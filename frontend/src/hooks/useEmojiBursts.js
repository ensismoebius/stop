import { useCallback, useRef, useState } from "react";

const LIFETIME_MS = 2200;
let nextId = 0;

/**
 * Fila de reacoes em emoji flutuantes, efemera (nunca persiste): cada
 * `push` adiciona um item que se remove sozinho apos a animacao, sem
 * limite de fila crescendo para sempre em sessoes longas.
 */
export function useEmojiBursts() {
  const [items, setItems] = useState([]);
  const timersRef = useRef(new Set());

  const push = useCallback((emoji) => {
    const id = ++nextId;
    setItems((current) => [...current, { id, emoji, x: Math.random() }]);
    const timer = setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
      timersRef.current.delete(timer);
    }, LIFETIME_MS);
    timersRef.current.add(timer);
  }, []);

  return { items, push };
}

export default useEmojiBursts;
