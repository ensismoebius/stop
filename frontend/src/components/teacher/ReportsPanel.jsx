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

/** Escapa um valor para celula CSV, envolvendo entre aspas. */
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

/** `<select>` genérico de filtro, com a opção "todos/todas" fixa no topo. */
function SelectField({ id, label, value, onChange, allLabel, options }) {
  return (
    <Field id={id} label={label}>
      <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** `<input>` genérico de filtro (data ou número). */
function InputField({ id, label, type, value, onChange }) {
  return (
    <Field id={id} label={label}>
      <input id={id} type={type} className="input" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

const MEDAL_OPTIONS = [
  { value: "GOLD", label: "🥇 Ouro" },
  { value: "SILVER", label: "🥈 Prata" },
  { value: "BRONZE", label: "🥉 Bronze" },
];

/** Linha de selects: disciplina, turma, aluno, partida, medalha. */
function ReportsFilterSelects({ classes, students, games, discipline, classId, studentId, gameId, medal, setters }) {
  const disciplines = [...new Set(classes.map((item) => item.discipline).filter(Boolean))];

  return (
    <div className="row">
      <SelectField
        id="report-discipline"
        label="Disciplina"
        value={discipline}
        onChange={setters.setDiscipline}
        allLabel="Todas"
        options={disciplines.map((item) => ({ value: item, label: item }))}
      />
      <SelectField
        id="report-class"
        label="Turma"
        value={classId}
        onChange={setters.setClassId}
        allLabel="Todas"
        options={classes.map((item) => ({ value: item.id, label: `${item.name} (${item.code})` }))}
      />
      <SelectField
        id="report-student"
        label="Aluno"
        value={studentId}
        onChange={setters.setStudentId}
        allLabel="Todos"
        options={students.map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
        id="report-game"
        label="Partida"
        value={gameId}
        onChange={setters.setGameId}
        allLabel="Todas"
        options={games.map((item) => ({ value: item.id, label: item.name }))}
      />
      <SelectField
        id="report-medal"
        label="Medalha"
        value={medal}
        onChange={setters.setMedal}
        allLabel="Todas"
        options={MEDAL_OPTIONS}
      />
    </div>
  );
}

/** Linha de intervalos: data e pontuação. */
function ReportsFilterRanges({ dateFrom, dateTo, scoreMin, scoreMax, setters }) {
  return (
    <div className="row">
      <InputField id="report-date-from" label="De" type="date" value={dateFrom} onChange={setters.setDateFrom} />
      <InputField id="report-date-to" label="Até" type="date" value={dateTo} onChange={setters.setDateTo} />
      <InputField
        id="report-score-min"
        label="Pontuação mínima"
        type="number"
        value={scoreMin}
        onChange={setters.setScoreMin}
      />
      <InputField
        id="report-score-max"
        label="Pontuação máxima"
        type="number"
        value={scoreMax}
        onChange={setters.setScoreMax}
      />
    </div>
  );
}

/** Formulário de filtros dos relatórios, mais os disparadores de exportar CSV e desempenho por categoria. */
function ReportsFilterForm({ classes, students, games, results, busy, onSearch, onCategoryStats }) {
  const [discipline, setDiscipline] = useState("");
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [gameId, setGameId] = useState("");
  const [medal, setMedal] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [scoreMin, setScoreMin] = useState("");
  const [scoreMax, setScoreMax] = useState("");
  const setters = { setDiscipline, setClassId, setStudentId, setGameId, setMedal, setDateFrom, setDateTo, setScoreMin, setScoreMax };

  const submit = (event) => {
    event.preventDefault();
    onSearch({ discipline, classId, studentId, gameId, medal, dateFrom, dateTo, scoreMin, scoreMax });
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <ReportsFilterSelects
        classes={classes}
        students={students}
        games={games}
        discipline={discipline}
        classId={classId}
        studentId={studentId}
        gameId={gameId}
        medal={medal}
        setters={setters}
      />
      <ReportsFilterRanges dateFrom={dateFrom} dateTo={dateTo} scoreMin={scoreMin} scoreMax={scoreMax} setters={setters} />

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
        <button
          type="button"
          className="btn btn--ghost"
          disabled={busy}
          onClick={() => onCategoryStats({ discipline, classId, gameId })}
        >
          Desempenho por categoria
        </button>
      </div>
    </form>
  );
}

/** Tabela de resultados filtrados, sempre ordenada por nome do aluno (fixo no backend). */
function ResultsTable({ results }) {
  return (
    <div className="card stack">
      <h3>Resultados</h3>
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
    </div>
  );
}

/** Desempenho por categoria: ordenado por taxa de acerto crescente (backend), pior desempenho primeiro. */
function CategoryStatsTable({ categoryStats }) {
  if (!categoryStats) return null;

  return (
    <div className="card stack">
      <h3>Desempenho por categoria</h3>
      <p className="muted small">
        Usa os filtros de disciplina, turma e partida acima. Ordenado por taxa de acerto, do pior desempenho
        para o melhor.
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
  );
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
  return (
    <section className="stack">
      <h2>Relatórios</h2>
      <ReportsFilterForm
        classes={classes}
        students={students}
        games={games}
        results={results}
        busy={busy}
        onSearch={onSearch}
        onCategoryStats={onCategoryStats}
      />
      <ResultsTable results={results} />
      <CategoryStatsTable categoryStats={categoryStats} />
    </section>
  );
}

export default ReportsPanel;
