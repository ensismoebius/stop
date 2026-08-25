import { useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import Field from "../components/common/Field.jsx";
import Alert from "../components/common/Alert.jsx";

/** Autenticacao administrativa separada da sessao do aluno (spec 35). */
export function TeacherLoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="login card stack">
      <div>
        <h1>Painel do professor</h1>
        <p className="muted small">Acesso restrito.</p>
      </div>

      <Alert kind="error">{error}</Alert>

      <form
        className="stack"
        onSubmit={async (event) => {
          event.preventDefault();
          setError(null);
          setBusy(true);
          try {
            await login(email.trim(), password);
          } catch (loginError) {
            setError(loginError.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field id="email" label="E-mail">
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field id="password" label="Senha">
          <input
            id="password"
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
          {busy ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}

export default TeacherLoginPage;
