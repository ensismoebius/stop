import { useEffect, useState } from "react";

/**
 * Correcao colaborativa (enhancements.md secoes 9-16, 23-24): o aluno
 * recebe respostas anonimas de colegas e decide válida/inválida, uma de
 * cada vez, avançando automaticamente. Nunca mostra quem respondeu.
 */
export function CollaborativeCorrection({
  reviews,
  completedIds,
  onDecide,
  deciding,
  letter,
  letterRule = "STARTS_WITH",
}) {
  const pending = reviews.filter((review) => !completedIds.has(review.reviewId));
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [reviews.length]);

  if (reviews.length === 0) {
    return (
      <section className="card stack">
        <h2>Correção colaborativa</h2>
        <p className="muted">Nenhuma resposta foi atribuída a você nesta rodada.</p>
      </section>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="notice" role="status">
        <div className="notice__title">Você terminou!</div>
        <p className="muted">Aguarde os demais jogadores concluírem a correção.</p>
      </div>
    );
  }

  const current = pending[Math.min(index, pending.length - 1)];
  const decide = (decision) => {
    onDecide(current.reviewId, decision);
    setIndex((value) => value + 1);
  };

  return (
    <section className="editor" aria-label="Corrija a resposta de um colega">
      <span className="editor__title">Corrija um colega — {current.categoryName}</span>
      {/* Quem corrige precisa saber por qual criterio julgar: "Letra A"
          sozinho nao diz se a resposta tinha de comecar com A ou so conte-la. */}
      {letter ? (
        <span className="editor__hint">
          {letterRule === "CONTAINS" ? "Contém a letra" : "Começa com a letra"} {letter}
        </span>
      ) : null}
      <p className="review__value">{current.value || <em className="muted">— em branco —</em>}</p>
      <div className="row">
        <button
          type="button"
          className="btn btn--success btn--block"
          disabled={deciding}
          onClick={() => decide("VALID")}
        >
          ✓ Válida
        </button>
        <button
          type="button"
          className="btn btn--danger btn--block"
          disabled={deciding}
          onClick={() => decide("INVALID")}
        >
          ✗ Inválida
        </button>
      </div>
      <span className="editor__hint">
        Progresso: {reviews.length - pending.length} / {reviews.length}
      </span>
    </section>
  );
}

export default CollaborativeCorrection;
