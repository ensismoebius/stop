import prisma from "../lib/prisma.js";
import gameRepository from "../repositories/gameRepository.js";
import classRepository from "../repositories/classRepository.js";
import roundRepository, { roundParticipantRepository } from "../repositories/roundRepository.js";
import roomRepository from "../repositories/roomRepository.js";
import viewService from "./viewService.js";
import { resolveRoom, broadcastState } from "./round/shared.js";
import * as realtime from "../sockets/realtime.js";
import logger from "../lib/logger.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";

export const gameService = {
  list: (filters) => gameRepository.list(filters),

  async get(id) {
    const game = await gameRepository.findById(id);
    if (!game) throw notFound("Partida não encontrada");
    return game;
  },

  async create({ name, classId, teacherId }) {
    const turma = await classRepository.findById(classId);
    if (!turma) throw badRequest("Turma inexistente");
    return gameRepository.create({ name, classId, teacherId, status: "CREATED" });
  },

  /**
   * Finaliza a partida e grava o resultado de cada aluno (`GameResult`) —
   * registro permanente que alimenta os relatorios academicos entre
   * partidas/turmas, distinto de `Score` (total corrente da partida em
   * andamento). Top 3 posicoes ganham medalha; empates contam pela posicao
   * (nao pelo indice na lista), entao dois alunos empatados em 1o lugar
   * ganham ouro os dois.
   */
  async finish(id) {
    await gameService.get(id);

    // Encerra a rodada em andamento ANTES de qualquer outra coisa. Sem
    // isso "Finalizar partida" so mexia na tabela Game: a rodada seguia
    // PLAYING, a sala seguia OPEN e os alunos continuavam conseguindo
    // responder — ou seja, a partida "terminava" sem terminar de fato.
    // Cancelar (em vez de pontuar) preserva as respostas para auditoria
    // (spec 44) sem inventar pontos de uma rodada que nunca foi corrigida.
    const current = await roundRepository.findCurrentByGame(id);
    if (current && current.status !== "FINISHED") {
      const { default: roundService } = await import("./roundService.js");
      await roundService.cancel(current.id, {
        message: "A partida foi encerrada pelo professor. Confira o resultado final.",
      });
    }

    const updated = await gameRepository.update(id, { status: "FINISHED", finishedAt: new Date() });

    const ranking = await viewService.loadRanking(id);
    const medalFor = (position) =>
      position === 1 ? "GOLD" : position === 2 ? "SILVER" : position === 3 ? "BRONZE" : null;
    if (ranking.length > 0) {
      await prisma.$transaction(
        ranking.map((entry) =>
          prisma.gameResult.upsert({
            where: { gameId_studentId: { gameId: id, studentId: entry.studentId } },
            create: {
              gameId: id,
              studentId: entry.studentId,
              score: entry.total,
              position: entry.position,
              medal: medalFor(entry.position),
            },
            update: {
              score: entry.total,
              position: entry.position,
              medal: medalFor(entry.position),
            },
          }),
        ),
      );
    }

    // Best-effort: quem estiver conectado agora precisa ver o podio final
    // na hora (tela publica/aluno ja mostram o ranking quando
    // game.status === FINISHED — so faltava avisa-los). Nunca deixa uma
    // falha aqui derrubar a finalizacao, que ja foi persistida com sucesso.
    try {
      const room = await resolveRoom(id);
      // Fecha a sala: impede que alguem entre numa partida ja encerrada.
      // Nao derruba quem ja esta conectado (CLOSED so bloqueia `join`),
      // entao os alunos presentes continuam recebendo o estado e veem o
      // podio normalmente.
      if (room.status !== "CLOSED") {
        await roomRepository.update(room.id, { status: "CLOSED" });
        realtime.toRoom(room.code, "roomStatusChanged", { status: "CLOSED" });
      }
      realtime.toRoom(room.code, "rankingUpdated", { ranking });
      await broadcastState(room.code);
    } catch (error) {
      logger.warn(`Falha ao difundir estado após finalizar a partida ${id}`, error?.message ?? error);
    }

    return updated;
  },

  /** Ranking oficial: sempre calculado pelo servidor (spec 42). */
  async ranking(gameId) {
    await gameService.get(gameId);
    return viewService.loadRanking(gameId, { includeRegistration: true });
  },

  /** Historico completo da partida para auditoria (spec 44). */
  async history(gameId) {
    const game = await gameService.get(gameId);
    const rounds = await roundRepository.listByGame(gameId);
    return {
      game: { id: game.id, name: game.name, status: game.status, className: game.class?.name },
      rounds: rounds.map((round) => ({
        id: round.id,
        roundNumber: round.roundNumber,
        themeName: round.themeName,
        letter: round.letter,
        status: round.status,
        durationSeconds: round.durationSeconds,
        startedAt: round.startedAt,
        stoppedAt: round.stoppedAt,
        stopReason: round.stopReason,
        firstStopper: round.firstStopper?.student?.name ?? null,
        categories: round.categories.map((category) => category.name),
      })),
    };
  },

  usedLetters: (gameId) => gameRepository.usedLetters(gameId),

  /**
   * Remove uma rodada do histórico. Só rodadas já concluídas (SCORED ou
   * FINISHED) podem ser removidas — uma em andamento nunca some debaixo
   * dos jogadores. Reverte primeiro os pontos que ela tiver gerado (via
   * `RoundParticipant.roundScore`, que já soma base + bônus da correção
   * colaborativa) para o ranking não ficar inflado; a exclusão do round em
   * si cai em cascata sobre categorias/participantes/respostas/avaliações
   * pelo schema.
   */
  async removeRound(gameId, roundId) {
    const round = await roundRepository.findById(roundId);
    if (!round || round.gameId !== gameId) throw notFound("Rodada não encontrada");
    if (!["SCORED", "FINISHED"].includes(round.status)) {
      throw conflict("Só é possível remover rodadas já concluídas");
    }

    const participants = await roundParticipantRepository.listByRound(roundId);
    await prisma.$transaction([
      ...participants
        .filter((participant) => participant.roundScore !== 0)
        .map((participant) =>
          prisma.score.updateMany({
            where: { gameId, studentId: participant.playerSession.studentId },
            data: { total: { decrement: participant.roundScore } },
          }),
        ),
      prisma.round.delete({ where: { id: roundId } }),
    ]);

    // Best-effort: o ranking pode ter mudado para quem estiver conectado
    // agora (spec 42/45). Nunca deixa uma falha aqui derrubar a remocao,
    // que ja foi persistida com sucesso.
    try {
      const room = await resolveRoom(gameId);
      const ranking = await viewService.loadRanking(gameId);
      realtime.toRoom(room.code, "rankingUpdated", { ranking });
      await broadcastState(room.code);
    } catch (error) {
      logger.warn(`Falha ao difundir estado após remover a rodada ${roundId}`, error?.message ?? error);
    }
  },
};

export default gameService;
