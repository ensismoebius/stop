import { useCallback, useEffect, useRef, useState } from "react";
import { createSocket, emitAck } from "../socket/socket.js";
import { SyncStatus, applyAuthoritative } from "../state/synchronization.js";

// Eventos servidor->cliente repassados 1:1 para `handlers[event]`, sem
// tratamento especial (diferente de `roomState`/`syncCountdownRequested`,
// que atualizam estado do hook ou respondem com ack).
const NAMED_EVENTS = [
  "playerJoined",
  "playerLeft",
  "roundCreated",
  "letterSelected",
  "roundStarting",
  "syncCountdownReleased",
  "roundStarted",
  "answerUpdated",
  "playerProgress",
  "playerEliminated",
  "roundStopped",
  "roundTimedOut",
  "collaborativeCorrectionStarted",
  "reviewAssigned",
  "reviewCompleted",
  "collaborativeCorrectionProgress",
  "collaborativeCorrectionFinished",
  "correctionStarted",
  "answerReviewed",
  "answersReviewed",
  "scoreUpdated",
  "rankingUpdated",
  "roundFinished",
  "roundCancelled",
  "nextRound",
  "roomStatusChanged",
  "roomSettingsChanged",
  "emojiReceived",
];

// Heartbeat da aplicação (baseline 8.3): o cliente reporta a posição que
// adotou e o servidor devolve a posição autoritativa corrente. Se o
// servidor está à frente (`stale`), dispara um `requestState` — recuperação
// passiva independente de evento, cobre pushes perdidos em qualquer fase.
const HEARTBEAT_MS = 6_000;

/**
 * Repassa 1:1 cada evento de `NAMED_EVENTS` para `handlersRef.current[event]`.
 * Os handlers são lidos via ref para que o registro não precise ser refeito
 * quando o objeto `handlers` muda entre renders.
 *
 * @param {object} instance instância de socket (Socket.IO).
 * @param {import("react").MutableRefObject<object | undefined>} handlersRef
 *   ref para o objeto de handlers corrente.
 */
function registerNamedListeners(instance, handlersRef) {
  for (const event of NAMED_EVENTS) {
    instance.on(event, (payload) => handlersRef.current?.[event]?.(payload));
  }
}

/** Payload de posição adotada (roomEpoch/stateVersion) para os acks de sincronização. */
function positionPayload(positionRef) {
  return {
    roomEpoch: positionRef.current.roomEpoch,
    stateVersion: positionRef.current.stateVersion,
  };
}

/**
 * Heartbeat da aplicação enquanto conectado: reporta a posição adotada; se o
 * servidor estiver à frente (`stale`), dispara `refresh` — recuperação
 * passiva independente de evento.
 */
function useApplicationHeartbeat({ socketRef, positionRef, connected, socket, refresh }) {
  useEffect(() => {
    if (!connected || !socket) return undefined;
    const timer = setInterval(async () => {
      const instance = socketRef.current;
      if (!instance) return;
      const response = await emitAck(instance, "applicationHeartbeat", {
        ...positionPayload(positionRef),
        sentAt: Date.now(),
      });
      if (!response?.ok) return;
      if (response.data?.stale) refresh();
    }, HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [connected, socket, refresh]);
}

/**
 * Cria o socket da sala, faz o `joinRoom` e conecta os eventos de ciclo de
 * vida, de estado (`roomState`), o `error` do servidor e o ack automático de
 * `syncCountdownRequested` (spec 54). No cleanup remove os listeners e fecha
 * o socket — reconecta do zero quando a configuração de entrada muda.
 */
function useRoomConnection({
  socketRef,
  handlersRef,
  applyAuthoritativeState,
  setSocket,
  setConnected,
  setError,
  setSyncStatus,
  enabled,
  roomCode,
  role,
  playerToken,
  adminToken,
}) {
  useEffect(() => {
    if (!enabled || !roomCode) return undefined;
    if (role === "player" && !playerToken) return undefined;
    if (role === "teacher" && !adminToken) return undefined;

    const instance = createSocket();
    socketRef.current = instance;
    setSocket(instance);

    const join = async () => {
      const response = await emitAck(instance, "joinRoom", {
        roomCode,
        role,
        playerToken,
        adminToken,
      });
      if (response.ok) {
        applyAuthoritativeState(response.data);
        handlersRef.current?.onJoined?.(response.data);
        setError(null);
        setSyncStatus(SyncStatus.SYNCHRONIZED);
      } else {
        setError(response.error);
        setSyncStatus(SyncStatus.UNREACHABLE);
      }
    };

    instance.on("connect", () => {
      setConnected(true);
      setSyncStatus(SyncStatus.CONNECTING);
      join();
    });
    instance.on("disconnect", () => {
      setConnected(false);
      setSyncStatus(SyncStatus.UNREACHABLE);
    });
    instance.on("connect_error", () => {
      setError({ code: "CONNECT_ERROR", message: "Sem conexao com o servidor" });
      setSyncStatus(SyncStatus.UNREACHABLE);
    });
    instance.on("roomState", (payload) => applyAuthoritativeState(payload));
    instance.on("error", (payload) => handlersRef.current?.onError?.(payload));

    // Unico evento server->cliente desta lista que espera um ack de volta:
    // o servidor usa isso so como sinal de "o dispositivo recebeu o
    // horario combinado", com timeout (spec 54) — nunca trava a partida
    // por um device lento ou offline. O ack e automatico aqui.
    instance.on("syncCountdownRequested", (payload, ack) => {
      handlersRef.current?.syncCountdownRequested?.(payload);
      if (typeof ack === "function") ack(true);
    });

    registerNamedListeners(instance, handlersRef);

    return () => {
      instance.removeAllListeners();
      instance.close();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, [roomCode, role, playerToken, adminToken, enabled, applyAuthoritativeState]);
}

/**
 * Conecta a sala e mantém o estado autoritativo recebido do servidor.
 *
 * TODO estado que chega ao dispositivo — ack do `joinRoom`, push de
 * `roomState`, resposta do `requestState`/REST — passa pela barreira de
 * sincronização (`applyAuthoritative`), que só adota posições
 * `(roomEpoch, stateVersion)` ≥ à adotada. Estados antigos que chegam
 * atrasados (push enviado antes de uma reconexão e entregue depois) são
 * descartados sem regredir o cliente (spec 45 e 64).
 */
export function useRoomSocket({ roomCode, role, playerToken, adminToken, handlers, enabled = true }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [position, setPosition] = useState({ roomEpoch: 1, stateVersion: 0 });
  const [syncStatus, setSyncStatus] = useState(SyncStatus.IDLE);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const socketRef = useRef(null);
  const positionRef = useRef({ roomEpoch: 1, stateVersion: 0 });
  const refreshBusyRef = useRef(false);

  /** Porta única para estados autoritativos entrarem no hook. */
  const applyAuthoritativeState = useCallback((incoming) => {
    if (!incoming) return null;
    const { adopted, position: nextPosition } = applyAuthoritative(positionRef.current, incoming);
    if (!adopted) return null;
    positionRef.current = nextPosition;
    setPosition(nextPosition);
    setState(incoming);
    handlersRef.current?.onState?.(incoming);
    return incoming;
  }, []);

  /**
   * Pedido de estado sob demanda (spec 45), versão-aware: manda a posição
   * adotada; o servidor responde `CURRENT` (nada novo) ou `ROOM_STATE`
   * (snapshot completo). Todas as fontes de estado passam pela barreira.
   */
  const refresh = useCallback(async () => {
    const instance = socketRef.current;
    if (!instance || refreshBusyRef.current) return null;
    refreshBusyRef.current = true;
    setSyncStatus((current) =>
      current === SyncStatus.SYNCHRONIZED ? SyncStatus.RECOVERING : current,
    );
    try {
      const response = await emitAck(instance, "requestState", positionPayload(positionRef));
      if (!response?.ok) {
        setSyncStatus(SyncStatus.DEGRADED);
        return response;
      }
      if (response.data?.status === "CURRENT") {
        setSyncStatus(SyncStatus.SYNCHRONIZED);
        return response;
      }
      applyAuthoritativeState(response.data);
      setSyncStatus(SyncStatus.SYNCHRONIZED);
      return response;
    } finally {
      refreshBusyRef.current = false;
    }
  }, [applyAuthoritativeState]);

  /** Adota um estado autoritativo de fora do socket (fallback REST). */
  const adoptState = useCallback(
    (incoming) => applyAuthoritativeState(incoming),
    [applyAuthoritativeState],
  );

  useApplicationHeartbeat({ socketRef, positionRef, connected, socket, refresh });

  useRoomConnection({
    socketRef,
    handlersRef,
    applyAuthoritativeState,
    setSocket,
    setConnected,
    setError,
    setSyncStatus,
    enabled,
    roomCode,
    role,
    playerToken,
    adminToken,
  });

  return {
    socket,
    connected,
    state,
    setState,
    error,
    roomEpoch: position.roomEpoch,
    stateVersion: position.stateVersion,
    syncStatus,
    refresh,
    adoptState,
  };
}

export default useRoomSocket;