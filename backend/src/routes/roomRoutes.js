import { Router } from "express";
import roomController from "../controllers/roomController.js";
import { requireTeacher, requirePlayer } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { roomJoinSchema, roomAvatarSchema } from "../validators/schemas.js";
import { authLimiter } from "../middleware/rateLimit.js";

const router = Router();

// Rotas publicas usadas pelo celular do aluno antes de existir sessao.
router.get("/:code", roomController.get);
router.post(
  "/:code/identify",
  authLimiter,
  validateBody(roomJoinSchema),
  roomController.identify,
);
router.post("/:code/join", authLimiter, validateBody(roomJoinSchema), roomController.join);
router.post(
  "/:code/avatar",
  authLimiter,
  validateBody(roomAvatarSchema),
  roomController.setAvatar,
);

// Rota do aluno ja identificado.
router.get("/:code/me", requirePlayer, roomController.playerState);

// Tela publica (TV): sem dados privados. O QR Code so aponta para a URL de
// entrada (ja exibida em texto na mesma tela), entao nao precisa de sessao
// administrativa — a tela publica tambem o exibe (spec 36).
router.get("/:code/public-state", roomController.publicState);
router.get("/:code/qrcode", roomController.qrCode);

// Rotas administrativas.
router.get("/:code/state", requireTeacher, roomController.teacherState);
router.post("/:code/close", requireTeacher, roomController.close);
router.patch("/:code/settings", requireTeacher, roomController.updateSettings);

export default router;
