import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useApplyState } from "../../src/pages/StudentGamePage.hooks.jsx";

/** Wire dos setters mínima que o hook precisa, capturando `setAnswers`. */
function setup(dirtySet = new Set()) {
  const sync = vi.fn();
  const setEliminated = vi.fn();
  const setReviews = vi.fn();
  const setCompletedReviewIds = vi.fn();
  const setRanking = vi.fn();
  const setAnswers = vi.fn();
  const dirtyRef = { current: dirtySet };

  const { result } = renderHook(() =>
    useApplyState({ sync, setAnswers, setEliminated, setReviews, setCompletedReviewIds, setRanking, dirtyRef }),
  );

  const apply = (state, currentAnswers = {}) => {
    act(() => result.current(state));
    const [updater] = setAnswers.mock.calls.at(-1);
    return typeof updater === "function" ? updater(currentAnswers) : updater;
  };

  return { apply, setAnswers, setReviews, setRanking, setEliminated, sync };
}

describe("useApplyState — preserva o rascunho local em edição (spec 48, backspace aleatório)", () => {
  it("durante PLAYING, um snapshot autoritativo mais antigo não apaga texto digitado mas não sincronizado", () => {
    const dirtySet = new Set(["cat-1"]);
    const { apply } = setup(dirtySet);

    const got = apply(
      {
        serverTime: "2026-01-01T00:00:00Z",
        round: { status: "PLAYING" },
        answers: [{ roundCategoryId: "cat-1", value: "gir" }],
      },
      { "cat-1": "girassol" },
    );

    expect(got["cat-1"]).toBe("girassol");
  });

  it("categorias não-sujas seguem o snapshot autoritativo mesmo durante PLAYING", () => {
    const dirtySet = new Set(["cat-1"]);
    const { apply } = setup(dirtySet);

    const got = apply(
      {
        serverTime: "2026-01-01T00:00:00Z",
        round: { status: "PLAYING" },
        answers: [
          { roundCategoryId: "cat-1", value: "gir" },
          { roundCategoryId: "cat-2", value: "rio" },
        ],
      },
      { "cat-1": "girassol", "cat-2": "antigo" },
    );

    expect(got["cat-1"]).toBe("girassol");
    expect(got["cat-2"]).toBe("rio");
  });

  it("após a confirmação do push (dirty limpo), o servidor volta a ter a palavra final", () => {
    const dirtySet = new Set();
    const { apply } = setup(dirtySet);

    const got = apply(
      {
        serverTime: "2026-01-01T00:00:00Z",
        round: { status: "PLAYING" },
        answers: [{ roundCategoryId: "cat-1", value: "girassol" }],
      },
      { "cat-1": "gira" },
    );

    expect(got["cat-1"]).toBe("girassol");
  });

  it("fora de PLAYING o rascunho sujo ainda vence — prioridade absoluta ao que o aluno digitou", () => {
    const dirtySet = new Set(["cat-1"]);
    const { apply } = setup(dirtySet);

    const got = apply(
      {
        serverTime: "2026-01-01T00:00:00Z",
        round: { status: "STOPPED" },
        answers: [{ roundCategoryId: "cat-1", value: "girassol" }],
      },
      { "cat-1": "gir" },
    );

    expect(got["cat-1"]).toBe("gir");
  });

  it("categorias não-sujas seguem o snapshot autoritativo mesmo fora de PLAYING", () => {
    const dirtySet = new Set(["cat-1"]);
    const { apply } = setup(dirtySet);

    const got = apply(
      {
        serverTime: "2026-01-01T00:00:00Z",
        round: { status: "STOPPED" },
        answers: [
          { roundCategoryId: "cat-1", value: "gir" },
          { roundCategoryId: "cat-2", value: "rio" },
        ],
      },
      { "cat-1": "girassol", "cat-2": "antigo" },
    );

    expect(got["cat-1"]).toBe("girassol");
    expect(got["cat-2"]).toBe("rio");
  });
});