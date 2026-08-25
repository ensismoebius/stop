import { useEffect, useRef, useState } from "react";
import { createSocket, emitAck } from "../socket/socket.js";

/**
 * Conecta a sala e mantem o estado autoritativo recebido do servidor.
 *
 * A cada (re)conexao o cliente refaz `joinRoom` e adota o estado devolvido
 * pelo servidor, descartando qualquer suposicao local (spec 45 e 64).
 */
export function useRoomSocket({ roomCode, role, playerToken, adminToken, handlers, enabled = true }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!enabled || !roomCode) return undefined;
    if (role === "player" && !playerToken) return undefined;
    if (role === "teacher" && !adminToken) return undefined;

    const instance = createSocket();
    setSocket(instance);

    const join = async () => {
      const response = await emitAck(instance, "joinRoom", {
        roomCode,
        role,
        playerToken,
        adminToken,
      });
      if (response.ok) {
        setState(response.data);
        setError(null);
        handlersRef.current?.onState?.(response.data);
        handlersRef.current?.onJoined?.(response.data);
      } else {
        setError(response.error);
      }
    };

    instance.on("connect", () => {
      setConnected(true);
      join();
    });
    instance.on("disconnect", () => setConnected(false));
    instance.on("connect_error", () =>
      setError({ code: "CONNECT_ERROR", message: "Sem conexao com o servidor" }),
    );
    // `onState` roda tanto no ack de entrada quanto em toda atualizacao
    // push do servidor: e o unico lugar onde paginas sincronizam relogio e
    // estado derivado a partir do estado autoritativo (spec 33 e 45).
    instance.on("roomState", (payload) => {
      setState(payload);
      handlersRef.current?.onState?.(payload);
    });
    instance.on("error", (payload) => handlersRef.current?.onError?.(payload));

    const named = [
      "playerJoined",
      "playerLeft",
      "roundCreated",
      "letterSelected",
      "roundStarted",
      "answerUpdated",
      "playerProgress",
      "playerEliminated",
      "roundStopped",
      "roundTimedOut",
      "correctionStarted",
      "answerReviewed",
      "answersReviewed",
      "scoreUpdated",
      "rankingUpdated",
      "roundFinished",
      "roundCancelled",
      "nextRound",
      "roomStatusChanged",
    ];
    for (const event of named) {
      instance.on(event, (payload) => handlersRef.current?.[event]?.(payload));
    }

    return () => {
      instance.removeAllListeners();
      instance.close();
      setSocket(null);
      setConnected(false);
    };
  }, [roomCode, role, playerToken, adminToken, enabled]);

  return { socket, connected, state, setState, error };
}

export default useRoomSocket;
