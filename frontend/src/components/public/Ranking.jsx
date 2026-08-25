/** Ranking calculado pelo servidor; empates na mesma posicao (spec 42). */
export function Ranking({ entries }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="ranking">
      <div className="ranking__title">🏆 Ranking</div>
      <ol className="ranking__list">
        {entries.slice(0, 8).map((entry) => (
          // A medalha acompanha a colocacao: em caso de empate os dois
          // recebem a mesma cor (spec 42).
          <li
            key={entry.studentId}
            className={`ranking__item${entry.position <= 3 ? ` ranking__item--p${entry.position}` : ""}`}
          >
            <span className="ranking__position">{entry.position}.</span>
            <span className="ranking__name">
              {entry.avatarUrl ? (
                <img className="ranking__avatar" src={entry.avatarUrl} alt="" />
              ) : null}
              {entry.name}
            </span>
            <span className="ranking__total">{entry.total}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default Ranking;
