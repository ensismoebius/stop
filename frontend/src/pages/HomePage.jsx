import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Field from "../components/common/Field.jsx";
import { useAuth } from "../state/AuthContext.jsx";

/** Ponto de entrada comum: professor, aluno e tela publica. */
export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const { authenticated } = useAuth();

  return (
    <div className="home">
      <div>
        <h1 className="home__title">STOP</h1>
        <p className="muted">Plataforma competitiva de revisão de React Native</p>
      </div>

      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          const clean = code.trim().toUpperCase();
          if (clean) navigate(`/join/${clean}`);
        }}
      >
        <Field id="room" label="Entrar em uma sala" hint="Ou escaneie o QR Code exibido na sala.">
          <input
            id="room"
            className="input"
            type="text"
            placeholder="STOP-7F42"
            autoComplete="off"
            autoCapitalize="characters"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <button type="submit" className="btn btn--primary btn--block">
          Entrar
        </button>
      </form>

      {/*
        So o dispositivo do professor ja autenticado (localStorage, spec 35)
        ve esses atalhos — um aluno que cai aqui ao digitar a URL raiz nunca
        deve ver caminho para o painel do professor ou a tela publica.
      */}
      {authenticated ? (
        <div className="home__links">
          <Link className="home__link" to="/teacher">
            <strong>Painel do professor</strong>
            <span className="muted small">Controle da partida, correção e configuração</span>
          </Link>
          <Link className="home__link" to="/screen">
            <strong>Tela pública</strong>
            <span className="muted small">TV ou projetor da sala</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export default HomePage;
