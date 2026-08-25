import { Router } from "express";
import studentController from "../controllers/studentController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { studentSchema, studentUpdateSchema, studentBulkSchema } from "../validators/schemas.js";

const router = Router();

router.use(requireTeacher);

router.get("/", studentController.list);
router.get("/:id", studentController.get);
router.post("/", validateBody(studentSchema), studentController.create);
router.post("/bulk", validateBody(studentBulkSchema), studentController.bulk);
router.patch("/:id", validateBody(studentUpdateSchema), studentController.update);
router.delete("/:id", studentController.remove);

export default router;
