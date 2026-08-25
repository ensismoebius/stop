import gameRepository from "../repositories/gameRepository.js";
import classRepository from "../repositories/classRepository.js";
import roundRepository from "../repositories/roundRepository.js";
import viewService from "./viewService.js";
import { badRequest, notFound } from "../lib/errors.js";

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

  async finish(id) {
    await gameService.get(id);
    return gameRepository.update(id, { status: "FINISHED", finishedAt: new Date() });
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
};

export default gameService;
