import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { usePlayer } from "../state/PlayerContext.jsx";
import { useServerClock } from "../hooks/useServerClock.js";
import useAudio from "../hooks/useAudio.js";
import useEmojiBursts from "../hooks/useEmojiBursts.js";
import {
  useApplyState,
  useStudentHandlers,
  useStudentConnection,
  useStudentRoundPhase,
  useStudentFullscreenFlow,
  useStudentAnswers,
  useStudentStop,
  useStudentReviewActions,
} from "./StudentGamePage.hooks.jsx";

/** Estado local + conexão + fase da rodada — a metade "de onde vêm os dados" da fiação da tela do aluno. */
export function useStudentConnectionState() {
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
  // Ajustes da sala: a linha de base vem da projeção de estado
  // (`state.settings`); o evento leve `roomSettingsChanged` atualiza ao vivo,
  // sem esperar o próximo publish. Mesmo desenho da tela pública.
  const [liveSettings, setLiveSettings] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [completedReviewIds, setCompletedReviewIds] = useState(() => new Set());
  const [stopSplash, setStopSplash] = useState(false);

  // Rascunhos de resposta ainda nao confirmados pelo servidor (spec 48):
  // compartilhado entre `useApplyState` (nao reescreve texto em edicao) e
  // `useStudentAnswers` (marca no digitar, limpa na confirmacao do push).
  const dirtyRef = useRef(new Set());

  useEffect(() => {
    if (!player?.playerToken) navigate("/", { replace: true });
  }, [player, navigate]);

  const applyState = useApplyState({ sync, setAnswers, setEliminated, setReviews, setCompletedReviewIds, setRanking, dirtyRef });
  const handlers = useStudentHandlers({
    applyState,
    audio,
    dirtyRef,
    emojiBursts,
    setAnswers,
    setCurrentId,
    setEliminated,
    setFeedback,
    setReviews,
    setCompletedReviewIds,
    setRanking,
    setStopSplash,
    setLiveSettings,
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
    // O evento leve vence a linha de base do estado: ele é mais recente por
    // definição (chega no instante em que o professor mexe no interruptor).
    settings: liveSettings ?? connection.state?.settings ?? null,
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
export function useStudentActionState(base) {
  const { clear, navigate, audio, connection, phase, answers, setAnswers, currentId, setCurrentId, setFeedback, setCompletedReviewIds, dirtyRef } = base;

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
    dirtyRef,
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
export function useStudentGameState() {
  const base = useStudentConnectionState();
  const { fullscreenFlow, answerActions, stop, reviewActions } = useStudentActionState(base);
  return { ...base, fullscreenFlow, answerActions, stop, reviewActions };
}
