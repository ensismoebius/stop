/**
 * Mensagem de feedback. Usa `role="alert"` para que leitores de tela
 * anunciem erros imediatamente (spec 39).
 */
export function Alert({ kind = "error", children }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export default Alert;
