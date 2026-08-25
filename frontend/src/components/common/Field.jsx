/** Campo de formulario com label associado (spec 39). */
export function Field({ id, label, hint, children }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? (
        <span className="small muted" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export default Field;
