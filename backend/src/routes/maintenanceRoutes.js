import { Router } from "express";
import maintenanceController from "../controllers/maintenanceController.js";
import { requireTeacher } from "../middleware/auth.js";

const router = Router();

router.use(requireTeacher);

router.get("/backup", maintenanceController.exportBackup);
router.post("/restore", maintenanceController.restoreBackup);
router.delete("/history", maintenanceController.eraseHistory);

export default router;
