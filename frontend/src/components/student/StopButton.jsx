/**
 * Botao STOP (spec 11).
 *
 * O bloqueio aqui e apenas feedback imediato: a regra de elegibilidade
 * definitiva esta no servidor (spec 56 e 64).
 */
export function StopButton({ disabled, filled, total, onClick }) {
  const missing = Math.max(0, total - filled);
  return (
    <button type="button" className="stop-button" disabled={disabled} onClick={onClick}>
      🛑 STOP
      <span className="stop-button__hint">
        {disabled
          ? missing > 0
            ? `faltam ${missing} de ${total}`
            : "indisponível"
          : `${filled} / ${total} preenchidas`}
      </span>
    </button>
  );
}

export default StopButton;
