import { Router } from "express";
import answerController from "../controllers/answerController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { answerBulkReviewSchema, answerReviewSchema } from "../validators/schemas.js";

const router = Router();

router.use(requireTeacher);

router.patch("/:id", validateBody(answerReviewSchema), answerController.review);
router.post("/bulk-review", validateBody(answerBulkReviewSchema), answerController.reviewMany);

export default router;
