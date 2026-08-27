import StatusBadge from "../common/StatusBadge.jsx";
import Avatar from "../common/Avatar.jsx";

/** Alunos conectados e progresso agregado (spec 4.1 e 49). */
export function PlayerMonitor({ players, requiredCount }) {
  const connected = players.filter((player) => player.connected).length;

  return (
    <section className="card stack">
      <div className="spread">
        <h2>Alunos</h2>
        <span className="small muted">
          {connected} conectado(s) de {players.length}
        </span>
      </div>

      {players.length === 0 ? (
        <p className="muted">Aguardando jogadores entrarem pela sala.</p>
      ) : (
        <div className="players">
          {players.map((player) => (
            <div key={player.playerSessionId} className="player">
              <div>
                <div
                  className={`player__name${player.avatarUrl ? " player__name--has-avatar" : ""}`}
                  data-initial={player.avatarUrl ? undefined : (player.name?.charAt(0)?.toUpperCase() ?? "?")}
                >
                  {player.avatarUrl ? (
                    <Avatar className="player__avatar" value={player.avatarUrl} name={player.name} />
                  ) : null}
                  {player.name}
                </div>
                <div className="player__meta">
                  <span className={`connection${player.connected ? " connection--on" : ""}`}>
                    {player.registrationNumber}
                  </span>
                </div>
              </div>
              <div className="player__meta">
                {requiredCount > 0 ? (
                  <span>
                    {player.filled}/{requiredCount}
                  </span>
                ) : null}
                <StatusBadge status={player.roundStatus ?? player.roomStatus} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default PlayerMonitor;
