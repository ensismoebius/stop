import prisma from "../lib/prisma.js";
import roomRepository from "../repositories/roomRepository.js";
import roundRepository, { roundParticipantRepository } from "../repositories/roundRepository.js";
import scoreRepository from "../repositories/scoreRepository.js";
import answerRepository from "../repositories/answerRepository.js";
import answerReviewRepository from "../repositories/answerReviewRepository.js";
import { buildRanking } from "../game/ranking.js";
import { notFound } from "../lib/errors.js";
import { getRoomSettings } from "./room/roomSettings.js";

/**
 * Avaliacoes atribuidas a um aluno na correcao colaborativa, no mesmo
 * formato anonimo de `reviewAssigned` (spec 10) — usado para a
 * reconexao recuperar o estado sem depender de ter recebido o evento ao
 * vivo (spec 38/45).
 */
async function reviewsForPlayer(round, playerSessionId) {
  if (!round || round.status !== "COLLABORATIVE_CORRECTION") return [];
  const assigned = await answerReviewRepository.listByGrader(round.id, playerSessionId);
  return assigned.map((review) => ({
    reviewId: review.id,
    roundCategoryId: review.answer.roundCategoryId,
    categoryName: review.answer.roundCategory.name,
    value: review.answer.value,
    decision: review.decision,
  }));
}

/**
 * Projecoes enviadas aos clientes.
 *
 * Cada perfil recebe apenas o necessario (spec 49):
 *  - aluno: a propria rodada e as proprias respostas;
 *  - professor: estado completo da sala e progresso agregado;
 *  - tela publica: nada de dados privados (spec 4.3).
 */

// A letra sempre aparece a partir de PLAYING. Durante STARTING ela so
// aparece depois que `revealAt` e preenchido — ou seja, depois que a
// animacao publica e a contagem regressiva sincronizada terminaram
// (enhancements.md secoes 4-7). READY nunca revela: e exatamente a fase em
// que a tela publica esta tocando o "drama" do sorteio.
const LETTER_REVEALED_STATUSES = [
  "PLAYING",
  "STOPPED",
  "COLLABORATIVE_CORRECTION",
  "CORRECTION",
  "SCORED",
  "FINISHED",
];

/**
 * Anexa a posição `(roomEpoch, stateVersion)` a uma projeção — o par que o
 * cliente usa para ordenar/adotar estados autoritativos (spec). Sem versão
 * (chamadas que optaram por não passar `version`) devolve a projeção como
 * está, preservando o comportamento de chamadas internas antigas.
 */
function withVersion(state, version) {
  if (!version) return state;
  return {
    ...state,
    roomEpoch: version.roomEpoch,
    stateVersion: version.stateVersion,
  };
}

/** Monta o round como o aluno deve ve-lo: letra oculta antes da revelacao. */
function roundForPlayer(round) {
  const summary = roundSummary(round);
  if (!summary) return null;
  const revealed = LETTER_REVEALED_STATUSES.includes(summary.status) || Boolean(summary.revealAt);
  return revealed ? summary : { ...summary, letter: null };
}

/** A letra so e revelada depois de sorteada. */
function roundSummary(round) {
  if (!round) return null;
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    themeName: round.themeName,
    letter: round.letter || null,
    letterRule: round.letterRule,
    durationSeconds: round.durationSeconds,
    startedAt: round.startedAt,
    revealAt: round.revealAt,
    endsAt: round.endsAt,
    collaborativeCorrectionEndsAt: round.collaborativeCorrectionEndsAt,
    stoppedAt: round.stoppedAt,
    stopReason: round.stopReason,
    firstStopperId: round.firstStopperId,
    firstStopperName: round.firstStopper?.student?.name ?? null,
    categories: (round.categories ?? []).map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      required: category.required,
      order: category.order,
    })),
  };
}

async function filledCountByPlayer(roundId) {
  const rows = await prisma.answer.groupBy({
    by: ["playerSessionId"],
    where: { roundId, NOT: { normalizedValue: "" } },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.playerSessionId, row._count._all]));
}

/**
 * Ranking oficial de uma partida (spec 42): unica fonte usada pelas
 * projecoes de sala (professor/tela publica/aluno) e por
 * `gameService.ranking` (consulta administrativa) — evita duas
 * implementacoes divergentes do mesmo calculo. `gameService.finish`
 * tambem usa este resultado para gravar o `GameResult` permanente de cada
 * aluno — um bug aqui nao seria so cosmetico, viraria historico academico
 * errado.
 *
 * `includeRegistration` fica desligado por padrao: a tela publica usa
 * este mesmo ranking e nunca pode expor a matricula do aluno (spec 4.3).
 * So a consulta administrativa (`gameService.ranking`, atras de
 * `requireTeacher`) pede explicitamente esse campo.
 *
 * So entra no ranking quem participou de pelo menos uma rodada. `join`
 * cria um `Score` zerado assim que o aluno entra na sala (para o placar
 * já existir se ele acompanhar a rodada seguinte) — sem esse filtro, um
 * aluno que só entrou na sala e nunca chegou a jogar uma rodada aparecia
 * empatado em último lugar com uma colocação que não significa nada.
 */
async function loadRanking(gameId, { includeRegistration = false } = {}) {
  const [scores, participantStudentIds] = await Promise.all([
    scoreRepository.listByGame(gameId),
    roundParticipantRepository.listParticipatingStudentIds(gameId),
  ]);
  return buildRanking(
    scores
      .filter((score) => participantStudentIds.has(score.studentId))
      .map((score) => ({
      studentId: score.studentId,
      name: score.student?.name ?? "—",
      ...(includeRegistration ? { registrationNumber: score.student?.registrationNumber ?? null } : {}),
      avatarUrl: score.student?.avatarUrl ?? null,
      total: score.total,
    })),
  );
}

export const viewService = {
  roundSummary,
  loadRanking,

  async loadRoomContext(roomCode) {
    const room = await roomRepository.findByCode(roomCode);
    if (!room) throw notFound("Sala não encontrada");
    const round = await roundRepository.findCurrentByGame(room.gameId);
    return { room, round };
  },

  /**
   * Estado completo para o painel do professor.
   *
   * `ctx` opcional permite ao broadcast calcular `room`/`round`/
   * `participants`/`ranking` uma unica vez e reaproveitar nas tres
   * projecoes — sem isso, cada chamada independente refaz as mesmas
   * consultas (o padrao N+1 que disparava ~6 queries de ranking por
   * difusao, fixme.md #2). Chamadas avulsas (REST) continuam carregando
   * tudo sozinhas.
   */
  async teacherState(roomCode, ctx = {}) {
    const { room, round } = ctx.room ? ctx : await viewService.loadRoomContext(roomCode);
    const participants =
      ctx.participants !== undefined
        ? ctx.participants
        : round
          ? await roundParticipantRepository.listByRound(round.id)
          : [];
    const participantBySession = new Map(participants.map((p) => [p.playerSessionId, p]));
    const filled = round ? await filledCountByPlayer(round.id) : new Map();
    const requiredCount = round
      ? round.categories.filter((category) => category.required).length
      : 0;

    return withVersion(
      {
        room: { id: room.id, code: room.code, status: room.status },
        settings: getRoomSettings(room.code),
        game: {
          id: room.game.id,
          name: room.game.name,
          status: room.game.status,
          className: room.game.class?.name ?? null,
        },
        round: roundSummary(round),
        serverTime: new Date().toISOString(),
        requiredCount,
        players: room.sessions.map((session) => {
          const participant = participantBySession.get(session.id);
          return {
            playerSessionId: session.id,
            studentId: session.studentId,
            name: session.student.name,
            registrationNumber: session.student.registrationNumber,
            avatarUrl: session.student.avatarUrl,
            connected: Boolean(session.socketId),
            roomStatus: session.status,
            roundStatus: participant?.status ?? null,
            filled: filled.get(session.id) ?? 0,
            roundScore: participant?.roundScore ?? 0,
          };
        }),
        ranking: ctx.ranking !== undefined ? ctx.ranking : await loadRanking(room.gameId),
      },
      ctx.version,
    );
  },

  /** Estado da TV/projetor: sem dados privados dos alunos (spec 4.3). */
   async publicState(roomCode, ctx = {}) {
     const { room, round } = ctx.room ? ctx : await viewService.loadRoomContext(roomCode);
     const participants =
       ctx.participants !== undefined
         ? ctx.participants
         : round
           ? await roundParticipantRepository.listByRound(round.id)
           : [];
     const activePlayers = participants.filter((p) => p.status === "PLAYING").length;
 
     return withVersion(
       {
         room: { code: room.code, status: room.status },
         settings: getRoomSettings(room.code),
         game: { name: room.game.name, className: room.game.class?.name ?? null, status: room.game.status },
         round: roundSummary(round),
         serverTime: new Date().toISOString(),
         connectedPlayers: room.sessions.filter((session) => Boolean(session.socketId)).length,
         totalPlayers: room.sessions.length,
         activePlayers,
         submittedPlayers: participants.filter((p) => p.status === "SUBMITTED").length,
         eliminatedPlayers: participants.filter((p) => p.status === "ELIMINATED").length,
         ranking: ctx.ranking !== undefined ? ctx.ranking : await loadRanking(room.gameId),
       },
       ctx.version,
     );
   },

  /**
   * Mesmo formato de `playerState`, mas para todos os jogadores da sala de
   * uma vez (usado no broadcast apos cada mudanca de rodada). Em vez de
   * repetir a consulta da rodada e buscar participante/respostas aluno por
   * aluno — o padrao N+1 que `playerState` tem ao ser chamado em loop —,
   * carrega a sala, os participantes e as respostas em uma consulta cada
   * e monta o estado de cada aluno em memoria (spec 49).
   */
  async playerStatesForRoom(roomCode, ctx = {}) {
    const { room, round } = ctx.room ? ctx : await viewService.loadRoomContext(roomCode);
    const participants =
      ctx.participants !== undefined
        ? ctx.participants
        : round
          ? await roundParticipantRepository.listByRound(round.id)
          : [];
    const participantBySession = new Map(participants.map((p) => [p.playerSessionId, p]));

    const answersByPlayer = new Map();
    if (round) {
      for (const answer of await answerRepository.listByRound(round.id)) {
        const list = answersByPlayer.get(answer.playerSessionId) ?? [];
        list.push(answer);
        answersByPlayer.set(answer.playerSessionId, list);
      }
    }

    // Avaliacoes atribuidas, agrupadas por avaliador — mesmo padrao acima:
    // uma consulta para a sala inteira em vez de uma por aluno (spec 49).
    const reviewsByGrader = new Map();
    if (round && round.status === "COLLABORATIVE_CORRECTION") {
      for (const review of await answerReviewRepository.listByRoundWithAnswers(round.id)) {
        const list = reviewsByGrader.get(review.graderPlayerSessionId) ?? [];
        list.push({
          reviewId: review.id,
          roundCategoryId: review.answer.roundCategoryId,
          categoryName: review.answer.roundCategory.name,
          value: review.answer.value,
          decision: review.decision,
        });
        reviewsByGrader.set(review.graderPlayerSessionId, list);
      }
    }

    // A letra e o tema so aparecem quando o servidor autoriza — mesma
    // regra para todos os alunos da sala nesse instante do broadcast.
    const roundForPlayers = roundForPlayer(round);
    const serverTime = new Date().toISOString();
    // Calculado uma unica vez para a sala inteira (nao por aluno): mesmo
    // motivo do `reviewsByGrader` acima. Sem isso, o ranking so chegava ao
    // aluno pelo evento pontual `rankingUpdated` — quem reconectasse depois
    // (tela apagou, saiu da tela cheia, atualizou a pagina) nunca via a
    // colocacao final, so quem estava conectado no instante exato da
    // pontuacao/finalizacao. So carrega (e revela nomes de colegas) quando
    // ja faz sentido mostrar — nunca durante uma rodada em andamento
    // (spec 49: aluno so ve as proprias respostas antes disso). A checagem
    // inclui `game.status === "FINISHED"` porque "Finalizar partida" pode
    // ser clicado a qualquer momento, inclusive com a ultima rodada ainda
    // em correcao (nunca pontuada) — sem isso, o ranking final nunca
    // aparecia nesse caso, mesmo com a partida encerrada.
    const showRanking =
      room.game.status === "FINISHED" || !round || round.status === "SCORED" || round.status === "FINISHED";
    const ranking = showRanking ? (ctx.ranking !== undefined ? ctx.ranking : await loadRanking(room.gameId)) : [];

    return new Map(
      room.sessions.map((session) => {
        const participant = participantBySession.get(session.id);
        const answers = answersByPlayer.get(session.id) ?? [];
        return [
          session.id,
          withVersion(
            {
              playerSessionId: session.id,
              student: session.student,
              room: { code: room.code, status: room.status },
              game: { id: room.game.id, name: room.game.name, status: room.game.status },
              roomStatus: session.status,
              roundStatus: participant?.status ?? null,
              round: roundForPlayers,
              serverTime,
              answers: answers.map((answer) => ({
                roundCategoryId: answer.roundCategoryId,
                value: answer.value,
              })),
              reviews: reviewsByGrader.get(session.id) ?? [],
              ranking,
              canAnswer:
                Boolean(round) && round.status === "PLAYING" && participant?.status === "PLAYING",
            },
            ctx.version,
          ),
        ];
      }),
    );
  },

  /** Estado do aluno: apenas a propria rodada e as proprias respostas. */
  async playerState(playerSessionId, version = null) {
    const session = await prisma.playerSession.findUnique({
      where: { id: playerSessionId },
      include: {
        student: { select: { id: true, name: true, registrationNumber: true, avatarUrl: true } },
        room: { include: { game: { include: { class: true } } } },
      },
    });
    if (!session) throw notFound("Sessão do aluno não encontrada");

    const round = await roundRepository.findCurrentByGame(session.room.gameId);
    const participant = round
      ? await roundParticipantRepository.find(round.id, session.id)
      : null;
    const answers = round ? await answerRepository.listByPlayer(round.id, session.id) : [];
    const reviews = await reviewsForPlayer(round, session.id);
    // Mesma condicao de `playerStatesForRoom`, incluindo `game.status ===
    // "FINISHED"` (a partida pode ser finalizada com a ultima rodada ainda
    // em correcao, nunca pontuada).
    const showRanking =
      session.room.game.status === "FINISHED" ||
      !round ||
      round.status === "SCORED" ||
      round.status === "FINISHED";

    return withVersion(
      {
        playerSessionId: session.id,
        student: session.student,
        room: { code: session.room.code, status: session.room.status },
        game: { id: session.room.game.id, name: session.room.game.name, status: session.room.game.status },
        roomStatus: session.status,
        roundStatus: participant?.status ?? null,
        round: roundForPlayer(round),
        reviews,
        ranking: showRanking ? await loadRanking(session.room.gameId) : [],
        serverTime: new Date().toISOString(),
        answers: answers.map((answer) => ({
          roundCategoryId: answer.roundCategoryId,
          value: answer.value,
        })),
        canAnswer:
          Boolean(round) &&
          round.status === "PLAYING" &&
          participant?.status === "PLAYING",
      },
      version,
    );
  },
};

export default viewService;
