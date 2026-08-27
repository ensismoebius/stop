import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import env from "./config/env.js";
import logger from "./lib/logger.js";
import routes from "./routes/index.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
const frontendSrc = path.resolve(__dirname, "../../frontend/src");

/** Data de modificacao mais recente da arvore — usada so pelo aviso abaixo. */
function newestMtimeMs(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const mtime = entry.isDirectory() ? newestMtimeMs(full) : fs.statSync(full).mtimeMs;
    if (mtime > newest) newest = mtime;
  }
  return newest;
}

/**
 * Este servidor entrega o frontend ja compilado (`frontend/dist`), nunca o
 * codigo-fonte. Se alguem altera `frontend/src` e esquece de rodar
 * `npm run build`, o navegador continua recebendo o bundle antigo: a
 * correcao existe no repositorio, passa nos testes, e mesmo assim "nao
 * funciona" na tela — sem nenhum erro em lugar nenhum. Ja aconteceu de
 * verdade (o podio pos-"Finalizar partida" ficou invisivel por causa
 * disso), entao o servidor agora avisa alto em vez de servir codigo velho
 * em silencio. Nunca derruba o processo: e so um aviso.
 */
function warnIfStaleBundle() {
  try {
    if (!fs.existsSync(frontendSrc)) return;
    const builtAt = newestMtimeMs(frontendDist);
    const editedAt = newestMtimeMs(frontendSrc);
    if (editedAt > builtAt) {
      const minutes = Math.round((editedAt - builtAt) / 60000);
      logger.warn(
        `frontend/dist esta DESATUALIZADO: frontend/src foi alterado ${minutes} min depois do ultimo build. ` +
          `O navegador vai receber o bundle antigo. Rode: cd frontend && npm run build`,
      );
    }
  } catch {
    // Um aviso nunca pode impedir o servidor de subir.
  }
}

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      // O frontend e servido pelo mesmo processo em rede local; a CSP
      // padrao do helmet quebraria o bundle do Vite.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.corsOrigins ?? true,
      credentials: true,
    }),
  );
  // Gzip (fixme.md #6): o bundle do frontend cru atravessa o router barato
  // da sala para 30+ celulares de uma vez. Compressao antes das rotas API,
  // do static e do fallback. O trafego Socket.IO nao passa por aqui (o
  // engine.io atende pelo propio path antes do Express).
  app.use(compression());
  // Restaurar um backup é um JSON só, mas pode carregar um semestre inteiro
  // de partidas — bem acima do limite geral de 256kb logo abaixo. Registrado
  // antes dele: quem bate nessa rota usa este limite maior, e o parser
  // geral, ao ver o corpo já processado, pula sem reprocessar (é assim que
  // o body-parser se comporta — `req._body` já vem `true`).
  app.use("/api/maintenance/restore", express.json({ limit: "20mb" }));
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false, limit: "256kb" }));

  app.use("/api", apiLimiter, routes);

  // Em producao/rede local o mesmo servidor entrega o frontend, permitindo
  // que os alunos acessem apenas http://IP:PORT (spec 37).
  if (fs.existsSync(frontendDist)) {
    warnIfStaleBundle();
    app.use(express.static(frontendDist));
    app.get(/^\/(?!api).*/, (_req, res) => {
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
