/** Resumo geral da partida (spec 43). */
function SummaryStats({ totals }) {
  return (
    <section className="card stack">
      <h2>Resumo</h2>
      <div className="stat-grid">
        <div className="stat">
          <div className="stat__value">{totals.rounds}</div>
          <div className="stat__label">Rodadas</div>
        </div>
        <div className="stat">
          <div className="stat__value">{Math.round(totals.fillRate * 100)}%</div>
          <div className="stat__label">Taxa de preenchimento</div>
        </div>
        <div className="stat">
          <div className="stat__value">{totals.validAnswers}</div>
          <div className="stat__label">Respostas válidas</div>
        </div>
        <div className="stat">
          <div className="stat__value">{totals.answers - totals.validAnswers}</div>
          <div className="stat__label">Respostas inválidas</div>
        </div>
        <div className="stat">
          <div className="stat__value">{totals.stops}</div>
          <div className="stat__label">STOPs</div>
        </div>
        <div className="stat">
          <div className="stat__value">{totals.timeouts}</div>
          <div className="stat__label">Timeouts</div>
        </div>
        <div className="stat">
          <div className="stat__value">{totals.eliminations}</div>
          <div className="stat__label">Eliminações</div>
        </div>
        <div className="stat">
          <div className="stat__value">
            {totals.averageSecondsToStop === null ? "—" : `${totals.averageSecondsToStop}s`}
          </div>
          <div className="stat__label">Tempo médio até STOP</div>
        </div>
      </div>
    </section>
  );
}

/** Tabela genérica de estatísticas (título, cabeçalhos e linhas por `keyField`). */
function StatsTable({ title, headers, data, keyField, columns }) {
  return (
    <section className="card stack">
      <h2>{title}</h2>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header} scope="col">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry[keyField]}>
                {columns.map((col) => (
                  <td key={col.key}>{entry[col.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Mapeamento de cada dimensão (categoria/tema) para a tabela a renderizar. */
const DIMENSION_VIEWS = {
  category: {
    title: "Desempenho por categoria",
    headers: ["Categoria", "Respostas", "Preenchidas", "Válidas", "Pontos"],
    keyField: "category",
    columns: [
      { key: "category" },
      { key: "answers" },
      { key: "filled" },
      { key: "valid" },
      { key: "totalScore" },
    ],
  },
  theme: {
    title: "Desempenho por tema",
    headers: ["Tema", "Rodadas", "Válidas", "Inválidas", "Pontos"],
    keyField: "theme",
    columns: [
      { key: "theme" },
      { key: "rounds" },
      { key: "validAnswers" },
      { key: "invalidAnswers" },
      { key: "totalScore" },
    ],
  },
};

/**
 * Desempenho por categoria; com `variant="theme"` a mesma tabela é reusada
 * para o desempenho por tema, trocando o mapeamento de título/colunas.
 */
function PerCategoryStats({ byCategory, variant = "category" }) {
  const view = DIMENSION_VIEWS[variant];
  return (
    <StatsTable
      title={view.title}
      headers={view.headers}
      data={byCategory}
      keyField={view.keyField}
      columns={view.columns}
    />
  );
}

/** Desempenho por tema, renderizado via `PerCategoryStats` com outro mapeamento. */
function PerThemeStats({ byTheme }) {
  return <PerCategoryStats byCategory={byTheme} variant="theme" />;
}

/** Histórico das rodadas, com remoção (confirmada) de rodada pontuada. */
function RoundHistoryTable({ history, onDeleteRound, busy }) {
  if (!history) return null;

  return (
    <section className="card stack">
      <h2>Histórico das rodadas</h2>
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Tema</th>
              <th scope="col">Letra</th>
              <th scope="col">Encerramento</th>
              <th scope="col">STOP de</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {history.rounds.map((round) => (
              <tr key={round.id}>
                <td>{round.roundNumber}</td>
                <td>{round.themeName}</td>
                <td>{round.letter || "—"}</td>
                <td>{round.stopReason ?? round.status}</td>
                <td>{round.firstStopper ?? "—"}</td>
                <td>
                  {onDeleteRound && (round.status === "SCORED" || round.status === "FINISHED") ? (
                    <button
                      type="button"
                      className="btn btn--ghost small"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Remover a rodada ${round.roundNumber} (${round.themeName}) do histórico? Os pontos que ela gerou serão descontados do ranking.`,
                          )
                        ) {
                          onDeleteRound(round.id);
                        }
                      }}
                    >
                      Remover
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Estatisticas da partida (spec 43). */
export function StatisticsPanel({ statistics, history, onDeleteRound, busy }) {
  if (!statistics) {
    return (
      <section className="card">
        <h2>Estatísticas</h2>
        <p className="muted">Nenhuma rodada pontuada ainda.</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <SummaryStats totals={statistics.totals} />
      <PerCategoryStats byCategory={statistics.byCategory} />
      <PerThemeStats byTheme={statistics.byTheme} />
      <RoundHistoryTable history={history} onDeleteRound={onDeleteRound} busy={busy} />
    </div>
  );
}

export default StatisticsPanel;