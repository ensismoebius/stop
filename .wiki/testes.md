# Testes

Três camadas: testes de integração do backend (Vitest sobre um banco real), testes
de componente do frontend (Vitest + Testing Library sobre jsdom) e uma simulação E2E
visual isolada (Playwright), esta última um script de scratchpad, não uma suíte
versionada.

> **O que nenhuma delas pega:** bug visual. Miniaturas cortadas e título branco em
> fundo branco passaram por 660 testes verdes — a estrutura e o comportamento
> estavam certos, só o CSS estava errado. Para mudança de aparência, screenshot
> (ou uma página de revisão renderizada) não é luxo, é a única verificação que
> vale.

## Backend — Vitest (`backend/tests/`)

`backend/tests/integration/api.test.js` cobre o fluxo completo via HTTP real
(`supertest` contra `createApp()`) sobre um banco de teste real (`stop_test`) —
diferente de `gameFlow.test.js`/`collaborativeCorrection.test.js`, que chamam os
serviços diretamente. Fixtures em `backend/tests/helpers/fixtures.js`.

Alguns passos de setup não têm equivalente em REST (ex.: submeter resposta —
`submitAnswer` só existe como evento de socket, spec 45) — nesses casos,
`api.test.js` importa e chama o serviço diretamente (`answerService.submit`,
`roundService.forceStop`, `roomService.join`) para montar o estado, e só volta a usar
`request(app)` para o endpoint HTTP que o teste está de fato verificando. Mistura
intencional, não descuido: o objetivo do teste é o endpoint, não o caminho até ele.

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

`roomService.join(code, registrationNumber)` devolve `{ playerSessionId, playerToken,
student, room, game }` — **não** `{ id, ... }`. Usar `session.id` em vez de
`session.playerSessionId` num teste passa despercebido até a primeira chamada que
depende desse valor (ex.: `answerService.submit({ playerSessionId: session.id, ...
})`), que falha com um erro do Prisma sobre argumento faltando, não com um erro óbvio
de "propriedade indefinida" — a mensagem não aponta de volta para a causa.

### Rodando

```bash
cd backend
DATABASE_URL="mysql://.../stop_test" npx vitest run
```

`vitest.config.js` fixa **`fileParallelism: false`**: os arquivos compartilham o
mesmo banco, então rodar em paralelo faria um teste apagar o cenário do outro.

### Duas falhas intermitentes já corrigidas (e o padrão delas)

Ambas passavam isoladas e falhavam de vez em quando na suíte inteira — o tipo de
teste que se aprende a ignorar, que é exatamente o perigo.

* **`criticalRules.test.js`** segurava uma trava e chamava `releaseHeld()` depois de
  um `setTimeout` fixo. Mas `asyncLock.run` faz `await previous` **antes** de chamar
  a task, ou seja, a trava nunca é adquirida de forma síncrona: sob carga,
  `releaseHeld` ainda era `undefined`. Correção: esperar um sinal de aquisição real
  em vez de dormir um tempo arbitrário.
* **`api.test.js`** usava o literal `"zzz-fora-da-letra"` como resposta que jamais
  bateria com a letra sorteada — só que o `LETTER_POOL` configurado **inclui Z**.
  Uma em cada ~21 execuções sorteava Z, a resposta virava válida e o teste caía.
  Correção: derivar uma letra comprovadamente diferente da sorteada.

Moral: teste que depende de sorteio precisa **derivar** o caso do valor sorteado,
nunca assumir um literal; e sincronização se espera por sinal, não por relógio.

## Frontend — Vitest + Testing Library (`frontend/tests/`)

```bash
cd frontend
npx vitest run            # ou: npx vitest run --coverage
```

Ambiente jsdom, configurado em `frontend/vitest.config.js` com
`frontend/tests/setup.js` — que traz um `MemoryStorage` próprio para
`localStorage`/`sessionStorage` (o Node moderno sombreia a implementação do jsdom) e
um stub de `scrollIntoView`.

Armadilhas específicas desta suíte:

* **Cerimônia de pódio** (`Ranking.test.jsx`): cada passo do roteiro só agenda o
  próximo **depois** de renderizar, então `advanceTimersByTime(passo1 + passo2)` não
  avança dois passos. Avance pelo maior atraso do roteiro, uma vez por passo.
* **Contagem de pontos**: usa `requestAnimationFrame` ancorado em `performance.now()`.
  Os testes stubam `requestAnimationFrame` para chamar o callback já "muito depois do
  fim", fazendo o número assentar no valor final de forma síncrona.
* **O título do passo aparece três vezes** no assistente de rosto: como `<h3>`, como
  `aria-label` do `role="group"` que embrulha as opções, e como `aria-label` do botão
  da trilha que pula para aquele passo. Um `getByRole("button", { name: /Tom de
  pele/ })` solto casa com o botão da trilha, não com a cor. Escope sempre:
  `within(screen.getByRole("group", { name: "Tom de pele" })).getByRole("button", {
  name: "Tom de pele 5" })`.
* **As miniaturas da galeria não têm nome próprio** — são "Opção 1", "Opção 2"…,
  porque `variant07` não diz nada a ninguém e o aluno escolhe olhando o rosto. Um
  teste que queira verificar *o desenho* precisa descer ao DOM
  (`container.querySelectorAll(".wz__option")`), não à árvore de acessibilidade; o
  que se afirma pelo papel é a **quantidade** e o índice gravado, não a peça.
* **`scrollIntoView` é stubado no `HTMLElement.prototype`**, não no
  `Element.prototype` (o jsdom não implementa layout). Um `vi.spyOn(Element.prototype,
  "scrollIntoView")` **instala o espião e nunca é chamado**: o stub do `setup.js`
  vive num protótipo mais próximo do elemento e sombreia o de cima. Espione
  `window.HTMLElement.prototype` — o mesmo objeto que o `setup.js` remendou.
* **Avatar é decorativo por padrão** (`alt=""`) porque o nome do aluno já está
  escrito ao lado; só o retrato de quem está montando o rosto recebe `alt`. Um teste
  que procura o avatar por `getByRole("img")` numa lista vai falhar — e está certo
  que falhe.

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

Para uma tela nova isolada (ex.: `StudentHistoryPage.jsx`, o botão "Desempenho por
categoria" do `ReportsPanel`), nem sempre vale a pena estender o script grande — um
script de verificação avulso, mais curto, que sobe os dois processos isolados,
semeia só o cenário mínimo necessário via Prisma direto (ex.: um `GameResult` sem
rodadas de verdade, para checar o estado vazio) e tira 1-2 screenshots, é suficiente
e mais rápido de escrever/rodar do que encaixar mais uma fase no fluxo completo.
