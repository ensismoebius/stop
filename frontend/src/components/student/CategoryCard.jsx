/**
 * Uma categoria da rodada.
 *
 * Preenchida e vazia se distinguem por borda, simbolo e texto — nunca
 * apenas pela cor (spec 9 e 39).
 */
export function CategoryCard({ category, value, current, disabled, onSelect }) {
  const filled = Boolean(value && value.trim());
  const classes = [
    "category",
    filled ? "category--filled" : "category--empty",
    current ? "category--current" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li>
      <button
        type="button"
        className={classes}
        onClick={() => onSelect(category.id)}
        disabled={disabled}
        aria-current={current ? "true" : undefined}
        aria-label={`${category.name}: ${filled ? value : "sem resposta"}`}
      >
        <span>
          <span className="category__name">{category.name}</span>
          <span className="category__answer">{filled ? value : "toque para responder"}</span>
        </span>
        <span className="category__check" aria-hidden="true">
          {filled ? "✓" : "○"}
        </span>
      </button>
    </li>
  );
}

export default CategoryCard;
