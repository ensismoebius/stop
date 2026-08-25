/**
 * Camada de reacoes em emoji flutuando na tela (spec Kahoot-like): apenas
 * visual, nunca intercepta clique (pointer-events: none no CSS).
 */
export function EmojiBursts({ items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="emoji-bursts" aria-hidden="true">
      {items.map((item) => (
        <span
          key={item.id}
          className="emoji-bursts__item"
          style={{ left: `${8 + item.x * 84}%` }}
        >
          {item.emoji}
        </span>
      ))}
    </div>
  );
}

export default EmojiBursts;
