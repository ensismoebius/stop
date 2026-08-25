/** "7 / 10 preenchidas" (spec 8). */
export function ProgressIndicator({ filled, total }) {
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <div className="progress">
      <div className="progress__label">
        <span>
          {filled} / {total} preenchidas
        </span>
        <span>{percent}%</span>
      </div>
      <div
        className="progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={filled}
        aria-label="Categorias preenchidas"
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default ProgressIndicator;
