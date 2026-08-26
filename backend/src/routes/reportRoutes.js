import { Router } from "express";
import reportController from "../controllers/reportController.js";
import { requireTeacher } from "../middleware/auth.js";

const router = Router();

router.use(requireTeacher);

router.get("/results", reportController.search);
router.get("/category-stats", reportController.categoryStats);

export default router;
