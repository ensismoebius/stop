import { Router } from "express";
import authRoutes from "./authRoutes.js";
import classRoutes from "./classRoutes.js";
import studentRoutes from "./studentRoutes.js";
import categoryRoutes from "./categoryRoutes.js";
import gameRoutes from "./gameRoutes.js";
import roomRoutes from "./roomRoutes.js";
import roundRoutes from "./roundRoutes.js";
import answerRoutes from "./answerRoutes.js";
import reportRoutes from "./reportRoutes.js";
import maintenanceRoutes from "./maintenanceRoutes.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

router.use("/auth", authRoutes);
router.use("/classes", classRoutes);
router.use("/students", studentRoutes);
router.use(categoryRoutes);
router.use("/games", gameRoutes);
router.use("/rooms", roomRoutes);
router.use("/rounds", roundRoutes);
router.use("/answers", answerRoutes);
router.use("/reports", reportRoutes);
router.use("/maintenance", maintenanceRoutes);

export default router;
