# Tempo real (Socket.IO)

## Bridge servico ↔ socket

`backend/src/sockets/realtime.js` é a **única** ponte entre regras de negócio e
Socket.IO — os serviços nunca importam `io` diretamente, só chamam funções deste
módulo. Isso mantém as regras testáveis sem servidor de socket (os testes de
integração chamam os serviços diretamente; `realtime.getIo()` retorna `null` fora de
um servidor real, e `emit()` simplesmente ignora e loga em debug).

### Salas por código de sala

```js
rooms.all(code)      // "room:<code>"           — todos: alunos + professor + tela
rooms.players(code)  // "room:<code>:players"    — só alunos
rooms.teachers(code) // "room:<code>:teachers"   — só painel do professor
rooms.screens(code)  // "room:<code>:screen"     — só tela pública
rooms.player(id)     // "player:<playerSessionId>" — um aluno específico, todas as abas/dispositivos daquela sessão
```

Funções de emissão: `toRoom`, `toPlayers`, `toTeachers`, `toScreens`, `toPlayer`.
Cada uma delega para `emit(target, event, payload)`, que checa `io` antes de emitir.

### `requestAck` — emissão com confirmação e timeout

Usada para a contagem regressiva sincronizada (spec 54): emite e aguarda ack de cada
socket conectado naquele momento, mas **nunca rejeita** — um timeout vira
`{ timedOut: true }`, tratado como "alguns dispositivos não confirmaram a tempo", não
como falha da operação. Nunca trava a partida por causa de um celular lento ou
offline.

## Eventos cliente → servidor

Registrados em `backend/src/sockets/handlers.js:registerHandlers`, cada um validado
por schema Zod antes de chegar à lógica de negócio:

| Evento | Uso |
| --- | --- |
| `joinRoom` | aluno entra na sala pelo código |
| `identifyStudent` | associa o socket a uma `PlayerSession` existente (reconexão) |
| `ready` | aluno sinaliza pronto |
| `sendEmoji` | reação emoji (aparece em aluno/professor/tela pública) |
| `submitAnswer` / `updateAnswer` | preencher/editar resposta de uma categoria |
| `requestStop` | aluno pressiona STOP |
| `fullscreenExited` | saída da tela cheia → elimina o aluno da rodada corrente (spec 24, 26) |
| `submitReview` | decisão de correção colaborativa (Válida/Inválida) |
| `telemetry` | eventos de telemetria (spec 25, 43) — não usados como prova de saída |
| `requestState` | pede reenvio do estado atual (reconexão manual) |
| `disconnect` | desconexão (handler nativo do Socket.IO, fora do wrapper `on`) |

## Eventos servidor → cliente

Todos escutados centralmente em `frontend/src/hooks/useRoomSocket.js` — a lista
`named` (linha ~70) é a fonte da verdade de quais eventos o frontend reconhece:

`playerJoined`, `playerLeft`, `roundCreated`, `letterSelected`, `roundStarting`,
`syncCountdownReleased`, `roundStarted`, `answerUpdated`, `playerProgress`,
`playerEliminated`, `roundStopped`, `roundTimedOut`, `collaborativeCorrectionStarted`,
`reviewAssigned`, `reviewCompleted`, `collaborativeCorrectionProgress`,
`collaborativeCorrectionFinished`, `correctionStarted`, `answerReviewed`,
`answersReviewed`, `scoreUpdated`, `rankingUpdated`, `roundFinished`,
`roundCancelled`, `nextRound`, `roomStatusChanged`, `emojiReceived`.

Mais um evento tratado à parte, fora da lista `named`, por esperar um **ack** de
volta: `syncCountdownRequested` (o handler chama `ack(true)` automaticamente depois
de repassar o payload — o servidor só usa isso como confirmação de recebimento, spec
54).

> **`roundCancelled` não significa só "cancelada".** O mesmo evento fecha a rodada
> em dois casos bem diferentes: o professor cancelar a rodada, e o professor
> finalizar a partida. Por isso `cancel(roundId, { message })` aceita o texto — o
> aluno lia "o professor cancelou esta rodada" no fim da partida, o que
> simplesmente não era verdade. Há teste para os dois textos, incluindo um que
> proíbe a palavra "cancelou" no caminho de finalização.

E um evento tratado à parte por atualizar o estado compartilhado diretamente:
`roomState` (ver abaixo).

## Estudo de caso — aula: 30 alunos presos na tela de espera

Numa turma real (30 alunos, notebook do professor como servidor, todos num único
router barato), ao iniciar a rodada alguns alunos chegavam à tela de categorias, mas
a maioria ficava presa na tela que segue a montagem do avatar (`/play`). Este caso
motivou quase todas as seções desta página — as seções com rótulo `[#N]` abaixo são
os detalhes de implementação de cada fix, e o código se refere a elas como
`tempo-real.md #1..#7`.

### Por que era possível ficar preso (o desenho)

A UI do aluno só sai da tela de espera quando `state.round.status` vira `PLAYING`
(`StudentGamePage.jsx` `roundHasStarted`; `CategoryList` só renderiza então). `state`
é atualizado por exatamente quatro coisas:

1. o `playerState` REST inicial (uma vez, no primeiro mount),
2. o ack do `joinRoom`,
3. um push `roomState`,
4. `requestState` — chamado **só dentro do handler de STOP**. Sem poll, sem watchdog.

Os pushes `roomState` são fire-and-forget: `io.to(...).emit` sem ack
(`backend/src/sockets/realtime.js`). Quem perde um único push (o que anunciava
`PLAYING`) fica preso **até o socket reconectar fisicamente ou recarregar a página**.
A tela pública já se auto-curava com um poll REST (`PublicScreenPage.jsx`, 15s); a
página do aluno não tinha equivalente.

### Por que o push é fácil de perder no início (carga)

No início da rodada o servidor dispara três `broadcastState` completos quase em
sequência — `start()` → `STARTING`, `syncCountdownReleased`, `beginPlaying` →
`PLAYING` (`backend/src/services/round/lifecycle.js`). Cada `broadcastState`
(`round/shared.js`):

- roda ~15-17 consultas no banco (`teacherState` + `publicState` +
  `playerStatesForRoom` computam cada um seu ranking — o ranking era calculado 3x
  por difusão, corrigido no [#2](#2-coalescência-e-um-único-passe-de-contexto)),
- emite, em seguida, ~35 payloads de socket individuais (30 alunos + professor +
  tela) num único processo Node que também serve o bundle estático e o MySQL.

Cada **join** e cada **ready** de aluno também disparava outro `broadcastState`
completo. No minuto antes de "iniciar", o servidor absorve ~60 difusões satélites —
saturando o pool do Prisma e travando o event loop bem quando a transição `PLAYING`
precisa chegar a todo mundo.

### A contagem regressiva adiciona espera dura

`runRevealSequence` aguarda `requestAck` de cada socket de aluno com timeout de
1500ms (`round/lifecycle.js`, `config/env.js`) e só então define
`revealAt = now + 3000`. Alguns aparelhos lentos/polling forçam o timeout completo
antes de liberar qualquer um — o trecho mais congestionado serializa nos clientes
mais lentos primeiro. Limitado, mas é latência de cauda empilhada sobre a carga
acima.

### Realidade de rede (por que "uns ok, a maioria presa")

`transports: ["websocket", "polling"]` (ver [#5](#5-transporte-configurável)), host é
o laptop num router barato. Esses routers derrubam/ofuscam o TCP sob muitos fluxos
WebSocket, produzindo **conexões meio-abertas**: os dois lados acreditam estar
conectados (o cliente nunca vê o disconnect, então nunca re-emite `joinRoom` — a
única coisa que devolveria o estado completo). O servidor só detectava o peer morto
após `pingInterval 20s + pingTimeout 25s` (hoje 5s/10s), e o cliente não tinha
watchdog equivalente. Push `PLAYING` perdido + socket meio-aberto = preso a rodada
toda.

### Fixes (por prioridade)

1. **Watchdog no cliente** (maior alavancagem — resolve o preso permanente). Enquanto
   espera (`CREATED`/`READY`/`STARTING`) e sempre que um `roomState` não chega há ~N
   segundos com o socket conectado, re-pedir o estado autoritativo (`emitAck
   "requestState"` ou o REST `playerState` — ambos existem e devolvem o estado
   completo). Transforma push perdido numa recuperação de segundos. Implementado no
   aluno em **todas** as fases: 3s de staleness (`WATCHDOG_STALE_MS`) → `requestState`
   versão-aware (posição adotada) → fallback REST (`adoptState`); refresh falho →
   `disconnect()` + `connect()` para o `joinRoom` reentregar o estado. De brinde, o
   refresh reconcilia os efeitos perdidos de um `fullscreenExited` (spec 24/26) que
   eliminaria o aluno.
   O **painel do professor ganhou o mesmo watchdog** (`useTeacherWatchdog` em
   `TeacherDashboardPage.hooks.jsx`): sem ele, um socket meio-aberto congelava o
   avanço de fase (ex.: "Criar rodada" gravava a rodada no banco mas o painel ficava
   no tema até recarregar — pedido de estado perdido + resposta REST perdida travavam
   também o `busy`). Hoje o painel pede `requestState` a cada ~3-12s sem estado novo
   e reconecta o socket em falha, e **toda requisição REST tem timeout de 30s** para
   o `guard` nunca prender o botão para sempre.
2. **Coalescer a rajada + um único ranking.** `broadcastStateSoon` (~150ms) para
   join/ready/disconnect; `loadRanking`/`playerStatesForRoom` calculados **uma vez**
   por difusão e compartilhados via `ctx` (`viewService.js`) — de ~6 consultas de
   ranking + 3 de contexto para ~2. Detalhes na seção
[#2](#2-coalescência-e-um-único-passe-de-contexto).
3. **Detectar peer morto mais cedo.** Heartbeat `pingInterval 5s / pingTimeout 10s`
   (`sockets/index.js`); watchdog de staleness no cliente (3s) que força
`disconnect()`+`connect()` quando `requestState` também falha. Detalhes na seção
    [#3](#13-recuperação-do-lado-do-cliente).
4. **Reforço da transição PLAYING.** `beginPlaying` agenda uma `broadcastStateSoon`
   ~1,5s depois (0 nos testes) para quem recebeu o `roundStarted` nomeado mas perdeu
o push `roomState`, sem ack de volta. Detalhes na seção
    [#4](#4-confirmação-da-transição-playing).
5. **Transporte configurável.** O transporte era hardcoded
   `["websocket", "polling"]`; routers baratos derrubam fluxos WebSocket longos. Agora
   `resolveTransports()` em `frontend/src/socket/socket.js` lê
   `VITE_SOCKET_TRANSPORTS` (padrão inalterado). Se o modo de falha do router for
   esse, forçar `["polling"]` na aula pode ser a resposta — polling são trocas HTTP
   curtas, sem conexão persistente para o router corromper; para 30 clientes a
   latência extra é desprezível. Fica o A/B numa aula real.
6. **Compressão.** `app.use(compression())` em `backend/src/app.js`: no início ~30
   celulares baixam o bundle quase no mesmo instante; gzip reduz a transferência
   várias vezes (bundle 603KB → 208KB gzip), menos colisões no router durante o load.
   `frontend/dist` precisa ser reconstruído após qualquer mudança no frontend (o
   aviso de bundle velho em `app.js` cobre o esquecimento).
7. **Separação de processos** (opcional — um computador, não obrigatório). Se a
   contenção do event loop ao servir o bundle a 30 celulares aparecer em medições,
   sirva `frontend/dist` de nginx/caddy (ou `npx serve` noutra porta) e deixe o Node
   só com `/api` + `/socket.io`. Não tentar `cluster` + Redis adapter de Socket.IO
   para 30 usuários — o gargalo era trabalho redundante (#2) e recuperação faltante
   (#1), não contagem de processos.

### Critério de aceite (próxima aula)

**Iniciar a rodada deve levar todo aluno conectado à tela de categorias em poucos
segundos do `PLAYING`, sem recarregamentos manuais.** Quem abre `/play` no meio da
rodada também deve cair na rodada em andamento (já funciona via REST fallback +
rejoin; o watchdog torna isso confiável). E, como o `testes.md` adverte,
comportamento visual/em tempo real é exatamente o tipo de coisa que uma suíte verde
de unidades não pega — validar no cenário real (muitos celulares, um router), não só
contra `stop_test`.

## O padrão `broadcastState()` — e por que ele existe

`backend/src/services/round/shared.js:34`. Junta e envia, numa só chamada, o estado
completo e atualizado para: painel do professor (`viewService.teacherState`), tela
pública (`viewService.publicState`), e **cada aluno individualmente**
(`viewService.playerStatesForRoom` — carregado em lote, uma consulta por tabela para
a sala inteira, não uma rodada de queries por aluno conectado; cada aluno recebe
só o próprio estado, nunca as respostas de um colega, spec 49).

Do próprio docstring do código (motivo real, não hipotético):

> Sem isso, o cliente do aluno só recebe o estado da rodada (incluindo o `endsAt` do
> cronômetro) no momento em que entra na sala: eventos como "a rodada começou"
> chegam nomeados, mas nada atualiza o estado compartilhado do React caso o handler
> não trate o payload explicitamente.

Ou seja: emitir `algumEventoEspecifico` sozinho **não** atualiza o `roomState` que os
três tipos de cliente guardam localmente — só dispara o que quer que o handler
daquele evento específico faça (ex.: tocar uma animação). Se a UI depende de
`round.status`, `game.status`, ou qualquer campo do estado geral para decidir o que
mostrar (ex.: "mostrar botão Pontuar", "mostrar pódio"), **só `broadcastState()`
garante que esse campo chegue** a todo mundo.

### Regra prática

**Toda função de serviço que muda o estado de sala/rodada/jogo deve terminar com
`await broadcastState(room.code)`** (ou aceitar explicitamente que os clientes
ficarão com estado obsoleto até a próxima reconexão/poll). Isso já causou dois bugs
reais nesta base, ambos com o mesmo formato — "o evento específico foi emitido, mas
ninguém chamou `broadcastState`":

1. **`openCorrection`** (`correction.js`) — emitia `correctionStarted`, mas sem
   `broadcastState` o `round.status` em cache no cliente nunca avançava para
   `CORRECTION`; o botão "Pontuar rodada" (condicionado a `round.status`) nunca
   aparecia para o professor. Corrigido adicionando `await broadcastState(room.code)`
   logo após o `realtime.toRoom(..., "correctionStarted", ...)`.
2. **`gameService.finish`** — marcava `game.status = FINISHED` e emitia
   `rankingUpdated`, mas sem `broadcastState` ninguém conectado via o pódio ao vivo:
   a tela pública e a tela do aluno já sabiam mostrar o ranking quando
   `game.status === "FINISHED"`, só nunca recebiam a notícia de que o jogo tinha
   acabado. Corrigido da mesma forma.

Ao adicionar uma nova ação que muda status de jogo/rodada/sala, confira se
`broadcastState` está sendo chamado — é o erro mais fácil de cometer (e mais difícil
de notar em teste manual rápido, porque o evento específico *parece* funcionar) neste
código.

### [#2] Coalescência e um único passe de contexto

Dois ajustes no `broadcastState` para a rajada de join/ready de 30 alunos:

1. **Um só passe de contexto/ranking.** As três projeções (`teacherState`,
   `publicState`, `playerStatesForRoom`) agora aceitam um `ctx` opcional
   (`{ room, round, participants, ranking }`): o `broadcastState` carrega isso
   **uma vez** e compartilha. Antes eram ~6 consultas de ranking + 3 de contexto por
   difusão; agora ~2. Chamadas avulsas (REST, ack de `joinRoom`) seguem sem ctx e
   carregam tudo sozinhas.
2. **`broadcastStateSoon` (coalescido)** — `round/shared.js`. Usam-no os sócios de
   alta frequência `join`/`ready`/`disconnect` (handlers.js): agrupa várias solicitações
   da mesma sala numa única difusão ~150ms depois. Nunca perde correção (a difusão
   relê o estado já persistido do banco ao disparar). Sem Socket.IO (testes de regra
   de negócio) vira no-op. Transições críticas da rodada continuam no `broadcastState`
   aguardado/imediato.

### [#4] Confirmação da transição PLAYING

`beginPlaying` agenda uma re-difusão coalescida (`broadcastStateSoon`) ~1,5s depois do
`roomState` PLAYING: pega o aluno que recebeu o `roundStarted` nomeado mas perdeu o
push fire-and-forget que o descolaria da tela de espera.

### [#1/#3] Recuperação do lado do cliente

O `roomState` é fire-and-forget, então o cliente não espera passivamente por ele:

- **Eventos nomeados de transição** (`roundCreated`, `roundStarting`,
  `syncCountdownReleased`, `roundStarted`, `roundStopped`, etc.) agora também disparam
  um `requestState` no `StudentGamePage.jsx` (`withTransitionRefresh`) — barato (só
  aquele aluno) e cobre o push perdido no instante exato da mudança.
- **Watchdog periódico**: em fases sem digitação (`""`/CREATED/READY/STARTING), se
  nenhum estado chega em 3s, o cliente pede de novo; se até o pedido falhar, derruba
  e reconecta de forma limpa (o `joinRoom` do reconnect reentrega o estado).
- **Heartbeat** (`sockets/index.js`): `pingInterval 5s / pingTimeout 10s`
  (era 20s/25s) para derrubar mais cedo conexões meio-abertas que routers baratos
  "engolem".

## Camada de confiabilidade (versões + idempotência)

### Posição autoritativa `(roomEpoch, stateVersion)`

`Room.roomEpoch`/`Room.stateVersion` são `Int` (schema.prisma) e sobem a cada difusão
autoritativa; todo `roomState`/resposta de `requestState` carrega as duas posições. O
cliente mantém a última posição adotada e compara toda fonte autoritativa contra ela.

**Barreira única de entrada** — `frontend/src/state/synchronization.js`
(`applyAuthoritative`, usado pelo `useRoomSocket.applyAuthoritativeState`): todo estado
autoritativo que entra no dispositivo (push `roomState`, ack de `joinRoom`, resposta de
`requestState`, fallback REST) passa por uma função que compara `(roomEpoch,
stateVersion)` e **descarta estados mais antigos que a posição adotada, sem rebater o
que o cliente já tem**. A ordem de chegada fica irrelevante: um push enviado antes de uma
reconexão e entregue depois dela não regride o estado novo (`roomEpoch` protege entre
sessões de sala; `stateVersion` ordena dentro da sessão). Estados sem metadados de
versão (push "cru"/mock) são adotados preservando a posição corrente — um snapshot
autoritativo nunca é rejeitado por falta de versão.

### `requestState` versão-aware e heartbeat de aplicação

O cliente manda a posição que adotou; o servidor (`handlers.js:254`) responde:

- **`CURRENT`** — a posição informada já é a atual: nada novo a enviar;
- **`ROOM_STATE`** — posição antiga/não informada: snapshot autoritativo completo
  (`roomEpoch`, `stateVersion`, `serverTime` + projeção do papel).

Enquanto conectado, o hook dispara `applicationHeartbeat` com a posição + `sentAt`
(`useRoomSocket.js:130`), e o servidor devolve `serverTime`/posição/`stale` — é o que
distingue "só clock para trás" (posição igual → `SYNCHRONIZED`) de "estado atrás"
(`DEGRADED`/`RECOVERING`). `SyncStatus` em `synchronization.js` modela
`IDLE/CONNECTING/SYNCHRONIZED/RECOVERING/DEGRADED/UNREACHABLE`.

### Comandos idempotentes (spec 3.1)

- **Cliente** (`socket.js:emitCommand`): anexa um `operationId` único ao payload e, se o
  ack não voltar (TIMEOUT — resposta perdida/atrasada), reenvia com o **mesmo** id.
- **Servidor** (`services/operations.js:claimOperation` + `handlers.js:wrap`): cria a
  linha `ProcessedOperation (roomId, id)` como trava `PENDING`; numa colisão P2002
  (concorrente com o mesmo id) espera ~150ms e, se `DONE`, **replay** do `responseJson`
  gravado — o reenvio nunca executa o efeito duas vezes. Falha no handler apaga o
  registro para o retry re-executar.
- Aplicado a `ready`, `submitAnswer`, `updateAnswer`, `requestStop`, `fullscreenExited`,
  `submitReview`. `sendEmoji` continua `emitAck` puro (efeito efêmero, sem estado).

### Medição de sincronização do professor

`broadcastState` apura `syncStats { expected, synchronized, stale, recovering }` a partir
do `syncRegistry.js` e anexa ao estado do professor. `TeacherDashboardPage.jsx` renderiza
uma pill no header — "Sincronizado N/M" (verde) ou "Sincronizando N/M" (âmbar, com o
count de `stale` no tooltip) — sinalizando quando há aluno defasado do estado
autoritativo.
