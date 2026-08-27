/**
 * Barreira central de sincronização do cliente (baseline: recuperação).
 *
 * TODO estado autoritativo que entra no dispositivo — push de `roomState`,
 * resposta do `requestState`, ack do `joinRoom`, fallback REST — passa por
 * uma única função (`applyAuthoritative`) que compara a posição
 * `(roomEpoch, stateVersion)` recebida contra a já adotada e DESCARTA
 * estados mais antigos sem rebater o que o cliente já tem.
 *
 * Isso torna a ordem de chegada irrelevante: um `roomState` enviado antes
 * de uma reconexão mas entregue depois dela não consegue regredir o estado
 * novo. `roomEpoch` protege entre sessões de sala (nunca maior no cliente
 * do que no servidor sábio por reset indevido); `stateVersion` ordena as
 * mudanças dentro da sessão.
 */

export const SyncStatus = Object.freeze({
  /** Sem sala configurada / hook desligado. */
  IDLE: "IDLE",
  /** Socket conectando ou fazendo join. */
  CONNECTING: "CONNECTING",
  /** A posição local bate com a última autoritativa. */
  SYNCHRONIZED: "SYNCHRONIZED",
  /** Pediu estado e aguarda a resposta. */
  RECOVERING: "RECOVERING",
  /** Posição atrás e/ou sem resposta do servidor há algum tempo. */
  DEGRADED: "DEGRADED",
  /** Sem conexão com o servidor. */
  UNREACHABLE: "UNREACHABLE",
});

/**
 * Compara duas posições `(roomEpoch, stateVersion)`.
 * Retorna -1 se `a` é mais antiga, 1 se é mais nova, 0 se são iguais.
 * Posições ausentes são tratadas como a base (0, 0).
 */
export function compareStatePosition(a = {}, b = {}) {
  const aEpoch = Number.isFinite(a.roomEpoch) ? a.roomEpoch : 0;
  const bEpoch = Number.isFinite(b.roomEpoch) ? b.roomEpoch : 0;
  const aVersion = Number.isFinite(a.stateVersion) ? a.stateVersion : 0;
  const bVersion = Number.isFinite(b.stateVersion) ? b.stateVersion : 0;
  if (aEpoch < bEpoch) return -1;
  if (aEpoch > bEpoch) return 1;
  if (aVersion < bVersion) return -1;
  if (aVersion > bVersion) return 1;
  return 0;
}

/**
 * Decide se um estado autoritativo recém-chegado pode ser adotado sobre a
 * posição corrente (`current`). Devolve `{ adopted, position }` — `adopted`
 * falso significa que o estado é antigo e deve ser descartado sem efeitos.
 *
 * Estados QUE CARREGAM versão passam pela comparação estrita de posição.
 * Estados SEM metadados de versão (push "cru", mock de ambiente) não têm
 * como ser comparados — adotar cegamente é o comportamento seguro, pois um
 * snapshot autoritativo do servidor nunca deve ser rejeitado por falta de
 * metadados; a posição corrente é preservada nesse caso.
 */
export function applyAuthoritative(current, incoming = {}) {
  const hasVersion =
    Number.isFinite(incoming.roomEpoch) || Number.isFinite(incoming.stateVersion);
  if (hasVersion) {
    if (compareStatePosition(incoming, current) < 0) {
      return {
        adopted: false,
        position: current ?? { roomEpoch: 1, stateVersion: 0 },
      };
    }
    return {
      adopted: true,
      position: {
        roomEpoch: Number.isFinite(incoming.roomEpoch)
          ? incoming.roomEpoch
          : current?.roomEpoch ?? 1,
        stateVersion: Number.isFinite(incoming.stateVersion)
          ? incoming.stateVersion
          : current?.stateVersion ?? 0,
      },
    };
  }
  return {
    adopted: true,
    position: { ...(current ?? { roomEpoch: 1, stateVersion: 0 }) },
  };
}