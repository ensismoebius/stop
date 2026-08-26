import { useState } from "react";
import Field from "../common/Field.jsx";

const MEDAL_LABEL = { GOLD: "🥇 Ouro", SILVER: "🥈 Prata", BRONZE: "🥉 Bronze" };

const CSV_HEADER = [
  "Aluno",
  "Matrícula",
  "Disciplina",
  "Turma",
  "Partida",
  "Data",
  "Posição",
  "Pontos",
  "Medalha",
];

function escapeCsvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

/** Baixa os resultados filtrados como CSV (BOM UTF-8 para acentuação abrir corretamente no Excel). */
function downloadResultsCsv(results) {
  const rows = results.map((result) => [
    result.student?.name,
    result.student?.registrationNumber,
    result.game?.class?.discipline || "—",
    result.game?.class?.name,
    result.game?.name,
    result.game?.finishedAt ? new Date(result.game.finishedAt).toLocaleDateString("pt-BR") : "—",
    `${result.position}º`,
    result.score,
    result.medal ? MEDAL_LABEL[result.medal] : "—",
  ]);
  const csv = [CSV_HEADER, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `relatorio-stop-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Relatorio academico entre partidas/turmas (spec: historico de
 * desempenho) — le de `GameResult`, gravado quando o professor finaliza
 * uma partida. Sempre ordenado por nome do aluno, independente dos
 * filtros escolhidos.
 */
export function ReportsPanel({
  classes,
  students,
  games,
  results,
  onSearch,
  categoryStats,
  onCategoryStats,
  busy,
}) {
  const disciplines = [...new Set(classes.map((item) => item.discipline).filter(Boolean))];

  const [discipline, setDiscipline] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [gameId, setGameId] = useState("");
  const [medal, setMedal] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");

  const submit = (event) => {
    event.preventDefault();
    onSearch({ discipline, classId, studentId, gameId, medal, dateFrom, dateTo, scoreMin, scoreMax });
  };

  const searchCategoryStats = () => {
    onCategoryStats({ discipline, classId, gameId });
  };

  return (
    <section className="stack">
      <h2>Relatórios</h2>

      <form className="card stack" onSubmit={submit}>
        <div className="row">
          <Field id="report-discipline" label="Disciplina">
            <select
              id="report-discipline"
              className="input"
              value={discipline}
              onChange={(event) => setDiscipline(event.target.value)}
            >
              <option value="">Todas</option>
              {disciplines.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </Field>

          <Field id="report-class" label="Turma">
            <select
              id="report-class"
              className="input"
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="">Todas</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.code})
                </option>
              ))}
            </select>
          </Field>

          <Field id="report-student" label="Aluno">
            <select
              id="report-student"
              className="input"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            >
              <option value="">Todos</option>
              {students.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="report-game" label="Partida">
            <select
              id="report-game"
              className="input"
              value={gameId}
              onChange={(event) => setGameId(event.target.value)}
            >
              <option value="">Todas</option>
              {games.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>

          <Field id="report-medal" label="Medalha">
            <select
              id="report-medal"
              className="input"
              value={medal}
              onChange={(event) => setMedal(event.target.value)}
            >
              <option value="">Todas</option>
              <option value="GOLD">🥇 Ouro</option>
              <option value="SILVER">🥈 Prata</option>
              <option value="BRONZE">🥉 Bronze</option>
            </select>
          </Field>
        </div>

        <div className="row">
          <Field id="report-date-from" label="De">
            <input
              id="report-date-from"
              type="date"
              className="input"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Field>
          <Field id="report-date-to" label="Até">
            <input
              id="report-date-to"
              type="date"
              className="input"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Field>
          <Field id="report-score-min" label="Pontuação mínima">
            <input
              id="report-score-min"
              type="number"
              className="input"
              value={scoreMin}
              onChange={(event) => setScoreMin(event.target.value)}
            />
          </Field>
          <Field id="report-score-max" label="Pontuação máxima">
            <input
              id="report-score-max"
              type="number"
              className="input"
              value={scoreMax}
              onChange={(event) => setScoreMax(event.target.value)}
            />
          </Field>
        </div>

        <div className="row">
          <button type="submit" className="btn btn--primary" disabled={busy}>
            Buscar
          </button>
          <button
            type="button"
            className="btn"
            disabled={results.length === 0}
            onClick={() => downloadResultsCsv(results)}
          >
            Exportar CSV
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={searchCategoryStats}>
            Desempenho por categoria
          </button>
        </div>
      </form>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th scope="col">Aluno</th>
              <th scope="col">Matrícula</th>
              <th scope="col">Disciplina</th>
              <th scope="col">Turma</th>
              <th scope="col">Partida</th>
              <th scope="col">Data</th>
              <th scope="col">Posição</th>
              <th scope="col">Pontos</th>
              <th scope="col">Medalha</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  Nenhum resultado para os filtros selecionados.
                </td>
              </tr>
            ) : (
              results.map((result) => (
                <tr key={result.id}>
                  <td>{result.student?.name}</td>
                  <td className="small muted">{result.student?.registrationNumber}</td>
                  <td className="small muted">{result.game?.class?.discipline || "—"}</td>
                  <td className="small muted">{result.game?.class?.name}</td>
                  <td>{result.game?.name}</td>
                  <td className="small muted">
                    {result.game?.finishedAt ? new Date(result.game.finishedAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td>{result.position}º</td>
                  <td>{result.score}</td>
                  <td>{result.medal ? MEDAL_LABEL[result.medal] : "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {categoryStats ? (
        <div className="card stack">
          <h3>Desempenho por categoria</h3>
          <p className="muted small">
            Usa os filtros de disciplina, turma e partida acima. Ordenado por taxa de acerto, do pior
            desempenho para o melhor.
          </p>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Categoria</th>
                  <th scope="col">Respostas</th>
                  <th scope="col">Preenchidas</th>
                  <th scope="col">Válidas</th>
                  <th scope="col">Taxa de preenchimento</th>
                  <th scope="col">Taxa de acerto</th>
                </tr>
              </thead>
              <tbody>
                {categoryStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted">
                      Nenhum dado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  categoryStats.map((stat) => (
                    <tr key={stat.category}>
                      <td>{stat.category}</td>
                      <td>{stat.answers}</td>
                      <td>{stat.filled}</td>
                      <td>{stat.valid}</td>
                      <td>{Math.round(stat.fillRate * 100)}%</td>
                      <td>{Math.round(stat.accuracyRate * 100)}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default ReportsPanel;
