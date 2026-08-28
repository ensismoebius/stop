import { createContext, useCallback, useContext, useMemo, useState } from "react";

const STORAGE_KEY = "stop:player";

const PlayerContext = createContext(null);

/** Le a sessao do aluno gravada no sessionStorage. */
function read() {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Sessao do aluno (spec 46).
 *
 * Guardamos apenas o identificador temporario em `sessionStorage`. O
 * servidor continua sendo a autoridade: o token so aponta para a sessao.
 */
export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(read);

  const save = useCallback((data) => {
    setPlayer(data);
    try {
      if (data) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponivel */
    }
  }, []);

  const clear = useCallback(() => save(null), [save]);

  const value = useMemo(() => ({ player, save, clear }), [player, save, clear]);

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** Acessa a sessao do aluno (spec 46). */
export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer precisa estar dentro de PlayerProvider");
  return context;
}

export default PlayerContext;
