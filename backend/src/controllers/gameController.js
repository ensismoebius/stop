import asyncHandler from "../lib/asyncHandler.js";
import gameService from "../services/gameService.js";
import roomService from "../services/roomService.js";
import roundService from "../services/roundService.js";
import statisticsService from "../services/statisticsService.js";

export const gameController = {
  list: asyncHandler(async (_req, res) => res.json(await gameService.list())),

  get: asyncHandler(async (req, res) => res.json(await gameService.get(Number(req.params.id)))),

  create: asyncHandler(async (req, res) => {
    const game = await gameService.create({ ...req.body, teacherId: req.teacher.id });
    res.status(201).json(game);
  }),

  createRoom: asyncHandler(async (req, res) => {
    const room = await roomService.create(Number(req.params.id));
    res.status(201).json(room);
  }),

  scores: asyncHandler(async (req, res) =>
    res.json({ ranking: await gameService.ranking(Number(req.params.id)) }),
  ),

  history: asyncHandler(async (req, res) => res.json(await gameService.history(Number(req.params.id)))),

  statistics: asyncHandler(async (req, res) =>
    res.json(await statisticsService.forGame(Number(req.params.id))),
  ),

  letters: asyncHandler(async (req, res) =>
    res.json({ usedLetters: await gameService.usedLetters(Number(req.params.id)) }),
  ),

  nextRound: asyncHandler(async (req, res) => {
    const round = await roundService.next({ ...req.body, gameId: Number(req.params.id) });
    res.status(201).json(round);
  }),

  finish: asyncHandler(async (req, res) => res.json(await gameService.finish(Number(req.params.id)))),

  removeRound: asyncHandler(async (req, res) => {
    await gameService.removeRound(Number(req.params.id), Number(req.params.roundId));
    res.status(204).end();
  }),
};

export default gameController;
