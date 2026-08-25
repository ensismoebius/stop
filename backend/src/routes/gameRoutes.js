import { Router } from "express";
import gameController from "../controllers/gameController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { gameSchema, roundCreateSchema } from "../validators/schemas.js";

const router = Router();

router.use(requireTeacher);

router.get("/", gameController.list);
router.post("/", validateBody(gameSchema), gameController.create);
router.get("/:id", gameController.get);
router.post("/:id/rooms", gameController.createRoom);
router.get("/:id/scores", gameController.scores);
router.get("/:id/history", gameController.history);
router.delete("/:id/rounds/:roundId", gameController.removeRound);
router.get("/:id/statistics", gameController.statistics);
router.get("/:id/letters", gameController.letters);
router.post(
  "/:id/rounds/next",
  validateBody(roundCreateSchema.omit({ gameId: true })),
  gameController.nextRound,
);
router.post("/:id/finish", gameController.finish);

export default router;
