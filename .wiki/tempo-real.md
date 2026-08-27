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

### Coalescência e um único passe de contexto (fixme.md #2)

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

### Confirmação da transição PLAYING (fixme.md #4)

`beginPlaying` agenda uma re-difusão coalescida (`broadcastStateSoon`) ~1,5s depois do
`roomState` PLAYING: pega o aluno que recebeu o `roundStarted` nomeado mas perdeu o
push fire-and-forget que o descolaria da tela de espera.

### Recuperação do lado do cliente (fixme.md #1/#3)

O `roomState` é fire-and-forget, então o cliente não espera passivamente por ele:

- **Eventos nomeados de transição** (`roundCreated`, `roundStarting`,
  `syncCountdownReleased`, `roundStarted`, `roundStopped`, etc.) agora também disparam
  um `requestState` no `StudentGamePage.jsx` (`withTransitionRefresh`) — barato (só
  aquele aluno) e cobre o push perdido no instante exato da mudança.
- **Watchdog periódico**: em fases sem digitação (`""`/CREATED/READY/STARTING), se
  nenhum estado chega em 3s, o cliente pede de novo; se até o pedido falhar, derruba
  e reconecta de forma limpa (o `joinRoom` do reconnect reentrega o estado).
- **Heartbeat** (`sockets/index.js`): `pingInterval 10s / pingTimeout 15s`
  (era 20s/25s) para derrubar mais cedo conexões meio-abertas que routers baratos
  "engolem".
