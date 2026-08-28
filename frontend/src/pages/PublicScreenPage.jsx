import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useCountdown, useServerClock } from "../hooks/useServerClock.js";
import useAudio from "../hooks/useAudio.js";
import useEmojiBursts from "../hooks/useEmojiBursts.js";
import skyForDate from "../lib/sky.js";
import GameTitle from "../components/public/GameTitle.jsx";
import ThemeDisplay from "../components/public/ThemeDisplay.jsx";
import LetterAnimation from "../components/public/LetterAnimation.jsx";
import Countdown from "../components/public/Countdown.jsx";
import PlayerCount from "../components/public/PlayerCount.jsx";
import GameStatus from "../components/public/GameStatus.jsx";
import Ranking from "../components/public/Ranking.jsx";
import PublicBackdrop from "../components/public/PublicBackdrop.jsx";
import Field from "../components/common/Field.jsx";
import api from "../services/api.js";
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import StopSplash from "../components/common/StopSplash.jsx";

/** Handlers de socket da tela pública: só efeitos locais (som/progresso) — o estado em si chega via REST/fallback. */
function buildScreenHandlers({ sync, audio, setStopSplash, setCollabProgress, emojiBursts, setLiveSettings }) {
  return {
    onState: (state) => sync(state?.serverTime),
    // O som do sorteio agora acompanha a animacao (tique a cada giro e
    // fanfarra so quando ela realmente para), nao o instante em que o
    // evento de rede chega — por isso nao ha mais um "LETTER" aqui. O
    // ranking segue o mesmo principio: quem toca os tiques e a fanfarra
    // agora e o proprio <Ranking>, no ritmo da revelacao dramatica, nao
    // o instante em que o evento de rede chega.
    roundStarted: () => audio.play("START"),
    roundStopped: () => {
      audio.play("STOPPED");
      audio.playVoice();
      setStopSplash(true);
    },
    roundTimedOut: () => {
      audio.play("STOPPED");
      audio.playVoice();
      setStopSplash(true);
    },
    // Ajustes da sala mudados pelo professor chegam por um evento LEVE,
    // sem reconstruir o estado inteiro — o slider de volume não deve travar.
    roomSettingsChanged: (settings) => setLiveSettings?.(settings),
    // Correcao colaborativa (spec 36): so o progresso agregado, nunca
    // respostas individuais na tela publica.
    collaborativeCorrectionStarted: (payload) => setCollabProgress(payload),
    collaborativeCorrectionProgress: (payload) => setCollabProgress(payload),
    collaborativeCorrectionFinished: () => setCollabProgress(null),
    emojiReceived: (payload) => emojiBursts.push(payload.emoji),
  };
}

// Estado inicial por REST: a TV mostra a partida mesmo antes de o
// WebSocket completar o handshake (e depois de uma queda de rede).
function useScreenFallback(code) {
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
  return fallback;
}

// QR Code de entrada (spec 36): a tela publica e o lugar natural para
// exibi-lo — os alunos escaneiam de longe, sem depender do painel do
// professor estar aberto.
function useScreenQrCode(code) {
  const [qrCode, setQrCode] = useState(null);
  useEffect(() => {
    if (!code) return;
    api
      .roomQrCode(null, code)
      .then(setQrCode)
      .catch(() => setQrCode(null));
  }, [code]);
  return qrCode;
}

// Efeito sonoro nos ultimos segundos (spec 22).
function useScreenBeep(playing, seconds, audio) {
  const [lastBeep, setLastBeep] = useState(null);
  useEffect(() => {
    if (!playing || seconds === null || seconds > 10 || seconds <= 0) return;
    if (lastBeep === seconds) return;
    setLastBeep(seconds);
    audio.play("FINAL_SECONDS");
  }, [seconds, playing, audio, lastBeep]);
}

// Céu do pódio (spec dos "bells and whistles"): recalcula a cada minuto — a
// hora do dia não muda mais rápido que isso, então não há razão para um
// timer mais agressivo. Só liga o timer enquanto o pódio está de fato na
// tela; nas outras fases o valor não é usado e o timer seria desperdício.
function usePodiumSky(now, active) {
  // `now` é logicamente estável (é sempre "hora do servidor agora"), mas o
  // `useServerClock` real só garante identidade estável via useCallback —
  // nada aqui depende de a referência mudar, então uma ref evita recriar o
  // efeito (e o setInterval) a cada render por causa só da função em si.
  const nowRef = useRef(now);
  nowRef.current = now;

  const [sky, setSky] = useState(() => skyForDate(new Date(nowRef.current())));
  useEffect(() => {
    if (!active) return undefined;
    const tick = () => setSky(skyForDate(new Date(nowRef.current())));
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, [active]);
  return sky;
}

// Trilha de fundo por fase: suspense enquanto a rodada corre, comemoração
// no pódio, silêncio fora dessas duas — só a tela pública tem essa música
// ambiente (os telefones dos alunos continuam só com os bipes curtos de
// useAudio: 50 aparelhos tocando trilhas fora de sincronia seria pior que
// não ter música nenhuma).
function useScreenMusic(playing, finished, audio) {
  useEffect(() => {
    if (finished) audio.playMusic("PODIUM");
    else if (playing) audio.playMusic("ROUND");
    else audio.stopMusic();
  }, [playing, finished, audio]);

  useEffect(() => () => audio.stopMusic(), [audio]);
}

// A tela publica normalmente e um TV ligado na sala e esquecido: ninguem
// clica no botaozinho de mudo, entao esperar só por esse clique (unico
// gatilho de unlock() antes desta funcao existir) deixava a musica de
// fundo travada pra sempre pela politica de autoplay do navegador — as
// trocas de fase disparavam playMusic() normalmente, so que o play() de
// verdade era recusado em silencio. Aqui destravamos no primeiro gesto
// de qualquer tipo na pagina inteira (clique, toque, tecla) — o que
// vier primeiro, sem exigir que seja num elemento especifico.
function useUnlockAudioOnFirstInteraction(audio) {
  const unlockedRef = useRef(false);
  useEffect(() => {
    if (unlockedRef.current) return undefined;
    const handleInteraction = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      audio.unlock();
      document.removeEventListener("pointerdown", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };
    document.addEventListener("pointerdown", handleInteraction);
    document.addEventListener("keydown", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);
    return () => {
      document.removeEventListener("pointerdown", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };
  }, [audio]);
}

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

  // Ajustes da sala: a linha de base vem da projeção de estado (`view.settings`),
  // e o evento LEVE `roomSettingsChanged` os atualiza ao vivo sem esperar o
  // próximo publish completo — o slider do professor não trava o painel.
  // Declarado antes dos handlers para evitar acesso no temporal dead zone.
  const [liveSettings, setLiveSettings] = useState(null);

  const handlers = useMemo(
    () =>
      buildScreenHandlers({ sync, audio, setStopSplash, setCollabProgress, emojiBursts, setLiveSettings }),
    [audio, sync, emojiBursts],
  );

  const { connected, state } = useRoomSocket({
    roomCode: code,
    role: "screen",
    handlers,
    enabled: Boolean(code),
  });

  const fallback = useScreenFallback(code);
  const qrCode = useScreenQrCode(code);
  const view = state ?? fallback;

  // Toda projeção de estado completa (publish de troca de rodada, REST de
  // fallback) traz os `settings` autoritativos — eles são a linha de base,
  // e o evento leve apenas sobrepõe entre um publish e outro.
  useEffect(() => {
    if (view?.settings) {
      setLiveSettings((prev) => ({ ...(prev ?? {}), ...view.settings }));
    }
  }, [view?.settings]);


  useEffect(() => {
    if (view?.serverTime) sync(view.serverTime);
  }, [view?.serverTime, sync]);

  // Volume/mudo da TV comandados remotamente pelo professor: cada mudança
  // dos ajustes é aplicada na preferência de áudio local.
  // O ref guarda o último valor aplicado — `setVolume`/`toggle` criam objeto
  // novo a cada troca de preferência, então sem o guard o efeito (que
  // depende de `audio`, re-criado a cada render) entraria em loop.
  const appliedRemote = useRef({ volume: undefined, muted: undefined });
  const remoteVolume = liveSettings?.volume;
  const remoteMuted = liveSettings?.muted;
  useEffect(() => {
    if (typeof remoteVolume === "number" && appliedRemote.current.volume !== remoteVolume) {
      appliedRemote.current.volume = remoteVolume;
      audio.setVolume(remoteVolume);
    }
  }, [remoteVolume, audio]);

  useEffect(() => {
    if (typeof remoteMuted === "boolean" && appliedRemote.current.muted !== remoteMuted) {
      appliedRemote.current.muted = remoteMuted;
      if (audio.enabled !== !remoteMuted) audio.toggle();
    }
  }, [remoteMuted, audio]);

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
  const finished = view?.game?.status === "FINISHED";
  const seconds = useCountdown(playing ? round?.endsAt : null, now);

  useScreenBeep(playing, seconds, audio);
  useScreenMusic(playing, finished, audio);
  useUnlockAudioOnFirstInteraction(audio);
  const sky = usePodiumSky(now, finished);

  return {
    audio,
    connected,
    view,
    round,
    waitingForPlayers,
    playing,
    showRanking,
    finished,
    sky,
    seconds,
    collabProgress,
    qrCode,
    emojiBursts,
    stopSplash,
    setStopSplash,
    liveSettings,
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
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              // Redundante com useUnlockAudioOnFirstInteraction (que já
              // destrava no primeiro gesto em qualquer lugar da página),
              // mas clicar aqui é em si um gesto do usuário — chamar de
              // novo é barato e garante o desbloqueio mesmo se por algum
              // motivo o listener global não tiver disparado ainda.
              audio.unlock();
              audio.toggle();
            }}
          >
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
    finished,
    sky,
    seconds,
    collabProgress,
    qrCode,
    emojiBursts,
    stopSplash,
    setStopSplash,
    liveSettings,
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
      <div
        className={`screen screen--ranking${finished ? " screen--podium" : ""}`}
        style={
          finished
            ? { "--sky-top": sky.top, "--sky-bottom": sky.bottom, "--sky-glow": sky.glow, "--sky-stars": sky.stars }
            : undefined
        }
      >
        {/* Fundo animado: bolhas de cor e particulas derivando por tras de
            tudo — no podio o céu calculado (que muda com a hora do dia)
            continua acima dele, e as estrelas aparecem a noite. */}
        <PublicBackdrop variant={finished ? "podium" : "default"} />
        {/* Pódio olímpico só no encerramento da partida; entre rodadas,
            o ranking normal. O céu (calculado, não é imagem) só entra
            nesse caso — é o pódio que pediu "background que muda com a
            hora do dia", não a lista de sempre. */}
        <Ranking
          entries={view?.ranking ?? []}
          audio={audio}
          finished={finished}
          hidePoints={Boolean(liveSettings?.hidePoints)}
        />
        <EmojiBursts items={emojiBursts.items} />
      </div>
    );
  }

  return (
    <div className="screen">
      <PublicBackdrop />
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
