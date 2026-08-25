import { useState } from "react";
import Field from "../common/Field.jsx";

/** Uma turma da lista, com edição/remoção inline. */
function ClassRow({ item, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [code, setCode] = useState(item.code);

  if (editing) {
    return (
      <tr>
        <td>
          <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        </td>
        <td>
          <input className="input" value={code} onChange={(event) => setCode(event.target.value)} />
        </td>
        <td>
          <div className="row">
            <button
              type="button"
              className="btn btn--primary small"
              onClick={() => {
                onUpdate(item.id, { name: name.trim(), code: code.trim() });
                setEditing(false);
              }}
            >
              Salvar
            </button>
            <button
              type="button"
              className="btn btn--ghost small"
              onClick={() => {
                setName(item.name);
                setCode(item.code);
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{item.name}</td>
      <td>{item.code}</td>
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

/** Um aluno da lista, com edição/remoção inline. Um aluno pode cursar mais de uma turma (spec 17). */
function StudentRow({ student, classes, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [registration, setRegistration] = useState(student.registrationNumber);
  const [name, setName] = useState(student.name);
  const [active, setActive] = useState(student.active !== false);
  const [classIds, setClassIds] = useState((student.enrollments ?? []).map((e) => e.classId));

  const turmaLabel = (student.enrollments ?? [])
    .map((e) => e.class?.code ?? e.classId)
    .join(", ");

  const toggleClass = (classId) => {
    setClassIds((current) =>
      current.includes(classId) ? current.filter((id) => id !== classId) : [...current, classId],
    );
  };

  if (editing) {
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
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Ativo
          </label>
        </td>
        <td>
          <div className="row">
            <button
              type="button"
              className="btn btn--primary small"
              disabled={classIds.length === 0}
              onClick={() => {
                onUpdate(student.id, {
                  registrationNumber: registration.trim(),
                  name: name.trim(),
                  active,
                  classIds,
                });
                setEditing(false);
              }}
            >
              Salvar
            </button>
            <button
              type="button"
              className="btn btn--ghost small"
              onClick={() => {
                setRegistration(student.registrationNumber);
                setName(student.name);
                setActive(student.active !== false);
                setClassIds((student.enrollments ?? []).map((e) => e.classId));
                setEditing(false);
              }}
            >
              Cancelar
            </button>
          </div>
        </td>
      </tr>
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
          <button
            type="button"
            className="btn btn--ghost small"
            onClick={() => onDelete(student.id)}
          >
            Remover
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Uma categoria dentro de um conjunto, com edição/remoção inline. */
function CategoryRow({ category, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [required, setRequired] = useState(category.required !== false);

  if (editing) {
    return (
      <div className="row">
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} />
        <label className="row small">
          <input
            type="checkbox"
            checked={required}
            onChange={(event) => setRequired(event.target.checked)}
          />
          Obrigatória
        </label>
        <button
          type="button"
          className="btn btn--primary small"
          onClick={() => {
            onUpdate(category.id, { name: name.trim(), required });
            setEditing(false);
          }}
        >
          Salvar
        </button>
        <button
          type="button"
          className="btn btn--ghost small"
          onClick={() => {
            setName(category.name);
            setRequired(category.required !== false);
            setEditing(false);
          }}
        >
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div className="row spread">
      <span className="small">
        {category.name}
        {category.required === false ? <span className="muted"> (opcional)</span> : null}
      </span>
      <div className="row">
        <button type="button" className="btn btn--ghost small" onClick={() => setEditing(true)}>
          Editar
        </button>
        <button
          type="button"
          className="btn btn--ghost small"
          onClick={() => onDelete(category.id)}
        >
          Remover
        </button>
      </div>
    </div>
  );
}

/** Um conjunto de categorias: nome editável + categorias com CRUD próprio. */
function CategorySetCard({ set, onUpdateSet, onDeleteSet, onCreateCategory, onUpdateCategory, onDeleteCategory }) {
  const [editingSet, setEditingSet] = useState(false);
  const [setName, setSetName] = useState(set.name);
  const [newCategoryName, setNewCategoryName] = useState("");

  return (
    <div className="card stack">
      <div className="spread">
        {editingSet ? (
          <div className="row">
            <input
              className="input"
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
            />
            <button
              type="button"
              className="btn btn--primary small"
              onClick={() => {
                onUpdateSet(set.id, { name: setName.trim() });
                setEditingSet(false);
              }}
            >
              Salvar
            </button>
            <button
              type="button"
              className="btn btn--ghost small"
              onClick={() => {
                setSetName(set.name);
                setEditingSet(false);
              }}
            >
              Cancelar
            </button>
          </div>
        ) : (
          <strong>{set.name}</strong>
        )}
        <div className="row">
          {!editingSet ? (
            <button type="button" className="btn btn--ghost small" onClick={() => setEditingSet(true)}>
              Editar nome
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost small"
            onClick={() => {
              if (window.confirm(`Remover o conjunto "${set.name}" e todas as suas categorias?`)) {
                onDeleteSet(set.id);
              }
            }}
          >
            Remover conjunto
          </button>
        </div>
      </div>

      <div className="stack">
        {(set.categories ?? []).map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            onUpdate={onUpdateCategory}
            onDelete={onDeleteCategory}
          />
        ))}
      </div>

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          if (!newCategoryName.trim()) return;
          onCreateCategory({
            categorySetId: set.id,
            name: newCategoryName.trim(),
            order: (set.categories ?? []).length,
            required: true,
          });
          setNewCategoryName("");
        }}
      >
        <input
          className="input"
          placeholder="Nova categoria"
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
          aria-label={`Nova categoria para ${set.name}`}
        />
        <button type="submit" className="btn small">
          + categoria
        </button>
      </form>
    </div>
  );
}

/**
 * Configuracao: turmas, alunos e conjuntos de categorias (spec 17 e 41).
 * Todo cadastro aqui e criavel, editavel e removivel — nada fica preso a
 * um formulario "so de criacao".
 */
export function ConfigPanel({
  classes,
  students,
  categorySets,
  selectedClassId,
  onSelectClass,
  onCreateClass,
  onUpdateClass,
  onDeleteClass,
  onCreateStudent,
  onUpdateStudent,
  onBulkStudents,
  onDeleteStudent,
  onCreateCategorySet,
  onUpdateCategorySet,
  onDeleteCategorySet,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}) {
  const [className, setClassName] = useState("");
  const [classCode, setClassCode] = useState("");
  const [registration, setRegistration] = useState("");
  const [studentName, setStudentName] = useState("");
  const [bulk, setBulk] = useState("");
  const [setName, setSetName] = useState("");
  const [setCategories, setSetCategories] = useState("");

  const parseBulk = (text) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [registrationNumber, ...rest] = line.split(/[;,\t]/);
        return { registrationNumber: registrationNumber.trim(), name: rest.join(" ").trim() };
      })
      .filter((student) => student.registrationNumber && student.name);

  return (
    <div className="stack">
      <section className="card stack">
        <h2>Turmas</h2>
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            onCreateClass({ name: className.trim(), code: classCode.trim() });
            setClassName("");
            setClassCode("");
          }}
        >
          <input
            className="input"
            style={{ flex: "2 1 200px" }}
            placeholder="Nome da turma"
            value={className}
            onChange={(event) => setClassName(event.target.value)}
            required
            aria-label="Nome da turma"
          />
          <input
            className="input"
            style={{ flex: "1 1 120px" }}
            placeholder="Código"
            value={classCode}
            onChange={(event) => setClassCode(event.target.value)}
            required
            aria-label="Código da turma"
          />
          <button type="submit" className="btn btn--primary">
            Adicionar
          </button>
        </form>

        {classes.length > 0 ? (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th scope="col">Nome</th>
                  <th scope="col">Código</th>
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

      <section className="card stack">
        <h2>Alunos</h2>
        {!selectedClassId ? (
          <p className="muted">Selecione uma turma para gerenciar os alunos.</p>
        ) : (
          <>
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                onCreateStudent({
                  registrationNumber: registration.trim(),
                  name: studentName.trim(),
                  classIds: [selectedClassId],
                });
                setRegistration("");
                setStudentName("");
              }}
            >
              <input
                className="input"
                style={{ flex: "1 1 140px" }}
                placeholder="Matrícula"
                value={registration}
                onChange={(event) => setRegistration(event.target.value)}
                required
                aria-label="Matrícula"
              />
              <input
                className="input"
                style={{ flex: "2 1 200px" }}
                placeholder="Nome"
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                required
                aria-label="Nome do aluno"
              />
              <button type="submit" className="btn btn--primary">
                Adicionar
              </button>
            </form>

            <Field
              id="bulk"
              label="Importar em lote"
              hint="Uma linha por aluno, no formato matrícula;nome"
            >
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
              disabled={parseBulk(bulk).length === 0}
              onClick={() => {
                onBulkStudents({ classId: selectedClassId, students: parseBulk(bulk) });
                setBulk("");
              }}
            >
              Importar {parseBulk(bulk).length} aluno(s)
            </button>

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

      <section className="stack">
        <h2>Conjuntos de categorias</h2>
        <form
          className="stack card"
          onSubmit={(event) => {
            event.preventDefault();
            const categories = setCategories
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean)
              .map((name, index) => ({ name, order: index, required: true }));
            if (categories.length === 0) return;
            onCreateCategorySet({ name: setName.trim(), categories });
            setSetName("");
            setSetCategories("");
          }}
        >
          <Field id="set-name" label="Nome do conjunto">
            <input
              id="set-name"
              className="input"
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              placeholder="React Native — Estilos"
              required
            />
          </Field>
          <Field id="set-categories" label="Categorias" hint="Uma por linha.">
            <textarea
              id="set-categories"
              className="input"
              rows={5}
              value={setCategories}
              onChange={(event) => setSetCategories(event.target.value)}
              placeholder={"Componente\nProp\nEvento\nHook\nBiblioteca"}
            />
          </Field>
          <button type="submit" className="btn btn--primary">
            Criar conjunto
          </button>
        </form>

        <div className="stack">
          {categorySets.map((set) => (
            <CategorySetCard
              key={set.id}
              set={set}
              onUpdateSet={onUpdateCategorySet}
              onDeleteSet={onDeleteCategorySet}
              onCreateCategory={onCreateCategory}
              onUpdateCategory={onUpdateCategory}
              onDeleteCategory={onDeleteCategory}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default ConfigPanel;
