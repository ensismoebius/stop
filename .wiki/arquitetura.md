# Arquitetura

## Princípio central

> O frontend apresenta o estado; o servidor decide o estado.

Pontuação, cronômetro, ordem de quem apertou STOP primeiro, eliminação e identidade
do aluno são sempre resolvidos no backend. Os três clientes são, na prática, três
"visualizações" diferentes do mesmo estado de sala — nenhum deles guarda lógica de
jogo que o servidor não possa sobrescrever a qualquer momento via `roomState`
(ver [Tempo real](tempo-real.md)).

## Os três clientes

| Cliente | Rota (frontend) | Dispositivo típico | Páginas React |
| --- | --- | --- | --- |
| Painel do professor | `/teacher` | Computador do professor | `TeacherDashboardPage.jsx`, `TeacherLoginPage.jsx` |
| Tela pública | `/screen/:código` | TV/projetor da sala | `PublicScreenPage.jsx` |
| Interface do aluno | `/join/:código` → `/play` | Celular do aluno | `JoinPage.jsx`, `StudentGamePage.jsx` |

Todos os três se conectam ao **mesmo** servidor Express + Socket.IO e entram nas
mesmas salas de socket (`room:<code>:teachers`, `room:<code>:screen`,
`room:<code>:players`) — ver [Tempo real](tempo-real.md).

## Camadas do backend

```
routes/          → validação de entrada (zod), autenticação (requireTeacher)
controllers/      → tradução HTTP ↔ chamada de serviço, sem lógica de negócio
services/         → regras de negócio, transações Prisma
services/round/   → regras de negócio específicas do ciclo de vida da rodada
  lifecycle.js      criação/início/avanço de rodada
  stop.js           STOP e transição para correção colaborativa
  collaborativeCorrection.js  atribuição e coleta de avaliações entre alunos
  correction.js     correção oficial do professor, pontuação
  shared.js         resolveRoom(), broadcastState() — usados por quase todo o resto
repositories/     → única camada que fala Prisma diretamente
game/             → lógica pura sem I/O (sorteio de letra, ranking, pontuação, timers)
sockets/          → realtime.js (bridge para Socket.IO) + handlers.js (eventos recebidos)
```

`game/` é deliberadamente livre de I/O — `ranking.js`, `scoring.js`, `letters.js` etc.
recebem dados já carregados e devolvem estruturas puras, o que os torna testáveis sem
banco nem socket (ver [Testes](testes.md)).

## Autenticação: dois níveis, mais rotas públicas por matrícula

Dois middlewares em `backend/src/middleware/auth.js`:

* **`requireTeacher`** — token administrativo (`Authorization: Bearer`), protege
  cadastros e controle de partida (spec 34/35). A sessão do aluno nunca é aceita
  aqui.
* **`requirePlayer`** — token de sessão do aluno (`x-player-token`), emitido ao
  entrar numa sala (`roomService.join`), escopado a essa sala/sessão específica.

Um terceiro nível, sem middleware algum, cobre o que o aluno precisa acessar **antes**
de ter qualquer token: identificação por matrícula (`POST /rooms/:code/identify`,
spec 6) e, mais recentemente, o próprio histórico acadêmico
(`GET /students/history/:registrationNumber`, usado por `StudentHistoryPage.jsx`).
O modelo de confiança é deliberadamente simples — só a matrícula, sem senha — e
consistente em todo o app: o aluno nunca teve senha para nada, então um endpoint de
consulta não deveria inventar uma exigência de segurança que o resto do sistema não
tem. Essas rotas levam `authLimiter` (rate limit mais estrito) para dificultar
varredura de matrículas.

Detalhe de implementação ao adicionar uma rota pública nova a um router que também
tem rotas protegidas: `router.use(requireTeacher)` (ex.: `studentRoutes.js`) só afeta
o que for registrado **depois** dele no mesmo router — a rota pública precisa vir
**antes** dessa linha, não depois com alguma exceção especial. Foi assim que
`/students/history/:registrationNumber` foi adicionada sem exigir um router separado.

## Camadas do frontend

```
pages/            → uma por rota, orquestra hooks + monta a UI da tela inteira
components/teacher/  → ConfigPanel, RoomControl, RoundControl, CorrectionPanel,
                        GroupedCorrectionPanel, RankingPanel, ReportsPanel,
                        StatisticsPanel, PlayerMonitor, CategorySetsPanel
components/student/  → CategoryCard, AnswerEditor, StopButton, CollaborativeCorrection,
                        CountdownTimer, AvatarPicker, EmojiPicker, GameHeader, ...
components/public/   → LetterAnimation, Countdown, Ranking, ThemeDisplay, GameStatus, ...
components/common/   → elementos genéricos reutilizados entre clientes (ex.: Field)
hooks/            → useRoomSocket (conexão + eventos), useServerClock (relógio
                     sincronizado com o servidor), useEmojiBursts, useFullscreen,
                     useAutoFullscreen, useAudio
services/api.js   → todas as chamadas REST em um único módulo
socket/socket.js  → criação do socket e emitAck (emit com Promise de ack)
```

## Topologia: dev vs. sala de aula

Em desenvolvimento normal, backend e frontend rodam como dois processos:

```
backend   → node (Express + Socket.IO) na porta 3000
frontend  → vite dev server na porta 5173, com proxy /api e /socket.io → :3000
```

Em sala de aula, o professor ativa um hotspot Wi-Fi neste mesmo computador; os
celulares dos alunos se conectam a ele e acessam `http://<ip-do-hotspot>:5173`. Isso
introduz duas armadilhas reais já encontradas nesta base — ver
[Implantação em sala de aula](implantacao-em-sala.md):

1. O proxy do Vite reescrevendo o header `Host` (`changeOrigin`) quebrava o link/QR
   Code de entrada gerado pelo backend.
2. Um hotspot sem internet (intencional) aciona a detecção de "captive portal" dos
   celulares, que silenciosamente desviam o tráfego para os dados móveis mesmo
   permanecendo "conectados" ao Wi-Fi — não é um bug do STOP, mas quebra o acesso.

## Testes/simulação isolados

Para testar o app inteiro sem afetar dados de produção, backend e frontend sobem uma
segunda vez em portas diferentes, apontando para um banco `stop_test` e um para o
outro via `VITE_API_URL`/`VITE_SOCKET_URL` — ver [Testes](testes.md).
