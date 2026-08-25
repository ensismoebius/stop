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

### `components/student/`

`AvatarPicker`, `GameHeader`, `LetterDisplay`, `CountdownTimer`, `CategoryList` +
`CategoryCard`, `AnswerEditor`, `StopButton`, `ProgressIndicator`,
`CollaborativeCorrection`, `EmojiPicker`. Compostos por `StudentGamePage.jsx`, que
também renderiza o ranking final (com medalha) quando `game.status === "FINISHED"`.

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
