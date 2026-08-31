import http from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { dropRoomSettings } from "../../src/services/room/roomSettings.js";
import { createSocketServer } from "../../src/sockets/index.js";
import { createScenario, prisma, resetDatabase } from "../helpers/fixtures.js";
import { emitAck, joinPlayerForScenario } from "../helpers/socket.js";
import { dropRoom } from "../../src/sockets/syncRegistry.js";
import roomState from "../../src/services/room/roomState.js";
import roundService from "../../src/services/roundService.js";

let app;
let server;
let ioServer;
let url;
let scenario;
let clients = [];

beforeAll(async () => {
  app = createApp();
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
  dropRoom(scenario.room.code);
  dropRoomSettings(scenario.room.code);
});

afterEach(() => {
  for (const client of clients) client.close();
  clients = [];
  vi.restoreAllMocks();
});

const settleBroadcasts = () => new Promise((resolve) => setTimeout(resolve, 80));

/**
 * O watchdog de CADA aluno bate em `requestState` a cada ~3-6s, e na quase
 * totalidade das vezes a resposta correta é "nada mudou". Montar o snapshot
 * autoritativo para só então descobrir isso custava ~35 consultas por pedido
 * (medido com 30 alunos: as três projeções da sala inteira), ou seja ~230
 * consultas/segundo numa turma cheia apenas para responder CURRENT — a mesma
 * saturação de banco que esta camada de confiabilidade existe para eliminar.
 *
 * A comparação de posição custa UMA consulta e é idêntica à que já era feita
 * (o snapshot lia a versão da mesma linha). Estes testes prendem essa ordem:
 * comparar primeiro, montar só quando o cliente está mesmo atrás.
 */
describe("custo do requestState (tempo-real.md #1)", () => {
  it("cliente em dia recebe CURRENT sem montar o snapshot da sala", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    await settleBroadcasts();

    const behind = await emitAck(player.client, "requestState", {});
    expect(behind.data.status).toBe("ROOM_STATE");

    const buildSpy = vi.spyOn(roomState, "getCurrent");
    const current = await emitAck(player.client, "requestState", {
      roomEpoch: behind.data.roomEpoch,
      stateVersion: behind.data.stateVersion,
    });

    expect(current.data.status).toBe("CURRENT");
    expect(current.data.roomEpoch).toBe(behind.data.roomEpoch);
    expect(current.data.stateVersion).toBe(behind.data.stateVersion);
    expect(current.data.serverTime).toBeDefined();
    // O ponto do teste: a resposta barata não passa pelo caminho caro.
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it("cliente atrasado continua recebendo o snapshot completo", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    await settleBroadcasts();

    const buildSpy = vi.spyOn(roomState, "getCurrent");
    const behind = await emitAck(player.client, "requestState", {
      roomEpoch: 1,
      stateVersion: 0,
    });

    expect(behind.data.status).toBe("ROOM_STATE");
    expect(behind.data.round !== undefined || behind.data.game !== undefined).toBe(true);
    expect(buildSpy).toHaveBeenCalled();
  });

  // O "ocultar pontos" do professor precisa alcançar o SOCKET do aluno, não só
  // as telas e os painéis: é a última ponta da corrente (projeção → evento →
  // handler → UI) e a única que nem o teste de componente nem o de projeção
  // cobrem. Se ela quebrar, o professor esconde o placar e os celulares
  // continuam exibindo os pontos até a rodada seguinte.
  it("o aluno conectado recebe roomSettingsChanged quando o professor oculta os pontos", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    await settleBroadcasts();

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: "professor@stop.local", password: "stop-admin" });

    // Corrida com prazo curto: se o evento voltar a não sair para os alunos,
    // o teste falha em 2s dizendo o que faltou, em vez de pendurar até o
    // timeout global e reportar só "timeout".
    const received = Promise.race([
      new Promise((resolve) => player.client.once("roomSettingsChanged", resolve)),
      new Promise((resolve) => setTimeout(() => resolve({ naoChegou: true }), 2000)),
    ]);
    const patch = await request(app)
      .patch(`/api/rooms/${scenario.room.code}/settings`)
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ hidePoints: true });

    expect(patch.status).toBe(200);
    await expect(received).resolves.toMatchObject({ hidePoints: true });
  });

  it("depois de uma difusão o mesmo cliente volta a receber ROOM_STATE (não fica preso em CURRENT)", async () => {
    const player = await joinPlayerForScenario(url, clients, scenario);
    await settleBroadcasts();
    const first = await emitAck(player.client, "requestState", {});
    const position = { roomEpoch: first.data.roomEpoch, stateVersion: first.data.stateVersion };

    expect((await emitAck(player.client, "requestState", position)).data.status).toBe("CURRENT");

    await roundService.broadcastState(scenario.room.code);
    const afterBroadcast = await emitAck(player.client, "requestState", position);
    expect(afterBroadcast.data.status).toBe("ROOM_STATE");
    expect(afterBroadcast.data.stateVersion).toBeGreaterThan(position.stateVersion);
  });
});
