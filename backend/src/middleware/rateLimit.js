import rateLimit from "express-rate-limit";
import env from "../config/env.js";

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Muitas requisições. Aguarde um instante." } },
};

/** Limite geral da API (spec 34). */
export const apiLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  ...common,
});

/** Limite mais estrito para login e identificacao por matricula. */
export const authLimiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.authMax,
  ...common,
});

export default apiLimiter;
