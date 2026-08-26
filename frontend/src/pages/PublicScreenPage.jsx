import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useCountdown, useServerClock } from "../hooks/useServerClock.js";
import useAudio from "../hooks/useAudio.js";
import useEmojiBursts from "../hooks/useEmojiBursts.js";
import GameTitle from "../components/public/GameTitle.jsx";
import ThemeDisplay from "../components/public/ThemeDisplay.jsx";
import LetterAnimation from "../components/public/LetterAnimation.jsx";
import Countdown from "../components/public/Countdown.jsx";
import PlayerCount from "../components/public/PlayerCount.jsx";
import GameStatus from "../components/public/GameStatus.jsx";
import Ranking from "../components/public/Ranking.jsx";
import Field from "../components/common/Field.jsx";
import api from "../services/api.js";
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import StopSplash from "../components/common/StopSplash.jsx";

/**
 * Estado da tela pública: socket + fallback REST + QR code + derivação de
 * fase (lobby/playing/ranking) e contador — extraído da página porque é
 * toda a "aquisição de dados", nao o "como desenhar", e a página já tinha
 * ficado longa demais so com isso.
 */
function useScreenState(code) {
  const audio = useAudio();
  const { sync, now } = useServerClock();
  const [collabProgress, setCollabProgress] = useState(null);
  const emojiBursts = useEmojiBursts();
  const [stopSplash, setStopSplash] = useState(false);

  const handlers = useMemo(
    () => ({
      onState: (state) => sync(state?.serverTime),
      // O som do sorteio agora acompanha a animacao (tique a cada giro e
      // fanfarra so quando ela realmente para), nao o instante em que o
      // evento de rede chega — por isso nao ha mais um "LETTER" aqui. O
      // ranking segue o mesmo principio: quem toca os tiques e a fanfarra
      // agora e o proprio <Ranking>, no ritmo da revelacao dramatica, nao
      // o instante em que o evento de rede chega.
      roundStarted: () => audio.play("START"),
      roundStopped: () => { audio.play("STOPPED"); audio.playVoice(); setStopSplash(true); },
      roundTimedOut: () => { audio.play("STOPPED"); audio.playVoice(); setStopSplash(true); },
      // Correcao colaborativa (spec 36): so o progresso agregado, nunca
      // respostas individuais na tela publica.
      collaborativeCorrectionStarted: (payload) => setCollabProgress(payload),
      collaborativeCorrectionProgress: (payload) => setCollabProgress(payload),
      collaborativeCorrectionFinished: () => setCollabProgress(null),
      emojiReceived: (payload) => emojiBursts.push(payload.emoji),
    }),
    [audio, sync, emojiBursts],
  );

  const { connected, state } = useRoomSocket({
    roomCode: code,
    role: "screen",
    handlers,
    enabled: Boolean(code),
  });

  // Estado inicial por REST: a TV mostra a partida mesmo antes de o
  // WebSocket completar o handshake (e depois de uma queda de rede).
  const [fallback, setFallback] = useState(null);
  useEffect(() => {
    if (!code) return undefined;
    let cancelled = false;
    const load = () =>
      api
        .publicState(code)
        .then((data) => {
          if (!cancelled) setFallback(data);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [code]);

  // QR Code de entrada (spec 36): a tela publica e o lugar natural para
  // exibi-lo — os alunos escaneiam de longe, sem depender do painel do
  // professor estar aberto.
  const [qrCode, setQrCode] = useState(null);
  useEffect(() => {
    if (!code) return;
    api
      .roomQrCode(null, code)
      .then(setQrCode)
      .catch(() => setQrCode(null));
  }, [code]);

  const view = state ?? fallback;

  useEffect(() => {
    if (view?.serverTime) sync(view.serverTime);
  }, [view?.serverTime, sync]);

  const round = view?.round ?? null;
  // O QR Code grande e o motivo da tela existir enquanto o professor ainda
  // esta esperando os alunos entrarem: sem rodada, ou com a rodada criada
  // mas a letra ainda oculta (CREATED/READY — o professor pode estar so
  // sorteando a letra com a sala ainda enchendo). So encolhe quando a
  // rodada de fato comeca a revelar a letra (STARTING em diante) — nao
  // basta o jogo ter saido de CREATED, que acontece assim que a primeira
  // rodada e criada, bem antes de alguem entrar.
  const waitingForPlayers = !round || round.status === "CREATED" || round.status === "READY";
  const playing = round?.status === "PLAYING";
  // Ranking so na tela publica no exato momento de fim de rodada ou fim de
  // partida (nunca antes, nem durante o intervalo indefinido ate a
  // proxima rodada comecar) — fora isso ficaria "vazando" o placar o tempo
  // todo e tirando a graca da virada.
  const showRanking = round?.status === "SCORED" || view?.game?.status === "FINISHED";
  const seconds = useCountdown(playing ? round?.endsAt : null, now);

  // Efeito sonoro nos ultimos segundos (spec 22).
  const [lastBeep, setLastBeep] = useState(null);
  useEffect(() => {
    if (!playing || seconds === null || seconds > 10 || seconds <= 0) return;
    if (lastBeep === seconds) return;
    setLastBeep(seconds);
    audio.play("FINAL_SECONDS");
  }, [seconds, playing, audio, lastBeep]);

  return {
    audio,
    connected,
    view,
    round,
    waitingForPlayers,
    playing,
    showRanking,
    seconds,
    collabProgress,
    qrCode,
    emojiBursts,
    stopSplash,
    setStopSplash,
  };
}

/** Formulário exibido quando a tela pública é aberta sem código de sala na URL. */
function ScreenCodeForm({ input, setInput, onSubmit }) {
  return (
    <div className="home">
      <h1 className="home__title">Tela pública</h1>
      <form className="card stack" onSubmit={onSubmit}>
        <Field id="screen-code" label="Código da sala">
          <input
            id="screen-code"
            className="input"
            value={input}
            placeholder="STOP-7F42"
            autoCapitalize="characters"
            onChange={(event) => setInput(event.target.value)}
          />
        </Field>
        <button type="submit" className="btn btn--primary btn--block">
          Exibir
        </button>
      </form>
    </div>
  );
}

/** Barra de progresso agregado da correção colaborativa (spec 36: nunca respostas individuais). */
function CollabProgressBar({ collabProgress }) {
  const percent =
    collabProgress.totalAssignments > 0
      ? Math.round((collabProgress.completedAssignments / collabProgress.totalAssignments) * 100)
      : 0;
  return (
    <div className="screen__collabProgress" role="status">
      <div className="screen__collabProgressBar">
        <div className="screen__collabProgressFill" style={{ width: `${percent}%` }} />
      </div>
      <span className="small">
        {collabProgress.completedGraders} / {collabProgress.totalGraders} jogadores concluíram
      </span>
    </div>
  );
}

/** Corpo principal da tela: lobby com QR grande enquanto espera jogadores, ou tema/letra/contador durante a rodada. */
function ScreenMain({ round, waitingForPlayers, playing, seconds, qrCode, code, audio, collabProgress, view }) {
  return (
    <main className="screen__main">
      {waitingForPlayers ? (
        <div className="screen__lobby">
          {qrCode?.dataUrl ? (
            <img
              className="screen__qr screen__qr--big"
              src={qrCode.dataUrl}
              alt={`QR Code de entrada da sala ${code}`}
            />
          ) : null}
          <div className="screen__joincode">{code}</div>
          <p className="screen__hint">Escaneie o QR Code ou acesse /join/{code}</p>
        </div>
      ) : (
        <>
          <ThemeDisplay theme={round?.themeName} roundNumber={round?.roundNumber} />
          <LetterAnimation letter={round?.letter} audio={audio} />
          {playing ? <Countdown seconds={seconds} running={playing} /> : null}
        </>
      )}
      <GameStatus status={round?.status} />
      {round?.status === "COLLABORATIVE_CORRECTION" && collabProgress ? (
        <CollabProgressBar collabProgress={collabProgress} />
      ) : null}
      <PlayerCount
        active={view?.activePlayers ?? view?.connectedPlayers ?? 0}
        total={view?.totalPlayers ?? 0}
        eliminated={view?.eliminatedPlayers ?? 0}
      />
      {round?.firstStopperName && round?.status !== "PLAYING" ? (
        <div className="screen__players">STOP de {round.firstStopperName}</div>
      ) : null}
    </main>
  );
}

/** Rodapé: código de acesso/QR pequeno, mudo/audio e badge de conexão. */
function ScreenFooter({ waitingForPlayers, qrCode, code, audio, connected }) {
  return (
    <footer className="screen__bottom">
      <div className="spread small muted">
        <span className="row screen__join">
          {!waitingForPlayers && qrCode?.dataUrl ? (
            <img className="screen__qr" src={qrCode.dataUrl} alt={`QR Code de entrada da sala ${code}`} />
          ) : null}
          <span>Acesse: /join/{code}</span>
        </span>
        <span className="row">
          <button type="button" className="btn btn--ghost" onClick={audio.toggle}>
            {audio.enabled ? "🔊" : "🔇"}
          </button>
          <ConnectionBadge connected={connected} />
        </span>
      </div>
    </footer>
  );
}

/**
 * Public screen page for TV/projector (spec 22).
 * Shows the game state to the classroom without revealing any
 * private student data.
 *
 * @returns {JSX.Element}
 */
export function PublicScreenPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const {
    audio,
    connected,
    view,
    round,
    waitingForPlayers,
    playing,
    showRanking,
    seconds,
    collabProgress,
    qrCode,
    emojiBursts,
    stopSplash,
    setStopSplash,
  } = useScreenState(code);

  const submit = useCallback(
    (event) => {
      event.preventDefault();
      const clean = input.trim().toUpperCase();
      if (clean) navigate(`/screen/${clean}`);
    },
    [input, navigate],
  );

  if (!code) {
    return <ScreenCodeForm input={input} setInput={setInput} onSubmit={submit} />;
  }

  // No momento do ranking a tela e so o ranking (spec de drama): nada de
  // titulo, tema, QR Code ou rodape competindo por atencao com a virada.
  if (showRanking) {
    return (
      <div className="screen screen--ranking">
        <Ranking entries={view?.ranking ?? []} audio={audio} />
        <EmojiBursts items={emojiBursts.items} />
      </div>
    );
  }

  return (
    <div className="screen">
      <GameTitle name={view?.game?.name ?? "Partida"} roomCode={code} />

      <ScreenMain
        round={round}
        waitingForPlayers={waitingForPlayers}
        playing={playing}
        seconds={seconds}
        qrCode={qrCode}
        code={code}
        audio={audio}
        collabProgress={collabProgress}
        view={view}
      />

      <ScreenFooter
        waitingForPlayers={waitingForPlayers}
        qrCode={qrCode}
        code={code}
        audio={audio}
        connected={connected}
      />

      <EmojiBursts items={emojiBursts.items} />

      {stopSplash ? <StopSplash onDone={() => setStopSplash(false)} /> : null}
    </div>
  );
}

export default PublicScreenPage;
