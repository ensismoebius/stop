import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api.js";
import Field from "../components/common/Field.jsx";
import Alert from "../components/common/Alert.jsx";

const MEDAL_LABEL = { GOLD: "🥇 Ouro", SILVER: "🥈 Prata", BRONZE: "🥉 Bronze" };

/** Busca por matrícula, redireciona para /historico/:registrationNumber. */
function HistorySearchForm({ input, setInput, loading, navigate }) {
  return (
    <form
      className="card stack"
      onSubmit={(event) => {
        event.preventDefault();
        const clean = input.trim();
        if (clean) navigate(`/historico/${encodeURIComponent(clean)}`);
      }}
    >
      <Field id="history-registration" label="Matrícula">
        <input
          id="history-registration"
          className="input"
          type="text"
          autoComplete="off"
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
      </Field>
      <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
        Buscar
      </button>
    </form>
  );
}

/** Tabela de partidas finalizadas do aluno, ou mensagem de "nenhuma ainda". */
function HistoryResults({ data }) {
  return (
    <section className="card stack">
      <h2>{data.student.name}</h2>
      <p className="muted small">Matrícula {data.student.registrationNumber}</p>

      {data.results.length === 0 ? (
        <p className="muted">Nenhuma partida finalizada ainda.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Partida</th>
                <th scope="col">Disciplina</th>
                <th scope="col">Turma</th>
                <th scope="col">Data</th>
                <th scope="col">Posição</th>
                <th scope="col">Pontos</th>
                <th scope="col">Medalha</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((result) => (
                <tr key={result.id}>
                  <td>{result.gameName}</td>
                  <td className="small muted">{result.discipline || "—"}</td>
                  <td className="small muted">{result.className || "—"}</td>
                  <td className="small muted">
                    {result.finishedAt ? new Date(result.finishedAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td>{result.position}º</td>
                  <td>{result.score}</td>
                  <td>{result.medal ? MEDAL_LABEL[result.medal] : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Historico academico do proprio aluno, por matricula — mesmo modelo de
 * confianca do identify de sala (spec 6): so a matricula, sem senha. Le de
 * `GameResult`, gravado quando o professor finaliza uma partida.
 */
export function StudentHistoryPage() {
  const { registrationNumber } = useParams();
  const navigate = useNavigate();

  const [input, setInput] = useState(registrationNumber ?? "");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (value) => {
    setError(null);
    setLoading(true);
    try {
      setData(await api.getStudentHistory(value));
    } catch (apiError) {
      setData(null);
      setError(apiError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (registrationNumber) load(registrationNumber);
  }, [registrationNumber, load]);

  return (
    <div className="home">
      <div>
        <h1 className="home__title">Meu histórico</h1>
        <p className="muted">Consulte suas partidas e medalhas pela matrícula.</p>
      </div>

      <HistorySearchForm input={input} setInput={setInput} loading={loading} navigate={navigate} />

      <Alert kind="error">{error}</Alert>

      {data ? <HistoryResults data={data} /> : null}

      <Link className="home__link" to="/">
        Voltar
      </Link>
    </div>
  );
}

export default StudentHistoryPage;
