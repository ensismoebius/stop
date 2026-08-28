/**
 * Fila de exclusao mutua por chave.
 *
 * As secoes criticas do jogo (STOP, timeout, troca de estado da rodada)
 * precisam ser serializadas dentro do processo. A garantia final de
 * atomicidade continua sendo do banco (updateMany condicional), mas o lock
 * evita trabalho duplicado e efeitos colaterais fora de ordem (spec 12 e 13).
 */
export class AsyncLock {
  #queues = new Map();

  /** Serializa `task` por chave: a proxima chamada so roda apos a atual terminar. */
  async run(key, task) {
    const previous = this.#queues.get(key) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    this.#queues.set(
      key,
      previous.then(() => current),
    );

    try {
      await previous;
      return await task();
    } finally {
      release();
    }
  }
}

export const gameLock = new AsyncLock();

export default gameLock;
