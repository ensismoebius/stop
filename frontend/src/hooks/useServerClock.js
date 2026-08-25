import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cronometro do cliente sincronizado com o relogio do servidor.
 *
 * O servidor e a autoridade do tempo (spec 33): aqui apenas calculamos a
 * diferenca entre o relogio local e o `serverTime` recebido e usamos essa
 * correcao para exibir o tempo restante.
 */
export function useServerClock() {
  const offsetRef = useRef(0);

  const sync = useCallback((serverTime) => {
    if (!serverTime) return;
    const server = new Date(serverTime).getTime();
    if (Number.isNaN(server)) return;
    offsetRef.current = server - Date.now();
  }, []);

  const now = useCallback(() => Date.now() + offsetRef.current, []);

  return { sync, now, offsetRef };
}

/**
 * Segundos restantes ate `endsAt`, corrigidos pelo relogio do servidor.
 * Retorna `null` quando nao ha contagem em andamento.
 */
export function useCountdown(endsAt, now) {
  const [remaining, setRemaining] = useState(null);

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return undefined;
    }
    const target = new Date(endsAt).getTime();
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((target - now()) / 1000));
      setRemaining(seconds);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endsAt, now]);

  return remaining;
}

export function formatClock(seconds) {
  if (seconds === null || seconds === undefined) return "--:--";
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = String(Math.floor(safe / 60)).padStart(2, "0");
  const rest = String(safe % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

export default useServerClock;
