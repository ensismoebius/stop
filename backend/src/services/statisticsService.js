import prisma from "../lib/prisma.js";
import gameService from "./gameService.js";

/** Acumula uma rodada no agregado por tema (criando a entrada quando nao existe). */
function accumulateThemeStats(byTheme, round) {
  const theme = byTheme.get(round.themeName) ?? {
    theme: round.themeName,
    rounds: 0,
    totalScore: 0,
    validAnswers: 0,
    invalidAnswers: 0,
  };
  theme.rounds += 1;
  byTheme.set(round.themeName, theme);
  return theme;
}

/** Acumula uma resposta no agregado por categoria e atualiza os totais do tema. */
function accumulateCategoryStats(byCategory, categoryById, answer, theme) {
  const category = categoryById.get(answer.roundCategoryId);
  const key = category?.name ?? `#${answer.roundCategoryId}`;
  const entry = byCategory.get(key) ?? {
    category: key,
    answers: 0,
    filled: 0,
    valid: 0,
    invalid: 0,
    totalScore: 0,
  };
  entry.answers += 1;
  if (answer.normalizedValue) entry.filled += 1;
  if (answer.score > 0) {
    entry.valid += 1;
    theme.validAnswers += 1;
  } else {
    entry.invalid += 1;
    theme.invalidAnswers += 1;
  }
  entry.totalScore += answer.score;
  theme.totalScore += answer.score;
  byCategory.set(key, entry);
}

/** Acumula a participacao de um aluno numa rodada (pontos, eliminacoes, stops). */
function accumulateStudentStats(byStudent, round, participant) {
  const student = participant.playerSession.student;
  const entry = byStudent.get(student.id) ?? {
    studentId: student.id,
    name: student.name,
    rounds: 0,
    total: 0,
    eliminations: 0,
    stops: 0,
    perRound: [],
  };
  entry.rounds += 1;
  entry.total += participant.roundScore;
  if (participant.status === "ELIMINATED") entry.eliminations += 1;
  if (round.firstStopperId === participant.playerSessionId) entry.stops += 1;
  entry.perRound.push({
    roundNumber: round.roundNumber,
    theme: round.themeName,
    letter: round.letter,
    score: participant.roundScore,
    status: participant.status,
  });
  byStudent.set(student.id, entry);
}

/** Uma passada pelas rodadas, agregando por aluno, tema e categoria (spec 43). */
function accumulateRoundStats(rounds) {
  const byStudent = new Map();
  const byTheme = new Map();
  const byCategory = new Map();
  const stopTimes = [];

  for (const round of rounds) {
    const theme = accumulateThemeStats(byTheme, round);
    const categoryById = new Map(round.categories.map((category) => [category.id, category]));

    for (const answer of round.answers) {
      accumulateCategoryStats(byCategory, categoryById, answer, theme);
    }
    for (const participant of round.participants) {
      accumulateStudentStats(byStudent, round, participant);
    }
    if (round.startedAt && round.stoppedAt) {
      stopTimes.push((round.stoppedAt.getTime() - round.startedAt.getTime()) / 1000);
    }
  }

  return { byStudent, byTheme, byCategory, stopTimes };
}

/** Agrega os totais da partida (volumes e medias) a partir das rodadas. */
function buildTotals(rounds, stopTimes) {
  const totalAnswers = rounds.reduce((sum, round) => sum + round.answers.length, 0);
  const filledAnswers = rounds.reduce(
    (sum, round) => sum + round.answers.filter((answer) => answer.normalizedValue).length,
    0,
  );
  const validAnswers = rounds.reduce(
    (sum, round) => sum + round.answers.filter((answer) => answer.score > 0).length,
    0,
  );

  return {
    rounds: rounds.length,
    answers: totalAnswers,
    filledAnswers,
    fillRate: totalAnswers === 0 ? 0 : Number((filledAnswers / totalAnswers).toFixed(3)),
    validAnswers,
    // Preenchidas mas nao pontuadas (invalida, em branco apos trim,
    // duplicada ou ainda pendente de correcao) — spec 43.
    invalidAnswers: filledAnswers - validAnswers,
    eliminations: rounds.reduce(
      (sum, round) =>
        sum + round.participants.filter((participant) => participant.status === "ELIMINATED").length,
      0,
    ),
    stops: rounds.filter((round) => round.stopReason === "STOP").length,
    timeouts: rounds.filter((round) => round.stopReason === "TIMEOUT").length,
    averageSecondsToStop:
      stopTimes.length === 0
        ? null
        : Number((stopTimes.reduce((left, right) => left + right, 0) / stopTimes.length).toFixed(1)),
  };
}

/**
 * Estatisticas da partida (spec 43).
 * Os dados brutos ja estao preservados; aqui apenas agregamos.
 */
export const statisticsService = {
  /** Estatisticas agregadas de uma partida: totais e breakdowns por aluno/tema/categoria. */
  async forGame(gameId) {
    const game = await gameService.get(gameId);

    const rounds = await prisma.round.findMany({
      where: { gameId },
      orderBy: { roundNumber: "asc" },
      include: {
        categories: true,
        participants: {
          include: { playerSession: { include: { student: { select: { id: true, name: true } } } } },
        },
        answers: true,
      },
    });

    const { byStudent, byTheme, byCategory, stopTimes } = accumulateRoundStats(rounds);

    return {
      game: { id: game.id, name: game.name, status: game.status },
      totals: buildTotals(rounds, stopTimes),
      byStudent: [...byStudent.values()].sort((left, right) => right.total - left.total),
      byTheme: [...byTheme.values()],
      byCategory: [...byCategory.values()].sort((left, right) =>
        left.category.localeCompare(right.category, "pt-BR"),
      ),
    };
  },
};

export default statisticsService;
