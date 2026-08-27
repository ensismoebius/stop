import asyncHandler from "../lib/asyncHandler.js";
import maintenanceService from "../services/maintenanceService.js";

export const maintenanceController = {
  exportBackup: asyncHandler(async (_req, res) => {
    const backup = await maintenanceService.exportAll();
    const filename = `stop-backup-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.json(backup);
  }),

  restoreBackup: asyncHandler(async (req, res) => {
    await maintenanceService.importAll(req.body);
    res.json({ status: "ok" });
  }),

  eraseHistory: asyncHandler(async (req, res) => {
    const result = await maintenanceService.eraseHistory();
    res.json(result);
  }),
};

export default maintenanceController;
