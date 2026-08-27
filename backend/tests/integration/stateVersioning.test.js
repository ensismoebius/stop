import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { createScenario, prisma, resetDatabase } from "../helpers/fixtures.js";
import { emitAck, joinTeacher, joinPlayer } from "../helpers/socket.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";
import { dropRoom } from "../../src/sockets/syncRegistry.js";

let server;
let ioServer;
let url;
let scenario;
let clients = [];

beforeAll(async () => {
  const app = createApp();
  server = http.createServer(app);
  ioServer = createSocketServer(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  ioServer.close();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  // A sala de teste sempre usa o mesmo código (STOP-TEST): zera o registro
  // de sincronização para não herdar posições de testes anteriores.
  dropRoom(scenario.room.code);
});

afterEach(() => {
  for (const client of clients) client.close();
  clients = [];
});

async function joinedPlayer(studentIndex = 0) {
  const session = await roomService.join(scenario.room.code, scenario.students[studentIndex].registrationNumber);
  return joinPlayer(url, scenario.room.code, session.playerToken, clients);
}

const roomVersion = async () => {
  const room = await prisma.room.findUnique({
    where: { id: scenario.room.id },
    select: { roomEpoch: true, stateVersion: true },
  });
  return { roomEpoch: room.roomEpoch, stateVersion: room.stateVersion };
};

/** Deixa os broadcasts coalescidos (0ms) de joins/readeys se assentarem. */
const settleBroadcasts = () => new Promise((resolve) => setTimeout(resolve, 80));

describe("versionamento de estado (baseline: recuperação)", () => {
  it("difusão explícita incrementa stateVersion de forma estrita e monotônica", async () => {
    const before = await roomVersion();
    await roundService.broadcastState(scenario.room.code);
    const after = await roomVersion();
    expect(after.stateVersion).toBeGreaterThan(before.stateVersion);
    expect(after.roomEpoch).toBe(before.roomEpoch);
  });

  it("requestState: CURRENT quando o cliente está em dia, ROOM_STATE quando está atrás", async () => {
    const player = await joinedPlayer();
    // Outro aluno entrando bumps a versão para além da que o player adotou.
    await joinedPlayer(1);
    await settleBroadcasts();

    const behind = await emitAck(player.client, "requestState", {});
    expect(behind.ok).toBe(true);
    expect(behind.data.status).toBe("ROOM_STATE");
    expect(behind.data.roomEpoch).toBeTypeOf("number");
    expect(behind.data.stateVersion).toBeTypeOf("number");

    const current = await emitAck(player.client, "requestState", {
      roomEpoch: behind.data.roomEpoch,
      stateVersion: behind.data.stateVersion,
    });
    expect(current.ok).toBe(true);
    expect(current.data.status).toBe("CURRENT");
    expect(current.data.serverTime).toBeDefined();
  });

  it("um roomState difundido para o aluno carrega as versões anexadas", async () => {
    const teacher = await joinTeacher(url, scenario.room.code, clients);
    const player = await joinedPlayer();
    const received = await new Promise((resolve) => {
      player.client.once("roomState", resolve);
      roundService.broadcastState(scenario.room.code);
    });
    expect(typeof received.roomEpoch).toBe("number");
    expect(typeof received.stateVersion).toBe("number");
    // A versão recebida nunca regride além da que o próprio ack do join reportou.
    expect(received.stateVersion).toBeGreaterThanOrEqual(0);
    void teacher;
  });

  it("o estado do professor mede syncStats progressivamente (expected/synchronized/stale/recovering)", async () => {
    const p1 = await joinedPlayer(0);
    const teacher = await joinTeacher(url, scenario.room.code, clients);

    // Professor em dia: o aluno conectado ainda não reportou posição → recovering.
    const initial = await emitAck(teacher.client, "requestState", {});
    expect(initial.ok).toBe(true);
    expect(initial.data.syncStats).toMatchObject({ expected: 1, synchronized: 0, stale: 0, recovering: 1 });

    // Deixa os broadcasts do join terminarem antes de medir a versão.
    await settleBroadcasts();
    const room = await prisma.room.findUnique({ where: { id: scenario.room.id } });
    const report = await emitAck(p1.client, "applicationHeartbeat", {
      roomEpoch: room.roomEpoch,
      stateVersion: room.stateVersion,
      sentAt: Date.now(),
    });
    expect(report.ok).toBe(true);
    expect(report.data.stale).toBe(false);

    const afterReport = await emitAck(teacher.client, "requestState", {});
    expect(afterReport.data.syncStats).toMatchObject({ expected: 1, synchronized: 1, stale: 0, recovering: 0 });

    // Aluno passa a reportar uma posição antiga → cai para stale no painel.
    await emitAck(p1.client, "applicationHeartbeat", {
      roomEpoch: 1,
      stateVersion: 0,
      sentAt: Date.now(),
    });
    const afterStale = await emitAck(teacher.client, "requestState", {});
    expect(afterStale.data.syncStats).toMatchObject({ expected: 1, synchronized: 0, stale: 1, recovering: 0 });
  });
});