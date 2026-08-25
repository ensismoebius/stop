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

/**
 * Tela publica para TV/projetor (spec 22).
 * Nao exibe nenhum dado privado dos alunos.
 */
export function PublicScreenPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const audio = useAudio();
  const { sync, now } = useServerClock();
  const [collabProgress, setCollabProgress] = useState(null);
  const emojiBursts = useEmojiBursts();

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
      roundStopped: () => audio.play("STOPPED"),
      roundTimedOut: () => audio.play("STOPPED"),
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

  const submit = useCallback(
    (event) => {
      event.preventDefault();
      const clean = input.trim().toUpperCase();
      if (clean) navigate(`/screen/${clean}`);
    },
    [input, navigate],
  );

  if (!code) {
    return (
      <div className="home">
        <h1 className="home__title">Tela pública</h1>
        <form className="card stack" onSubmit={submit}>
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
          <div className="screen__collabProgress" role="status">
            <div className="screen__collabProgressBar">
              <div
                className="screen__collabProgressFill"
                style={{
                  width: `${
                    collabProgress.totalAssignments > 0
                      ? Math.round(
                          (collabProgress.completedAssignments / collabProgress.totalAssignments) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            <span className="small">
              {collabProgress.completedGraders} / {collabProgress.totalGraders} jogadores concluíram
            </span>
          </div>
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

      <EmojiBursts items={emojiBursts.items} />
    </div>
  );
}

export default PublicScreenPage;
