import { useState } from "react";
import Field from "../common/Field.jsx";
import MaintenancePanel from "./MaintenancePanel.jsx";

/** Linha de turma em modo de edição. */
function ClassRowEditing({ item, onSave, onCancel }) {
  const [name, setName] = useState(item.name);
  const [code, setCode] = useState(item.code);
  const [discipline, setDiscipline] = useState(item.discipline ?? "");

  return (
    <tr>
      <td>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
      </td>
      <td>
        <input className="input" value={code} onChange={(event) => setCode(event.target.value)} />
      </td>
      <td>
        <input
          className="input"
          value={discipline}
          onChange={(event) => setDiscipline(event.target.value)}
          placeholder="—"
        />
      </td>
      <td>
        <div className="row">
          <button
            type="button"
            className="btn btn--primary small"
            onClick={() =>
              onSave({ name: name.trim(), code: code.trim(), discipline: discipline.trim() || null })
            }
          >
            Salvar
          </button>
          <button type="button" className="btn btn--ghost small" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Uma turma da lista, com edição/remoção inline. */
function ClassRow({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <ClassRowEditing
        item={item}
        onSave={(data) => {
          onUpdate(item.id, data);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <tr>
      <td>{item.name}</td>
      <td>{item.code}</td>
      <td className="small muted">{item.discipline || "—"}</td>
      <td>
        <div className="row">
          <button type="button" className="btn btn--ghost small" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button
            type="button"
            className="btn btn--ghost small"
            onClick={() => {
              if (
                window.confirm(
                  `Remover a turma "${item.name}"? Isso apaga também os alunos e o histórico de partidas dela.`,
                )
              ) {
                onDelete(item.id);
              }
            }}
          >
            Remover
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Linha de aluno em modo de edição — pode cursar mais de uma turma (spec 17). */
function StudentRowEditing({ student, classes, onSave, onCancel }) {
  const [registration, setRegistration] = useState(student.registrationNumber);
  const [name, setName] = useState(student.name);
  const [active, setActive] = useState(student.active !== false);
  const [classIds, setClassIds] = useState((student.enrollments ?? []).map((e) => e.classId));

  const toggleClass = (classId) => {
    setClassIds((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    );
  };

  return (
    <tr>
      <td>
        <input
          className="input"
          value={registration}
          onChange={(event) => setRegistration(event.target.value)}
        />
      </td>
      <td>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
      </td>
      <td>
        <div className="stack small">
          {classes.map((item) => (
            <label key={item.id} className="row small">
              <input
                type="checkbox"
                checked={classIds.includes(item.id)}
                onChange={() => toggleClass(item.id)}
              />
              {item.name} ({item.code})
            </label>
          ))}
        </div>
      </td>
      <td>
        <label className="row small">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Ativo
        </label>
      </td>
      <td>
        <div className="row">
          <button
            type="button"
            className="btn btn--primary small"
            disabled={classIds.length === 0}
            onClick={() =>
              onSave({ registrationNumber: registration.trim(), name: name.trim(), active, classIds })
            }
          >
            Salvar
          </button>
          <button type="button" className="btn btn--ghost small" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Um aluno da lista, com edição/remoção inline. */
function StudentRow({ student, classes, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);

  const turmaLabel = (student.enrollments ?? []).map((e) => e.class?.code ?? e.classId).join(", ");

  if (editing) {
    return (
      <StudentRowEditing
        student={student}
        classes={classes}
        onSave={(data) => {
          onUpdate(student.id, data);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <tr>
      <td>{student.registrationNumber}</td>
      <td>{student.name}</td>
      <td className="small muted">{turmaLabel || "—"}</td>
      <td className="small muted">{student.active === false ? "Inativo" : "Ativo"}</td>
      <td>
        <div className="row">
          <button type="button" className="btn btn--ghost small" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button type="button" className="btn btn--ghost small" onClick={() => onDelete(student.id)}>
            Remover
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Formulário genérico de criação: uma linha de campos de texto + botão
 * "Adicionar", limpando os campos após o envio. `CreateClassForm` e
 * `CreateStudentForm` são a mesma forma com campos diferentes.
 */
function RowCreateForm({ fields, submitLabel, onSubmit }) {
  const empty = () => Object.fromEntries(fields.map((field) => [field.key, ""]));
  const [values, setValues] = useState(empty);

  return (
    <form
      className="row"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(Object.fromEntries(fields.map((field) => [field.key, values[field.key].trim()])));
        setValues(empty());
      }}
    >
      {fields.map((field) => (
        <input
          key={field.key}
          className="input"
          style={{ flex: field.flex }}
          placeholder={field.placeholder}
          value={values[field.key]}
          onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
          required={field.required}
          aria-label={field.ariaLabel}
        />
      ))}
      <button type="submit" className="btn btn--primary">
        {submitLabel}
      </button>
    </form>
  );
}

/** Formulário de criação de turma. */
function CreateClassForm({ onCreateClass }) {
  return (
    <RowCreateForm
      submitLabel="Adicionar"
      fields={[
        { key: "name", placeholder: "Nome da turma", ariaLabel: "Nome da turma", required: true, flex: "2 1 200px" },
        { key: "code", placeholder: "Código", ariaLabel: "Código da turma", required: true, flex: "1 1 120px" },
        { key: "discipline", placeholder: "Disciplina", ariaLabel: "Disciplina da turma", flex: "1 1 160px" },
      ]}
      onSubmit={(values) => onCreateClass({ ...values, discipline: values.discipline || null })}
    />
  );
}

/** Cadastro de turmas: criar + tabela editável + seletor da turma ativa abaixo. */
function TurmasSection({ classes, selectedClassId, onSelectClass, onCreateClass, onUpdateClass, onDeleteClass }) {
  return (
    <section className="card stack">
      <h2>Turmas</h2>
      <CreateClassForm onCreateClass={onCreateClass} />

      {classes.length > 0 ? (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Código</th>
                <th scope="col">Disciplina</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {classes.map((item) => (
                <ClassRow key={item.id} item={item} onUpdate={onUpdateClass} onDelete={onDeleteClass} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Field id="class-select" label="Turma selecionada (para gerenciar os alunos abaixo)">
        <select
          id="class-select"
          className="input"
          value={selectedClassId ?? ""}
          onChange={(event) => onSelectClass(Number(event.target.value) || null)}
        >
          <option value="">Selecione</option>
          {classes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.code})
            </option>
          ))}
        </select>
      </Field>
    </section>
  );
}

function parseBulkStudents(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [registrationNumber, ...rest] = line.split(/[;,\t]/);
      return { registrationNumber: registrationNumber.trim(), name: rest.join(" ").trim() };
    })
    .filter((student) => student.registrationNumber && student.name);
}

/** Formulário de criação de um único aluno na turma selecionada. */
function CreateStudentForm({ selectedClassId, onCreateStudent }) {
  return (
    <RowCreateForm
      submitLabel="Adicionar"
      fields={[
        { key: "registrationNumber", placeholder: "Matrícula", ariaLabel: "Matrícula", required: true, flex: "1 1 140px" },
        { key: "name", placeholder: "Nome", ariaLabel: "Nome do aluno", required: true, flex: "2 1 200px" },
      ]}
      onSubmit={(values) => onCreateStudent({ ...values, classIds: [selectedClassId] })}
    />
  );
}

/** Importação em lote (textarea "matrícula;nome" por linha) para a turma selecionada. */
function BulkImportStudents({ selectedClassId, onBulkStudents }) {
  const [bulk, setBulk] = useState("");
  const bulkStudents = parseBulkStudents(bulk);

  return (
    <>
      <Field id="bulk" label="Importar em lote" hint="Uma linha por aluno, no formato matrícula;nome">
        <textarea
          id="bulk"
          className="input"
          rows={4}
          value={bulk}
          onChange={(event) => setBulk(event.target.value)}
          placeholder={"202612345;João da Silva\n202612346;Maria Oliveira"}
        />
      </Field>
      <button
        type="button"
        className="btn"
        disabled={bulkStudents.length === 0}
        onClick={() => {
          onBulkStudents({ classId: selectedClassId, students: bulkStudents });
          setBulk("");
        }}
      >
        Importar {bulkStudents.length} aluno(s)
      </button>
    </>
  );
}

/** Cadastro de alunos da turma selecionada: criar (individual ou em lote) + tabela editável. */
function AlunosSection({ classes, students, selectedClassId, onCreateStudent, onUpdateStudent, onBulkStudents, onDeleteStudent }) {
  return (
    <section className="card stack">
      <h2>Alunos</h2>
      {!selectedClassId ? (
        <p className="muted">Selecione uma turma para gerenciar os alunos.</p>
      ) : (
        <>
          <CreateStudentForm selectedClassId={selectedClassId} onCreateStudent={onCreateStudent} />
          <BulkImportStudents selectedClassId={selectedClassId} onBulkStudents={onBulkStudents} />

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Matrícula</th>
                  <th scope="col">Nome</th>
                  <th scope="col">Turmas</th>
                  <th scope="col">Status</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    classes={classes}
                    onUpdate={onUpdateStudent}
                    onDelete={onDeleteStudent}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Configuracao: turmas e alunos (spec 17). Conjuntos de categorias tem tela
 * própria (CategorySetsPanel) — cadastro que muda com pouca frequência,
 * separado do fluxo do dia a dia de turmas/alunos.
 * Todo cadastro aqui e criavel, editavel e removivel — nada fica preso a
 * um formulario "so de criacao".
 */
export function ConfigPanel({
  classes,
  students,
  selectedClassId,
  onSelectClass,
  onCreateClass,
  onUpdateClass,
  onDeleteClass,
  onCreateStudent,
  onUpdateStudent,
  onBulkStudents,
  onDeleteStudent,
  onExportBackup,
  onRestoreBackup,
  onEraseHistory,
  busy,
}) {
  return (
    <div className="stack">
      <TurmasSection
        classes={classes}
        selectedClassId={selectedClassId}
        onSelectClass={onSelectClass}
        onCreateClass={onCreateClass}
        onUpdateClass={onUpdateClass}
        onDeleteClass={onDeleteClass}
      />
      <AlunosSection
        classes={classes}
        students={students}
        selectedClassId={selectedClassId}
        onCreateStudent={onCreateStudent}
        onUpdateStudent={onUpdateStudent}
        onBulkStudents={onBulkStudents}
        onDeleteStudent={onDeleteStudent}
      />
      <MaintenancePanel
        onExportBackup={onExportBackup}
        onRestoreBackup={onRestoreBackup}
        onEraseHistory={onEraseHistory}
        busy={busy}
      />
    </div>
  );
}

export default ConfigPanel;
