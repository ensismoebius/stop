# Frontend

React 18 + Vite + React Router. Uma página por rota (`pages/`), que orquestra hooks
e monta a UI; a lógica de apresentação fica em `components/<cliente>/`.

## Rotas e páginas

| Rota | Página | Cliente |
| --- | --- | --- |
| `/teacher` (login) | `TeacherLoginPage.jsx` | professor |
| `/teacher` (autenticado) | `TeacherDashboardPage.jsx` | professor |
| `/screen/:código` | `PublicScreenPage.jsx` | tela pública |
| `/join/:código` | `JoinPage.jsx` | aluno (entrada) |
| `/play` | `StudentGamePage.jsx` | aluno (jogo) |
| `/historico`, `/historico/:matrícula` | `StudentHistoryPage.jsx` | aluno (consulta, fora de uma partida) |
| `/` | `HomePage.jsx` | — |

## Hooks (`frontend/src/hooks/`)

* **`useRoomSocket.js`** — conecta o socket, registra todos os listeners de evento
  (ver [Tempo real](tempo-real.md)), e expõe `roomState` + um mapa de handlers por
  evento passado pelo chamador. É o único lugar que fala Socket.IO diretamente;
  páginas consomem o hook, não o socket cru.
* **`useServerClock.js`** — relógio sincronizado com o servidor, usado por
  `CountdownTimer`/`Countdown` para o cronômetro não divergir por causa do relógio
  local do dispositivo.
* **`useEmojiBursts.js`** — anima as reações emoji recebidas via `emojiReceived`.
* **`useFullscreen.js` / `useAutoFullscreen.js`** — controla e detecta saída de tela
  cheia no cliente do aluno (a saída aciona `fullscreenExited` → eliminação da
  rodada corrente, spec 24/26).
* **`useAudio.js`** — efeitos sonoros.

## Componentes por cliente

### `components/teacher/`

| Componente | Papel |
| --- | --- |
| `ConfigPanel.jsx` | CRUD de Turmas (incluindo `discipline`), Alunos, e vínculo com `CategorySetsPanel` |
| `CategorySetsPanel.jsx` | CRUD de conjuntos de categorias e categorias |
| `RoomControl.jsx` | abrir/fechar sala, ver QR/link de entrada |
| `RoundControl.jsx` | criar/iniciar/avançar rodada |
| `PlayerMonitor.jsx` | status ao vivo de cada aluno conectado |
| `CorrectionPanel.jsx` | grade de correção "crua" (uma linha por aluno × categoria) |
| `GroupedCorrectionPanel.jsx` | grade agrupada por resposta distinta, com auto-avanço para a próxima categoria pendente após Válida/Inválida — sem botão "Em branco" (respostas vazias já chegam marcadas automaticamente, ver [Ciclo de vida da rodada](ciclo-de-vida-da-rodada.md#correção-do-professor)) |
| `RankingPanel.jsx` | ranking da partida em andamento |
| `StatisticsPanel.jsx` | estatísticas por partida |
| `ReportsPanel.jsx` | relatórios acadêmicos entre partidas/turmas — ver abaixo |

#### `ReportsPanel.jsx`

Lê de `GET /reports/results` (`api.searchReports`), que por sua vez consulta
`GameResult` (ver [Modelo de dados](modelo-de-dados.md)). Filtros: disciplina, turma,
aluno, partida, medalha, intervalo de data, intervalo de pontuação — todos
opcionais e combináveis. **Sempre** ordenado por nome do aluno
(`orderBy: { student: { name: "asc" } }` no backend, `reportService.js`), independente
de quais filtros estão ativos — não é uma opção de ordenação da UI, é fixo no
serviço.

Duas ações adicionais na mesma tela:

* **Exportar CSV** — gera o arquivo inteiramente no cliente a partir do `results` já
  carregado (sem round-trip ao servidor); usa BOM UTF-8 para acentuação abrir
  corretamente no Excel.
* **Desempenho por categoria** — dispara `GET /reports/category-stats`
  (`api.categoryStats`), reaproveitando só os filtros de disciplina/turma/partida do
  mesmo formulário (não aluno/medalha/data/pontuação, que não fazem sentido nessa
  granularidade). Agrega `Answer` por `roundCategory.name` — estável entre partidas
  diferentes que reusam o mesmo `CategorySet`, pelo mesmo motivo que
  `RoundCategory` é uma cópia imutável (ver
  [Modelo de dados](modelo-de-dados.md#roundcategory-cópia-imutável-não-referência))
  — e ordena por taxa de acerto **crescente**: a categoria em que a turma mais erra
  aparece primeiro, o dado mais acionável para o professor.

### `components/student/`

`AvatarPicker`, `GameHeader`, `LetterDisplay`, `CountdownTimer`, `CategoryList` +
`CategoryCard`, `AnswerEditor`, `StopButton`, `ProgressIndicator`,
`CollaborativeCorrection`, `EmojiPicker`. Compostos por `StudentGamePage.jsx`, que
também renderiza o ranking final (com medalha) quando `game.status === "FINISHED"`.

`EmojiPicker.jsx`'s `EMOJI_REACTIONS` (conjunto fixo, sem digitação livre — spec:
fácil de moderar) é **duplicado** em `backend/src/validators/schemas.js` como
`z.enum(EMOJI_REACTIONS)`: o servidor rejeita qualquer emoji fora dessa lista via
`sendEmoji`. Adicionar uma reação nova exige editar os dois lugares — esquecer o
backend faz o clique do aluno falhar silenciosamente na validação do socket.

### `StudentHistoryPage.jsx` (`/historico`)

Consulta o histórico do próprio aluno (medalhas/pontuação por partida) só pela
matrícula, via o endpoint público `GET /students/history/:registrationNumber` — ver
[Arquitetura](arquitetura.md#autenticação-dois-níveis-mais-rotas-públicas-por-matrícula)
para o porquê desse endpoint não exigir token de professor. Aceita tanto `/historico` (formulário) quanto
`/historico/:matrícula` (link direto, para favoritar/compartilhar). Link visível para
todos na `HomePage`, sem gate de autenticação — diferente dos atalhos de professor,
que só aparecem para quem já está autenticado.

### `components/public/`

`GameTitle`, `ThemeDisplay`, `LetterAnimation`, `Countdown`, `PlayerCount`,
`GameStatus`, `Ranking` (pódio final com 🥇🥈🥉, revelação animada e escalonada por
posição — ao testar visualmente, aguardar a animação terminar antes de tirar
screenshot/verificar o DOM, ver [Testes](testes.md)).

### `components/common/`

Elementos genéricos reaproveitados entre clientes (ex.: `Field.jsx`, usado por
formulários em `ConfigPanel` e `ReportsPanel`).

## Serviços

* **`services/api.js`** — todas as chamadas REST num único módulo, uma função por
  endpoint (ex.: `searchReports(token, filters)` usa `URLSearchParams` para montar a
  query string).
* **`socket/socket.js`** — `createSocket()` e `emitAck()` (emit que devolve uma
  Promise resolvida pelo ack do servidor).

## Estado

`state/` guarda o que não é local de um componente nem vem direto do socket (ex.:
sessão do professor autenticado). O grosso do estado de jogo, porém, vive no
`roomState` que `useRoomSocket` mantém e que o servidor é sempre quem decide — ver
o princípio central em [Arquitetura](arquitetura.md).
