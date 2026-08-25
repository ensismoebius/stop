import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../state/PlayerContext.jsx";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useServerClock, useCountdown } from "../hooks/useServerClock.js";
import useFullscreen from "../hooks/useFullscreen.js";
import useAudio from "../hooks/useAudio.js";
import { emitAck } from "../socket/socket.js";
import api from "../services/api.js";
import GameHeader from "../components/student/GameHeader.jsx";
import CategoryList from "../components/student/CategoryList.jsx";
import AnswerEditor from "../components/student/AnswerEditor.jsx";
import StopButton from "../components/student/StopButton.jsx";
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import Alert from "../components/common/Alert.jsx";

const SYNC_DELAY = 450;

const STATUS_MESSAGE = {
  CREATED: { title: "Aguardando", text: "O professor está preparando a rodada." },
  READY: { title: "Preparar!", text: "A letra foi sorteada. A rodada começa em instantes." },
  STARTING: { title: "Preparar!", text: "A rodada vai começar." },
  STOPPED: { title: "STOP!", text: "A rodada foi encerrada. Aguarde a correção." },
  CORRECTION: { title: "Correção", text: "O professor está corrigindo as respostas." },
  SCORED: { title: "Pontuação", text: "A pontuação da rodada foi divulgada." },
  FINISHED: { title: "Rodada encerrada", text: "Aguarde o professor iniciar a próxima." },
};

export function StudentGamePage() {
  const { player, clear } = usePlayer();
  const navigate = useNavigate();
  const audio = useAudio();
  const { sync, now } = useServerClock();

  const [answers, setAnswers] = useState({});
  const [currentId, setCurrentId] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [eliminated, setEliminated] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [entered, setEntered] = useState(false);

  const timersRef = useRef({});
  const socketRef = useRef(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    if (!player?.playerToken) navigate("/", { replace: true });
  }, [player, navigate]);

  const applyState = useCallback(
    (state) => {
      if (!state) return;
      sync(state.serverTime);
      const next = {};
      for (const answer of state.answers ?? []) next[answer.roundCategoryId] = answer.value;
      setAnswers(next);
      setEliminated(state.roundStatus === "ELIMINATED" ? { reason: "FULLSCREEN_EXIT" } : null);
    },
    [sync],
  );

  const handlers = useMemo(
    () => ({
      // `onState` roda a cada `roomState` — no ingresso e em toda mudanca
      // relevante empurrada pelo servidor (spec 45). Os handlers nomeados
      // abaixo cuidam apenas de efeitos locais: som e mensagens.
      onState: (state) => applyState(state),
      onError: (payload) => setFeedback({ kind: "error", message: payload.message }),
      letterSelected: () => audio.play("LETTER"),
      roundCreated: () => {
        setAnswers({});
        setCurrentId(null);
        setEliminated(null);
        setFeedback(null);
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
        setFeedback({
          kind: "warning",
          message: payload.firstStopperName
            ? `STOP! ${payload.firstStopperName} encerrou a rodada.`
            : "STOP! A rodada foi encerrada.",
        });
      },
      roundTimedOut: () => {
        audio.play("STOPPED");
        setFeedback({ kind: "warning", message: "O tempo acabou. A rodada foi encerrada." });
      },
      playerEliminated: (payload) => {
        audio.play("ELIMINATED");
        setEliminated(payload);
      },
      rankingUpdated: (payload) => {
        audio.play("RANKING");
        setRanking(payload.ranking ?? []);
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
    }),
    [applyState, audio],
  );

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

  const round = state?.round ?? null;
  const categories = round?.categories ?? [];
  const playing = round?.status === "PLAYING" && state?.roundStatus === "PLAYING" && !eliminated;
  const seconds = useCountdown(round?.status === "PLAYING" ? round?.endsAt : null, now);

  // Aviso sonoro nos ultimos segundos (spec 22 e 23).
  const lastBeepRef = useRef(null);
  useEffect(() => {
    if (!playing || seconds === null || seconds > 10 || seconds <= 0) return;
    if (lastBeepRef.current === seconds) return;
    lastBeepRef.current = seconds;
    audio.play("FINAL_SECONDS");
  }, [seconds, playing, audio]);

  // ------------------------------------------------------------------
  // Tela cheia (spec 24): sair durante a rodada elimina o aluno, e sair da
  // tela cheia ou trocar de app a qualquer momento devolve o aluno para a
  // tela de entrada — o dispositivo precisa ficar travado no jogo.
  // ------------------------------------------------------------------
  const leaveRoom = useCallback(() => {
    clear();
    navigate("/", { replace: true });
  }, [clear, navigate]);

  const handleFullscreenExit = useCallback(() => {
    const socketInstance = socketRef.current;
    if (socketInstance && round && round.status === "PLAYING" && state?.roundStatus === "PLAYING") {
      emitAck(socketInstance, "fullscreenExited", { roundId: round.id });
    }
    if (entered) leaveRoom();
  }, [round, state?.roundStatus, entered, leaveRoom]);

  const fullscreen = useFullscreen({ onExit: handleFullscreenExit });

  const enterGame = useCallback(async () => {
    audio.unlock();
    await fullscreen.enter(document.documentElement);
    setEntered(true);
  }, [audio, fullscreen]);

  // Sair da aba/janela ou trocar de app tambem devolve para a entrada
  // (spec 24/25): a telemetria continua registrada, mas agora e tambem
  // motivo de saida — antes so avisava o professor, sem consequencia local.
  useEffect(() => {
    if (!entered) return undefined;
    const report = (type) =>
      socket?.emit("telemetry", { type, roundId: round?.id, payload: { at: Date.now() } });
    const onVisibility = () => {
      if (document.hidden) {
        report("VISIBILITY_HIDDEN");
        leaveRoom();
      } else {
        report("VISIBILITY_VISIBLE");
      }
    };
    const onBlur = () => {
      report("WINDOW_BLUR");
      leaveRoom();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [entered, leaveRoom, socket, round?.id]);

  // ------------------------------------------------------------------
  // Respostas: estado local + sincronizacao controlada (spec 48).
  // ------------------------------------------------------------------
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
    [round],
  );

  const handleChange = useCallback(
    (roundCategoryId, value) => {
      setAnswers((current) => ({ ...current, [roundCategoryId]: value }));
      clearTimeout(timersRef.current[roundCategoryId]);
      timersRef.current[roundCategoryId] = setTimeout(
        () => pushAnswer(roundCategoryId),
        SYNC_DELAY,
      );
    },
    [pushAnswer],
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
    [currentId, commit],
  );

  useEffect(() => () => {
    for (const timer of Object.values(timersRef.current)) clearTimeout(timer);
  }, []);

  const requiredCategories = categories.filter((category) => category.required);
  const filledCount = categories.filter((category) =>
    (answers[category.id] ?? "").trim().length > 0,
  ).length;
  const canStop =
    playing &&
    requiredCategories.length > 0 &&
    requiredCategories.every((category) => (answers[category.id] ?? "").trim().length > 0);

  const handleStop = useCallback(async () => {
    const socketInstance = socketRef.current;
    if (!socketInstance || !round) return;
    // Garante que tudo foi enviado antes de reivindicar o STOP.
    await Promise.all(categories.map((category) => commit(category.id)));
    const response = await emitAck(socketInstance, "requestStop", { roundId: round.id });
    if (response.ok) {
      setFeedback({ kind: "success", message: "Você deu STOP primeiro!" });
    } else {
      setFeedback({ kind: "error", message: response.error?.message ?? "STOP recusado" });
    }
    refresh();
  }, [round, categories, commit, refresh]);

  if (!player) return null;

  const message = round ? STATUS_MESSAGE[round.status] : null;
  const currentCategory = categories.find((category) => category.id === currentId) ?? null;

  return (
    <div className="student">
      <GameHeader
        round={round}
        seconds={seconds}
        running={playing}
        filled={filledCount}
        total={categories.length}
      />

      <main className="student__body">
        <div className="spread small muted">
          <span className="row">
            {state?.student?.avatarUrl ?? player.student?.avatarUrl ? (
              <img
                className="student__avatar"
                src={state?.student?.avatarUrl ?? player.student?.avatarUrl}
                alt=""
              />
            ) : null}
            {state?.student?.name} · sala {player.room?.code}
          </span>
          <ConnectionBadge connected={connected} />
        </div>

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

        {!playing && message ? (
          <div className="notice">
            <div className="notice__title">{message.title}</div>
            <p className="muted">{message.text}</p>
            {round?.status === "READY" || round?.status === "CREATED" ? (
              <button type="button" className="btn btn--primary btn--block" onClick={enterGame}>
                {entered ? "Pronto!" : "Entrar na partida"}
              </button>
            ) : null}
          </div>
        ) : null}

        {!round ? (
          <div className="notice">
            <div className="notice__title">Aguardando jogadores</div>
            <p className="muted">Assim que o professor iniciar a rodada, ela aparecerá aqui.</p>
          </div>
        ) : null}

        {currentCategory ? (
          <AnswerEditor
            category={currentCategory}
            value={answers[currentCategory.id] ?? ""}
            letter={round?.letter}
            disabled={!playing}
            onChange={handleChange}
            onCommit={commit}
            onClose={() => {
              commit(currentCategory.id);
              setCurrentId(null);
            }}
          />
        ) : null}

        {categories.length > 0 ? (
          <CategoryList
            categories={categories}
            answers={answers}
            currentId={currentId}
            disabled={!playing}
            onSelect={selectCategory}
          />
        ) : null}

        {ranking.length > 0 && !playing ? (
          <section className="card">
            <h2>Ranking</h2>
            <ol className="ranking__list">
              {ranking.slice(0, 10).map((entry) => (
                <li
                  key={entry.studentId}
                  className={`ranking__item${
                    entry.position <= 3 ? ` ranking__item--p${entry.position}` : ""
                  }`}
                >
                  <span className="ranking__position">{entry.position}</span>
                  <span className="ranking__name">{entry.name}</span>
                  <span className="ranking__total">{entry.total}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        <div className="row small">
          <button type="button" className="btn btn--ghost" onClick={audio.toggle}>
            {audio.enabled ? "🔊 Som ligado" : "🔇 Som desligado"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              clear();
              navigate("/", { replace: true });
            }}
          >
            Sair
          </button>
        </div>
      </main>

      <div className="stopbar">
        <StopButton
          disabled={!canStop}
          filled={filledCount}
          total={categories.length}
          onClick={handleStop}
        />
      </div>
    </div>
  );
}

export default StudentGamePage;
