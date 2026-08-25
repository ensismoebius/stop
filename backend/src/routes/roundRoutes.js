import { Router } from "express";
import roundController from "../controllers/roundController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { roundCreateSchema } from "../validators/schemas.js";

const router = Router();

router.use(requireTeacher);

router.post("/", validateBody(roundCreateSchema), roundController.create);
router.get("/:id", roundController.get);
router.post("/:id/letter", roundController.drawLetter);
router.post("/:id/start", roundController.start);
router.post("/:id/stop", roundController.stop);
router.post("/:id/correction", roundController.correction);
router.get("/:id/correction", roundController.correctionGrid);
router.post("/:id/score", roundController.score);
router.post("/:id/finish", roundController.finish);
router.post("/:id/cancel", roundController.cancel);
router.get("/:id/answers", roundController.answers);

export default router;
