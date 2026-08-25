import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Correção agregada por resposta distinta (enhancements.md spec 17/20/21/
 * 52): em vez de 40 alunos × 8 categorias como 320 itens independentes,
 * o professor corrige cada resposta distinta uma única vez e a decisão
 * se propaga para todos os alunos daquele grupo.
 */
export function GroupedCorrectionPanel({ grid, onReviewGroup, busy }) {
  const categories = grid?.categories ?? [];
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const rowRefs = useRef(new Map());

  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  const active = categories.find((category) => category.id === activeCategoryId) ?? categories[0];

  // Respostas em branco ja saem marcadas sozinhas (normalizacao/trim no
  // servidor, spec 19-21): nao ha decisao para o professor tomar ali, entao
  // nem entram na lista de correcao nem contam para o total da aba.
  const actionable = useCallback((category) => category.groups.filter((group) => group.normalizedValue), []);
  const groups = active ? actionable(active) : [];

  /**
   * Depois de marcar um grupo, avanca sozinho para o proximo a corrigir
   * (a proxima resposta da mesma categoria ou, se acabou, a primeira aba
   * com respostas ainda pendentes) — o professor nao precisa procurar a
   * proxima resposta manualmente a cada clique.
   */
  const advanceAfterDecision = useCallback(
    (groupIndex) => {
      const next = groups[groupIndex + 1];
      if (next) {
        const node = rowRefs.current.get(next.normalizedValue || "__blank__");
        node?.focus();
        node?.scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const currentIndex = categories.findIndex((category) => category.id === active?.id);
      const nextCategory = categories
        .slice(currentIndex + 1)
        .find((category) => actionable(category).length > 0);
      if (nextCategory) setActiveCategoryId(nextCategory.id);
    },
    [active, categories, groups, actionable],
  );

  const decide = useCallback(
    (group, groupIndex, decision) => {
      onReviewGroup(group.answerIds, decision);
      advanceAfterDecision(groupIndex);
    },
    [onReviewGroup, advanceAfterDecision],
  );

  if (!grid) {
    return (
      <section className="card">
        <h2>Correção agregada</h2>
        <p className="muted">A correção aparece assim que a rodada for encerrada.</p>
      </section>
    );
  }

  return (
    <section className="card stack correction">
      <div className="spread">
        <h2>
          Correção agregada — letra {grid.round?.letter} · {grid.round?.themeName}
        </h2>
      </div>

      <p className="correction__hint">
        Cada resposta distinta aparece uma única vez. Marque válida ou inválida e a decisão se
        propaga para todos os alunos que responderam igual — respostas em branco já são
        descartadas automaticamente.
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
            {category.name} ({actionable(category).length})
          </button>
        ))}
      </div>

      <div className="stack">
        {groups.map((group, groupIndex) => (
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
                ref={(node) => {
                  const key = group.normalizedValue || "__blank__";
                  if (node) rowRefs.current.set(key, node);
                  else rowRefs.current.delete(key);
                }}
                onClick={() => decide(group, groupIndex, "VALID")}
              >
                ✓ Válida
              </button>
              <button
                type="button"
                className="btn btn--danger"
                disabled={busy}
                onClick={() => decide(group, groupIndex, "INVALID")}
              >
                ✗ Inválida
              </button>
            </div>
          </div>
        ))}
        {active && groups.length === 0 ? (
          <p className="muted">
            {active.groups.length > 0
              ? "Todas as respostas desta categoria estão em branco — nada para corrigir aqui."
              : "Nenhuma resposta nesta categoria."}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export default GroupedCorrectionPanel;
