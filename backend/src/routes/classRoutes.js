import { Router } from "express";
import classController from "../controllers/classController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { classSchema, classUpdateSchema } from "../validators/schemas.js";

const router = Router();

// Endpoints administrativos: sempre protegidos (spec 34).
router.use(requireTeacher);

router.get("/", classController.list);
router.get("/:id", classController.get);
router.post("/", validateBody(classSchema), classController.create);
router.patch("/:id", validateBody(classUpdateSchema), classController.update);
router.delete("/:id", classController.remove);

export default router;
