import asyncHandler from "../lib/asyncHandler.js";
import reportService from "../services/reportService.js";

const toInt = (value) => (value === undefined || value === "" ? undefined : Number(value));
const toDate = (value) => (value === undefined || value === "" ? undefined : new Date(value));

export const reportController = {
  search: asyncHandler(async (req, res) => {
    const { discipline, classId, studentId, gameId, medal, dateFrom, dateTo, scoreMin, scoreMax } =
      req.query;
    const results = await reportService.search({
      discipline: discipline || undefined,
      classId: toInt(classId),
      studentId: toInt(studentId),
      gameId: toInt(gameId),
      medal: medal || undefined,
      dateFrom: toDate(dateFrom),
      dateTo: toDate(dateTo),
      scoreMin: toInt(scoreMin),
      scoreMax: toInt(scoreMax),
    });
    res.json(results);
  }),
};

export default reportController;
