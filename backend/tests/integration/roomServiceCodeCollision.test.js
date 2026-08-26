import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createScenario, prisma, resetDatabase } from "../helpers/fixtures.js";
import roomService from "../../src/services/roomService.js";
import { generateRoomCode } from "../../src/game/codes.js";

// Isolado num arquivo próprio: o mock de geração de código afeta qualquer
// chamada a roomService.create() neste arquivo, então mantemos as demais
// suítes (que dependem de códigos aleatórios reais) intactas em outros
// arquivos.
vi.mock("../../src/game/codes.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, generateRoomCode: vi.fn() };
});

let scenario;

beforeEach(async () => {
  await resetDatabase();
  scenario = await createScenario();
  vi.mocked(generateRoomCode).mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("roomService.create (colisão de código de sala, spec 5)", () => {
  it("tenta novamente quando o código sorteado já existe, até achar um livre", async () => {
    const outroGame = await prisma.game.create({
      data: { name: "Outra partida", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    // A sala do cenário padrão já usa "STOP-TEST" (fixtures.js). A primeira
    // tentativa colide com ela; a segunda usa um código livre.
    vi.mocked(generateRoomCode).mockReturnValueOnce("STOP-TEST").mockReturnValueOnce("STOP-FREE");

    const room = await roomService.create(outroGame.id);
    expect(room.code).toBe("STOP-FREE");
    expect(generateRoomCode).toHaveBeenCalledTimes(2);
  });

  it("desiste após esgotar as tentativas e nunca cria a sala", async () => {
    const outroGame = await prisma.game.create({
      data: { name: "Outra partida 2", classId: scenario.turma.id, teacherId: scenario.teacher.id },
    });
    vi.mocked(generateRoomCode).mockReturnValue("STOP-TEST");

    await expect(roomService.create(outroGame.id)).rejects.toMatchObject({ status: 409 });
    const rooms = await prisma.room.findMany({ where: { gameId: outroGame.id } });
    expect(rooms).toHaveLength(0);
  });
});
