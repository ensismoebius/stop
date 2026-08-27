import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import {
  createScenario,
  prisma,
  resetDatabase,
  joinAllStudents,
  startedRound as startedRoundFixture,
} from "../helpers/fixtures.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";
import answerService from "../../src/services/answerService.js";

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

describe("superfície administrativa ainda não coberta (CRUD completo das rotas REST)", () => {
  it("GET /api/auth/me devolve o professor autenticado", async () => {
    const response = await auth(request(app).get("/api/auth/me"));
    expect(response.status).toBe(200);
    expect(response.body.teacher.email).toBe("professor@stop.local");
  });

  it("serve o frontend buildado para qualquer rota fora de /api (spec 37)", async () => {
    const response = await request(app).get("/pagina-qualquer-do-spa");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });

  it("rota administrativa desconhecida devolve 404 padronizado", async () => {
    const response = await auth(request(app).get("/api/rota-que-nao-existe"));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  describe("turmas", () => {
    it("lista, busca por id e atualiza uma turma", async () => {
      const list = await auth(request(app).get("/api/classes"));
      expect(list.status).toBe(200);
      expect(list.body.map((c) => c.id)).toContain(scenario.turma.id);

      const get = await auth(request(app).get(`/api/classes/${scenario.turma.id}`));
      expect(get.status).toBe(200);
      expect(get.body.name).toBe(scenario.turma.name);

      const notFound = await auth(request(app).get("/api/classes/999999"));
      expect(notFound.status).toBe(404);

      const updated = await auth(request(app).patch(`/api/classes/${scenario.turma.id}`)).send({
        discipline: "React Native",
      });
      expect(updated.status).toBe(200);
      expect(updated.body.discipline).toBe("React Native");
    });
  });

  describe("alunos", () => {
    it("busca por id, filtra por nome/matrícula e atualiza um aluno", async () => {
      const student = scenario.students[0];

      const get = await auth(request(app).get(`/api/students/${student.id}`));
      expect(get.status).toBe(200);
      expect(get.body.name).toBe(student.name);

      const notFound = await auth(request(app).get("/api/students/999999"));
      expect(notFound.status).toBe(404);

      const bySearch = await auth(
        request(app).get(`/api/students?search=${encodeURIComponent(student.name.slice(0, 4))}`),
      );
      expect(bySearch.status).toBe(200);
      expect(bySearch.body.map((s) => s.id)).toContain(student.id);

      const updated = await auth(request(app).patch(`/api/students/${student.id}`)).send({
        name: "Nome Atualizado",
        classIds: [scenario.turma.id],
      });
      expect(updated.status).toBe(200);
      expect(updated.body.name).toBe("Nome Atualizado");

      const badClass = await auth(request(app).patch(`/api/students/${student.id}`)).send({
        classIds: [999999],
      });
      expect(badClass.status).toBe(400);
    });
  });

  describe("conjuntos de categorias e categorias", () => {
    it("lista (com filtro active), busca por id e trata 404", async () => {
      const list = await auth(request(app).get("/api/category-sets"));
      expect(list.status).toBe(200);
      expect(list.body.map((s) => s.id)).toContain(scenario.categorySet.id);

      const onlyActive = await auth(request(app).get("/api/category-sets?active=true"));
      expect(onlyActive.status).toBe(200);
      expect(onlyActive.body.every((s) => s.active)).toBe(true);

      const get = await auth(request(app).get(`/api/category-sets/${scenario.categorySet.id}`));
      expect(get.status).toBe(200);

      const notFound = await auth(request(app).get("/api/category-sets/999999"));
      expect(notFound.status).toBe(404);
    });

    it("faz o CRUD completo de categorias avulsas dentro de um conjunto", async () => {
      const listAll = await auth(request(app).get("/api/categories"));
      expect(listAll.status).toBe(200);

      const listBySet = await auth(
        request(app).get(`/api/categories?categorySetId=${scenario.categorySet.id}`),
      );
      expect(listBySet.status).toBe(200);
      expect(listBySet.body.length).toBe(scenario.categorySet.categories.length);

      const created = await auth(request(app).post("/api/categories")).send({
        categorySetId: scenario.categorySet.id,
        name: "Nova Categoria",
      });
      expect(created.status).toBe(201);

      const badSet = await auth(request(app).post("/api/categories")).send({
        categorySetId: 999999,
        name: "Orfã",
      });
      expect(badSet.status).toBe(400);

      const get = await auth(request(app).get(`/api/categories/${created.body.id}`));
      expect(get.status).toBe(200);
      expect(get.body.name).toBe("Nova Categoria");

      const getMissing = await auth(request(app).get("/api/categories/999999"));
      expect(getMissing.status).toBe(404);

      const updated = await auth(request(app).patch(`/api/categories/${created.body.id}`)).send({
        name: "Categoria Renomeada",
      });
      expect(updated.status).toBe(200);
      expect(updated.body.name).toBe("Categoria Renomeada");

      // Trocar de conjunto valida o novo categorySetId.
      const otherSet = await auth(request(app).post("/api/category-sets")).send({
        name: "Outro Conjunto",
        categories: [{ name: "X" }],
      });
      const movedOk = await auth(request(app).patch(`/api/categories/${created.body.id}`)).send({
        categorySetId: otherSet.body.id,
      });
      expect(movedOk.status).toBe(200);

      const movedBad = await auth(request(app).patch(`/api/categories/${created.body.id}`)).send({
        categorySetId: 999999,
      });
      expect(movedBad.status).toBe(400);

      const removed = await auth(request(app).delete(`/api/categories/${created.body.id}`));
      expect(removed.status).toBe(204);
    });
  });

  describe("partidas", () => {
    it("lista, busca por id, consulta letras usadas e avança para a próxima rodada via HTTP", async () => {
      await joinAllStudents(scenario);

      const list = await auth(request(app).get("/api/games"));
      expect(list.status).toBe(200);
      expect(list.body.map((g) => g.id)).toContain(scenario.game.id);

      const get = await auth(request(app).get(`/api/games/${scenario.game.id}`));
      expect(get.status).toBe(200);
      expect(get.body.name).toBe(scenario.game.name);

      const getMissing = await auth(request(app).get("/api/games/999999"));
      expect(getMissing.status).toBe(404);

      const lettersBefore = await auth(request(app).get(`/api/games/${scenario.game.id}/letters`));
      expect(lettersBefore.status).toBe(200);
      expect(lettersBefore.body.usedLetters).toEqual([]);

      const nextRound = await auth(request(app).post(`/api/games/${scenario.game.id}/rounds/next`)).send({
        categorySetId: scenario.categorySet.id,
        durationSeconds: 60,
      });
      expect(nextRound.status).toBe(201);
      expect(nextRound.body.roundNumber).toBe(1);
    });
  });

  describe("sala: avatar do aluno", () => {
    it("aceita o rosto do aluno e rejeita quem não pertence à turma", async () => {
      const student = scenario.students[0];
      const response = await request(app).post(`/api/rooms/${scenario.room.code}/avatar`).send({
        registrationNumber: student.registrationNumber,
        avatarUrl: "face:v1:02111002203202052",
      });
      expect(response.status).toBe(200);
      expect(response.body.avatarUrl).toBe("face:v1:02111002203202052");

      const naoMatriculado = await request(app).post(`/api/rooms/${scenario.room.code}/avatar`).send({
        registrationNumber: "000000000",
        avatarUrl: "face:v1:02111002203202052",
      });
      expect(naoMatriculado.status).toBe(404);
    });

    it("aceita o rosto montado pelo aluno e recusa marcação disfarçada de avatar", async () => {
      const student = scenario.students[0];
      // A receita é só um código de características — nunca SVG de origem
      // desconhecida entrando no banco pelo campo do avatar.
      const rosto = await request(app).post(`/api/rooms/${scenario.room.code}/avatar`).send({
        registrationNumber: student.registrationNumber,
        avatarUrl: "face:v1:02111002203202052",
      });
      expect(rosto.status).toBe(200);
      expect(rosto.body.avatarUrl).toBe("face:v1:02111002203202052");

      for (const invalido of [
        'face:v1:<svg onload="alert(1)">',
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "face:v2:0000",
        "javascript:alert(1)",
      ]) {
        const recusado = await request(app).post(`/api/rooms/${scenario.room.code}/avatar`).send({
          registrationNumber: student.registrationNumber,
          avatarUrl: invalido,
        });
        expect(recusado.status).toBe(400);
      }
    });

    it("fecha a sala via rota administrativa", async () => {
      const response = await auth(request(app).post(`/api/rooms/${scenario.room.code}/close`));
      expect(response.status).toBe(200);
      expect(response.body.status).toBe("CLOSED");
    });
  });

  describe("relatórios: filtros compostos", () => {
    it("aplica todos os filtros de busca simultaneamente sem erro", async () => {
      await prisma.class.update({
        where: { id: scenario.turma.id },
        data: { discipline: "React Native" },
      });
      const student = scenario.students[0];
      // Participação de verdade (RoundParticipant), senão o ranking filtra
      // o aluno antes mesmo de chegar nos filtros do relatório testados aqui.
      await roomService.join(scenario.room.code, student.registrationNumber);
      await startedRoundFixture(scenario);
      await prisma.score.update({
        where: { gameId_studentId: { gameId: scenario.game.id, studentId: student.id } },
        data: { total: 10 },
      });
      await auth(request(app).post(`/api/games/${scenario.game.id}/finish`));

      const response = await auth(
        request(app).get(
          `/api/reports/results?discipline=${encodeURIComponent("React Native")}` +
            `&classId=${scenario.turma.id}&studentId=${student.id}&gameId=${scenario.game.id}` +
            `&medal=GOLD&dateFrom=2000-01-01&dateTo=2100-01-01&scoreMin=0&scoreMax=100`,
        ),
      );
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].studentId).toBe(student.id);
    });

    it("category-stats aplica o filtro de classId e discipline", async () => {
      await prisma.class.update({
        where: { id: scenario.turma.id },
        data: { discipline: "React Native" },
      });
      const [joao] = await joinAllStudents(scenario);
      const round = await startedRoundFixture(scenario);
      await answerService.submit({
        roundId: round.id,
        playerSessionId: joao.playerSessionId,
        roundCategoryId: round.categories[0].id,
        value: `${round.letter}esposta`,
      });
      await roundService.forceStop(round.id);
      await roundService.closeCollaborativeCorrection(round.id);
      await roundService.score(round.id);

      const response = await auth(
        request(app).get(
          `/api/reports/category-stats?classId=${scenario.turma.id}&discipline=${encodeURIComponent("React Native")}`,
        ),
      );
      expect(response.status).toBe(200);
      expect(response.body.length).toBeGreaterThan(0);
    });
  });

  describe("estatísticas com respostas válidas pontuadas", () => {
    it("contabiliza respostas válidas por categoria e por tema", async () => {
      const [joao, maria] = await joinAllStudents(scenario);
      const round = await startedRoundFixture(scenario);
      const [c1] = round.categories;
      // Respostas distintas: cada uma pontua 10 (UNIQUE), portanto válida.
      await answerService.submit({
        roundId: round.id,
        playerSessionId: joao.playerSessionId,
        roundCategoryId: c1.id,
        value: `${round.letter}esposta-joao`,
      });
      await answerService.submit({
        roundId: round.id,
        playerSessionId: maria.playerSessionId,
        roundCategoryId: c1.id,
        value: `${round.letter}esposta-maria`,
      });
      await roundService.forceStop(round.id);
      await roundService.closeCollaborativeCorrection(round.id);
      await roundService.score(round.id);

      const response = await auth(request(app).get(`/api/games/${scenario.game.id}/statistics`));
      expect(response.status).toBe(200);
      const category = response.body.byCategory.find((c) => c.category === c1.name);
      expect(category.valid).toBeGreaterThan(0);
      const theme = response.body.byTheme[0];
      expect(theme.validAnswers).toBeGreaterThan(0);
    });

    it("contabiliza eliminações e quem deu STOP por aluno", async () => {
      const [joao, maria] = await joinAllStudents(scenario);
      const round = await startedRoundFixture(scenario);
      for (const category of round.categories) {
        await answerService.submit({
          roundId: round.id,
          playerSessionId: maria.playerSessionId,
          roundCategoryId: category.id,
          value: `${round.letter}${category.id}`,
        });
      }
      await roundService.eliminate({ roundId: round.id, playerSessionId: joao.playerSessionId });
      await roundService.requestStop({ roundId: round.id, playerSessionId: maria.playerSessionId });
      await roundService.closeCollaborativeCorrection(round.id);
      await roundService.score(round.id);

      const response = await auth(request(app).get(`/api/games/${scenario.game.id}/statistics`));
      expect(response.status).toBe(200);
      expect(response.body.totals.eliminations).toBe(1);
      const mariaStats = response.body.byStudent.find((s) => s.studentId === maria.student.id);
      expect(mariaStats.stops).toBe(1);
    });

    it("uma partida sem nenhuma rodada jogada tem médias e taxas nulas/zeradas", async () => {
      await roundService.create({ gameId: scenario.game.id, categorySetId: scenario.categorySet.id });
      const response = await auth(request(app).get(`/api/games/${scenario.game.id}/statistics`));
      expect(response.status).toBe(200);
      expect(response.body.totals.fillRate).toBe(0);
      expect(response.body.totals.averageSecondsToStop).toBeNull();
    });
  });
});
