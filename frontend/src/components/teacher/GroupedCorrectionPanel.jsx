import { useEffect, useState } from "react";

/**
 * Correção agregada por resposta distinta (enhancements.md spec 17/20/21/
 * 52): em vez de 40 alunos × 8 categorias como 320 itens independentes,
 * o professor corrige cada resposta distinta uma única vez e a decisão
 * se propaga para todos os alunos daquele grupo.
 */
export function GroupedCorrectionPanel({ grid, onReviewGroup, busy }) {
  const categories = grid?.categories ?? [];
  const [activeCategoryId, setActiveCategoryId] = useState(null);

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  if (!grid) {
    return (
      <section className="card">
        <h2>Correção agregada</h2>
        <p className="muted">A correção aparece assim que a rodada for encerrada.</p>
      </section>
    );
  }

  const active = categories.find((category) => category.id === activeCategoryId) ?? categories[0];

  return (
    <section className="card stack correction">
      <div className="spread">
        <h2>
          Correção agregada — letra {grid.round?.letter} · {grid.round?.themeName}
        </h2>
      </div>

      <p className="correction__hint">
        Cada resposta distinta aparece uma única vez. Marque válida, inválida ou em branco e a
        decisão se propaga para todos os alunos que responderam igual.
      </p>

      <div className="row" role="tablist" aria-label="Categorias">
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={category.id === active?.id}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.name} ({category.groups.length})
          </button>
        ))}
      </div>

      <div className="stack">
        {(active?.groups ?? []).map((group) => (
          <div key={group.normalizedValue || "__blank__"} className="group-row spread">
            <div className="group-row__info">
              <span className="group-row__value">
                {group.value || <em className="muted">— vazio —</em>}
              </span>
              <span className="small muted">
                {group.count} aluno(s)
                {!group.startsWithLetter && group.value ? " · fora da letra" : ""}
                {group.reviewState === "MIXED" ? " · marcações divergentes" : ` · ${group.reviewState.toLowerCase()}`}
              </span>
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn--success"
                disabled={busy}
                onClick={() => onReviewGroup(group.answerIds, "VALID")}
              >
                ✓ Válida
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => onReviewGroup(group.answerIds, "INVALID")}
              >
                ✗ Inválida
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => onReviewGroup(group.answerIds, "BLANK")}
              >
                Em branco
              </button>
            </div>
          </div>
        ))}
        {active && active.groups.length === 0 ? (
          <p className="muted">Nenhuma resposta nesta categoria.</p>
        ) : null}
      </div>
    </section>
  );
}

export default GroupedCorrectionPanel;
