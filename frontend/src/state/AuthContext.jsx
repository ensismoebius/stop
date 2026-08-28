import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../services/api.js";

const STORAGE_KEY = "stop:admin";

const AuthContext = createContext(null);

/**
 * Sessao administrativa do professor (spec 35).
 * Guardada separadamente da sessao do aluno: uma nunca serve para a outra.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [checking, setChecking] = useState(Boolean(session));

  useEffect(() => {
    if (!session?.token) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api
      .me(session.token)
      .catch(() => {
        if (!cancelled) setSession(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  useEffect(() => {
    try {
      if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* armazenamento indisponivel */
    }
  }, [session]);

  const login = useCallback(async (email, password) => {
    const result = await api.login(email, password);
    setSession(result);
    return result;
  }, []);

  const logout = useCallback(() => setSession(null), []);

  const value = useMemo(
    () => ({
      token: session?.token ?? null,
      teacher: session?.teacher ?? null,
      authenticated: Boolean(session?.token),
      checking,
      login,
      logout,
    }),
    [session, checking, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Acessa a sessao administrativa do professor (spec 35). */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth precisa estar dentro de AuthProvider");
  return context;
}

export default AuthContext;
