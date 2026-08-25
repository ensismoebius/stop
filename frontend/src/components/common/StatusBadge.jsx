const LABELS = {
  WAITING: { text: "aguardando", modifier: "waiting" },
  READY: { text: "pronto", modifier: "waiting" },
  PLAYING: { text: "jogando", modifier: "playing" },
  SUBMITTED: { text: "deu stop", modifier: "submitted" },
  ELIMINATED: { text: "eliminado", modifier: "eliminated" },
  FINISHED: { text: "encerrado", modifier: "waiting" },
};

/**
 * Estado do jogador. O texto acompanha a cor para nao depender apenas
 * dela (spec 39).
 */
export function StatusBadge({ status }) {
  if (!status) return null;
  const item = LABELS[status] ?? { text: status.toLowerCase(), modifier: "waiting" };
  return <span className={`badge badge--${item.modifier}`}>{item.text}</span>;
}

export default StatusBadge;
