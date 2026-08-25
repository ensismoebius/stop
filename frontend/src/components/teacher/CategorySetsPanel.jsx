import { useState } from "react";
import Field from "../common/Field.jsx";

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
 * Gerenciamento dos conjuntos de categorias (spec 17 e 41), em tela própria
 * separada de turmas/alunos: cadastro que muda com pouca frequência e é
 * reaproveitado entre partidas, não faz parte do fluxo do dia a dia.
 */
export function CategorySetsPanel({
  categorySets,
  onCreateCategorySet,
  onUpdateCategorySet,
  onDeleteCategorySet,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}) {
  const [setName, setSetName] = useState("");
  const [setCategories, setSetCategories] = useState("");

  return (
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
  );
}

export default CategorySetsPanel;
