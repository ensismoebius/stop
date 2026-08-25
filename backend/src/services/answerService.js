import prisma from "../lib/prisma.js";
import gameLock from "../lib/asyncLock.js";
import answerRepository from "../repositories/answerRepository.js";
import roundRepository, { roundParticipantRepository } from "../repositories/roundRepository.js";
import { normalizeAnswer, isFilled } from "../game/normalize.js";
import { ROUND_STATUS, PLAYER_STATUS, acceptsAnswers } from "../game/roundState.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import * as realtime from "../sockets/realtime.js";
import roundService, { lockKey } from "./roundService.js";
import viewService from "./viewService.js";

export const answerService = {
  /**
   * Grava/atualiza uma resposta.
   *
   * Todas as condicoes sao verificadas no servidor (spec 47 e 64):
   * rodada em PLAYING, dentro do tempo, jogador elegivel e categoria
   * pertencente a rodada.
   */
  async submit({ roundId, playerSessionId, roundCategoryId, value }) {
    const round = await roundRepository.findById(roundId);
    if (!round) throw notFound("Rodada não encontrada");

    if (!acceptsAnswers(round.status)) {
      throw conflict("A rodada não aceita mais respostas");
    }
    if (round.endsAt && round.endsAt.getTime() <= Date.now()) {
      // Encerra por tempo antes de rejeitar, mantendo o estado coerente.
      await roundService.handleTimeout(roundId);
      throw conflict("O tempo da rodada terminou");
    }

    const category = round.categories.find((item) => item.id === roundCategoryId);
    if (!category) throw badRequest("Categoria não pertence a esta rodada");

    const value_ = String(value ?? "").slice(0, 120).trim();
    const normalizedValue = normalizeAnswer(value_);

    // Revalida dentro da secao critica: um STOP, timeout ou eliminacao pode
    // ter fechado a rodada/o participante entre a checagem acima e agora
    // (mesma trava usada por requestStop/handleTimeout/forceStop/eliminate
    // em roundService, spec 47).
    const answer = await gameLock.run(lockKey(roundId), async () => {
      const fresh = await roundRepository.findById(roundId);
      if (!fresh || !acceptsAnswers(fresh.status)) {
        throw conflict("A rodada não aceita mais respostas");
      }
      const participant = await roundParticipantRepository.find(roundId, playerSessionId);
      if (!participant) throw forbidden("Você não participa desta rodada");
      if (participant.status === PLAYER_STATUS.ELIMINATED) {
        throw forbidden("Você foi eliminado desta rodada");
      }
      if (participant.status !== PLAYER_STATUS.PLAYING) {
        throw forbidden("Você não pode mais alterar respostas");
      }
      return answerRepository.upsert({
        roundId,
        playerSessionId,
        roundCategoryId,
        value: value_,
        normalizedValue,
      });
    });

    const progress = await answerService.progress(round, playerSessionId);
    const room = await roundService.resolveRoom(round.gameId);

    realtime.toPlayer(playerSessionId, "answerUpdated", {
      roundId,
      roundCategoryId,
      value: answer.value,
      ...progress,
    });
    // O professor recebe apenas o progresso agregado, nunca o conteudo
    // das respostas durante a rodada (spec 49).
    realtime.toTeachers(room.code, "playerProgress", {
      roundId,
      playerSessionId,
      filled: progress.filled,
      total: progress.total,
    });

    return { answer, ...progress };
  },

  /** Progresso "X / Y preenchidas" e elegibilidade para o STOP (spec 8/11). */
  async progress(round, playerSessionId) {
    const answers = await answerRepository.listByPlayer(round.id, playerSessionId);
    const filledIds = new Set(
      answers.filter((answer) => isFilled(answer.value)).map((answer) => answer.roundCategoryId),
    );
    const required = round.categories.filter((category) => category.required);
    const missing = required.filter((category) => !filledIds.has(category.id));
    return {
      filled: filledIds.size,
      total: round.categories.length,
      requiredTotal: required.length,
      canStop: missing.length === 0 && required.length > 0,
      missing: missing.map((category) => category.id),
    };
  },

  listByRound: (roundId) => answerRepository.listByRound(roundId),

  /** Correcao manual do professor (spec 18). */
  async review(answerId, reviewState) {
    const answer = await answerRepository.findById(answerId);
    if (!answer) throw notFound("Resposta não encontrada");
    if (![ROUND_STATUS.CORRECTION, ROUND_STATUS.STOPPED].includes(answer.round.status)) {
      throw conflict("A rodada não está em fase de correção");
    }
    const updated = await answerRepository.update(answerId, { reviewState });
    const room = await roundService.resolveRoom(answer.round.gameId);
    realtime.toTeachers(room.code, "answerReviewed", {
      roundId: answer.roundId,
      answerId,
      reviewState: updated.reviewState,
    });
    return updated;
  },

  /** Correcao em lote: mantem a correcao rapida com teclado (spec 18). */
  async reviewMany(reviews) {
    const ids = reviews.map((review) => review.answerId);
    const answers = await prisma.answer.findMany({
      where: { id: { in: ids } },
      include: { round: true },
    });
    if (answers.length === 0) throw notFound("Nenhuma resposta encontrada");
    const invalid = answers.find(
      (answer) => ![ROUND_STATUS.CORRECTION, ROUND_STATUS.STOPPED].includes(answer.round.status),
    );
    if (invalid) throw conflict("A rodada não está em fase de correção");

    await prisma.$transaction(
      reviews.map((review) =>
        prisma.answer.update({
          where: { id: review.answerId },
          data: { reviewState: review.reviewState },
        }),
      ),
    );

    const room = await roundService.resolveRoom(answers[0].round.gameId);
    realtime.toTeachers(room.code, "answersReviewed", {
      roundId: answers[0].roundId,
      count: reviews.length,
    });
    return { updated: reviews.length };
  },

  /** Estado completo do aluno (usado na reconexao, spec 45). */
  playerState: (playerSessionId) => viewService.playerState(playerSessionId),
};

export default answerService;
