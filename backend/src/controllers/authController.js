import asyncHandler from "../lib/asyncHandler.js";
import authService from "../services/authService.js";

export const authController = {
  login: asyncHandler(async (req, res) => {
    const result = await authService.login(req.body);
    res.json(result);
  }),

  me: asyncHandler(async (req, res) => {
    res.json({ teacher: req.teacher });
  }),
};

export default authController;
