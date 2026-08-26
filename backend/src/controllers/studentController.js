import asyncHandler from "../lib/asyncHandler.js";
import studentService from "../services/studentService.js";

export const studentController = {
  list: asyncHandler(async (req, res) => {
    const classId = req.query.classId ? Number(req.query.classId) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    res.json(await studentService.list({ classId, search }));
  }),
  get: asyncHandler(async (req, res) => res.json(await studentService.get(Number(req.params.id)))),
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await studentService.create(req.body)),
  ),
  bulk: asyncHandler(async (req, res) =>
    res.status(201).json(await studentService.bulkCreate(req.body)),
  ),
  update: asyncHandler(async (req, res) =>
    res.json(await studentService.update(Number(req.params.id), req.body)),
  ),
  remove: asyncHandler(async (req, res) => {
    await studentService.remove(Number(req.params.id));
    res.status(204).end();
  }),
  history: asyncHandler(async (req, res) =>
    res.json(await studentService.historyByRegistration(req.params.registrationNumber)),
  ),
};

export default studentController;
