import { cloneElement, isValidElement } from "react";

/** Campo de formulario com label associado (spec 39). */
export function Field({ id, label, hint, children }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const input =
    hintId && isValidElement(children)
      ? cloneElement(children, {
          "aria-describedby": [children.props["aria-describedby"], hintId].filter(Boolean).join(" "),
        })
      : children;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {input}
      {hint ? (
        <span className="small muted" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export default Field;
