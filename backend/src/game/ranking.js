/**
 * Ranking com empates na mesma posicao (spec 42) — separado de
 * game/scoring.js: pontuacao por resposta e ordenacao de ranking sao
 * responsabilidades independentes.
 * Nao usa ordem de chegada como criterio de desempate.
 *
 * @param {{ studentId: number, name: string, total: number }[]} entries
 */
export function buildRanking(entries) {
  const sorted = [...entries].sort((left, right) => {
    if (right.total !== left.total) return right.total - left.total;
    return String(left.name ?? "").localeCompare(String(right.name ?? ""), "pt-BR");
  });

  let position = 0;
  let previousTotal = null;
  let index = 0;

  return sorted.map((entry) => {
    index += 1;
    if (previousTotal === null || entry.total !== previousTotal) {
      position = index;
      previousTotal = entry.total;
    }
    return { ...entry, position };
  });
}

export default buildRanking;
