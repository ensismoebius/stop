/** Estatisticas da partida (spec 43). */
export function StatisticsPanel({ statistics, history }) {
  if (!statistics) {
    return (
      <section className="card">
        <h2>Estatísticas</h2>
        <p className="muted">Nenhuma rodada pontuada ainda.</p>
      </section>
    );
  }

  const { totals } = statistics;

  return (
    <div className="stack">
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

      <section className="card stack">
        <h2>Desempenho por categoria</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                <th scope="col">Respostas</th>
                <th scope="col">Preenchidas</th>
                <th scope="col">Válidas</th>
                <th scope="col">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {statistics.byCategory.map((entry) => (
                <tr key={entry.category}>
                  <td>{entry.category}</td>
                  <td>{entry.answers}</td>
                  <td>{entry.filled}</td>
                  <td>{entry.valid}</td>
                  <td>{entry.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card stack">
        <h2>Desempenho por tema</h2>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Tema</th>
                <th scope="col">Rodadas</th>
                <th scope="col">Válidas</th>
                <th scope="col">Inválidas</th>
                <th scope="col">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {statistics.byTheme.map((entry) => (
                <tr key={entry.theme}>
                  <td>{entry.theme}</td>
                  <td>{entry.rounds}</td>
                  <td>{entry.validAnswers}</td>
                  <td>{entry.invalidAnswers}</td>
                  <td>{entry.totalScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {history ? (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default StatisticsPanel;
