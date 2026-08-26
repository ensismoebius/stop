import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoundControl from "../../../src/components/teacher/RoundControl.jsx";

const categorySets = [
  { id: 1, name: "Biologia", categories: [{ id: 1 }, { id: 2 }] },
  { id: 2, name: "Química" },
];

function baseProps(overrides = {}) {
  return {
    round: null,
    categorySets,
    usedLetters: [],
    seconds: null,
    busy: false,
    onCreateRound: vi.fn(),
    onDrawLetter: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onCancel: vi.fn(),
    onScore: vi.fn(),
    onNextRound: vi.fn(),
    onGoToCorrection: vi.fn(),
    collabProgress: null,
    onFinishCollaborativeCorrection: vi.fn(),
    disabled: false,
    ...overrides,
  };
}

describe("RoundControl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the 'nenhuma rodada' badge and theme-choice phase when there is no round", () => {
    render(<RoundControl {...baseProps()} />);
    expect(screen.getByText("nenhuma rodada")).toBeInTheDocument();
    expect(screen.getByText("Escolha o tema e o tempo da rodada para começar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar rodada" })).toBeInTheDocument();
  });

  it("creates a round with the selected category set and duration", async () => {
    const user = userEvent.setup();
    const onCreateRound = vi.fn();
    render(<RoundControl {...baseProps({ onCreateRound })} />);

    await user.selectOptions(screen.getByLabelText("Tema / conjunto de categorias"), "2");
    const durationInput = screen.getByLabelText("Duração (segundos)");
    await user.clear(durationInput);
    await user.type(durationInput, "60");
    await user.click(screen.getByRole("button", { name: "Criar rodada" }));

    expect(onCreateRound).toHaveBeenCalledWith({ categorySetId: 2, durationSeconds: 60 });
  });

  it("disables the create-round action while disabled or busy", () => {
    const { rerender } = render(<RoundControl {...baseProps({ disabled: true })} />);
    expect(screen.getByRole("button", { name: "Criar rodada" })).toBeDisabled();

    rerender(<RoundControl {...baseProps({ busy: true })} />);
    expect(screen.getByRole("button", { name: "Criar rodada" })).toBeDisabled();
  });

  it("disables the create-round action when there are no category sets to select from", () => {
    // A fresh render (not a rerender of the same instance): categorySetId
    // starts unset and, with categorySets empty, useRoundFormFields' effect
    // has nothing to default it to, so it stays falsy.
    render(<RoundControl {...baseProps({ categorySets: [] })} />);
    expect(screen.getByRole("button", { name: "Criar rodada" })).toBeDisabled();
  });

  it("shows the round badge and CREATED phase (draw letter)", async () => {
    const user = userEvent.setup();
    const onDrawLetter = vi.fn();
    render(
      <RoundControl
        {...baseProps({
          round: { roundNumber: 3, status: "CREATED", themeName: "Biologia" },
          onDrawLetter,
        })}
      />,
    );

    expect(screen.getByText("Rodada 3 · CREATED")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sortear letra" }));
    expect(onDrawLetter).toHaveBeenCalled();
  });

  it("cancels the round after confirmation, and skips when declined", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(
      <RoundControl
        {...baseProps({ round: { roundNumber: 1, status: "CREATED", themeName: "Bio" }, onCancel })}
      />,
    );

    vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "✕ cancelar esta rodada" }));
    expect(onCancel).not.toHaveBeenCalled();

    window.confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: "✕ cancelar esta rodada" }));
    expect(window.confirm).toHaveBeenLastCalledWith("Cancelar a rodada atual? Ela não será pontuada.");
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the READY phase: start, draw another letter, cancel", async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    const onDrawLetter = vi.fn();
    render(
      <RoundControl
        {...baseProps({
          round: { roundNumber: 1, status: "READY", themeName: "Biologia" },
          onStart,
          onDrawLetter,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Iniciar rodada" }));
    expect(onStart).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Sortear outra letra" }));
    expect(onDrawLetter).toHaveBeenCalled();
  });

  it("shows the STARTING phase with a syncing message", () => {
    render(
      <RoundControl
        {...baseProps({ round: { roundNumber: 1, status: "STARTING", themeName: "Biologia" } })}
      />,
    );
    expect(screen.getByText(/sincronizando o início/)).toBeInTheDocument();
  });

  it("shows the PLAYING phase with formatted clock, letter, and stop action", async () => {
    const user = userEvent.setup();
    const onStop = vi.fn();
    render(
      <RoundControl
        {...baseProps({
          round: { roundNumber: 1, status: "PLAYING", themeName: "Biologia", letter: "B" },
          seconds: 75,
          onStop,
        })}
      />,
    );

    expect(screen.getByText("01:15")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "⏹ ENCERRAR RODADA" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("shows the STOPPED placeholder message", () => {
    render(<RoundControl {...baseProps({ round: { roundNumber: 1, status: "STOPPED" } })} />);
    expect(screen.getByText("A rodada foi encerrada. Preparando a correção colaborativa…")).toBeInTheDocument();
  });

  it("shows collaborative-correction progress and finish action", async () => {
    const user = userEvent.setup();
    const onFinish = vi.fn();
    render(
      <RoundControl
        {...baseProps({
          round: { roundNumber: 1, status: "COLLABORATIVE_CORRECTION" },
          collabProgress: { completedAssignments: 3, totalAssignments: 10 },
          onFinishCollaborativeCorrection: onFinish,
        })}
      />,
    );
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Finalizar correção colaborativa agora →" }));
    expect(onFinish).toHaveBeenCalled();
  });

  it("defaults collaborative-correction progress to 0/0 when absent", () => {
    render(
      <RoundControl
        {...baseProps({ round: { roundNumber: 1, status: "COLLABORATIVE_CORRECTION" }, collabProgress: null })}
      />,
    );
    expect(screen.getByText("0 / 0")).toBeInTheDocument();
  });

  it("shows the CORRECTION phase with go-to-correction and score actions", async () => {
    const user = userEvent.setup();
    const onGoToCorrection = vi.fn();
    const onScore = vi.fn();
    render(
      <RoundControl
        {...baseProps({ round: { roundNumber: 1, status: "CORRECTION" }, onGoToCorrection, onScore })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Abrir correção →" }));
    expect(onGoToCorrection).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Pontuar rodada agora" }));
    expect(onScore).toHaveBeenCalled();
  });

  it("shows the SCORED phase and submits the next round with the chosen theme/duration", async () => {
    const user = userEvent.setup();
    const onNextRound = vi.fn();
    render(
      <RoundControl
        {...baseProps({
          round: { roundNumber: 1, status: "SCORED", themeName: "Biologia" },
          onNextRound,
        })}
      />,
    );

    expect(screen.getByText(/Pontuação de/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "PRÓXIMA RODADA →" }));
    expect(onNextRound).toHaveBeenCalledWith({ categorySetId: 1, durationSeconds: 120 });
  });

  it("renders nothing for an unrecognised status", () => {
    render(<RoundControl {...baseProps({ round: { roundNumber: 1, status: "WEIRD" } })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("treats a FINISHED round the same as no round (badge + theme phase)", () => {
    render(<RoundControl {...baseProps({ round: { roundNumber: 5, status: "FINISHED" } })} />);
    expect(screen.getByText("nenhuma rodada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar rodada" })).toBeInTheDocument();
  });

  it("renders the used-letters strip, marking only the last occurrence of the current letter as current", () => {
    render(
      <RoundControl
        {...baseProps({
          round: { roundNumber: 2, status: "CREATED", themeName: "Bio", letter: "A" },
          usedLetters: ["A", "B", null, "A"],
        })}
      />,
    );
    expect(screen.getByText("Letras já usadas nesta partida:")).toBeInTheDocument();
    const items = screen.getAllByText("A");
    // Two "A" entries render (falsy filtered out); only the last should carry --current.
    const currentItems = document.querySelectorAll(".letters__item--current");
    expect(currentItems).toHaveLength(1);
    expect(currentItems[0]).toHaveTextContent("A");
  });

  it("hides the used-letters strip entirely when there are none", () => {
    render(<RoundControl {...baseProps({ usedLetters: [] })} />);
    expect(screen.queryByText("Letras já usadas nesta partida:")).not.toBeInTheDocument();
  });

  it("hides the used-letters strip when usedLetters is only falsy values", () => {
    render(<RoundControl {...baseProps({ usedLetters: [null, undefined] })} />);
    expect(screen.queryByText("Letras já usadas nesta partida:")).not.toBeInTheDocument();
  });

  it("defaults usedLetters to none when the prop itself is missing", () => {
    render(<RoundControl {...baseProps({ usedLetters: undefined })} />);
    expect(screen.queryByText("Letras já usadas nesta partida:")).not.toBeInTheDocument();
  });

  it("marks flow steps done/current based on the round status", () => {
    render(<RoundControl {...baseProps({ round: { roundNumber: 1, status: "PLAYING" }, seconds: 10 })} />);
    const flow = screen.getByLabelText("Fluxo da rodada");
    expect(flow).toBeInTheDocument();
    expect(document.querySelectorAll(".flow__step--done").length).toBeGreaterThan(0);
    expect(document.querySelector(".flow__step--current")).toHaveTextContent("Acompanhar");
  });

  it("defaults the selected category set to the first one once category sets arrive", () => {
    render(<RoundControl {...baseProps()} />);
    expect(screen.getByLabelText("Tema / conjunto de categorias")).toHaveValue("1");
  });

  it("shows the categories count as 0 when a category set has no categories array", () => {
    render(<RoundControl {...baseProps()} />);
    expect(screen.getByText("Química (0 categorias)")).toBeInTheDocument();
  });

  it("disables theme/duration fields when disabled is true, on the CREATED-round SCORED phase too", () => {
    render(
      <RoundControl
        {...baseProps({ round: { roundNumber: 1, status: "SCORED", themeName: "Bio" }, disabled: true })}
      />,
    );
    expect(screen.getByLabelText("Tema / conjunto de categorias")).toBeDisabled();
    expect(screen.getByLabelText("Duração (segundos)")).toBeDisabled();
  });
});
