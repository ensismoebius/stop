import asyncHandler from "../lib/asyncHandler.js";
import categoryService from "../services/categoryService.js";

export const categorySetController = {
  list: asyncHandler(async (req, res) =>
    res.json(await categoryService.listSets({ onlyActive: req.query.active === "true" })),
  ),
  get: asyncHandler(async (req, res) => res.json(await categoryService.getSet(Number(req.params.id)))),
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await categoryService.createSet(req.body)),
  ),
  update: asyncHandler(async (req, res) =>
    res.json(await categoryService.updateSet(Number(req.params.id), req.body)),
  ),
  remove: asyncHandler(async (req, res) => {
    await categoryService.removeSet(Number(req.params.id));
    res.status(204).end();
  }),
};

export const categoryController = {
  list: asyncHandler(async (req, res) =>
    res.json(
      await categoryService.listCategories(
        req.query.categorySetId ? Number(req.query.categorySetId) : undefined,
      ),
    ),
  ),
  get: asyncHandler(async (req, res) =>
    res.json(await categoryService.getCategory(Number(req.params.id))),
  ),
  create: asyncHandler(async (req, res) =>
    res.status(201).json(await categoryService.createCategory(req.body)),
  ),
  update: asyncHandler(async (req, res) =>
    res.json(await categoryService.updateCategory(Number(req.params.id), req.body)),
  ),
  remove: asyncHandler(async (req, res) => {
    await categoryService.removeCategory(Number(req.params.id));
    res.status(204).end();
  }),
};

export default categorySetController;
