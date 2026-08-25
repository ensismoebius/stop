import prisma from "../lib/prisma.js";
import gameService from "./gameService.js";

/**
 * Estatisticas da partida (spec 43).
 * Os dados brutos ja estao preservados; aqui apenas agregamos.
 */
export const statisticsService = {
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

    const byStudent = new Map();
    const byTheme = new Map();
    const byCategory = new Map();
    const stopTimes = [];

    for (const round of rounds) {
      const theme = byTheme.get(round.themeName) ?? {
        theme: round.themeName,
        rounds: 0,
        totalScore: 0,
        validAnswers: 0,
        invalidAnswers: 0,
      };
      theme.rounds += 1;

      const categoryById = new Map(round.categories.map((category) => [category.id, category]));

      for (const answer of round.answers) {
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

      for (const participant of round.participants) {
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

      if (round.startedAt && round.stoppedAt) {
        stopTimes.push((round.stoppedAt.getTime() - round.startedAt.getTime()) / 1000);
      }

      byTheme.set(round.themeName, theme);
    }

    const totalAnswers = rounds.reduce((sum, round) => sum + round.answers.length, 0);
    const filledAnswers = rounds.reduce(
      (sum, round) => sum + round.answers.filter((answer) => answer.normalizedValue).length,
      0,
    );

    return {
      game: { id: game.id, name: game.name, status: game.status },
      totals: {
        rounds: rounds.length,
        answers: totalAnswers,
        filledAnswers,
        fillRate: totalAnswers === 0 ? 0 : Number((filledAnswers / totalAnswers).toFixed(3)),
        validAnswers: rounds.reduce(
          (sum, round) => sum + round.answers.filter((answer) => answer.score > 0).length,
          0,
        ),
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
            : Number((stopTimes.reduce((a, b) => a + b, 0) / stopTimes.length).toFixed(1)),
      },
      byStudent: [...byStudent.values()].sort((a, b) => b.total - a.total),
      byTheme: [...byTheme.values()],
      byCategory: [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category, "pt-BR")),
    };
  },
};

export default statisticsService;
