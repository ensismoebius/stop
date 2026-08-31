import { beforeEach, describe, expect, it } from "vitest";
import { recordClientSync, dropClientSync, syncStats, dropRoom } from "../../src/sockets/syncRegistry.js";

const ROOM = "STOP-SYNC";
const contextFor = (role, sessionId) => ({
  room: { code: ROOM },
  role,
  session: sessionId ? { id: sessionId } : undefined,
});

const POSITION = { roomEpoch: 1, stateVersion: 7 };
const statsNow = (totalConnected) =>
  syncStats(ROOM, { totalConnected, currentEpoch: 1, currentVersion: 7 });

beforeEach(() => {
  dropRoom(ROOM);
});

describe("syncRegistry.syncStats", () => {
  it("conta apenas alunos — professor e tela não entram no denominador dos alunos", () => {
    // `expected` vem das PlayerSession conectadas; o professor e a tela pública
    // reportam posição pelo mesmo caminho (requestState/heartbeat) e ficam no
    // mesmo mapa. Contá-los junto fazia o painel exibir mais sincronizados do
    // que alunos existentes ("Sincronizado 3/2"), destruindo justamente o
    // indicador que avisa o professor de que a turma ficou para trás.
    recordClientSync(contextFor("player", 1), POSITION);
    recordClientSync(contextFor("player", 2), POSITION);
    recordClientSync(contextFor("teacher"), POSITION);
    recordClientSync(contextFor("screen"), POSITION);

    const stats = statsNow(2);
    expect(stats).toEqual({ expected: 2, synchronized: 2, stale: 0, recovering: 0 });
    expect(stats.synchronized).toBeLessThanOrEqual(stats.expected);
  });

  it("aluno com posição antiga conta como stale; conectado sem reportar conta como recovering", () => {
    recordClientSync(contextFor("player", 1), { roomEpoch: 1, stateVersion: 2 });
    recordClientSync(contextFor("teacher"), POSITION);

    // 3 alunos conectados: 1 reportou (atrasado), 2 nunca reportaram.
    expect(statsNow(3)).toEqual({ expected: 3, synchronized: 0, stale: 1, recovering: 2 });
  });

  it("dropClientSync remove o aluno do cálculo (desconexão não deixa fantasma sincronizado)", () => {
    recordClientSync(contextFor("player", 1), POSITION);
    recordClientSync(contextFor("player", 2), POSITION);
    expect(statsNow(2).synchronized).toBe(2);

    dropClientSync(contextFor("player", 2));
    expect(statsNow(1)).toEqual({ expected: 1, synchronized: 1, stale: 0, recovering: 0 });
  });
});
