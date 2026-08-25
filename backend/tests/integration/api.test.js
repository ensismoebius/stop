import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createScenario, prisma, resetDatabase } from "../helpers/fixtures.js";

const app = createApp();
let scenario;
let token;

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email: "professor@stop.local", password: "stop-admin" });
  token = response.body.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const auth = (req) => req.set("Authorization", `Bearer ${token}`);

describe("API REST (spec 30 e 34)", () => {
  it("responde ao health check", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
  });

  it("autentica o professor e rejeita credencial errada (spec 35)", async () => {
    expect(token).toBeTruthy();
    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: "professor@stop.local", password: "errada" });
    expect(bad.status).toBe(401);
  });

  it("protege os endpoints administrativos", async () => {
    for (const path of ["/api/students", "/api/classes", "/api/category-sets", "/api/games"]) {
      const response = await request(app).get(path);
      expect(response.status).toBe(401);
    }
  });

  it("rejeita a sessao do aluno em rotas administrativas (spec 35)", async () => {
    const join = await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: scenario.students[0].registrationNumber });
    const response = await request(app)
      .get("/api/students")
      .set("Authorization", `Bearer ${join.body.playerToken}`);
    expect(response.status).toBe(401);
  });

  it("valida payloads de entrada (spec 34)", async () => {
    const response = await auth(request(app).post("/api/classes")).send({ name: "" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("BAD_REQUEST");
  });

  it("cria partida, sala e QR Code (spec 5 e 36)", async () => {
    const game = await auth(request(app).post("/api/games")).send({
      name: "Revisao",
      classId: scenario.turma.id,
    });
    expect(game.status).toBe(201);

    const room = await auth(request(app).post(`/api/games/${game.body.id}/rooms`)).send({});
    expect(room.status).toBe(201);
    expect(room.body.code).toMatch(/^STOP-[A-Z0-9]{4}$/);

    const qr = await auth(request(app).get(`/api/rooms/${room.body.code}/qrcode`));
    expect(qr.status).toBe(200);
    expect(qr.body.url).toContain(`/join/${room.body.code}`);
    expect(qr.body.dataUrl.startsWith("data:image/png;base64,")).toBe(true);
    // O QR Code nao carrega dados pessoais.
    expect(qr.body.url).not.toContain(scenario.students[0].registrationNumber);
  });

  it("consulta publica da sala nao exige autenticacao", async () => {
    const response = await request(app).get(`/api/rooms/${scenario.room.code}`);
    expect(response.status).toBe(200);
    expect(response.body.code).toBe(scenario.room.code);
  });

  it("identifica a matricula e devolve o nome para confirmacao (spec 6)", async () => {
    const student = scenario.students[0];
    const ok = await request(app)
      .post(`/api/rooms/${scenario.room.code}/identify`)
      .send({ registrationNumber: student.registrationNumber });
    expect(ok.status).toBe(200);
    expect(ok.body.student.name).toBe(student.name);

    const nao = await request(app)
      .post(`/api/rooms/${scenario.room.code}/identify`)
      .send({ registrationNumber: "000000000" });
    expect(nao.status).toBe(404);
  });

  it("entra na sala e consulta o proprio estado", async () => {
    const join = await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: scenario.students[0].registrationNumber });
    expect(join.status).toBe(201);
    expect(join.body.playerToken).toBeTruthy();

    const me = await request(app)
      .get(`/api/rooms/${scenario.room.code}/me`)
      .set("x-player-token", join.body.playerToken);
    expect(me.status).toBe(200);
    expect(me.body.student.name).toBe(scenario.students[0].name);

    const semToken = await request(app).get(`/api/rooms/${scenario.room.code}/me`);
    expect(semToken.status).toBe(401);
  });

  it("percorre o ciclo da rodada pelas rotas administrativas", async () => {
    const join = await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: scenario.students[0].registrationNumber });

    const round = await auth(request(app).post("/api/rounds")).send({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    expect(round.status).toBe(201);

    // Nao e possivel iniciar sem sortear a letra.
    const semLetra = await auth(request(app).post(`/api/rounds/${round.body.id}/start`));
    expect(semLetra.status).toBe(400);

    const letra = await auth(request(app).post(`/api/rounds/${round.body.id}/letter`));
    expect(letra.status).toBe(200);
    expect(letra.body.round.letter).toMatch(/^[A-Z]$/);

    const start = await auth(request(app).post(`/api/rounds/${round.body.id}/start`));
    expect(start.status).toBe(200);
    expect(start.body.status).toBe("PLAYING");

    const stop = await auth(request(app).post(`/api/rounds/${round.body.id}/stop`));
    expect(stop.status).toBe(200);

    const grid = await auth(request(app).get(`/api/rounds/${round.body.id}/correction`));
    expect(grid.status).toBe(200);
    expect(grid.body.players).toHaveLength(1);

    const answerId = grid.body.players[0].answers[0].id;
    const review = await auth(request(app).patch(`/api/answers/${answerId}`)).send({
      reviewState: "INVALID",
    });
    expect(review.status).toBe(200);
    expect(review.body.reviewState).toBe("INVALID");

    const score = await auth(request(app).post(`/api/rounds/${round.body.id}/score`));
    expect(score.status).toBe(200);
    expect(score.body.ranking[0].studentId).toBe(scenario.students[0].id);

    const scores = await auth(request(app).get(`/api/games/${scenario.game.id}/scores`));
    expect(scores.status).toBe(200);
    expect(scores.body.ranking).toHaveLength(1);

    const stats = await auth(request(app).get(`/api/games/${scenario.game.id}/statistics`));
    expect(stats.status).toBe(200);
    expect(stats.body.totals.rounds).toBe(1);

    expect(join.body.playerToken).toBeTruthy();
  });

  it("faz CRUD de conjuntos de categorias (spec 17)", async () => {
    const created = await auth(request(app).post("/api/category-sets")).send({
      name: "React Native — Estilos",
      categories: [{ name: "Propriedade" }, { name: "Unidade" }],
    });
    expect(created.status).toBe(201);
    expect(created.body.categories).toHaveLength(2);

    const updated = await auth(request(app).patch(`/api/category-sets/${created.body.id}`)).send({
      name: "React Native — Estilos e Layout",
    });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("React Native — Estilos e Layout");

    const removed = await auth(request(app).delete(`/api/category-sets/${created.body.id}`));
    expect(removed.status).toBe(204);
  });

  it("faz CRUD de alunos e turmas (spec 30)", async () => {
    const turma = await auth(request(app).post("/api/classes")).send({
      name: "React Native 2026/2",
      code: "RN-2026-2",
    });
    expect(turma.status).toBe(201);

    const aluno = await auth(request(app).post("/api/students")).send({
      registrationNumber: "202600001",
      name: "Novo Aluno",
      classIds: [turma.body.id],
    });
    expect(aluno.status).toBe(201);

    const duplicado = await auth(request(app).post("/api/students")).send({
      registrationNumber: "202600001",
      name: "Duplicado",
      classIds: [turma.body.id],
    });
    expect(duplicado.status).toBe(409);

    const bulk = await auth(request(app).post("/api/students/bulk")).send({
      classId: turma.body.id,
      students: [
        { registrationNumber: "202600002", name: "Aluno Dois" },
        { registrationNumber: "202600003", name: "Aluno Tres" },
      ],
    });
    expect(bulk.status).toBe(201);
    expect(bulk.body.created).toBe(2);

    const lista = await auth(request(app).get(`/api/students?classId=${turma.body.id}`));
    expect(lista.body).toHaveLength(3);
  });
});
