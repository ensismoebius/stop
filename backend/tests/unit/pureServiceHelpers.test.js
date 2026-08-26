import { describe, expect, it } from "vitest";
import studentService from "../../src/services/studentService.js";
import viewService from "../../src/services/viewService.js";

describe("studentService.belongsToClass (funcao pura)", () => {
  it("devolve falso quando o aluno nao tem nenhuma matricula carregada", () => {
    expect(studentService.belongsToClass({}, 1)).toBe(false);
  });

  it("devolve verdadeiro quando ha uma matricula na turma", () => {
    expect(studentService.belongsToClass({ enrollments: [{ classId: 1 }] }, 1)).toBe(true);
  });
});

describe("viewService.roundSummary (funcao pura)", () => {
  it("usa lista vazia quando a rodada nao trouxe categorias", () => {
    const summary = viewService.roundSummary({
      id: 1,
      roundNumber: 1,
      status: "CREATED",
      themeName: "Tema",
      letter: "",
      durationSeconds: 60,
    });
    expect(summary.categories).toEqual([]);
  });

  it("devolve null para uma rodada inexistente", () => {
    expect(viewService.roundSummary(null)).toBeNull();
  });
});
