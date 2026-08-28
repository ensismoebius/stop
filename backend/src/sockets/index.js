import { Server } from "socket.io";
import env from "../config/env.js";
import logger from "../lib/logger.js";
import * as realtime from "./realtime.js";
import registerHandlers from "./handlers.js";

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      // Em rede local o IP do professor varia; a autorizacao real acontece
      // no `joinRoom` (spec 34/37).
      origin: env.corsOrigins ?? true,
      credentials: true,
    },
    // Heartbeat curto (fixme.md #3): router/AP baratos de sala de aula
    // "engolem" conexoes sem avisar (half-open); o servidor so derruba o
    // par defunto ao detectar o ping perdido. Era 20s+25s — um aluno ficava
    // "conectado" por quase um minuto sem receber nada; 10s/15s foi um meio
    // termo, ainda lento demais quando a associação Wi-Fi do próprio servidor
    // cai de forma silenciosa (conectados so voltam quando o sinal volta).
    pingInterval: 5_000,
    pingTimeout: 10_000,
    maxHttpBufferSize: 1e5,
  });

  realtime.setIo(io);

  io.on("connection", (socket) => {
    logger.debug(`Socket conectado: ${socket.id}`);
    registerHandlers(io, socket);
  });

  return io;
}

export default createSocketServer;
