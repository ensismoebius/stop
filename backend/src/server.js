import http from "node:http";
import nodeOs from "node:os";
import env from "./config/env.js";
import logger from "./lib/logger.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./sockets/index.js";
import { recoverActiveRounds } from "./game/recovery.js";
import { clearAllTimers } from "./game/timers.js";
import { checkDatabase, disconnectPrisma } from "./lib/prisma.js";

/** Enderecos IPv4 da maquina nas interfaces nao-internas (para o aviso de rede local). */
function localAddresses() {
  return Object.values(nodeOs.networkInterfaces())
    .flat()
    .filter((iface) => iface && iface.family === "IPv4" && !iface.internal)
    .map((iface) => iface.address);
}

/** Sobe o servidor HTTP + Socket.IO, recupera rodadas e registra shutdown gracioso. */
async function main() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const ioServer = createSocketServer(httpServer);

  // O servidor sobe mesmo com o banco indisponivel para que /api/health
  // continue respondendo, mas o diagnostico fica explicito no log.
  const database = await checkDatabase();

  if (database.healthy) {
    try {
      const recovered = await recoverActiveRounds();
      if (recovered > 0) logger.info(`${recovered} rodada(s) recuperada(s)`);
    } catch (error) {
      logger.warn("Nao foi possivel recuperar rodadas ativas", error?.message ?? error);
    }
  }

  // Escuta em 0.0.0.0 para permitir acesso pelos celulares (spec 37).
  httpServer.listen(env.port, env.host, () => {
    logger.info(`STOP server ouvindo em http://${env.host}:${env.port}`);
    for (const address of localAddresses()) {
      logger.info(`  rede local: http://${address}:${env.port}`);
    }
  });

  const shutdown = async (signal) => {
    logger.info(`Recebido ${signal}; encerrando`);
    clearAllTimers();
    ioServer.close();
    httpServer.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error("Falha ao iniciar o servidor", error);
  process.exit(1);
});
