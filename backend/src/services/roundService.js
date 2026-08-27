import { lockKey, resolveRoom, getRoundOrFail, broadcastState, broadcastStateSoon } from "./round/shared.js";
import { create, drawRoundLetter, start, finish, cancel, next } from "./round/lifecycle.js";
import { requestStop, forceStop, handleTimeout, finalizeRound, eliminate } from "./round/stop.js";
import {
  openCorrection,
  score,
  correctionGrid,
  groupedCorrectionGrid,
  missingRequiredCategories,
} from "./round/correction.js";
import {
  startCollaborativeCorrection,
  submitReview,
  closeCollaborativeCorrection,
  collaborativeCorrectionProgress,
} from "./round/collaborativeCorrection.js";

export { lockKey };

export const roundService = {
  broadcastState,
  broadcastStateSoon,
  resolveRoom,
  create,
  drawRoundLetter,
  start,
  requestStop,
  forceStop,
  handleTimeout,
  finalizeRound,
  startCollaborativeCorrection,
  submitReview,
  closeCollaborativeCorrection,
  collaborativeCorrectionProgress,
  openCorrection,
  score,
  finish,
  cancel,
  next,
  eliminate,
  missingRequiredCategories,
  correctionGrid,
  groupedCorrectionGrid,
  get: getRoundOrFail,
};

export default roundService;
