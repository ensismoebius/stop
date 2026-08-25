import prisma from "../lib/prisma.js";
import roomRepository from "../repositories/roomRepository.js";
import roundRepository, { roundParticipantRepository } from "../repositories/roundRepository.js";
import scoreRepository from "../repositories/scoreRepository.js";
import answerRepository from "../repositories/answerRepository.js";
import { buildRanking } from "../game/scoring.js";
import { notFound } from "../lib/errors.js";

/**
 * Projecoes enviadas aos clientes.
 *
 * Cada perfil recebe apenas o necessario (spec 49):
 *  - aluno: a propria rodada e as proprias respostas;
 *  - professor: estado completo da sala e progresso agregado;
 *  - tela publica: nada de dados privados (spec 4.3).
 */

/** A letra so e revelada depois de sorteada. */
function roundSummary(round) {
  if (!round) return null;
  return {
    id: round.id,
    roundNumber: round.roundNumber,
    status: round.status,
    themeName: round.themeName,
    letter: round.letter || null,
    durationSeconds: round.durationSeconds,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
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

async function loadRanking(gameId) {
  const scores = await scoreRepository.listByGame(gameId);
  return buildRanking(
    scores.map((score) => ({
      studentId: score.studentId,
      name: score.student?.name ?? "—",
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

  /** Estado completo para o painel do professor. */
  async teacherState(roomCode) {
    const { room, round } = await viewService.loadRoomContext(roomCode);
    const participants = round ? await roundParticipantRepository.listByRound(round.id) : [];
    const participantBySession = new Map(participants.map((p) => [p.playerSessionId, p]));
    const filled = round ? await filledCountByPlayer(round.id) : new Map();
    const requiredCount = round
      ? round.categories.filter((category) => category.required).length
      : 0;

    return {
      room: { id: room.id, code: room.code, status: room.status },
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
      ranking: await loadRanking(room.gameId),
    };
  },

  /** Estado da TV/projetor: sem dados privados dos alunos (spec 4.3). */
  async publicState(roomCode) {
    const { room, round } = await viewService.loadRoomContext(roomCode);
    const participants = round ? await roundParticipantRepository.listByRound(round.id) : [];
    const activePlayers = participants.filter((p) => p.status === "PLAYING").length;

    return {
      room: { code: room.code, status: room.status },
      game: { name: room.game.name, className: room.game.class?.name ?? null, status: room.game.status },
      round: roundSummary(round),
      serverTime: new Date().toISOString(),
      connectedPlayers: room.sessions.filter((session) => Boolean(session.socketId)).length,
      totalPlayers: room.sessions.length,
      activePlayers,
      submittedPlayers: participants.filter((p) => p.status === "SUBMITTED").length,
      eliminatedPlayers: participants.filter((p) => p.status === "ELIMINATED").length,
      ranking: await loadRanking(room.gameId),
    };
  },

  /** Estado do aluno: apenas a propria rodada e as proprias respostas. */
  async playerState(playerSessionId) {
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

    const summary = roundSummary(round);
    // A letra e o tema so aparecem quando o servidor autoriza.
    const revealed = summary && ["READY", "STARTING", "PLAYING", "STOPPED", "CORRECTION", "SCORED", "FINISHED"].includes(summary.status);

    return {
      playerSessionId: session.id,
      student: session.student,
      room: { code: session.room.code, status: session.room.status },
      game: { id: session.room.game.id, name: session.room.game.name },
      roomStatus: session.status,
      roundStatus: participant?.status ?? null,
      round: revealed ? summary : summary ? { ...summary, letter: null } : null,
      serverTime: new Date().toISOString(),
      answers: answers.map((answer) => ({
        roundCategoryId: answer.roundCategoryId,
        value: answer.value,
      })),
      canAnswer:
        Boolean(round) &&
        round.status === "PLAYING" &&
        participant?.status === "PLAYING",
    };
  },
};

export default viewService;
