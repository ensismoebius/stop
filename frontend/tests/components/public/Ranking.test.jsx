import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import Ranking from "../../../src/components/public/Ranking.jsx";

/** Cria um participante com valores padrão, sobrescrevíveis por `overrides`. */
function entry(overrides = {}) {
  return { studentId: "s1", name: "Ana", total: 30, position: 1, avatarUrl: null, ...overrides };
}

/** Pódio completo mais dois participantes fora dele. */
function fullField() {
  return [
    entry({ studentId: "s1", name: "Ana", total: 30, position: 1 }),
    entry({ studentId: "s2", name: "Bruno", total: 20, position: 2 }),
    entry({ studentId: "s3", name: "Carla", total: 10, position: 3 }),
    entry({ studentId: "s4", name: "Davi", total: 5, position: 4 }),
    entry({ studentId: "s5", name: "Elis", total: 2, position: 5 }),
  ];
}

/**
 * Cada passo do roteiro agenda o seguinte só depois de renderizar, então
 * avançar o tempo de dois passos de uma vez não funciona. Avançamos pelo
 * maior atraso do roteiro (3200ms): isso dispara exatamente um passo, já
 * que o próximo é sempre agendado com pelo menos 1700ms a partir dali.
 */
const STEP_MS = 3200;
const next = (times = 1) => {
  for (let i = 0; i < times; i += 1) act(() => vi.advanceTimersByTime(STEP_MS));
};

// tease(3) → 3º → tease(2) → 2º → tease(1) → 1º → turma
const toThird = () => next(1);
const toSecond = () => next(2);
const toFirst = () => next(2);
const toAudience = () => next(1);

beforeEach(() => {
  vi.useFakeTimers();
  // A contagem de pontos usa requestAnimationFrame ancorado em
  // performance.now(). Torna-a sincrona: o primeiro frame ja reporta
  // "muito depois do fim", entao o valor assenta no total na hora.
  vi.stubGlobal("requestAnimationFrame", (cb) => {
    cb(performance.now() + 100000);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stepOf = (place) => screen.getByTestId(`podium-step-${place}`);

describe("Ranking entre rodadas (lista de sempre)", () => {
  it("usa a lista, não o pódio, enquanto a partida não acabou", () => {
    render(<Ranking entries={fullField()} audio={null} />);
    expect(screen.getByText("🏆 RANKING 🏆")).toBeInTheDocument();
    expect(screen.queryByTestId("podium-step-1")).not.toBeInTheDocument();
    expect(screen.queryByText("3º LUGAR…")).not.toBeInTheDocument();
  });

  it("revela do último colocado para o primeiro", () => {
    render(<Ranking entries={fullField()} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    // O último colocado aparece primeiro; o 1º lugar ainda não.
    expect(screen.getByText("Elis")).toBeInTheDocument();
    expect(screen.queryByText("Ana")).not.toBeInTheDocument();

    for (let i = 0; i < 4; i += 1) act(() => vi.advanceTimersByTime(1100));
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  it("não dispara fogos nem faixa de participantes", () => {
    const { container } = render(<Ranking entries={fullField()} audio={null} />);
    for (let i = 0; i < 6; i += 1) act(() => vi.advanceTimersByTime(1100));
    expect(container.querySelector(".fireworks")).toBeNull();
    expect(screen.queryByTestId("audience")).not.toBeInTheDocument();
  });

  it("mostra no máximo o top 8", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      entry({ studentId: `s${i}`, name: `Aluno ${i + 1}`, total: 50 - i, position: i + 1 }),
    );
    render(<Ranking entries={many} audio={null} />);
    for (let i = 0; i < 10; i += 1) act(() => vi.advanceTimersByTime(1100));
    expect(screen.getAllByRole("listitem")).toHaveLength(8);
    expect(screen.queryByText("Aluno 9")).not.toBeInTheDocument();
  });

  it("mostra o avatar na linha da lista quando existe", () => {
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1, avatarUrl: "/a.svg" }),
    ];
    const { container } = render(<Ranking entries={entries} audio={null} />);
    act(() => vi.advanceTimersByTime(700));
    expect(container.querySelector(".ranking-reveal__avatar")).toHaveAttribute("src", "/a.svg");
  });

  it("troca para o pódio quando a partida termina", () => {
    const { rerender } = render(<Ranking entries={fullField()} audio={null} />);
    expect(screen.getByText("🏆 RANKING 🏆")).toBeInTheDocument();

    rerender(<Ranking entries={fullField()} audio={null} finished />);
    expect(screen.getByTestId("podium-step-1")).toBeInTheDocument();
    expect(screen.queryByText("🏆 RANKING 🏆")).not.toBeInTheDocument();
  });

  it("oculta os pontos na lista quando hidePoints=true", () => {
    const { container } = render(<Ranking entries={fullField()} audio={null} hidePoints />);
    for (let i = 0; i < 5; i += 1) act(() => vi.advanceTimersByTime(1100));
    // As linhas reveladas mostram o placeholder, não o número real.
    expect(container.querySelectorAll(".ranking-reveal__total--hidden").length).toBeGreaterThan(0);
    expect(container.querySelector(".ranking-reveal__total--hidden").textContent).toBe("•••");
    expect(screen.queryByText("30")).not.toBeInTheDocument();
    expect(screen.queryByText("20")).not.toBeInTheDocument();
  });
});

describe("Ranking (cerimônia de pódio)", () => {
  it("renders nothing when there are no entries", () => {
    const { container } = render(<Ranking entries={[]} audio={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when entries is undefined", () => {
    const { container } = render(<Ranking entries={undefined} audio={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lays the podium out in olympic order: 2nd, 1st, 3rd", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    const steps = screen.getAllByTestId(/^podium-step-/);
    expect(steps.map((step) => step.dataset.testid)).toEqual([
      "podium-step-2",
      "podium-step-1",
      "podium-step-3",
    ]);
  });

  it("teases each place before revealing it", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    // Começa anunciando o 3º lugar, com o degrau ainda vazio.
    expect(screen.getByText("3º LUGAR…")).toBeInTheDocument();
    expect(within(stepOf(3)).queryByText("Carla")).not.toBeInTheDocument();
  });

  it("reveals third place first — before second and first", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    toThird();

    expect(within(stepOf(3)).getByText("Carla")).toBeInTheDocument();
    expect(within(stepOf(2)).queryByText("Bruno")).not.toBeInTheDocument();
    expect(within(stepOf(1)).queryByText("Ana")).not.toBeInTheDocument();
  });

  it("then reveals second, still holding back the winner", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    toThird();
    toSecond();

    expect(within(stepOf(3)).getByText("Carla")).toBeInTheDocument();
    expect(within(stepOf(2)).getByText("Bruno")).toBeInTheDocument();
    expect(within(stepOf(1)).queryByText("Ana")).not.toBeInTheDocument();
  });

  it("reveals the winner last, with fireworks", () => {
    const { container } = render(<Ranking entries={fullField()} audio={null} finished />);
    expect(container.querySelector(".fireworks")).toBeNull();

    toThird();
    toSecond();
    toFirst();

    expect(within(stepOf(1)).getByText("Ana")).toBeInTheDocument();
    expect(container.querySelector(".fireworks")).not.toBeNull();
  });

  it("counts each winner's score up to the target", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    toThird();
    expect(within(stepOf(3)).getByText("10")).toBeInTheDocument();
  });

  it("shows everyone — podium and the rest — at the very end", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    toThird();
    toSecond();
    toFirst();
    expect(screen.queryByTestId("audience")).not.toBeInTheDocument();

    toAudience();
    const audience = within(screen.getByTestId("audience"));
    // Fora do pódio, mas também quem subiu ao degrau — ninguém fica de fora.
    expect(audience.getByText("Davi")).toBeInTheDocument();
    expect(audience.getByText("Elis")).toBeInTheDocument();
    expect(audience.getByText("Ana")).toBeInTheDocument();
    expect(audience.getByText("Bruno")).toBeInTheDocument();
    expect(audience.getByText("Carla")).toBeInTheDocument();
  });

  it("plays drumroll for the tease and a fanfare for the winner", () => {
    const audio = { play: vi.fn() };
    render(<Ranking entries={fullField()} audio={audio} finished />);
    expect(audio.play).toHaveBeenCalledWith("DRUMROLL");

    toThird();
    expect(audio.play).toHaveBeenCalledWith("PODIUM");

    toSecond();
    toFirst();
    expect(audio.play).toHaveBeenCalledWith("FANFARE");
  });

  it("puts everyone tied on the same step", () => {
    // Empate real: dois alunos em 1º sobem juntos no degrau do ouro.
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1 }),
      entry({ studentId: "s2", name: "Bruno", total: 30, position: 1 }),
      entry({ studentId: "s3", name: "Carla", total: 10, position: 3 }),
    ];
    render(<Ranking entries={entries} audio={null} finished />);
    toThird();
    toSecond();
    toFirst();

    const gold = within(stepOf(1));
    expect(gold.getByText("Ana")).toBeInTheDocument();
    expect(gold.getByText("Bruno")).toBeInTheDocument();
  });

  it("renders avatars on the podium when provided", () => {
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1, avatarUrl: "/a.svg" }),
    ];
    const { container } = render(<Ranking entries={entries} audio={null} finished />);
    toThird();
    toSecond();
    toFirst();
    expect(container.querySelector(".podium__avatar")).toHaveAttribute("src", "/a.svg");
  });

  it("shows avatars in the audience strip, falling back to an initial", () => {
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1 }),
      entry({ studentId: "s4", name: "Davi", total: 5, position: 4, avatarUrl: "/d.svg" }),
      entry({ studentId: "s5", name: "Elis", total: 2, position: 5 }),
    ];
    render(<Ranking entries={entries} audio={null} finished />);
    toThird();
    toSecond();
    toFirst();
    toAudience();

    const audience = within(screen.getByTestId("audience"));
    // O avatar é decorativo: o nome já está escrito ao lado dele.
    expect(audience.getByRole("listitem", { name: /Davi/ }).querySelector("img")).toHaveAttribute(
      "src",
      "/d.svg",
    );
    // Sem avatar, entra a inicial do nome.
    expect(audience.getByText("E")).toBeInTheDocument();
  });

  it("shows the full class in the audience strip even when only the podium placed", () => {
    const entries = [
      entry({ studentId: "s1", name: "Ana", total: 30, position: 1 }),
      entry({ studentId: "s2", name: "Bruno", total: 20, position: 2 }),
    ];
    render(<Ranking entries={entries} audio={null} finished />);
    toThird();
    toSecond();
    toFirst();
    toAudience();
    // O rodapé agora traz todo mundo — inclusive os medalhistas.
    const audience = within(screen.getByTestId("audience"));
    expect(audience.getByText("Ana")).toBeInTheDocument();
    expect(audience.getByText("Bruno")).toBeInTheDocument();
  });

  it("restarts the ceremony when the ranking actually changes", () => {
    const { rerender } = render(<Ranking entries={fullField()} audio={null} finished />);
    toThird();
    toSecond();
    expect(within(stepOf(2)).getByText("Bruno")).toBeInTheDocument();

    const next = fullField().map((item) =>
      item.studentId === "s2" ? { ...item, total: 99 } : item,
    );
    rerender(<Ranking entries={next} audio={null} finished />);
    // Volta ao início: nenhum degrau ocupado.
    expect(within(stepOf(2)).queryByText("Bruno")).not.toBeInTheDocument();
  });

  it("does not restart on a re-render with the same ranking", () => {
    const entries = fullField();
    const { rerender } = render(<Ranking entries={entries} audio={null} finished />);
    toThird();
    rerender(<Ranking entries={[...entries]} audio={null} finished />);
    expect(within(stepOf(3)).getByText("Carla")).toBeInTheDocument();
  });

  it("stops scheduling once the ceremony is over", () => {
    render(<Ranking entries={fullField()} audio={null} finished />);
    toThird();
    toSecond();
    toFirst();
    toAudience();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("sempre mostra os pontos no pódio, mesmo com hidePoints=true", () => {
    const { container } = render(<Ranking entries={fullField()} audio={null} finished hidePoints />);
    toThird();
    toSecond();
    toFirst();

    // O ocultar-pontos vale para a lista de classificação entre rodadas,
    // nunca para a cerimônia do pódio — aqui os totais sempre aparecem.
    expect(container.querySelector(".podium__total--hidden")).toBeNull();
    const totals = container.querySelectorAll(".podium__total");
    expect(totals.length).toBeGreaterThan(0);
    const texts = Array.from(totals).map((el) => el.textContent);
    expect(texts).toContain("30");
    expect(texts).toContain("20");
    expect(texts).toContain("10");
  });
});
