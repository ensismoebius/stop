import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STATE_LABEL = {
  PENDING: "pendente",
  VALID: "válida",
  INVALID: "inválida",
  BLANK: "em branco",
  DUPLICATE: "duplicada",
};

const CYCLE = ["VALID", "INVALID", "BLANK", "DUPLICATE"];

const KEY_MAP = {
  "1": "VALID",
  v: "VALID",
  "2": "INVALID",
  i: "INVALID",
  "3": "BLANK",
  b: "BLANK",
  "4": "DUPLICATE",
  d: "DUPLICATE",
};

/**
 * Navegacao por teclado da grade de correcao: setas movem o foco, 1/V 2/I
 * 3/B 4/D marcam direto, espaco/enter alternam o ciclo VALID→INVALID→
 * BLANK→DUPLICATE. Extraido do componente porque mistura varios hooks
 * (estado de foco, callbacks memoizados, ref de nós DOM) que nao tem
 * relacao com o JSX em si — so com "onde estou e o que a tecla significa".
 */
function useCorrectionGridKeyboard(players, categories, onReview) {
  const [focus, setFocus] = useState({ row: 0, column: 0 });
  const cellsRef = useRef(new Map());

  const answerAt = useCallback(
    (row, column) => {
      const player = players[row];
      const category = categories[column];
      if (!player || !category) return null;
      return player.answers.find((answer) => answer.roundCategoryId === category.id) ?? null;
    },
    [players, categories],
  );

  useEffect(() => {
    const key = `${focus.row}:${focus.column}`;
    cellsRef.current.get(key)?.focus();
  }, [focus]);

  const move = useCallback(
    (deltaRow, deltaColumn) => {
      setFocus((current) => ({
        row: Math.min(players.length - 1, Math.max(0, current.row + deltaRow)),
        column: Math.min(categories.length - 1, Math.max(0, current.column + deltaColumn)),
      }));
    },
    [players.length, categories.length],
  );

  const handleKeyDown = useCallback(
    (event, row, column) => {
      const answer = answerAt(row, column);
      if (event.key === "ArrowDown") {
        event.preventDefault();
        move(1, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        move(-1, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        move(0, 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        move(0, -1);
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (answer) {
          const index = CYCLE.indexOf(answer.reviewState);
          onReview(answer.id, CYCLE[(index + 1) % CYCLE.length]);
        }
      } else {
        const mapped = KEY_MAP[event.key.toLowerCase()];
        if (mapped && answer) {
          event.preventDefault();
          onReview(answer.id, mapped);
          move(1, 0);
        }
      }
    },
    [answerAt, move, onReview],
  );

  return { setFocus, cellsRef, handleKeyDown };
}

/** Um botão-célula da grade: valor + estado, cicla a marcação no clique ou navega/marca pelo teclado. */
function AnswerCell({ player, category, answer, row, column, busy, cellsRef, setFocus, handleKeyDown, onReview }) {
  const state = answer?.reviewState ?? "BLANK";
  const classes = [
    "answer-chip",
    `answer-chip--${state.toLowerCase()}`,
    answer?.duplicated ? "answer-chip--duplicate" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <td className="answer-cell">
      <button
        type="button"
        className={classes}
        disabled={busy || !answer}
        ref={(node) => {
          const key = `${row}:${column}`;
          if (node) cellsRef.current.set(key, node);
          else cellsRef.current.delete(key);
        }}
        onFocus={() => setFocus({ row, column })}
        onKeyDown={(event) => handleKeyDown(event, row, column)}
        onClick={() => {
          if (!answer) return;
          const index = CYCLE.indexOf(answer.reviewState);
          onReview(answer.id, CYCLE[(index + 1) % CYCLE.length]);
        }}
        aria-label={`${player.name}, ${category.name}: ${answer?.value || "em branco"}, ${STATE_LABEL[state]}`}
      >
        <span className="answer-chip__value">{answer?.value || <em className="muted">— vazio —</em>}</span>
        <span className="answer-chip__state">
          {STATE_LABEL[state]}
          {answer?.duplicated ? " · repetida" : ""}
          {answer && !answer.matchesLetter && answer.value ? " · fora da letra" : ""}
        </span>
      </button>
    </td>
  );
}

/** Grade aluno × categoria propriamente dita. */
function AnswerGrid({ players, categories, busy, cellsRef, setFocus, handleKeyDown, onReview }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th scope="col">Aluno</th>
            {categories.map((category) => (
              <th key={category.id} scope="col">
                {category.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, row) => (
            <tr key={player.playerSessionId}>
              <th scope="row">{player.name}</th>
              {categories.map((category, column) => {
                const answer = player.answers.find((item) => item.roundCategoryId === category.id);
                return (
                  <AnswerCell
                    key={category.id}
                    player={player}
                    category={category}
                    answer={answer}
                    row={row}
                    column={column}
                    busy={busy}
                    cellsRef={cellsRef}
                    setFocus={setFocus}
                    handleKeyDown={handleKeyDown}
                    onReview={onReview}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function reviewSummary(players) {
  let pending = 0;
  let valid = 0;
  for (const player of players) {
    for (const answer of player.answers) {
      if (answer.reviewState === "PENDING") pending += 1;
      if (answer.reviewState === "VALID") valid += 1;
    }
  }
  return { pending, valid };
}

/**
 * Grade de correcao (spec 18).
 *
 * A correcao precisa ser rapida: e possivel percorrer as respostas com as
 * setas e marcar com o teclado (1/V, 2/I, 3/B, 4/D ou espaco para alternar).
 */
export function CorrectionPanel({ grid, onReview, busy }) {
  const players = grid?.players ?? [];
  const categories = grid?.categories ?? [];
  const { setFocus, cellsRef, handleKeyDown } = useCorrectionGridKeyboard(players, categories, onReview);
  const summary = useMemo(() => reviewSummary(players), [players]);

  if (!grid) {
    return (
      <section className="card">
        <h2>Correção</h2>
        <p className="muted">A correção aparece assim que a rodada for encerrada.</p>
      </section>
    );
  }

  return (
    <section className="card stack correction">
      <div className="spread">
        <h2>
          Correção — letra {grid.round?.letter} · {grid.round?.themeName}
        </h2>
        <span className="small muted">
          {summary.valid} válida(s) · {summary.pending} pendente(s)
        </span>
      </div>

      <p className="correction__hint">
        Use as setas para navegar. Marque com <strong>1/V</strong> válida, <strong>2/I</strong>{" "}
        inválida, <strong>3/B</strong> em branco, <strong>4/D</strong> duplicada. Espaço alterna.
      </p>

      <AnswerGrid
        players={players}
        categories={categories}
        busy={busy}
        cellsRef={cellsRef}
        setFocus={setFocus}
        handleKeyDown={handleKeyDown}
        onReview={onReview}
      />

      {grid.eliminated?.length > 0 ? (
        <p className="small muted">
          Eliminados nesta rodada (não pontuam):{" "}
          {grid.eliminated.map((player) => player.name).join(", ")}
        </p>
      ) : null}
    </section>
  );
}

export default CorrectionPanel;
