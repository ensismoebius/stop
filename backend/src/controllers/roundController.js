import asyncHandler from "../lib/asyncHandler.js";
import roundService from "../services/roundService.js";
import answerService from "../services/answerService.js";

export const roundController = {
  create: asyncHandler(async (req, res) => res.status(201).json(await roundService.create(req.body))),

  get: asyncHandler(async (req, res) => res.json(await roundService.get(Number(req.params.id)))),

  drawLetter: asyncHandler(async (req, res) =>
    res.json(await roundService.drawRoundLetter(Number(req.params.id))),
  ),

  start: asyncHandler(async (req, res) => res.json(await roundService.start(Number(req.params.id)))),

  /** STOP administrativo (o STOP do aluno chega por Socket.IO). */
  stop: asyncHandler(async (req, res) => res.json(await roundService.forceStop(Number(req.params.id)))),

  correction: asyncHandler(async (req, res) =>
    res.json(await roundService.openCorrection(Number(req.params.id))),
  ),

  correctionGrid: asyncHandler(async (req, res) =>
    res.json(await roundService.correctionGrid(Number(req.params.id))),
  ),

  score: asyncHandler(async (req, res) => res.json(await roundService.score(Number(req.params.id)))),

  finish: asyncHandler(async (req, res) => res.json(await roundService.finish(Number(req.params.id)))),

  /** Descarta a rodada atual sem pontuar (botao "cancelar" do professor). */
  cancel: asyncHandler(async (req, res) => res.json(await roundService.cancel(Number(req.params.id)))),

  answers: asyncHandler(async (req, res) =>
    res.json(await answerService.listByRound(Number(req.params.id))),
  ),
};

export default roundController;
