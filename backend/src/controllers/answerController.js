import asyncHandler from "../lib/asyncHandler.js";
import answerService from "../services/answerService.js";

export const answerController = {
  review: asyncHandler(async (req, res) =>
    res.json(await answerService.review(Number(req.params.id), req.body.reviewState)),
  ),

  reviewMany: asyncHandler(async (req, res) =>
    res.json(await answerService.reviewMany(req.body.reviews)),
  ),
};

export default answerController;
