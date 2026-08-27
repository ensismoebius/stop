import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../src/app.js";
import { createScenario, prisma, resetDatabase, waitForRoundStatus } from "../helpers/fixtures.js";
import roundService from "../../src/services/roundService.js";
import answerService from "../../src/services/answerService.js";
import roomService from "../../src/services/roomService.js";

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
    expect(start.body.status).toBe("STARTING");
    await waitForRoundStatus(round.body.id, "PLAYING");

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

  it("remove uma rodada do histórico e reverte a pontuação (nova feature)", async () => {
    await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: scenario.students[0].registrationNumber });

    const round = await auth(request(app).post("/api/rounds")).send({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    await auth(request(app).post(`/api/rounds/${round.body.id}/letter`));
    await auth(request(app).post(`/api/rounds/${round.body.id}/start`));
    await waitForRoundStatus(round.body.id, "PLAYING");
    await auth(request(app).post(`/api/rounds/${round.body.id}/stop`));

    // Rodada ainda nao concluida (nem SCORED nem FINISHED) nunca pode ser
    // removida (spec de segurança).
    const bloqueada = await auth(
      request(app).delete(`/api/games/${scenario.game.id}/rounds/${round.body.id}`),
    );
    expect(bloqueada.status).toBe(409);

    const grid = await auth(request(app).get(`/api/rounds/${round.body.id}/correction`));
    const answerId = grid.body.players[0].answers[0].id;
    // Simula uma resposta valida preenchida (o preenchimento em si e feito
    // via socket, fora do escopo REST testado aqui).
    await prisma.answer.update({
      where: { id: answerId },
      data: { value: "Xadrez", normalizedValue: "XADREZ" },
    });
    await auth(request(app).patch(`/api/answers/${answerId}`)).send({ reviewState: "VALID" });
    await auth(request(app).post(`/api/rounds/${round.body.id}/score`));

    const before = await auth(request(app).get(`/api/games/${scenario.game.id}/scores`));
    expect(before.body.ranking[0].total).toBe(10);

    const removida = await auth(
      request(app).delete(`/api/games/${scenario.game.id}/rounds/${round.body.id}`),
    );
    expect(removida.status).toBe(204);

    // Era a unica rodada da partida: removida ela, o cascade tambem apaga
    // o RoundParticipant do aluno — sem nenhuma rodada de fato jogada,
    // ele nao aparece mais no ranking (em vez de sobrar com total zerado).
    const after = await auth(request(app).get(`/api/games/${scenario.game.id}/scores`));
    expect(after.body.ranking).toHaveLength(0);

    const history = await auth(request(app).get(`/api/games/${scenario.game.id}/history`));
    expect(history.body.rounds.map((item) => item.id)).not.toContain(round.body.id);
  });

  it("bloqueia a remoção de turma e aluno com histórico de partidas (spec 44)", async () => {
    // O aluno entra na sala: isso cria a PlayerSession que liga o aluno,
    // via a partida, ao histórico daquela turma.
    const join = await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: scenario.students[0].registrationNumber });
    expect(join.status).toBe(201);

    const turmaDelete = await auth(request(app).delete(`/api/classes/${scenario.turma.id}`));
    expect(turmaDelete.status).toBe(409);

    const alunoDelete = await auth(request(app).delete(`/api/students/${scenario.students[0].id}`));
    expect(alunoDelete.status).toBe(409);

    // Turma e aluno sem nenhuma partida vinculada continuam removíveis normalmente.
    const turmaLivre = await auth(request(app).post("/api/classes")).send({
      name: "Sem uso",
      code: "SEM-USO",
    });
    const alunoLivre = await auth(request(app).post("/api/students")).send({
      registrationNumber: "202600009",
      name: "Aluno Sem Uso",
      classIds: [turmaLivre.body.id],
    });

    const remocaoAluno = await auth(request(app).delete(`/api/students/${alunoLivre.body.id}`));
    expect(remocaoAluno.status).toBe(204);

    const remocaoTurma = await auth(request(app).delete(`/api/classes/${turmaLivre.body.id}`));
    expect(remocaoTurma.status).toBe(204);
  });

  it("bloqueia novas rodadas numa partida já finalizada (nova feature)", async () => {
    await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: scenario.students[0].registrationNumber });

    const round = await auth(request(app).post("/api/rounds")).send({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    await auth(request(app).post(`/api/rounds/${round.body.id}/letter`));
    await auth(request(app).post(`/api/rounds/${round.body.id}/start`));
    await waitForRoundStatus(round.body.id, "PLAYING");
    await auth(request(app).post(`/api/rounds/${round.body.id}/stop`));
    await auth(request(app).post(`/api/rounds/${round.body.id}/score`));

    const finish = await auth(request(app).post(`/api/games/${scenario.game.id}/finish`));
    expect(finish.status).toBe(200);
    expect(finish.body.status).toBe("FINISHED");

    const novaRodada = await auth(request(app).post("/api/rounds")).send({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    expect(novaRodada.status).toBe(409);

    const proxima = await auth(
      request(app).post(`/api/games/${scenario.game.id}/rounds/next`),
    ).send({ categorySetId: scenario.categorySet.id, durationSeconds: 60 });
    expect(proxima.status).toBe(409);
  });

  it("finaliza a partida, grava GameResult com medalha por posição (empate incluso) e alimenta o relatório ordenado por nome (nova feature)", async () => {
    await prisma.class.update({
      where: { id: scenario.turma.id },
      data: { discipline: "React Native" },
    });

    // Empate no 1º lugar entre os alunos[0] e [1]; alunos[2] fica atras —
    // pela regra de posicao (nao indice), o 3º colocado cai direto pra
    // posicao 3 e medalha de bronze, pulando a prata.
    //
    // Os 3 precisam ter entrado numa rodada de verdade (RoundParticipant):
    // sem isso o ranking os filtra por "nunca participou" antes mesmo de
    // chegar na logica de empate/medalha testada aqui.
    const [a, b, c] = scenario.students;
    for (const student of scenario.students) {
      await request(app)
        .post(`/api/rooms/${scenario.room.code}/join`)
        .send({ registrationNumber: student.registrationNumber });
    }
    const round = await auth(request(app).post("/api/rounds")).send({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    await auth(request(app).post(`/api/rounds/${round.body.id}/letter`));
    await auth(request(app).post(`/api/rounds/${round.body.id}/start`));
    await waitForRoundStatus(round.body.id, "PLAYING");

    await prisma.score.update({
      where: { gameId_studentId: { gameId: scenario.game.id, studentId: a.id } },
      data: { total: 10 },
    });
    await prisma.score.update({
      where: { gameId_studentId: { gameId: scenario.game.id, studentId: b.id } },
      data: { total: 10 },
    });
    await prisma.score.update({
      where: { gameId_studentId: { gameId: scenario.game.id, studentId: c.id } },
      data: { total: 5 },
    });

    const finish = await auth(request(app).post(`/api/games/${scenario.game.id}/finish`));
    expect(finish.status).toBe(200);

    const results = await auth(
      request(app).get(`/api/reports/results?gameId=${scenario.game.id}`),
    );
    expect(results.status).toBe(200);
    // "Joao da Silva", "Maria Oliveira", "Pedro Santos" — ordem alfabetica,
    // independente da pontuacao/posicao de cada um.
    expect(results.body.map((item) => item.student.name)).toEqual([
      "Joao da Silva",
      "Maria Oliveira",
      "Pedro Santos",
    ]);
    const byStudentId = Object.fromEntries(results.body.map((item) => [item.studentId, item]));
    expect(byStudentId[a.id]).toMatchObject({ score: 10, position: 1, medal: "GOLD" });
    expect(byStudentId[b.id]).toMatchObject({ score: 10, position: 1, medal: "GOLD" });
    expect(byStudentId[c.id]).toMatchObject({ score: 5, position: 3, medal: "BRONZE" });

    const soOuro = await auth(
      request(app).get(`/api/reports/results?gameId=${scenario.game.id}&medal=GOLD`),
    );
    expect(soOuro.body).toHaveLength(2);

    const porDisciplina = await auth(
      request(app).get("/api/reports/results?discipline=React Native"),
    );
    expect(porDisciplina.body.length).toBeGreaterThanOrEqual(3);

    const outraDisciplina = await auth(
      request(app).get("/api/reports/results?discipline=Inexistente"),
    );
    expect(outraDisciplina.body).toEqual([]);
  });

  it("aluno consulta o proprio historico por matricula, sem autenticacao de professor (nova feature)", async () => {
    const [a] = scenario.students;
    await request(app)
      .post(`/api/rooms/${scenario.room.code}/join`)
      .send({ registrationNumber: a.registrationNumber });
    const round = await auth(request(app).post("/api/rounds")).send({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    await auth(request(app).post(`/api/rounds/${round.body.id}/letter`));
    await auth(request(app).post(`/api/rounds/${round.body.id}/start`));
    await waitForRoundStatus(round.body.id, "PLAYING");
    await prisma.score.update({
      where: { gameId_studentId: { gameId: scenario.game.id, studentId: a.id } },
      data: { total: 10 },
    });
    await auth(request(app).post(`/api/games/${scenario.game.id}/finish`));

    const history = await request(app).get(`/api/students/history/${a.registrationNumber}`);
    expect(history.status).toBe(200);
    expect(history.body.student).toMatchObject({
      name: a.name,
      registrationNumber: a.registrationNumber,
    });
    expect(history.body.results).toHaveLength(1);
    expect(history.body.results[0]).toMatchObject({ score: 10, position: 1, medal: "GOLD" });

    const notFound = await request(app).get("/api/students/history/000000000");
    expect(notFound.status).toBe(404);
  });

  it("agrega desempenho por categoria, ordenado pela pior taxa de acerto primeiro (nova feature)", async () => {
    const sessions = await Promise.all(
      scenario.students.map((student) => roomService.join(scenario.room.code, student.registrationNumber)),
    );

    const created = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
      durationSeconds: 60,
    });
    await roundService.drawRoundLetter(created.id);
    await roundService.start(created.id);
    const round = await waitForRoundStatus(created.id, "PLAYING");
    const [certa, errada] = round.categories;

    // Uma resposta que comprovadamente NAO comeca com a letra sorteada,
    // seja ela qual for. Antes isso era o literal "zzz-fora-da-letra", mas
    // o LETTER_POOL configurado inclui Z: quando o sorteio caia em Z a
    // resposta passava a ser valida e o teste falhava (~1 vez a cada 21).
    const outraLetra = "ABCDEFGHIJLMNOPRSTUVZ".split("").find((letra) => letra !== round.letter);
    const foraDaLetra = `${outraLetra}${outraLetra}-fora-da-letra`;

    // "certa": todo mundo responde valido (mesma resposta -> duplicada,
    // mas ainda pontua e conta como valida). "errada": ninguem comeca com
    // a letra sorteada -> tudo marcado invalido na correcao (spec 19).
    for (const session of sessions) {
      await answerService.submit({
        roundId: round.id,
        playerSessionId: session.playerSessionId,
        roundCategoryId: certa.id,
        value: `${round.letter}resposta`,
      });
      await answerService.submit({
        roundId: round.id,
        playerSessionId: session.playerSessionId,
        roundCategoryId: errada.id,
        value: foraDaLetra,
      });
    }

    await roundService.forceStop(round.id);
    await roundService.closeCollaborativeCorrection(round.id);
    await roundService.score(round.id);

    const stats = await auth(
      request(app).get(`/api/reports/category-stats?gameId=${scenario.game.id}`),
    );
    expect(stats.status).toBe(200);
    const byCategory = Object.fromEntries(stats.body.map((item) => [item.category, item]));
    expect(byCategory[certa.name]).toMatchObject({ answers: 3, filled: 3, valid: 3, accuracyRate: 1 });
    expect(byCategory[errada.name]).toMatchObject({ answers: 3, filled: 3, valid: 0, accuracyRate: 0 });
    // Ordenado por taxa de acerto crescente: a categoria com melhor
    // desempenho ("certa", 100%) nunca aparece antes de uma com pior.
    const accuracyRates = stats.body.map((item) => item.accuracyRate);
    expect(accuracyRates).toEqual([...accuracyRates].sort((a, b) => a - b));
    expect(stats.body.at(-1).category).toBe(certa.name);
  });
});
