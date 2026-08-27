import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../state/PlayerContext.jsx";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useServerClock, useCountdown } from "../hooks/useServerClock.js";
import useFullscreen from "../hooks/useFullscreen.js";
import useAudio from "../hooks/useAudio.js";
import useEmojiBursts from "../hooks/useEmojiBursts.js";
import { emitAck } from "../socket/socket.js";
import api from "../services/api.js";
import GameHeader from "../components/student/GameHeader.jsx";
import CategoryList from "../components/student/CategoryList.jsx";
import AnswerEditor from "../components/student/AnswerEditor.jsx";
import StopButton from "../components/student/StopButton.jsx";
import CollaborativeCorrection from "../components/student/CollaborativeCorrection.jsx";
import EmojiPicker from "../components/student/EmojiPicker.jsx";
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import Alert from "../components/common/Alert.jsx";
import StopSplash from "../components/common/StopSplash.jsx";
import Avatar from "../components/common/Avatar.jsx";

const SYNC_DELAY = 450;
const MEDAL_BY_POSITION = { 1: "🥇", 2: "🥈", 3: "🥉" };

const STATUS_MESSAGE = {
  CREATED: { title: "Aguardando", text: "O professor está preparando a rodada." },
  READY: { title: "Preparar!", text: "A letra foi sorteada. Aguarde a revelação na tela." },
  STARTING: { title: "Preparar!", text: "A rodada vai começar." },
  STOPPED: { title: "STOP!", text: "A rodada foi encerrada. Aguarde a correção." },
  CORRECTION: { title: "Correção", text: "O professor está corrigindo as respostas." },
  SCORED: { title: "Pontuação", text: "A pontuação da rodada foi divulgada." },
  FINISHED: { title: "Rodada encerrada", text: "Aguarde o professor iniciar a próxima." },
};

/** Aplica um `roomState` recebido do servidor (via socket ou REST) ao estado local de respostas/eliminação/revisões. */
function useApplyState({ sync, setAnswers, setEliminated, setReviews, setCompletedReviewIds, setRanking }) {
  return useCallback(
    (state) => {
      if (!state) return;
      sync(state.serverTime);
      const next = {};
      for (const answer of state.answers ?? []) next[answer.roundCategoryId] = answer.value;
      setAnswers(next);
      setEliminated(state.roundStatus === "ELIMINATED" ? { reason: "FULLSCREEN_EXIT" } : null);
      // Recupera a correcao colaborativa ao reconectar (spec 38/45): o
      // evento `reviewAssigned` so chega uma vez, ao vivo.
      if (state.reviews) {
        setReviews(state.reviews);
        setCompletedReviewIds(
          new Set(state.reviews.filter((review) => review.decision !== "PENDING").map((review) => review.reviewId)),
        );
      }
      // Mesmo raciocinio para o ranking: `rankingUpdated` so chega ao vivo,
      // no instante da pontuacao/finalizacao. Quem reconecta depois disso
      // (tela apagou, saiu da tela cheia, atualizou a pagina) precisa
      // encontrar a colocacao final aqui, no estado normal da sala — senao
      // nunca mais aparece.
      if (state.ranking) setRanking(state.ranking);
    },
    [sync, setAnswers, setEliminated, setReviews, setCompletedReviewIds, setRanking],
  );
}

/** Handlers de ciclo de vida da rodada: som e reset de estado local a cada fase nova. */
function buildLifecycleHandlers({
  applyState,
  audio,
  setAnswers,
  setCurrentId,
  setEliminated,
  setFeedback,
  setReviews,
  setCompletedReviewIds,
  setStopSplash,
}) {
  return {
    onState: (state) => applyState(state),
    onError: (payload) => setFeedback({ kind: "error", message: payload.message }),
    letterSelected: () => audio.play("LETTER"),
    syncCountdownRequested: () => audio.play("LETTER"),
    roundCreated: () => {
      setAnswers({});
      setCurrentId(null);
      setEliminated(null);
      setFeedback(null);
      setReviews([]);
      setCompletedReviewIds(new Set());
    },
    roundStarted: () => {
      audio.play("START");
      setAnswers({});
      setCurrentId(null);
      setEliminated(null);
      setFeedback(null);
    },
    roundStopped: (payload) => {
      audio.play("STOPPED");
      audio.playVoice();
      setStopSplash(true);
      setFeedback({
        kind: "warning",
        message: payload.firstStopperName
          ? `STOP! ${payload.firstStopperName} encerrou a rodada.`
          : "STOP! A rodada foi encerrada.",
      });
    },
    roundTimedOut: () => {
      audio.play("STOPPED");
      audio.playVoice();
      setStopSplash(true);
      setFeedback({ kind: "warning", message: "O tempo acabou. A rodada foi encerrada." });
    },
    roundCancelled: (payload) => {
      setAnswers({});
      setCurrentId(null);
      setEliminated(null);
      setFeedback({
        kind: "warning",
        message: payload?.message ?? "O professor cancelou esta rodada.",
      });
    },
  };
}

/** Handlers de correção colaborativa, eliminação, ranking e reações — não dependem da fase da rodada. */
function buildMiscHandlers({ setReviews, setCompletedReviewIds, audio, setEliminated, setRanking, emojiBursts }) {
  return {
    // Correcao colaborativa (spec 9-16): respostas anonimas de colegas,
    // atribuidas so a este aluno.
    reviewAssigned: (payload) => {
      setReviews(payload.reviews ?? []);
      setCompletedReviewIds(new Set());
    },
    reviewCompleted: (payload) => {
      setCompletedReviewIds((current) => new Set(current).add(payload.reviewId));
    },
    playerEliminated: (payload) => {
      audio.play("ELIMINATED");
      setEliminated(payload);
    },
    rankingUpdated: (payload) => {
      audio.play("RANKING");
      setRanking(payload.ranking ?? []);
    },
    // Reacoes em emoji (Kahoot-like): visivel para todo mundo na sala,
    // inclusive quem mandou — puramente visual, sem estado persistido.
    emojiReceived: (payload) => emojiBursts.push(payload.emoji),
  };
}

/** Handlers dos eventos de socket da rodada (spec 45): cuidam so de efeitos locais — o estado autoritativo chega via `onState`/`applyState`. */
function useStudentHandlers({
  applyState,
  audio,
  emojiBursts,
  setAnswers,
  setCurrentId,
  setEliminated,
  setFeedback,
  setReviews,
  setCompletedReviewIds,
  setRanking,
  setStopSplash,
}) {
  return useMemo(
    () => ({
      ...buildLifecycleHandlers({
        applyState,
        audio,
        setAnswers,
        setCurrentId,
        setEliminated,
        setFeedback,
        setReviews,
        setCompletedReviewIds,
        setStopSplash,
      }),
      ...buildMiscHandlers({ setReviews, setCompletedReviewIds, audio, setEliminated, setRanking, emojiBursts }),
    }),
    [
      applyState,
      audio,
      emojiBursts,
      setAnswers,
      setCurrentId,
      setEliminated,
      setFeedback,
      setReviews,
      setCompletedReviewIds,
      setRanking,
      setStopSplash,
    ],
  );
}

/** Conexão de socket do aluno + fallback REST inicial + `refresh` sob demanda (spec 45). */
function useStudentConnection(player, handlers, applyState) {
  const socketRef = useRef(null);
  const { socket, connected, state, setState } = useRoomSocket({
    roomCode: player?.room?.code,
    role: "player",
    playerToken: player?.playerToken,
    handlers,
  });
  socketRef.current = socket;

  /**
   * Busca o estado autoritativo sob demanda. Nao e mais necessario apos
   * cada evento — o servidor empurra `roomState` automaticamente (spec 45)
   * — mas serve de rede de seguranca apos uma acao cujo resultado nao
   * gerou push (por exemplo, um STOP rejeitado).
   */
  const refresh = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket) return null;
    const response = await emitAck(socket, "requestState", {});
    if (response.ok) {
      setState((current) => current ?? response.data);
      applyState(response.data);
    }
    return response.ok ? response.data : null;
  }, [applyState, setState]);

  // Primeira pintura por REST, antes do handshake do WebSocket (spec 45).
  useEffect(() => {
    if (state || !player?.room?.code || !player?.playerToken) return;
    api
      .playerState(player.room.code, player.playerToken)
      .then((data) => {
        setState((current) => current ?? data);
        applyState(data);
      })
      .catch(() => {});
  }, [state, player?.room?.code, player?.playerToken, setState, applyState]);

  return { socket, connected, state, socketRef, refresh };
}

/** Deriva fase/categorias/contadores da rodada atual e toca o beep dos últimos segundos. */
function useStudentRoundPhase(state, now, audio, eliminated) {
  const round = state?.round ?? null;
  const categories = round?.categories ?? [];
  const playing = round?.status === "PLAYING" && state?.roundStatus === "PLAYING" && !eliminated;
  const roundHasStarted = Boolean(round) && !["CREATED", "READY", "STARTING"].includes(round.status);
  const seconds = useCountdown(round?.status === "PLAYING" ? round?.endsAt : null, now);
  // Contagem regressiva sincronizada antes da letra/categorias aparecerem
  // (spec 54) — mesmo mecanismo de relogio do servidor usado no `seconds`
  // acima, so que apontando para `revealAt` em vez de `endsAt`.
  const revealSeconds = useCountdown(round?.status === "STARTING" ? round?.revealAt : null, now);

  // Aviso sonoro nos ultimos segundos (spec 22 e 23).
  const lastBeepRef = useRef(null);
  useEffect(() => {
    if (!playing || seconds === null || seconds > 10 || seconds <= 0) return;
    if (lastBeepRef.current === seconds) return;
    lastBeepRef.current = seconds;
    audio.play("FINAL_SECONDS");
  }, [seconds, playing, audio]);

  return { round, categories, playing, roundHasStarted, seconds, revealSeconds };
}

/**
 * Tela cheia (spec 24): sair durante a rodada elimina o aluno, e sair da
 * tela cheia ou trocar de app a qualquer momento devolve o aluno para a
 * tela de entrada — o dispositivo precisa ficar travado no jogo.
 */
function useStudentFullscreenFlow({ clear, navigate, round, state, socketRef, socket, audio }) {
  const [entered, setEntered] = useState(false);

  const leaveRoom = useCallback(() => {
    clear();
    navigate("/", { replace: true });
  }, [clear, navigate]);

  const handleFullscreenExit = useCallback(() => {
    const socketInstance = socketRef.current;
    // A eliminacao e por rodada, nunca uma saida da sala (spec 24/26): o
    // servidor elimina o aluno so daquela rodada, avisa via `playerEliminated`
    // e o aluno continua na tela do jogo, apto a jogar a proxima rodada.
    if (socketInstance && round && round.status === "PLAYING" && state?.roundStatus === "PLAYING") {
      emitAck(socketInstance, "fullscreenExited", { roundId: round.id });
    }
  }, [round, state?.roundStatus, socketRef]);

  const fullscreen = useFullscreen({ onExit: handleFullscreenExit });

  const enterGame = useCallback(async () => {
    audio.unlock();
    await fullscreen.enter(document.documentElement);
    setEntered(true);
    // Identificado e pronto para a rodada (spec 7): sem isso o professor so
    // ve WAITING ate a rodada comecar, mesmo com o aluno ja na tela do jogo.
    const socketInstance = socketRef.current;
    if (socketInstance) emitAck(socketInstance, "ready", {});
  }, [audio, fullscreen, socketRef]);

  // Sem botao "Entrar na partida": o primeiro toque/tecla do aluno nesta
  // tela ja conta como o gesto exigido pelo navegador para som e tela
  // cheia (mesmo padrao "toque em qualquer lugar" do useAutoFullscreen a
  // nivel de app) e dispara a mesma acao que o botao antigo disparava.
  useEffect(() => {
    if (entered) return undefined;
    if (round?.status !== "CREATED" && round?.status !== "READY") return undefined;
    const trigger = () => enterGame();
    const events = ["pointerdown", "keydown"];
    for (const event of events) document.addEventListener(event, trigger, { once: true });
    return () => {
      for (const event of events) document.removeEventListener(event, trigger);
    };
  }, [entered, round?.status, enterGame]);

  // `blur`/`visibilitychange` sao apenas telemetria (spec 25): podem
  // acontecer por motivos legitimos (notificacao, troca rapida de app), e a
  // regra de eliminacao deve se basear so na saida do fullscreen. Nunca
  // devolvem o aluno para a entrada.
  useEffect(() => {
    if (!entered) return undefined;
    const report = (type) =>
      socket?.emit("telemetry", { type, roundId: round?.id, payload: { at: Date.now() } });
    const onVisibility = () => report(document.hidden ? "VISIBILITY_HIDDEN" : "VISIBILITY_VISIBLE");
    const onBlur = () => report("WINDOW_BLUR");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [entered, socket, round?.id]);

  return { leaveRoom, fullscreen, enterGame };
}

/** Respostas: estado local + sincronização controlada e debounce (spec 48). */
function useStudentAnswers({ round, categories, answers, setAnswers, currentId, setCurrentId, socketRef, setFeedback, playing }) {
  const timersRef = useRef({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const pushAnswer = useCallback(
    async (roundCategoryId) => {
      const socketInstance = socketRef.current;
      if (!socketInstance || !round || round.status !== "PLAYING") return;
      const value = answersRef.current[roundCategoryId] ?? "";
      const response = await emitAck(socketInstance, "submitAnswer", {
        roundId: round.id,
        roundCategoryId,
        value,
      });
      if (!response.ok && response.error?.code !== "TIMEOUT") {
        setFeedback({ kind: "error", message: response.error?.message ?? "Falha ao salvar" });
      }
    },
    [round, socketRef, setFeedback],
  );

  const handleChange = useCallback(
    (roundCategoryId, value) => {
      setAnswers((current) => ({ ...current, [roundCategoryId]: value }));
      clearTimeout(timersRef.current[roundCategoryId]);
      timersRef.current[roundCategoryId] = setTimeout(() => pushAnswer(roundCategoryId), SYNC_DELAY);
    },
    [pushAnswer, setAnswers],
  );

  const commit = useCallback(
    (roundCategoryId) => {
      clearTimeout(timersRef.current[roundCategoryId]);
      return pushAnswer(roundCategoryId);
    },
    [pushAnswer],
  );

  const selectCategory = useCallback(
    (roundCategoryId) => {
      // Trocar de categoria sincroniza a anterior (spec 48).
      if (currentId && currentId !== roundCategoryId) commit(currentId);
      setCurrentId(roundCategoryId);
    },
    [currentId, commit, setCurrentId],
  );

  useEffect(
    () => () => {
      for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
    },
    [],
  );

  const requiredCategories = categories.filter((category) => category.required);
  const filledCount = categories.filter((category) => (answers[category.id] ?? "").trim().length > 0).length;
  const canStop =
    playing &&
    requiredCategories.length > 0 &&
    requiredCategories.every((category) => (answers[category.id] ?? "").trim().length > 0);

  return { commit, handleChange, selectCategory, filledCount, canStop };
}

/** Pedido de STOP: garante que tudo foi sincronizado antes de reivindicar (spec). */
function useStudentStop({ round, categories, commit, refresh, setFeedback, socketRef }) {
  const [stopping, setStopping] = useState(false);
  const handleStop = useCallback(async () => {
    const socketInstance = socketRef.current;
    if (!socketInstance || !round || stopping) return;
    setStopping(true);
    try {
      // Garante que tudo foi enviado antes de reivindicar o STOP.
      await Promise.all(categories.map((category) => commit(category.id)));
      const response = await emitAck(socketInstance, "requestStop", { roundId: round.id });
      if (response.ok) {
        setFeedback({ kind: "success", message: "Você deu STOP primeiro!" });
      } else {
        setFeedback({ kind: "error", message: response.error?.message ?? "STOP recusado" });
      }
      refresh();
    } finally {
      setStopping(false);
    }
  }, [round, categories, commit, refresh, stopping, socketRef, setFeedback]);

  return { handleStop, stopping };
}

/** Decisão de correção colaborativa (spec 9-16) e envio de reações em emoji. */
function useStudentReviewActions({ socketRef, setCompletedReviewIds, setFeedback }) {
  const [reviewBusy, setReviewBusy] = useState(false);

  const handleDecideReview = useCallback(
    async (reviewId, decision) => {
      const socketInstance = socketRef.current;
      if (!socketInstance) return;
      setReviewBusy(true);
      try {
        const response = await emitAck(socketInstance, "submitReview", { reviewId, decision });
        if (response.ok) {
          setCompletedReviewIds((current) => new Set(current).add(reviewId));
        } else if (response.error?.code !== "TIMEOUT") {
          setFeedback({ kind: "error", message: response.error?.message ?? "Falha ao enviar avaliação" });
        }
      } finally {
        setReviewBusy(false);
      }
    },
    [socketRef, setCompletedReviewIds, setFeedback],
  );

  const sendEmoji = useCallback(
    (emoji) => {
      const socketInstance = socketRef.current;
      if (socketInstance) emitAck(socketInstance, "sendEmoji", { emoji });
    },
    [socketRef],
  );

  return { handleDecideReview, sendEmoji, reviewBusy };
}

/** Avatar/nome do aluno + badge de conexão. */
function StudentTopBar({ state, player, connected }) {
  return (
    <div className="spread small muted">
      <span className="row">
        {state?.student?.avatarUrl ?? player.student?.avatarUrl ? (
          <Avatar
            className="student__avatar"
            value={state?.student?.avatarUrl ?? player.student?.avatarUrl}
            name={state?.student?.name}
          />
        ) : null}
        {state?.student?.name} · sala {player.room?.code}
      </span>
      <ConnectionBadge connected={connected} />
    </div>
  );
}

/** Avisos/estado da rodada acima do editor de respostas: feedback, eliminação, fullscreen, correção colaborativa, status. */
function StudentStatusArea({ connection, player, feedback, eliminated, phase, fullscreenFlow, reviews, completedReviewIds, reviewActions, message }) {
  const { round, playing, revealSeconds } = phase;
  const { fullscreen, enterGame } = fullscreenFlow;
  const { handleDecideReview, reviewBusy } = reviewActions;
  return (
    <>
      <StudentTopBar state={connection.state} player={player} connected={connection.connected} />

      {feedback ? <Alert kind={feedback.kind}>{feedback.message}</Alert> : null}

      {eliminated ? (
        <div className="notice notice--eliminated" role="alert">
          <div className="notice__title">Você foi eliminado desta rodada</div>
          {eliminated.message ??
            "Você saiu da tela cheia.\n\nVocê poderá participar da próxima rodada."}
        </div>
      ) : null}

      {playing && !fullscreen.isFullscreen && fullscreen.supported ? (
        <Alert kind="warning">
          Você não está em tela cheia. Volte para o modo tela cheia para continuar jogando.
          <button type="button" className="btn btn--block" onClick={enterGame}>
            Voltar à tela cheia
          </button>
        </Alert>
      ) : null}

      {!playing && round?.status === "COLLABORATIVE_CORRECTION" ? (
        <CollaborativeCorrection
          reviews={reviews}
          completedIds={completedReviewIds}
          onDecide={handleDecideReview}
          deciding={reviewBusy}
          letter={round?.letter}
          letterRule={round?.letterRule}
        />
      ) : null}

      {!playing && round?.status !== "COLLABORATIVE_CORRECTION" && message ? (
        <div className="notice">
          <div className="notice__title">{message.title}</div>
          <p className="muted">{message.text}</p>
          {round?.status === "STARTING" ? (
            <span className="letter__value" aria-live="polite">
              {round?.letter
                ? round.letter
                : revealSeconds !== null && revealSeconds > 0
                  ? revealSeconds
                  : "—"}
            </span>
          ) : null}
        </div>
      ) : null}

      {!round ? (
        <div className="notice">
          <div className="notice__title">Aguardando jogadores</div>
          <p className="muted">Assim que o professor iniciar a rodada, ela aparecerá aqui.</p>
        </div>
      ) : null}
    </>
  );
}

/** Editor da categoria atual (spec 48) + lista de categorias, visível só depois que a rodada de fato começa. */
function StudentAnswerArea({ currentCategory, answers, phase, answerActions, setCurrentId, currentId }) {
  const { round, playing, roundHasStarted, categories } = phase;
  const { handleChange, commit, selectCategory } = answerActions;
  return (
    <>
      {currentCategory ? (
        <AnswerEditor
          category={currentCategory}
          value={answers[currentCategory.id] ?? ""}
          letter={round?.letter}
          letterRule={round?.letterRule}
          disabled={!playing}
          onChange={handleChange}
          onCommit={commit}
          onClose={() => {
            commit(currentCategory.id);
            setCurrentId(null);
          }}
        />
      ) : null}

      {/* As categorias so aparecem quando a rodada de fato comeca a valer
          (spec): antes disso (CREATED/READY/STARTING) nao ha nada a
          responder ainda, entao mostrar a lista so antecipa/spoila o
          conteudo sem utilidade. */}
      {roundHasStarted && categories.length > 0 ? (
        <CategoryList
          categories={categories}
          answers={answers}
          currentId={currentId}
          disabled={!playing}
          onSelect={selectCategory}
        />
      ) : null}
    </>
  );
}

/**
 * Ranking, visível só ao fim de rodada/partida (nunca durante o jogo).
 * Checa `gameStatus` alem de `round?.status` porque o professor pode
 * finalizar a partida com a ultima rodada ainda em correcao (nunca
 * pontuada) — sem isso, o ranking final nunca aparecia nesse caso.
 */
function StudentRankingList({ ranking, round, gameStatus, studentId }) {
  const show =
    gameStatus === "FINISHED" || round?.status === "SCORED" || round?.status === "FINISHED" || !round;
  if (!(ranking.length > 0 && show)) {
    return null;
  }

  // A lista visivel e so o top 10, entao numa turma de 100+ alunos a
  // maioria simplesmente nao se encontrava nela e terminava a partida sem
  // saber a propria colocacao. O aluno sempre ve o proprio resultado: em
  // destaque no topo e, se estiver fora do top 10, tambem no fim da lista.
  const me = studentId ? ranking.find((entry) => entry.studentId === studentId) : null;
  const top = ranking.slice(0, 10);
  const meOutsideTop = Boolean(me) && !top.some((entry) => entry.studentId === me.studentId);

  const renderRow = (entry) => (
    <li
      key={entry.studentId}
      className={[
        "ranking__item",
        entry.position <= 3 ? `ranking__item--p${entry.position}` : "",
        me && entry.studentId === me.studentId ? "ranking__item--me" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="ranking__position">{MEDAL_BY_POSITION[entry.position] ?? entry.position}</span>
      <span className="ranking__name">{entry.name}</span>
      <span className="ranking__total">{entry.total}</span>
    </li>
  );

  return (
    <section className="card">
      <h2>Ranking</h2>

      {me ? (
        <div className="ranking__me">
          <span className="ranking__me-medal">{MEDAL_BY_POSITION[me.position] ?? `${me.position}º`}</span>
          <span className="ranking__me-label">
            Sua colocação: <strong>{me.position}º lugar</strong>
          </span>
          <span className="ranking__me-total">
            <strong>{me.total}</strong> {me.total === 1 ? "ponto" : "pontos"}
          </span>
        </div>
      ) : null}

      <ol className="ranking__list">
        {top.map(renderRow)}
        {meOutsideTop ? (
          <>
            <li className="ranking__gap" aria-hidden="true">
              ⋯
            </li>
            {renderRow(me)}
          </>
        ) : null}
      </ol>
    </section>
  );
}

/** Emoji picker + botões de som/sair, no rodapé do corpo da página. */
function StudentFooterControls({ sendEmoji, audio, leaveRoom }) {
  return (
    <>
      <EmojiPicker onSend={sendEmoji} />
      <div className="row small">
        <button type="button" className="btn btn--ghost" onClick={audio.toggle}>
          {audio.enabled ? "🔊 Som ligado" : "🔇 Som desligado"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={leaveRoom}>
          Sair
        </button>
      </div>
    </>
  );
}

/** Estado local + conexão + fase da rodada — a metade "de onde vêm os dados" da fiação da tela do aluno. */
function useStudentConnectionState() {
  const { player, clear } = usePlayer();
  const navigate = useNavigate();
  const audio = useAudio();
  const { sync, now } = useServerClock();
  const emojiBursts = useEmojiBursts();

  const [answers, setAnswers] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [eliminated, setEliminated] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [completedReviewIds, setCompletedReviewIds] = useState(() => new Set());
  const [stopSplash, setStopSplash] = useState(false);

  useEffect(() => {
    if (!player?.playerToken) navigate("/", { replace: true });
  }, [player, navigate]);

  const applyState = useApplyState({ sync, setAnswers, setEliminated, setReviews, setCompletedReviewIds, setRanking });
  const handlers = useStudentHandlers({
    applyState,
    audio,
    emojiBursts,
    setAnswers,
    setCurrentId,
    setEliminated,
    setFeedback,
    setReviews,
    setCompletedReviewIds,
    setRanking,
    setStopSplash,
  });
  const connection = useStudentConnection(player, handlers, applyState);
  const phase = useStudentRoundPhase(connection.state, now, audio, eliminated);

  return {
    player,
    clear,
    navigate,
    audio,
    emojiBursts,
    answers,
    setAnswers,
    currentId,
    setCurrentId,
    feedback,
    setFeedback,
    eliminated,
    ranking,
    reviews,
    completedReviewIds,
    setCompletedReviewIds,
    stopSplash,
    setStopSplash,
    connection,
    phase,
  };
}

/** Ações da tela do aluno — tela cheia, respostas, STOP e correção colaborativa — a metade "o que dá pra fazer com os dados". */
function useStudentActionState(base) {
  const { clear, navigate, audio, connection, phase, answers, setAnswers, currentId, setCurrentId, setFeedback, setCompletedReviewIds } = base;

  const fullscreenFlow = useStudentFullscreenFlow({
    clear,
    navigate,
    round: phase.round,
    state: connection.state,
    socketRef: connection.socketRef,
    socket: connection.socket,
    audio,
  });
  const answerActions = useStudentAnswers({
    round: phase.round,
    categories: phase.categories,
    answers,
    setAnswers,
    currentId,
    setCurrentId,
    socketRef: connection.socketRef,
    setFeedback,
    playing: phase.playing,
  });
  const stop = useStudentStop({
    round: phase.round,
    categories: phase.categories,
    commit: answerActions.commit,
    refresh: connection.refresh,
    setFeedback,
    socketRef: connection.socketRef,
  });
  const reviewActions = useStudentReviewActions({ socketRef: connection.socketRef, setCompletedReviewIds, setFeedback });

  return { fullscreenFlow, answerActions, stop, reviewActions };
}

/** Junta as duas metades da fiação de hooks da tela do aluno para a página só cuidar do JSX. */
function useStudentGameState() {
  const base = useStudentConnectionState();
  const { fullscreenFlow, answerActions, stop, reviewActions } = useStudentActionState(base);
  return { ...base, fullscreenFlow, answerActions, stop, reviewActions };
}

/**
 * Student game page: displays categories, answer inputs, the STOP
 * button, and handles all round lifecycle events via WebSocket.
 *
 * @returns {JSX.Element}
 */
export function StudentGamePage() {
  const game = useStudentGameState();
  const { player, phase, answerActions, stop, reviewActions, fullscreenFlow } = game;

  if (!player) return null;

  const message = phase.round ? STATUS_MESSAGE[phase.round.status] : null;
  const currentCategory = phase.categories.find((category) => category.id === game.currentId) ?? null;

  return (
    <div className="student">
      <GameHeader
        round={phase.round}
        seconds={phase.seconds}
        running={phase.playing}
        filled={answerActions.filledCount}
        total={phase.categories.length}
      />

      <main className="student__body">
        <StudentStatusArea
          connection={game.connection}
          player={player}
          feedback={game.feedback}
          eliminated={game.eliminated}
          phase={phase}
          fullscreenFlow={fullscreenFlow}
          reviews={game.reviews}
          completedReviewIds={game.completedReviewIds}
          reviewActions={reviewActions}
          message={message}
        />

        <StudentAnswerArea
          currentCategory={currentCategory}
          answers={game.answers}
          phase={phase}
          answerActions={answerActions}
          setCurrentId={game.setCurrentId}
          currentId={game.currentId}
        />

        <StudentRankingList
          ranking={game.ranking}
          round={phase.round}
          gameStatus={game.connection.state?.game?.status}
          studentId={game.connection.state?.student?.id}
        />

        <StudentFooterControls sendEmoji={reviewActions.sendEmoji} audio={game.audio} leaveRoom={fullscreenFlow.leaveRoom} />
      </main>

      <div className="stopbar">
        <StopButton
          disabled={!answerActions.canStop || stop.stopping}
          filled={answerActions.filledCount}
          total={phase.categories.length}
          onClick={stop.handleStop}
        />
      </div>

      <EmojiBursts items={game.emojiBursts.items} />

      {game.stopSplash ? <StopSplash onDone={() => game.setStopSplash(false)} /> : null}
    </div>
  );
}

export default StudentGamePage;
