import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createScenario, prisma, resetDatabase } from "../helpers/fixtures.js";
import roomService from "../../src/services/roomService.js";
import roundService from "../../src/services/roundService.js";
import answerService from "../../src/services/answerService.js";
import gameService from "../../src/services/gameService.js";
import viewService from "../../src/services/viewService.js";

let scenario;

async function joinAll() {
  const sessions = [];
  for (const student of scenario.students) {
    sessions.push(await roomService.join(scenario.room.code, student.registrationNumber));
  }
  return sessions;
}

async function startedRound() {
  const round = await roundService.create({
    gameId: scenario.game.id,
    categorySetId: scenario.categorySet.id,
  });
  await roundService.drawRoundLetter(round.id);
  return roundService.start(round.id);
}

async function fillAll(round, playerSessionId, prefix) {
  for (const category of round.categories) {
    await answerService.submit({
      roundId: round.id,
      playerSessionId,
      roundCategoryId: category.id,
      value: `${prefix}${category.name}`,
    });
  }
}

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("fluxo completo da partida (spec 60)", () => {
  it("identifica o aluno pela matricula e devolve o nome do banco (spec 6)", async () => {
    const student = scenario.students[0];
    const result = await roomService.identify(scenario.room.code, student.registrationNumber);
    expect(result.student.name).toBe(student.name);
    expect(result.student.registrationNumber).toBe(student.registrationNumber);
  });

  it("nega acesso a matricula inexistente (spec 61)", async () => {
    await expect(roomService.identify(scenario.room.code, "000000000")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("nega matricula de outra turma", async () => {
    const outraTurma = await prisma.class.create({ data: { name: "Outra", code: "OUTRA" } });
    const intruso = await prisma.student.create({
      data: {
        name: "Intruso",
        registrationNumber: "999999999",
        enrollments: { create: { classId: outraTurma.id } },
      },
    });
    await expect(
      roomService.identify(scenario.room.code, intruso.registrationNumber),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("cria a sessao do aluno e reaproveita na reentrada (spec 46)", async () => {
    const student = scenario.students[0];
    const first = await roomService.join(scenario.room.code, student.registrationNumber);
    const second = await roomService.join(scenario.room.code, student.registrationNumber);
    expect(second.playerSessionId).toBe(first.playerSessionId);
    expect(second.playerToken).toBe(first.playerToken);
  });

  it("copia as categorias para a rodada (spec 17)", async () => {
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    expect(round.categories).toHaveLength(scenario.categorySet.categories.length);

    // Alterar o cadastro depois nao altera a rodada ja criada.
    await prisma.category.updateMany({
      where: { categorySetId: scenario.categorySet.id },
      data: { name: "Renomeada" },
    });
    const reloaded = await roundService.get(round.id);
    expect(reloaded.categories.map((category) => category.name)).toEqual(
      scenario.categorySet.categories.map((category) => category.name),
    );
  });

  it("sorteia a letra no servidor e persiste na rodada (spec 15)", async () => {
    await joinAll();
    const round = await roundService.create({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    expect(round.letter).toBe("");
    const { round: withLetter } = await roundService.drawRoundLetter(round.id);
    expect(withLetter.letter).toMatch(/^[A-Z]$/);
    expect(withLetter.status).toBe("READY");

    const persisted = await roundService.get(round.id);
    expect(persisted.letter).toBe(withLetter.letter);
  });

  it("nao repete letras enquanto houver disponiveis (spec 16)", async () => {
    await joinAll();
    const letters = [];
    for (let i = 0; i < 4; i += 1) {
      const round = await roundService.next({
        gameId: scenario.game.id,
        categorySetId: scenario.categorySet.id,
      });
      const { round: withLetter } = await roundService.drawRoundLetter(round.id);
      letters.push(withLetter.letter);
      await roundService.start(round.id);
      await roundService.forceStop(round.id);
      await roundService.score(round.id);
    }
    expect(new Set(letters).size).toBe(4);
    const used = await gameService.usedLetters(scenario.game.id);
    expect(used.filter(Boolean)).toEqual(letters);
  });

  it("percorre rodada, STOP, correcao, pontuacao e ranking", async () => {
    const [joao, maria, pedro] = await joinAll();
    const round = await startedRound();
    expect(round.status).toBe("PLAYING");
    expect(round.endsAt).toBeTruthy();

    const letra = round.letter;
    // Joao e Maria repetem a resposta da primeira categoria; Pedro difere.
    const [c1, c2, c3] = round.categories;
    for (const player of [joao, maria]) {
      await answerService.submit({
        roundId: round.id,
        playerSessionId: player.playerSessionId,
        roundCategoryId: c1.id,
        value: `${letra}efresh`,
      });
    }
    await answerService.submit({
      roundId: round.id,
      playerSessionId: pedro.playerSessionId,
      roundCategoryId: c1.id,
      value: `${letra}outer`,
    });
    for (const player of [joao, maria, pedro]) {
      for (const category of [c2, c3]) {
        await answerService.submit({
          roundId: round.id,
          playerSessionId: player.playerSessionId,
          roundCategoryId: category.id,
          value: `${letra}${player.playerSessionId}${category.id}`,
        });
      }
    }

    const stopped = await roundService.requestStop({
      roundId: round.id,
      playerSessionId: joao.playerSessionId,
    });
    expect(stopped.status).toBe("STOPPED");
    expect(stopped.firstStopperId).toBe(joao.playerSessionId);

    // A correcao abre imediatamente apos o STOP (spec 12, item 10).
    const afterStop = await roundService.get(round.id);
    expect(afterStop.status).toBe("CORRECTION");

    const grid = await roundService.correctionGrid(round.id);
    expect(grid.players).toHaveLength(3);
    expect(grid.players[0].answers).toHaveLength(3);

    const { ranking } = await roundService.score(round.id);
    const scored = await roundService.get(round.id);
    expect(scored.status).toBe("SCORED");

    const answers = await prisma.answer.findMany({ where: { roundId: round.id } });
    const byPlayer = new Map();
    for (const answer of answers) {
      byPlayer.set(answer.playerSessionId, (byPlayer.get(answer.playerSessionId) ?? 0) + answer.score);
    }
    // 5 (repetida) + 10 + 10 para Joao e Maria; 10 + 10 + 10 para Pedro.
    expect(byPlayer.get(joao.playerSessionId)).toBe(25);
    expect(byPlayer.get(maria.playerSessionId)).toBe(25);
    expect(byPlayer.get(pedro.playerSessionId)).toBe(30);

    expect(ranking[0].total).toBe(30);
    expect(ranking[0].position).toBe(1);
    expect(ranking[1].position).toBe(2);
    expect(ranking[2].position).toBe(2);
  });

  it("a proxima rodada limpa eliminacoes e reabilita todos (spec 27)", async () => {
    const [joao] = await joinAll();
    const round = await startedRound();
    await roundService.eliminate({ roundId: round.id, playerSessionId: joao.playerSessionId });

    const eliminado = await prisma.roundParticipant.findUnique({
      where: { roundId_playerSessionId: { roundId: round.id, playerSessionId: joao.playerSessionId } },
    });
    expect(eliminado.status).toBe("ELIMINATED");

    await roundService.forceStop(round.id);
    await roundService.score(round.id);

    const proxima = await roundService.next({
      gameId: scenario.game.id,
      categorySetId: scenario.categorySet.id,
    });
    await roundService.drawRoundLetter(proxima.id);
    await roundService.start(proxima.id);

    const participante = await prisma.roundParticipant.findUnique({
      where: {
        roundId_playerSessionId: { roundId: proxima.id, playerSessionId: joao.playerSessionId },
      },
    });
    expect(participante.status).toBe("PLAYING");

    // E consegue responder normalmente na nova rodada.
    const nova = await roundService.get(proxima.id);
    await expect(
      answerService.submit({
        roundId: proxima.id,
        playerSessionId: joao.playerSessionId,
        roundCategoryId: nova.categories[0].id,
        value: `${nova.letter}esposta`,
      }),
    ).resolves.toBeTruthy();
  });

  it("preserva o historico das rodadas (spec 44)", async () => {
    await joinAll();
    const round = await startedRound();
    await roundService.forceStop(round.id);
    await roundService.score(round.id);
    const history = await gameService.history(scenario.game.id);
    expect(history.rounds).toHaveLength(1);
    expect(history.rounds[0].letter).toBe(round.letter);
    expect(history.rounds[0].categories).toEqual(round.categories.map((category) => category.name));
  });

  it("a tela publica nao expoe dados privados (spec 4.3)", async () => {
    await joinAll();
    await startedRound();
    const publicState = await viewService.publicState(scenario.room.code);
    const serialized = JSON.stringify(publicState);
    for (const student of scenario.students) {
      expect(serialized).not.toContain(student.registrationNumber);
    }
    expect(publicState.activePlayers).toBe(3);
    expect(publicState.round.letter).toBeTruthy();
  });

  it("o aluno recebe apenas as proprias respostas (spec 49)", async () => {
    const [joao, maria] = await joinAll();
    const round = await startedRound();
    await answerService.submit({
      roundId: round.id,
      playerSessionId: maria.playerSessionId,
      roundCategoryId: round.categories[0].id,
      value: `${round.letter}esposta da Maria`,
    });
    const state = await viewService.playerState(joao.playerSessionId);
    expect(state.answers).toHaveLength(0);
    expect(JSON.stringify(state)).not.toContain("Maria");
  });
});
