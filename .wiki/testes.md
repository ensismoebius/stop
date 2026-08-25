# Testes

Duas camadas: testes de integração automatizados do backend (Vitest) e uma
simulação E2E visual isolada (Playwright), este último um script fora do
repositório (scratchpad), não uma suíte versionada.

## Backend — Vitest (`backend/tests/`)

`backend/tests/integration/api.test.js` cobre o fluxo completo via chamadas diretas
aos serviços (não HTTP) contra um banco de teste real (`stop_test`). Fixtures em
`backend/tests/helpers/fixtures.js`.

### `resetDatabase()` e a ordem de `TABLES`

```js
const TABLES = [
  "TelemetryEvent", "Answer", "RoundParticipant", "RoundCategory", "Round",
  "Score", "GameResult", "PlayerSession", "Room", "Game",
  "Category", "CategorySet", "Enrollment", "Student", "Class", "Teacher",
];
```

Cada teste chama `resetDatabase()`, que roda `DELETE FROM` em uma transação, **na
ordem filho → pai** (em vez de `TRUNCATE`, para não precisar desabilitar checagem de
FK). **Toda nova tabela com uma FK `Restrict` para algo mais abaixo na lista precisa
ser adicionada aqui**, na posição certa (antes do que ela referencia) — senão a
transação falha assim que existir pelo menos uma linha na tabela nova, quebrando
`resetDatabase()` e, com ele, o `beforeEach`/`afterEach` de **toda** suíte
subsequente.

Isso já aconteceu de verdade: `GameResult` (FK `Restrict` para `Student`) ficou de
fora da lista até ser adicionado proativamente ao implementar a feature de
finalização de partida — antes de qualquer teste falhar, só por reexame do grafo de
FKs (ver [Modelo de dados](modelo-de-dados.md#restrict-vs-cascade-o-padrão-de-proteção-de-histórico)
para o porquê de `Restrict` existir aqui em primeiro lugar).

### Padrão de fixture

`createScenario()` monta professor + turma + alunos + conjunto de categorias +
partida + sala num único helper; `startedRound()` cria uma rodada e a avança até
`PLAYING`, aguardando o status assíncrono via `waitForRoundStatus` (polling com
timeout — a sequência de revelação/contagem regressiva atravessa ticks assíncronos
mesmo com as durações configuradas para ~0 em ambiente de teste, via
`env.letterRevealAnimationMs`/`countdownAckTimeoutMs`/`countdownDurationMs`).

### Rodando

```bash
cd backend
DATABASE_URL="mysql://.../stop_test" npx vitest run
```

**Nunca** apontar `DATABASE_URL` de teste para o banco de produção do `.env` — o
`.env` do projeto aponta para produção por padrão; sempre sobrescrever
explicitamente ao rodar testes ou migrações experimentais (ver
[Modelo de dados](modelo-de-dados.md#migrações)).

## Simulação E2E visual (Playwright, ambiente isolado)

Não é uma suíte versionada no repositório — é um script de scratchpad usado para
verificar visualmente o fluxo completo do app (screenshots em cada fase), reexecutado
sempre que uma mudança grande é feita. Padrão, caso precise recriá-lo:

### Setup: dois processos extras, portas diferentes das de dev

```bash
# backend isolado — porta 3001, banco de teste
PORT=3001 DATABASE_URL="mysql://.../stop_test" node backend/src/server.js

# frontend isolado — porta 5174, apontando para o backend isolado acima
VITE_API_URL=http://localhost:3001 VITE_SOCKET_URL=http://localhost:3001 \
  npx vite --port 5174 --strictPort
```

**As duas env vars do frontend são obrigatórias em todo restart** — sem elas, o
build cai no proxy padrão do Vite (`:3000`, ver `vite.config.js`), que aponta para o
backend de desenvolvimento normal, não para o isolado. Esquecer isso já causou um
timeout de login inteiro numa rodada de teste (a UI parecia travada, mas na verdade
as requisições iam para o backend errado).

### Locators: armadilhas encontradas

1. **Locators por texto (`hasText`) quebram no modo de edição.** No instante em que
   uma linha de tabela entra em modo de edição, o texto vira valor de um `<input>`,
   não mais conteúdo de texto — um locator `hasText` que funcionava antes da edição
   passa a não encontrar nada depois. Solução: usar locators estruturais/posicionais
   capturados uma vez (ex.: `tbody tr .last()`, `div.stack > div .nth(n)`), que
   permanecem válidos independente do conteúdo mudar.
2. **Asserções por `.count()` correm contra o re-render assíncrono.** `.count()`
   confere instantaneamente; se a UI ainda não re-renderizou, o teste vê o estado
   antigo. Solução: `.first().waitFor({ state: "visible" | "hidden", timeout })`,
   que faz polling em vez de checar uma vez só.
3. **Não assumir ordem de lista sem checar o `orderBy` real do backend.** Um teste
   assumia que o conjunto de categorias recém-criado seria o último da lista
   (`.last()`); na verdade a listagem é ordenada alfabeticamente por nome no
   backend, então "CRUD Teste" aparecia **antes** de conjuntos com nomes que começam
   com letras maiores — o locator certo era `.first()`. Sempre conferir o `orderBy`
   do endpoint antes de escrever a asserção de posição.
4. **Animações com temporização própria precisam de espera explícita antes do
   screenshot.** O pódio final (`Ranking.jsx`) revela posições de forma escalonada;
   tirar o screenshot cedo demais mostra só 1 de 3 alunos empatados em 1º lugar —
   não porque o backend está errado (checagem direta no banco confirmou os 3
   `GameResult` corretos, todos `GOLD`), mas porque a animação ainda não tinha
   terminado. Correção: aguardar um tempo fixo (~6s, maior que a duração da
   animação) antes de capturar a tela final.

### Fases cobertas (referência, não script ativo)

Criação de turma/aluno/conjunto de categorias → entrada via QR/link → sorteio de
letra + contagem regressiva sincronizada → fase `PLAYING` → STOP → correção
colaborativa (peer review) → correção agrupada do professor (auto-avanço,
Válida/Inválida) → pontuação → CRUD completo (criar/editar/apagar) de Turmas,
Alunos e Conjuntos de categorias/Categorias → finalização da partida (pódio na tela
pública, medalha na tela do aluno, aba Relatórios com busca filtrada e não
filtrada).
