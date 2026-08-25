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
    pingInterval: 20_000,
    pingTimeout: 25_000,
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
