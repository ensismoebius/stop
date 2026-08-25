# Ciclo de vida da rodada

Toda a lógica está em `backend/src/services/round/` (`lifecycle.js`, `stop.js`,
`collaborativeCorrection.js`, `correction.js`, `shared.js`), operando sempre sob um
lock por rodada (`gameLock.run(lockKey(roundId), ...)`, `shared.js:8`) para resolver
corridas — por exemplo, dois alunos pressionando STOP ao mesmo tempo é decidido por
um `UPDATE` condicional atômico (`transitionIfStatus`), não por lógica em memória.

## Máquina de estados (`RoundStatus`)

```
CREATED → READY → STARTING → PLAYING → STOPPED
                                          │
                                          ▼
                          COLLABORATIVE_CORRECTION
                                          │
                                          ▼
                                     CORRECTION
                                          │
                                          ▼
                                       SCORED
                                          │
                              (proxima rodada, ou)
                                          ▼
                                     FINISHED*
```

\* `FINISHED` aqui é do jogo (`GameStatus`), não da rodada — ver
[Finalização e medalhas](#finalização-e-medalhas-gameservicefinish) abaixo. A última
rodada de uma partida fica em `SCORED`; é `Game.status` que vira `FINISHED`.

| Status | Acionado por | Arquivo |
| --- | --- | --- |
| `CREATED` → `READY` → `STARTING` | `roundService`/`lifecycle.js`: sorteio de letra + animação pública + contagem sincronizada (spec 4-7, 54) | `lifecycle.js` |
| `STARTING` → `PLAYING` | fim da contagem regressiva; `revealAt`/`endsAt` gravados — é esse o momento em que a letra deixa de ficar oculta e o cronômetro começa de verdade | `lifecycle.js` |
| `PLAYING` → `STOPPED` | `requestStop` (aluno), `forceStop` (professor), ou `handleTimeout` (prazo esgotado) — todas convergem em `finalizeRound` | `stop.js` |
| `STOPPED` → `COLLABORATIVE_CORRECTION` | `startCollaborativeCorrection`, chamada automaticamente pelo fim de `finalizeRound` | `collaborativeCorrection.js` |
| `COLLABORATIVE_CORRECTION` → `CORRECTION` | `closeCollaborativeCorrection` → `openCorrection` | `collaborativeCorrection.js` → `correction.js` |
| `CORRECTION` → `SCORED` | `score(roundId)`, disparado pelo professor | `correction.js` |

`backend/src/game/roundState.js` define `assertTransition`, que valida cada
transição contra um mapa de estados permitidos — uma tentativa de pular etapas
lança erro em vez de corromper o estado silenciosamente.

## STOP e a corrida entre alunos

`requestStop` (`stop.js:79`) resolve a corrida com um único `UPDATE ... WHERE status
= 'PLAYING'` (`transitionIfStatus`): quem "ganha" a linha afetada (`count === 1`) é o
primeiro stopper; todo mundo mais tarde recebe `count === 0` e o erro "Outro aluno
pressionou STOP primeiro". Não há verificação-depois-ação em JS — a atomicidade vem
do banco.

`finalizeRound` (chamada por STOP, timeout e STOP forçado do professor) é o ponto de
convergência: marca participantes como `FINISHED`, emite `roundStopped`/`roundTimedOut`,
e **imediatamente** chama `startCollaborativeCorrection` — não há pausa manual entre
"a rodada parou" e "a correção colaborativa começa".

## Correção colaborativa (peer review)

Implementa enhancements.md seções 8-16. Fluxo em `collaborativeCorrection.js`:

1. `startCollaborativeCorrection` distribui as respostas preenchidas entre os alunos
   elegíveis via `assignReviews` (`game/reviewAssignment.js`) — nunca a própria
   resposta, nunca duas atribuições repetidas para o mesmo avaliador. Cada atribuição
   vira uma linha `AnswerReview` com `decision: PENDING` **antes** de o aluno avaliar
   — a linha existente é o que sustenta o contador de progresso ("5/8") e impede
   reenvio duplicado (`@@unique([answerId, graderPlayerSessionId])`).
2. O aluno avaliador recebe `reviewAssigned` com **apenas** `reviewId`, o nome da
   categoria e o valor da resposta — nunca o autor (anonimato por desenho, spec 10).
3. `submitReview` grava a decisão via `claimDecision`, que só afeta a linha se ainda
   estiver `PENDING` (mesmo padrão de UPDATE condicional do STOP — impede duas abas
   do mesmo aluno enviarem a mesma avaliação duas vezes).
4. A fase fecha (`closeCollaborativeCorrection`) por qualquer um dos três gatilhos:
   todo mundo terminou (`completedAssignments >= totalAssignments`), o prazo
   configurado esgotou (`collaborativeCorrectionEndsAt`, reagendado em
   `game/recovery.js` se o servidor reiniciar no meio da fase), ou o professor clica
   "Finalizar correção" a qualquer momento — nenhum aluno pendente pode travar a
   partida.
5. Se ninguém tem o que corrigir (partida solo, ou ninguém preencheu nada na rodada),
   a fase é pulada inteiramente e vai direto para `CORRECTION`.

O bônus de pontuação por correção colaborativa correta é aplicado depois, em
`score()` — ver abaixo.

## Correção do professor

`openCorrection` (`correction.js:31`) materializa a grade: garante uma linha
`Answer` por aluno elegível × categoria (categorias não respondidas viram `BLANK`
explícito) e sugere automaticamente `VALID`/`INVALID` via `suggestReviewState`
(baseado na letra da rodada) para o que ainda estiver `PENDING`. O professor então
ajusta manualmente o que estiver semanticamente errado — **não existe um botão
"Em branco"** na UI de correção agrupada: respostas vazias já chegam marcadas
`BLANK` automaticamente pela materialização acima, então o professor só decide entre
Válida/Inválida.

Duas visões da mesma grade, ambas em `correction.js`:

* **`correctionGrid`** — uma linha por aluno × categoria (visão "crua").
* **`groupedCorrectionGrid`** — agrupa respostas com o mesmo `normalizedValue` dentro
  da mesma categoria, para que o professor corrija cada resposta distinta **uma
  única vez** em vez de repetir o julgamento para "React" preenchido por 12 alunos
  diferentes (spec 17/20/21/52). É o que alimenta `GroupedCorrectionPanel.jsx`,
  incluindo o auto-avanço para a próxima categoria pendente após marcar
  Válida/Inválida.

`score(roundId)`:

1. Pontua cada resposta via `game/scoring.js` (`scoreAnswers`).
2. Aplica o **bônus de correção colaborativa**: se a decisão do aluno-avaliador
   bateu com a decisão oficial do professor, ele ganha `env.collaborativeReviewBonus`
   por acerto — **independente da pontuação das próprias respostas dele** (spec
   27-31).
3. Atualiza `Score.total` (upsert por `[gameId, studentId]`) e emite `scoreUpdated` +
   `rankingUpdated` + `broadcastState`.

## Ranking e empates (`game/ranking.js`)

`buildRanking` ordena por total decrescente (desempate alfabético por nome,
`localeCompare` com `pt-BR`) e atribui posição **pelo índice na lista ordenada**, não
por contador incrementado a cada entrada distinta:

```js
if (previousTotal === null || entry.total !== previousTotal) {
  position = index;   // index = posição na lista ordenada, 1-based
}
```

Consequência: dois alunos empatados em 1º lugar ocupam ambos `position = 1`; o
terceiro aluno (com total distinto, mesmo que só 1 ponto a menos) fica em
`position = 3`, **não `position = 2`** — a posição "pula" o espaço que o empate
ocupou. Isso é intencional (mesma convenção de ranking esportivo) e é o mesmo valor
gravado em `GameResult.position` na finalização.

## Finalização e medalhas (`gameService.finish`)

`gameService.finish(id)` (`backend/src/services/gameService.js:34`) é chamado pelo
professor ao encerrar a partida (`Game.status → FINISHED`). Diferente de `score()`
(que atualiza `Score`, o total corrente), `finish()` grava **`GameResult`** — o
registro permanente:

1. Carrega o ranking final via `viewService.loadRanking` (mesma função usada por
   `gameService.ranking`, única fonte de verdade para posição/empates).
2. Para cada entrada, `prisma.gameResult.upsert` (idempotente por
   `@@unique([gameId, studentId])`) grava `score`, `position` e `medal`:
   `position === 1 → GOLD`, `2 → SILVER`, `3 → BRONZE`, qualquer outra posição →
   `null` (o aluno ainda ganha uma linha em `GameResult` — só sem medalha). Como a
   medalha deriva de `position` (não do índice), um empate em 1º dá ouro aos dois.
3. Bloqueio de novas rodadas: `round/lifecycle.js`'s `create()` checa
   `game.status === "FINISHED"` **antes** de qualquer outra validação e lança 409 —
   como `next()` chama `create()` internamente, isso cobre ambos os caminhos de
   criar uma nova rodada numa partida já finalizada.
4. Difunde `rankingUpdated` + `broadcastState` para que quem estiver conectado veja o
   pódio **imediatamente** — a tela pública (`Ranking.jsx`) e a tela do aluno
   (`StudentGamePage.jsx`) já sabiam mostrar o ranking quando `game.status ===
   "FINISHED"`; faltava só avisá-los (ver [Tempo real](tempo-real.md) para o porquê
   disso não ser automático).

O pódio é puramente derivado de `position`: 🥇/🥈/🥉 aparecem para `position <= 3`
tanto em `Ranking.jsx` (tela pública) quanto no ranking de `StudentGamePage.jsx`
(aluno), via um mapa `MEDAL_BY_POSITION` idêntico nos dois lugares.
