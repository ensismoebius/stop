import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useCountdown } from "../hooks/useServerClock.js";
import useFullscreen from "../hooks/useFullscreen.js";
import { emitAck, emitCommand } from "../socket/socket.js";
import api from "../services/api.js";

const SYNC_DELAY = 450;

// Watchdog (baseline: recuperação). Base de 3s — no limite do intervalo de
// heartbeat (15s) fica uma espera longa demais para a turma; aqui a
// recuperação de um push perdido sai em ~3s.
const WATCHDOG_STALE_MS = 3_000;
// Jitter aleatório reparte os pedidos de 30+ alunos vigiando ao mesmo tempo
// (semancha o "thundering herd"); backoff limitado evita martelar o servidor
// quando a rede está degradada.
const WATCHDOG_JITTER_MS = 3_000;
const WATCHDOG_MAX_MS = 12_000;

// Eventos nomeados que implicam mudanca de estado da rodada. O `roomState`
// que os acompanha e fire-and-forget: um aluno pode receber o evento
// nomeado e ainda assim perder o push que o descolaria da tela de espera —
// exatamente o sintoma da turma. Ao ouvir qualquer um deles, o cliente
// pede o estado autoritativo na hora (fixme.md #1), barato (so este aluno).
const TRANSITION_EVENTS = [
  "roundCreated",
  "letterSelected",
  "roundStarting",
  "syncCountdownReleased",
  "roundStarted",
  "roundStopped",
  "roundTimedOut",
  "roundCancelled",
  "nextRound",
  "collaborativeCorrectionStarted",
  "collaborativeCorrectionFinished",
  "correctionStarted",
  "scoreUpdated",
  "rankingUpdated",
];

/** Aplica um `roomState` recebido do servidor (via socket ou REST) ao estado local de respostas/eliminação/revisões. */
export function useApplyState({ sync, setAnswers, setEliminated, setReviews, setCompletedReviewIds, setRanking }) {
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
export function buildLifecycleHandlers({
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
export function buildMiscHandlers({ setReviews, setCompletedReviewIds, audio, setEliminated, setRanking, emojiBursts }) {
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
export function useStudentHandlers({
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

/** Envolve os handlers de transicao para que, alem do efeito local, pecam o estado autoritativo na hora (fixme.md #1). */
export function withTransitionRefresh(handlers, refreshRef) {
  const enriched = { ...handlers };
  for (const event of TRANSITION_EVENTS) {
    const original = enriched[event];
    if (typeof original !== "function") continue;
    enriched[event] = (payload) => {
      original(payload);
      refreshRef.current();
    };
  }
  return enriched;
}

/** Conexão de socket do aluno + fallback REST inicial + `refresh` sob demanda + watchdog (fixme.md #1/#3, spec 45). */
export function useStudentConnection(player, handlers, applyState) {
  const socketRef = useRef(null);
  const lastStateAtRef = useRef(Date.now());
  const refreshRef = useRef(async () => null);
  const { socket, connected, state, setState, refresh: hookRefresh, adoptState, syncStatus } = useRoomSocket({
    roomCode: player?.room?.code,
    role: "player",
    playerToken: player?.playerToken,
    handlers: withTransitionRefresh(handlers, refreshRef),
  });
  socketRef.current = socket;

  /**
   * Busca o estado autoritativo sob demanda (spec 45). Em produção delega
   * para o `refresh` versionado do useRoomSocket: o servidor responde
   * `CURRENT` quando o cliente já está em dia (custo ~zero) e `ROOM_STATE`
   * quando ele ficou para trás — e a barreira (`applyAuthoritativeState`)
   * garante que um estado mais novo recebido no meio do voo nunca regrede.
   * O fallback abaixo preserva o comportamento histórico (heurística de
   * `serverTime`) e existe só para ambientes que mockam o hook.
   */
  const refresh = useCallback(async () => {
    if (hookRefresh) return hookRefresh();
    const socket = socketRef.current;
    if (!socket) return null;
    const response = await emitAck(socket, "requestState", {});
    if (response.ok) {
      setState((current) => {
        if (!current) return response.data;
        const currentTime = current.serverTime ? new Date(current.serverTime).getTime() : -Infinity;
        const nextTime = response.data?.serverTime ? new Date(response.data.serverTime).getTime() : Infinity;
        return nextTime >= currentTime ? response.data : current;
      });
      applyState(response.data);
    }
    return response;
  }, [hookRefresh, applyState, setState]);
  refreshRef.current = refresh;

  // Marca quando o servidor confirmou um estado (push ou ack) pela ultima
  // vez — o watchdog usa isso para saber que algo "deveria ter chegado".
  useEffect(() => {
    if (state) lastStateAtRef.current = Date.now();
  }, [state]);

  // Watchdog de recuperacao (fixme.md #1, spec 46/47): independente de fase
  // da rodada — roda sempre, nao so na espera. Com requestState versionado
  // (respota CURRENT quando nada mudou), perguntar durante o jogo é barato e
  // detecta socket meia-aberta (fixme.md #3) mesmo na fase em que os eventos
  // nomeados de transicao nao chegam. Jitter aleatorio reparte os pedidos da
  // turma; em falha, backoff exponencial limitado + reconexao limpa — o
  // `joinRoom` do reconectar reentrega o estado autoritativo.
  useEffect(() => {
    if (!connected || !state) return undefined;
    let timer;
    let backoffMs = WATCHDOG_STALE_MS;
    const schedule = () => {
      const jitter = Math.floor(Math.random() * (WATCHDOG_JITTER_MS + 1));
      const delay = Math.min(backoffMs + jitter, WATCHDOG_MAX_MS);
      timer = setTimeout(run, delay);
    };
    const run = async () => {
      if (Date.now() - lastStateAtRef.current < WATCHDOG_STALE_MS) {
        schedule();
        return;
      }
      const response = await refresh();
      const instance = socketRef.current;
      if (response?.ok) {
        backoffMs = WATCHDOG_STALE_MS;
      } else {
        backoffMs = Math.min(backoffMs * 2, WATCHDOG_MAX_MS);
        if (instance?.connected) {
          instance.disconnect();
          instance.connect();
        }
      }
      schedule();
    };
    schedule();
    return () => clearTimeout(timer);
  }, [connected, state, refresh]);

  // Primeira pintura por REST, antes do handshake do WebSocket (spec 45).
  useEffect(() => {
    if (state || !player?.room?.code || !player?.playerToken) return;
    api
      .playerState(player.room.code, player.playerToken)
      .then((data) => {
        if (!data) return;
        if (adoptState) adoptState(data);
        else {
          setState((current) => current ?? data);
          applyState(data);
        }
      })
      .catch(() => {});
  }, [state, player?.room?.code, player?.playerToken, setState, applyState, adoptState]);

  return { socket, connected, state, socketRef, refresh, syncStatus };
}

/** Deriva fase/categorias/contadores da rodada atual e toca o beep dos últimos segundos. */
export function useStudentRoundPhase(state, now, audio, eliminated) {
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
export function useStudentFullscreenFlow({ clear, navigate, round, state, socketRef, socket, audio }) {
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
      emitCommand(socketInstance, "fullscreenExited", { roundId: round.id });
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
    if (socketInstance) emitCommand(socketInstance, "ready", {});
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
export function useStudentAnswers({ round, categories, answers, setAnswers, currentId, setCurrentId, socketRef, setFeedback, playing }) {
  const timersRef = useRef({});
  const answersRef = useRef(answers);
  answersRef.current = answers;

  const pushAnswer = useCallback(
    async (roundCategoryId) => {
      const socketInstance = socketRef.current;
      if (!socketInstance || !round || round.status !== "PLAYING") return;
      const value = answersRef.current[roundCategoryId] ?? "";
      const response = await emitCommand(socketInstance, "submitAnswer", {
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
export function useStudentStop({ round, categories, commit, refresh, setFeedback, socketRef }) {
  const [stopping, setStopping] = useState(false);
  const handleStop = useCallback(async () => {
    const socketInstance = socketRef.current;
    if (!socketInstance || !round || stopping) return;
    setStopping(true);
    try {
      // Garante que tudo foi enviado antes de reivindicar o STOP.
      await Promise.all(categories.map((category) => commit(category.id)));
      const response = await emitCommand(socketInstance, "requestStop", { roundId: round.id });
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
export function useStudentReviewActions({ socketRef, setCompletedReviewIds, setFeedback }) {
  const [reviewBusy, setReviewBusy] = useState(false);

  const handleDecideReview = useCallback(
    async (reviewId, decision) => {
      const socketInstance = socketRef.current;
      if (!socketInstance) return;
      setReviewBusy(true);
      try {
        const response = await emitCommand(socketInstance, "submitReview", { reviewId, decision });
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
