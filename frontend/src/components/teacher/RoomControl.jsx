import { useState } from "react";
import Field from "../common/Field.jsx";

/** QR Code + código de entrada da sala já criada, ou o botão para criar (spec 5 e 36). */
function GameRoom({ room, qrCode, onCreateRoom, busy, closed }) {
  if (!room) {
    return (
      <button type="button" className="btn btn--primary" onClick={onCreateRoom} disabled={busy}>
        Criar sala e gerar QR Code
      </button>
    );
  }

  // Sala encerrada nao aceita mais ninguem, entao mostrar QR Code e codigo
  // de entrada seria mentira: alguem tentaria entrar e levaria erro. O card
  // vira um aviso de sala fechada, mantendo so o acesso a tela publica —
  // que continua util, porque e onde o podio final fica.
  if (closed) {
    return (
      <div className="stack roomclosed">
        <div>
          <div className="small muted">Sala</div>
          <div className="roomcode roomcode--closed">{room.code}</div>
        </div>
        <span className="badge badge--finished">Sala encerrada — não aceita mais entradas</span>
        <a className="btn btn--ghost" href={`/screen/${room.code}`} target="_blank" rel="noreferrer">
          Abrir tela pública
        </a>
      </div>
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

  // Uma partida FINISHED nunca pode receber nova rodada (o backend rejeita),
  // entao "continuar" nao faz sentido para ela — sem este filtro, partidas
  // ja encerradas continuavam aparecendo aqui (e como listGames() nao filtra
  // por status e a ordenacao e por criacao mais recente, elas dominavam a
  // lista, dando a impressao de que partidas "removidas" nunca somem).
  const resumable = games.filter((item) => item.status !== "FINISHED");

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
            placeholder="Revisão de conteúdo — aula 7"
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

      {resumable.length > 0 ? (
        <div className="stack">
          <span className="small muted">Ou continue uma partida existente</span>
          <div className="stack">
            {resumable.slice(0, 6).map((item) => (
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
  settings,
  onToggleHidePoints,
  onVolumeChange,
  onToggleMuted,
}) {
  const hidePoints = Boolean(settings?.hidePoints);
  const volume = typeof settings?.volume === "number" ? settings.volume : 0.65;
  const muted = Boolean(settings?.muted);

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

          <GameRoom
            room={room}
            qrCode={qrCode}
            onCreateRoom={onCreateRoom}
            busy={busy}
            // A sala fecha junto com a partida; `room.status` cobre o caso
            // em que ela foi fechada sozinha, pelo botao de encerrar sala.
            closed={game.status === "FINISHED" || room?.status === "CLOSED"}
          />

          {/* Ajustes AO VIVO da tela publica, aplicados por broadcast: ocultar
              pontos no ranking e controles de volume/mudo do som da TV. Valem
              já para a próxima projeção que a tela publica receber. */}
          {room ? (
            <div className="stack">
              <label className="check">
                <input
                  type="checkbox"
                  checked={hidePoints}
                  onChange={(event) => onToggleHidePoints?.(event.target.checked)}
                />
                <span>Ocultar pontos na tela pública (ranking)</span>
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={muted}
                  onChange={(event) => onToggleMuted?.(event.target.checked)}
                />
                <span>Mudo na tela pública</span>
              </label>

              <div className="spread">
                <span className="small">Volume da tela pública</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  disabled={muted}
                  aria-label="Volume da tela pública"
                  onChange={(event) => onVolumeChange?.(Number(event.target.value))}
                />
                <span className="small tabular">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <GameSelector classes={classes} games={games} onCreateGame={onCreateGame} onSelectGame={onSelectGame} busy={busy} />
      )}
    </section>
  );
}

export default RoomControl;
