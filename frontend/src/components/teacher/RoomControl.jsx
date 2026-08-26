import { useState } from "react";
import Field from "../common/Field.jsx";

/** QR Code + código de entrada da sala já criada, ou o botão para criar (spec 5 e 36). */
function GameRoom({ room, qrCode, onCreateRoom, busy }) {
  if (!room) {
    return (
      <button type="button" className="btn btn--primary" onClick={onCreateRoom} disabled={busy}>
        Criar sala e gerar QR Code
      </button>
    );
  }

  return (
    <div className="qr">
      {qrCode?.dataUrl ? <img src={qrCode.dataUrl} alt={`QR Code de entrada da sala ${room.code}`} /> : null}
      <div className="stack">
        <div>
          <div className="small muted">Código da sala</div>
          <div className="roomcode">{room.code}</div>
        </div>
        <div className="qr__url">{qrCode?.url}</div>
        <a className="btn btn--ghost" href={`/screen/${room.code}`} target="_blank" rel="noreferrer">
          Abrir tela pública
        </a>
      </div>
    </div>
  );
}

/** Criar uma nova partida, ou retomar uma já existente. */
function GameSelector({ classes, games, onCreateGame, onSelectGame, busy }) {
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");

  return (
    <div className="stack">
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateGame({ name: name.trim(), classId: Number(classId) });
          setName("");
        }}
      >
        <Field id="game-name" label="Nova partida">
          <input
            id="game-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Revisão React Native — aula 7"
            required
          />
        </Field>
        <Field id="game-class" label="Turma">
          <select
            id="game-class"
            className="input"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            required
          >
            <option value="">Selecione a turma</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item._count?.enrollments ?? 0} alunos)
              </option>
            ))}
          </select>
        </Field>
        <button type="submit" className="btn btn--primary" disabled={busy || !classId}>
          Criar partida
        </button>
      </form>

      {games.length > 0 ? (
        <div className="stack">
          <span className="small muted">Ou continue uma partida existente</span>
          <div className="stack">
            {games.slice(0, 6).map((item) => (
              <button key={item.id} type="button" className="btn" onClick={() => onSelectGame(item)}>
                {item.name} · {item.class?.name} · {item._count?.rounds ?? 0} rodada(s)
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Criacao da sala e QR Code (spec 5 e 36).
 *
 * "Encerrar partida" mora na barra de acoes rapidas do painel do professor
 * (TeacherDashboardPage), nao aqui — assim fica alcancavel em qualquer fase
 * da rodada, sem precisar rolar ate este card.
 */
export function RoomControl({
  classes,
  games,
  game,
  room,
  qrCode,
  onCreateGame,
  onSelectGame,
  onCreateRoom,
  busy,
}) {
  return (
    <section className="card stack">
      <h2>Sala</h2>

      {game ? (
        <div className="stack">
          <div className="spread">
            <div>
              <div className="small muted">Partida</div>
              <strong>{game.name}</strong>
              <div className="small muted">{game.class?.name}</div>
            </div>
            <div className="row">
              <button type="button" className="btn btn--ghost" onClick={() => onSelectGame(null)}>
                Trocar
              </button>
            </div>
          </div>

          <GameRoom room={room} qrCode={qrCode} onCreateRoom={onCreateRoom} busy={busy} />
        </div>
      ) : (
        <GameSelector classes={classes} games={games} onCreateGame={onCreateGame} onSelectGame={onSelectGame} busy={busy} />
      )}
    </section>
  );
}

export default RoomControl;
