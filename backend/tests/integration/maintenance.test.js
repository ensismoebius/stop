import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import {
  createScenario,
  prisma,
  resetDatabase,
  joinAllStudents,
  startedRound,
  fillAllAnswers,
} from "../helpers/fixtures.js";

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

describe("GET /api/maintenance/backup", () => {
  it("exige token de professor", async () => {
    const response = await request(app).get("/api/maintenance/backup");
    expect(response.status).toBe(401);
  });

  it("devolve um JSON com versão, timestamp e os dados atuais do banco", async () => {
    const response = await auth(request(app).get("/api/maintenance/backup"));
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(response.body.exportedAt).toBeTruthy();
    expect(response.body.data.teacher).toHaveLength(1);
    expect(response.body.data.teacher[0].email).toBe("professor@stop.local");
    expect(response.body.data.class).toHaveLength(1);
    expect(response.body.data.student).toHaveLength(3);
    expect(response.body.data.game).toHaveLength(1);
    expect(response.body.data.room[0].code).toBe("STOP-TEST");
  });
});

describe("DELETE /api/maintenance/history", () => {
  it("exige token de professor", async () => {
    const response = await request(app).delete("/api/maintenance/history");
    expect(response.status).toBe(401);
  });

  it("apaga partidas/rodadas/respostas mas preserva turmas, alunos e conjuntos de categoria", async () => {
    const sessions = await joinAllStudents(scenario);
    const round = await startedRound(scenario);
    await fillAllAnswers(round, sessions[0].playerSessionId);

    const response = await auth(request(app).delete("/api/maintenance/history"));
    expect(response.status).toBe(200);
    expect(response.body.gamesDeleted).toBe(1);

    expect(await prisma.game.count()).toBe(0);
    expect(await prisma.room.count()).toBe(0);
    expect(await prisma.round.count()).toBe(0);
    expect(await prisma.answer.count()).toBe(0);
    expect(await prisma.playerSession.count()).toBe(0);

    // Configuração — nunca histórico — sobrevive intacta.
    expect(await prisma.teacher.count()).toBe(1);
    expect(await prisma.class.count()).toBe(1);
    expect(await prisma.student.count()).toBe(3);
    expect(await prisma.categorySet.count()).toBe(1);
  });

  it("não falha (0 apagados) quando não há nenhuma partida", async () => {
    await prisma.room.deleteMany({});
    await prisma.game.deleteMany({});
    const response = await auth(request(app).delete("/api/maintenance/history"));
    expect(response.status).toBe(200);
    expect(response.body.gamesDeleted).toBe(0);
  });
});

describe("POST /api/maintenance/restore", () => {
  it("exige token de professor", async () => {
    const response = await request(app).post("/api/maintenance/restore").send({ version: 1, data: {} });
    expect(response.status).toBe(401);
  });

  it("rejeita um arquivo sem o formato esperado", async () => {
    const response = await auth(request(app).post("/api/maintenance/restore").send({ nonsense: true }));
    expect(response.status).toBe(400);
  });

  it("rejeita uma versão de backup incompatível", async () => {
    const response = await auth(
      request(app).post("/api/maintenance/restore").send({ version: 999, data: {} }),
    );
    expect(response.status).toBe(400);
  });

  it("restaura exatamente o conteúdo do backup, substituindo o que existia antes", async () => {
    const exportResponse = await auth(request(app).get("/api/maintenance/backup"));
    const backup = exportResponse.body;

    // Muda o banco depois do backup: uma turma extra que não estava nele —
    // a restauração precisa desfazer isso (não é uma mesclagem).
    await prisma.class.create({ data: { name: "Turma indevida", code: "ERRO-1" } });

    const restoreResponse = await auth(
      request(app).post("/api/maintenance/restore").send(backup),
    );
    expect(restoreResponse.status).toBe(200);

    const classes = await prisma.class.findMany();
    expect(classes).toHaveLength(1);
    expect(classes[0].code).toBe(scenario.turma.code);

    const teachers = await prisma.teacher.findMany();
    expect(teachers).toHaveLength(1);
    expect(teachers[0].email).toBe("professor@stop.local");

    const students = await prisma.student.findMany();
    expect(students).toHaveLength(3);

    // A conta restaurada continua utilizável (a senha não corrompeu no
    // ida-e-volta JSON).
    const loginAfterRestore = await request(app)
      .post("/api/auth/login")
      .send({ email: "professor@stop.local", password: "stop-admin" });
    expect(loginAfterRestore.status).toBe(200);
  });

  it("restaura também o histórico (rodadas/respostas/resultados), não só a configuração", async () => {
    const sessions = await joinAllStudents(scenario);
    const round = await startedRound(scenario);
    await fillAllAnswers(round, sessions[0].playerSessionId);

    const exportResponse = await auth(request(app).get("/api/maintenance/backup"));
    const backup = exportResponse.body;
    expect(backup.data.answer.length).toBeGreaterThan(0);

    await auth(request(app).delete("/api/maintenance/history"));
    expect(await prisma.answer.count()).toBe(0);

    const restoreResponse = await auth(request(app).post("/api/maintenance/restore").send(backup));
    expect(restoreResponse.status).toBe(200);

    expect(await prisma.game.count()).toBe(1);
    expect(await prisma.round.count()).toBe(1);
    expect(await prisma.answer.count()).toBe(backup.data.answer.length);
  });
});
