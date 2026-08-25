import asyncHandler from "../lib/asyncHandler.js";
import classService from "../services/classService.js";

export const classController = {
  list: asyncHandler(async (_req, res) => res.json(await classService.list())),
  get: asyncHandler(async (req, res) => res.json(await classService.get(Number(req.params.id)))),
  create: asyncHandler(async (req, res) => res.status(201).json(await classService.create(req.body))),
  update: asyncHandler(async (req, res) =>
    res.json(await classService.update(Number(req.params.id), req.body)),
  ),
  remove: asyncHandler(async (req, res) => {
    await classService.remove(Number(req.params.id));
    res.status(204).end();
  }),
};

export default classController;
