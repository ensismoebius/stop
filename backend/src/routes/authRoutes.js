import { Router } from "express";
import authController from "../controllers/authController.js";
import { validateBody } from "../middleware/validate.js";
import { loginSchema } from "../validators/schemas.js";
import { requireTeacher } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimit.js";

const router = Router();

router.post("/login", authLimiter, validateBody(loginSchema), authController.login);
router.get("/me", requireTeacher, authController.me);

export default router;
