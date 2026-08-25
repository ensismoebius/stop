/**
 * Distribuicao de respostas para a correcao colaborativa entre alunos
 * (enhancements.md secoes 9-14). Funcao pura: sem I/O, testavel isolada.
 *
 * Regras:
 *  - um aluno nunca recebe a propria resposta para corrigir (secao 11);
 *  - nenhum par (avaliador, resposta) se repete (secao 14);
 *  - cada avaliador recebe ate `count` respostas distintas;
 *  - a carga por resposta fica aproximadamente equilibrada (secao 13) —
 *    nao e garantida perfeitamente igual, apenas balanceada na medida do
 *    possivel dado o tamanho da turma.
 */

/** Fisher-Yates: nao muta o array recebido. */
function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * @param {{ playerSessionId: number|string, answers: { id: number|string }[] }[]} participants
 *   Participantes elegiveis (nao eliminados) com suas respostas preenchidas
 *   nesta rodada (recomenda-se excluir respostas em branco: nao ha o que
 *   avaliar em uma resposta vazia).
 * @param {number} count Quantidade alvo de avaliacoes por aluno.
 * @returns {Map<number|string, (number|string)[]>} avaliador -> answerIds atribuidos.
 */
export function assignReviews(participants, count) {
  const assignments = new Map(participants.map((p) => [p.playerSessionId, []]));
  if (count <= 0 || participants.length < 2) return assignments;

  const pool = participants.flatMap((p) =>
    p.answers.map((answer) => ({ answerId: answer.id, authorId: p.playerSessionId })),
  );
  if (pool.length === 0) return assignments;

  const load = new Map(pool.map((entry) => [entry.answerId, 0]));
  const graderOrder = shuffled(participants.map((p) => p.playerSessionId));

  for (const graderId of graderOrder) {
    const assignedHere = assignments.get(graderId);
    const assignedAnswerIds = new Set();

    // Reordena a cada avaliador (embaralha + ordena por carga atual) para
    // que o resultado nao dependa so da ordem original do pool — favorece
    // as respostas menos avaliadas ate agora, mantendo o balanceamento.
    const candidates = shuffled(pool.filter((entry) => entry.authorId !== graderId));
    candidates.sort((a, b) => load.get(a.answerId) - load.get(b.answerId));

    for (const entry of candidates) {
      if (assignedHere.length >= count) break;
      if (assignedAnswerIds.has(entry.answerId)) continue;
      assignedAnswerIds.add(entry.answerId);
      assignedHere.push(entry.answerId);
      load.set(entry.answerId, load.get(entry.answerId) + 1);
    }
  }

  return assignments;
}

export default assignReviews;
