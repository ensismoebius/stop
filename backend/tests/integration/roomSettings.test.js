import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createScenario, resetDatabase } from "../helpers/fixtures.js";
import { dropRoomSettings } from "../../src/services/room/roomSettings.js";
import roomService from "../../src/services/roomService.js";
import viewService from "../../src/services/viewService.js";
import * as realtime from "../../src/sockets/realtime.js";

const app = createApp();

let token;

/** Login do professor de teste e devolve o token de admin. */
async function makeToken() {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "professor@stop.local", password: "stop-admin" });
  return response.body.token;
}

const auth = (req) => req.set("Authorization", `Bearer ${token}`);

describe("ajustes de sala (ocultar pontos no ranking)", () => {
  let scenario;

  beforeEach(async () => {
    await resetDatabase();
    scenario = await createScenario({ teacher: { email: "professor@stop.local" } });
    token = await makeToken();
    dropRoomSettings(scenario.room.code);
  });

  it("exige token de professor", async () => {
    const response = await request(app)
      .patch(`/api/rooms/${scenario.room.code}/settings`)
      .send({ hidePoints: true });
    expect(response.status).toBe(401);
  });

  it("aplica hidePoints e publica na tela publica", async () => {
    const setResponse = await auth(
      request(app)
        .patch(`/api/rooms/${scenario.room.code}/settings`)
        .send({ hidePoints: true }),
    );
    expect(setResponse.status).toBe(200);
    expect(setResponse.body.settings.hidePoints).toBe(true);

    const publicResponse = await request(app).get(`/api/rooms/${scenario.room.code}/public-state`);
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.settings.hidePoints).toBe(true);
  });

  it("desliga hidePoints quando vira false", async () => {
    await auth(
      request(app).patch(`/api/rooms/${scenario.room.code}/settings`).send({ hidePoints: true }),
    );
    const offResponse = await auth(
      request(app).patch(`/api/rooms/${scenario.room.code}/settings`).send({ hidePoints: false }),
    );
    expect(offResponse.status).toBe(200);
    expect(offResponse.body.settings.hidePoints).toBe(false);

    const publicResponse = await request(app).get(`/api/rooms/${scenario.room.code}/public-state`);
    expect(publicResponse.body.settings.hidePoints).toBe(false);
  });

  it("default de uma sala nova é hidePoints=false", async () => {
    const publicResponse = await request(app).get(`/api/rooms/${scenario.room.code}/public-state`);
    expect(publicResponse.body.settings.hidePoints).toBe(false);
  });

  it("aplica volume e mudo e publica na tela publica", async () => {
    const setResponse = await auth(
      request(app)
        .patch(`/api/rooms/${scenario.room.code}/settings`)
        .send({ volume: 0.8, muted: true }),
    );
    expect(setResponse.status).toBe(200);
    expect(setResponse.body.settings.volume).toBe(0.8);
    expect(setResponse.body.settings.muted).toBe(true);

    const publicResponse = await request(app).get(`/api/rooms/${scenario.room.code}/public-state`);
    expect(publicResponse.body.settings.volume).toBe(0.8);
    expect(publicResponse.body.settings.muted).toBe(true);
  });

  it("limita o volume ao intervalo 0..1", async () => {
    const setResponse = await auth(
      request(app)
        .patch(`/api/rooms/${scenario.room.code}/settings`)
        .send({ volume: 7 }),
    );
    expect(setResponse.status).toBe(200);
    expect(setResponse.body.settings.volume).toBe(1);
  });

  it("default de uma sala nova tem volume 0.65 e mudo desligado", async () => {
    const publicResponse = await request(app).get(`/api/rooms/${scenario.room.code}/public-state`);
    expect(publicResponse.body.settings.volume).toBe(0.65);
    expect(publicResponse.body.settings.muted).toBe(false);
  });

  // "Ocultar pontos" também vale para a tela do aluno, então a projeção do
  // aluno precisa carregar a linha de base: o evento leve `roomSettingsChanged`
  // só alcança quem já estava conectado quando o professor mexeu no
  // interruptor — quem entra ou reconecta depois depende deste campo.
  it("o estado do aluno carrega os ajustes da sala (linha de base do ocultar pontos)", async () => {
    const session = await roomService.join(scenario.room.code, scenario.students[0].registrationNumber);

    const before = await viewService.playerState(session.playerSessionId);
    expect(before.settings).toMatchObject({ hidePoints: false });

    await auth(
      request(app).patch(`/api/rooms/${scenario.room.code}/settings`).send({ hidePoints: true }),
    );

    const after = await viewService.playerState(session.playerSessionId);
    expect(after.settings).toMatchObject({ hidePoints: true });

    // E o mesmo vale para a projeção em lote usada nas difusões.
    const states = await viewService.playerStatesForRoom(scenario.room.code);
    for (const state of states.values()) {
      expect(state.settings).toMatchObject({ hidePoints: true });
    }
  });

  it("o PATCH de ajustes chega à sala inteira, não só a telas e professores", async () => {
    const spy = vi.spyOn(realtime, "toRoom");
    await auth(
      request(app).patch(`/api/rooms/${scenario.room.code}/settings`).send({ hidePoints: true }),
    );
    const settingsBroadcasts = spy.mock.calls.filter((call) => call[1] === "roomSettingsChanged");
    expect(settingsBroadcasts).toHaveLength(1);
    expect(settingsBroadcasts[0][0]).toBe(scenario.room.code);
    expect(settingsBroadcasts[0][2]).toMatchObject({ hidePoints: true });
    spy.mockRestore();
  });
});
