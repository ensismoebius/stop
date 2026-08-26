import { Router } from "express";
import studentController from "../controllers/studentController.js";
import { requireTeacher } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { studentSchema, studentUpdateSchema, studentBulkSchema } from "../validators/schemas.js";
import { authLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Rota publica: o aluno consulta o proprio historico so com a matricula
// (mesmo modelo de confianca do identify de sala, spec 6). Precisa vir
// antes do requireTeacher abaixo, que protege o resto deste router.
router.get("/history/:registrationNumber", authLimiter, studentController.history);

router.use(requireTeacher);

router.get("/", studentController.list);
router.get("/:id", studentController.get);
router.post("/", validateBody(studentSchema), studentController.create);
router.post("/bulk", validateBody(studentBulkSchema), studentController.bulk);
router.patch("/:id", validateBody(studentUpdateSchema), studentController.update);
router.delete("/:id", studentController.remove);

export default router;
