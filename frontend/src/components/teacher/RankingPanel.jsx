import Avatar from "../common/Avatar.jsx";
/** Ranking oficial calculado pelo servidor (spec 42). */
export function RankingPanel({ ranking }) {
  return (
    <section className="card stack">
      <h2>Ranking</h2>
      {!ranking || ranking.length === 0 ? (
        <p className="muted">Nenhuma pontuação registrada ainda.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Aluno</th>
                <th scope="col">Pontos</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((entry) => (
                <tr key={entry.studentId}>
                  <td>{entry.position}</td>
                  <td className="ranking-panel__name">
                    {entry.avatarUrl ? (
                      <Avatar className="ranking-panel__avatar" value={entry.avatarUrl} name={entry.name} />
                    ) : null}
                    {entry.name}
                  </td>
                  <td>{entry.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default RankingPanel;
