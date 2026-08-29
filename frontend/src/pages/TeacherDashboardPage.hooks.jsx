import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api.js";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useCountdown } from "../hooks/useServerClock.js";
import { WATCHDOG_MAX_MS, WATCHDOG_JITTER_MS, WATCHDOG_STALE_MS } from "./StudentGamePage.hooks.jsx";

export const GAME_KEY = "stop:teacher:game";

/** Cadastros básicos (turmas/partidas/conjuntos de categorias/alunos da turma selecionada) e a lista completa de alunos usada pelo filtro de relatórios. */
export function useDashboardCatalog(token, tab, setError) {
  const [classes, setClasses] = useState([]);
  const [games, setGames] = useState([]);
  const [categorySets, setCategorySets] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [allStudents, setAllStudents] = useState([]);

  const loadBasics = useCallback(async () => {
    if (!token) return;
    const [classList, gameList, sets] = await Promise.all([
      api.listClasses(token),
      api.listGames(token),
      api.listCategorySets(token),
    ]);
    setClasses(classList);
    setGames(gameList);
    setCategorySets(sets);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadBasics().catch((loadError) => setError(loadError.message));
  }, [token, loadBasics, setError]);

  useEffect(() => {
    if (!token || !selectedClassId) {
      setStudents([]);
      return;
    }
    api
      .listStudents(token, selectedClassId)
      .then(setStudents)
      .catch((listError) => setError(listError.message));
  }, [token, selectedClassId, setError]);

  // Lista completa de alunos (todas as turmas) para o filtro de relatórios —
  // carregada só quando a aba é aberta, não no load inicial do dashboard.
  useEffect(() => {
    if (!token || tab !== "reports") return;
    api.listStudents(token).then(setAllStudents).catch((listError) => setError(listError.message));
  }, [token, tab, setError]);

  return {
    classes,
    games,
    categorySets,
    students,
    setStudents,
    selectedClassId,
    setSelectedClassId,
    allStudents,
    loadBasics,
  };
}

/** Partida/sala/QR-code/histórico de letras selecionados, restaurados entre recargas de página via localStorage. */
export function useDashboardGame(token) {
  const [game, setGame] = useState(null);
  const [room, setRoom] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [usedLetters, setUsedLetters] = useState([]);

  // Restaura a partida selecionada entre recargas de pagina.
  useEffect(() => {
    if (!token || game) return;
    const stored = Number(window.localStorage.getItem(GAME_KEY));
    if (!stored) return;
    api
      .getGame(token, stored)
      .then((data) => setGame(data))
      .catch(() => window.localStorage.removeItem(GAME_KEY));
  }, [token, game]);

  useEffect(() => {
    if (!game) {
      setRoom(null);
      setQrCode(null);
      return;
    }
    window.localStorage.setItem(GAME_KEY, String(game.id));
    const existing = game.rooms?.find((item) => item.status === "OPEN") ?? game.rooms?.[0] ?? null;
    setRoom(existing);
  }, [game]);

  useEffect(() => {
    if (!token || !room) return;
    api.roomQrCode(token, room.code).then(setQrCode).catch(() => setQrCode(null));
  }, [token, room]);

  // Historico de letras da partida, visivel para o professor (spec 16).
  useEffect(() => {
    if (!token || !game) {
      setUsedLetters([]);
      return;
    }
    api
      .usedLetters(token, game.id)
      .then((data) => setUsedLetters(data.usedLetters ?? []))
      .catch(() => setUsedLetters([]));
  }, [token, game?.id]);

  const reloadGame = useCallback(async () => {
    if (!token || !game) return;
    const [fresh, letters] = await Promise.all([
      api.getGame(token, game.id),
      api.usedLetters(token, game.id),
    ]);
    setGame(fresh);
    setUsedLetters(letters.usedLetters ?? []);
  }, [token, game?.id]);

  return { game, setGame, room, setRoom, qrCode, usedLetters, setUsedLetters, reloadGame };
}

/** Grades de correção (flat + agregada) da rodada atual, mais a aba usada para exibi-las. */
export function useDashboardGrids(token) {
  const [grid, setGrid] = useState(null);
  const [groupedGrid, setGroupedGrid] = useState(null);
  const [correctionView, setCorrectionView] = useState("grouped");

  const loadGrid = useCallback(
    async (roundId) => {
      if (!token || !roundId) return;
      try {
        const [flat, grouped] = await Promise.all([
          api.correctionGrid(token, roundId),
          api.groupedCorrectionGrid(token, roundId),
        ]);
        setGrid(flat);
        setGroupedGrid(grouped);
      } catch {
        setGrid(null);
        setGroupedGrid(null);
      }
    },
    [token],
  );

  return { grid, setGrid, groupedGrid, setGroupedGrid, correctionView, setCorrectionView, loadGrid };
}

/** Socket do professor para a sala atual (thin wrapper só para manter `useDashboardRealtime` curto). */
export function useDashboardSocket({ token, room, handlers }) {
  return useRoomSocket({
    roomCode: room?.code,
    role: "teacher",
    adminToken: token,
    handlers,
    enabled: Boolean(room?.code && token),
  });
}

/**
 * Watchdog de recuperação do painel do professor (tempo-real.md #1/#3, spec 45).
 *
 * O painel vive do push `roomState` + `refresh`; num socket meia-aberta
 * (router barato berrando) nenhum dos dois responde — o heartbeat (6s)
 * também trava no silêncio e o estado fica congelado até recarregar a
 * página. Igual ao watchdog do aluno: sem estado autoritativo por
 * `WATCHDOG_STALE_MS`, pede `refresh` (requestState versionado, ~zero custo
 * quando CURRENT); em falha, backoff + reconexão limpa — o `joinRoom` do
 * reconectar reentrega o estado completo e o painel avança sozinho.
 */
export function useTeacherWatchdog({ connected, state, refresh, socket }) {
  const lastStateAtRef = useRef(Date.now());
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const socketRef = useRef(socket);
  socketRef.current = socket;

  useEffect(() => {
    if (state) lastStateAtRef.current = Date.now();
  }, [state]);

  useEffect(() => {
    if (!connected || !state || !socketRef.current) return undefined;
    let timer;
    let backoffMs = WATCHDOG_STALE_MS;
    const schedule = () => {
      const jitter = Math.floor(Math.random() * (WATCHDOG_JITTER_MS + 1));
      const delay = Math.min(backoffMs + jitter, WATCHDOG_MAX_MS);
      timer = setTimeout(run, delay);
    };
    const run = async () => {
      if (Date.now() - lastStateAtRef.current < WATCHDOG_STALE_MS) {
        schedule();
        return;
      }
      const response = await refreshRef.current();
      const instance = socketRef.current;
      if (response?.ok) {
        backoffMs = WATCHDOG_STALE_MS;
      } else {
        backoffMs = Math.min(backoffMs * 2, WATCHDOG_MAX_MS);
        if (instance?.connected) {
          instance.disconnect();
          instance.connect();
        }
      }
      schedule();
    };
    schedule();
    return () => clearTimeout(timer);
  }, [connected, state]);

  return null;
}

/** Estado por REST (fallback antes do handshake) + derivação de `round`/contador a partir do estado ao vivo. */
export function useDashboardView({ token, room, state, sync, now }) {
  // Estado inicial por REST: o painel fica utilizavel imediatamente apos um
  // reload, sem esperar o handshake do WebSocket.
  const [fallback, setFallback] = useState(null);
  useEffect(() => {
    if (!token || !room?.code) return;
    api
      .teacherState(token, room.code)
      .then(setFallback)
      .catch(() => setFallback(null));
  }, [token, room?.code]);

  const view = state ?? fallback;

  useEffect(() => {
    if (view?.serverTime) sync(view.serverTime);
  }, [view?.serverTime, sync]);

  const round = view?.round ?? null;
  const seconds = useCountdown(round?.status === "PLAYING" ? round?.endsAt : null, now);

  return { view, round, seconds };
}

/** Estado em tempo real da rodada atual: socket, progresso da correção colaborativa e derivação de fase/contador. */
export function useDashboardRealtime({ token, room, sync, now, emojiBursts, reloadGame, setError, setTab, loadGrid, setGrid, setGroupedGrid }) {
  const [collabProgress, setCollabProgress] = useState(null);

  // Ajustes da sala, atualizados AO VIVO pelo evento leve `roomSettingsChanged`
  // (o slider/painel do professor reflete imediatamente, sem esperar o próximo
  // publish completo que trocar de rodada). A linha de base vem de `view.settings`
  // via efeito abaixo; `setLiveSettings` é declarado antes dos handlers (que o
  // usam) para evitar acesso no temporal dead zone.
  const [liveSettings, setLiveSettings] = useState(null);

  const handlers = useMemo(
    () => ({
      onState: (state) => sync(state?.serverTime),
      onError: (payload) => setError(payload.message),
      roundStopped: (payload) => {
        loadGrid(payload.roundId);
        setTab("correction");
      },
      roundTimedOut: (payload) => {
        loadGrid(payload.roundId);
        setTab("correction");
      },
      collaborativeCorrectionStarted: (payload) => setCollabProgress(payload),
      collaborativeCorrectionProgress: (payload) => setCollabProgress(payload),
      collaborativeCorrectionFinished: () => setCollabProgress(null),
      correctionStarted: (payload) => {
        setCollabProgress(null);
        loadGrid(payload.roundId);
      },
      answerReviewed: (payload) => loadGrid(payload.roundId),
      answersReviewed: (payload) => loadGrid(payload.roundId),
      letterSelected: () => reloadGame(),
      scoreUpdated: () => reloadGame(),
      nextRound: () => {
        setGrid(null);
        setGroupedGrid(null);
        setCollabProgress(null);
        setTab("control");
        reloadGame();
      },
      roundCancelled: () => {
        setGrid(null);
        setGroupedGrid(null);
        setCollabProgress(null);
        setTab("control");
        reloadGame();
      },
      emojiReceived: (payload) => emojiBursts.push(payload.emoji),
      // Ajustes da sala vindos de outro painel/mediacao — refletir na hora.
      roomSettingsChanged: (settings) => setLiveSettings?.((prev) => ({ ...prev, ...settings })),
    }),
    [loadGrid, reloadGame, sync, emojiBursts, setTab, setError, setLiveSettings],
  );

  const { socket, connected, state, refresh } = useDashboardSocket({ token, room, handlers });
  const { view, round, seconds } = useDashboardView({ token, room, state, sync, now });
  useTeacherWatchdog({ connected, state, refresh, socket });

  // Toda projeção de estado completa (publish de troca de rodada, REST de
  // fallback) traz os `settings` autoritativos — a linha de base; o evento
  // leve apenas sobrepõe entre um publish e outro.
  useEffect(() => {
    if (view?.settings) {
      setLiveSettings((prev) => ({ ...(prev ?? {}), ...view.settings }));
    }
  }, [view?.settings]);

  return { connected, view, round, seconds, collabProgress, setCollabProgress, liveSettings, setLiveSettings, refresh };
}

/**
 * Estatísticas/histórico de uma partida escolhida na aba "Configuração"
 * (spec 43). Vive dentro da própria aba — cada jogo é um record separado e
 * o "Resumo" só faz sentido para a partida selecionada, não para alguma
 * deduzida do painel inteiro. `defaultGameId` é a partida ativa do painel,
 * usada apenas como padrão ao abrir a aba; trocar a seleção aqui não
 * perturba a partida em andamento (controle/QR-code/sala continuam intactos).
 */
export function useConfigStats({ token, defaultGameId, setError }) {
  const [gameId, setGameId] = useState(defaultGameId ?? null);
  const [statistics, setStatistics] = useState(null);
  const [history, setHistory] = useState(null);

  const refresh = useCallback(async () => {
    if (!token || !gameId) {
      setStatistics(null);
      setHistory(null);
      return;
    }
    const [stats, hist] = await Promise.all([
      api.gameStatistics(token, gameId),
      api.gameHistory(token, gameId),
    ]);
    setStatistics(stats);
    setHistory(hist);
  }, [token, gameId]);

  useEffect(() => {
    setStatistics(null);
    setHistory(null);
    if (!token || !gameId) return;
    refresh().catch((loadError) => setError(loadError.message));
  }, [token, gameId, refresh, setError]);

  return { gameId, setGameId, statistics, history, refresh };
}

/** Ações de partida/sala: criar, selecionar, abrir sala, encerrar. Sempre por `guard`, exceto `selectGame` (ver nota). */
export function buildGameLifecycleActions({
  token,
  guard,
  game,
  room,
  setGame,
  setRoom,
  loadBasics,
  reloadGame,
  setGrid,
  setGroupedGrid,
}) {
  const createGame = (payload) =>
    guard(async () => {
      const created = await api.createGame(token, payload);
      const full = await api.getGame(token, created.id);
      setGame(full);
      await loadBasics();
    });

  // Este handler nunca foi passado por `guard` (sem busy/erro) — preservado
  // assim para nao mudar o comportamento existente ao extrair a acao.
  const selectGame = async (selected) => {
    if (!selected) {
      setGame(null);
      window.localStorage.removeItem(GAME_KEY);
      return;
    }
    setGame(await api.getGame(token, selected.id));
  };

  const createRoom = () =>
    guard(async () => {
      const created = await api.createRoom(token, game.id);
      setRoom(created);
      await reloadGame();
    });

  /**
   * Encerra a partida, mas mantem ela selecionada — o professor acabou de
   * finalizar e normalmente quer revisar o historico/estatisticas/ranking
   * final na hora, no proprio painel. So refaz o `game` (status agora
   * FINISHED) para refletir o novo estado; estatisticas e historico
   * continuam validos (mesmo game.id) e nao precisam ser recarregados.
   * Zerar tudo aqui — como antes — apagava esses dados da tela mesmo sem
   * nada ter sido apagado no banco, e como uma partida FINISHED some da
   * lista "continuar partida existente" (RoomControl.jsx), nao havia mais
   * como voltar a ve-los. Trocar de partida explicitamente (botao
   * "Trocar", que chama selectGame(null)) continua limpando normalmente.
   */
  const finishGame = () =>
    guard(async () => {
      await api.finishGame(token, game.id);
      setGame(await api.getGame(token, game.id));
      await loadBasics();
    });

  // Ajuste de apresentação AO VIVO (ex.: ocultar pontos no ranking). O
  // backend já dispara o broadcast — aqui só refletimos no painel.
  const updateRoomSettings = (patch) =>
    room
      ? guard(async () => {
          await api.updateRoomSettings(room.code, patch, token);
          await reloadGame();
        })
      : Promise.resolve();

  return { createGame, selectGame, createRoom, finishGame, updateRoomSettings };
}

/** Ações de fluxo da rodada: criar, sortear letra, iniciar/encerrar/cancelar, fechar correção colaborativa. */
export function buildRoundFlowActions({ token, guard, game, round, usedLetters, setUsedLetters, setGrid, setGroupedGrid, setCollabProgress, setTab, reloadGame, refresh }) {
  const createRound = (payload) =>
    guard(async () => {
      await api.createRound(token, { ...payload, gameId: game.id });
      setGrid(null);
      setGroupedGrid(null);
      await reloadGame();
      // A rodada é criada no banco na hora, mas o broadcast de `roomState`
      // que carrega o round CREATED para este painel pode se perder quando a
      // criação acontece logo após abrir a sala (socket ainda se juntando ao
      // canal do professor). Puxar o estado autoritativo aqui garante que o
      // painel saia da fase "tema" e mostre o "Sortear letra" mesmo se a
      // difusão não chegou. É um no-op seguro se o socket ainda não estiver
      // pronto (o join, quando completar, entrega o round).
      refresh?.();
    });

  const drawLetter = () =>
    guard(async () => {
      const result = await api.drawLetter(token, round.id);
      setUsedLetters(result.usedLetters ?? usedLetters);
    });

  const startRound = () => guard(() => api.startRound(token, round.id));
  const stopRound = () => guard(() => api.stopRound(token, round.id));

  /** Fecha a correção colaborativa antecipadamente (spec 38-39). */
  const finishCollaborativeCorrection = () =>
    guard(async () => {
      await api.finishCollaborativeCorrection(token, round.id);
      setCollabProgress(null);
    });

  /** Descarta a rodada atual sem pontuar e libera a criacao de outra. */
  const cancelRound = () =>
    guard(async () => {
      await api.cancelRound(token, round.id);
      setGrid(null);
      setGroupedGrid(null);
      setTab("control");
      await reloadGame();
    });

  return { createRound, drawLetter, startRound, stopRound, finishCollaborativeCorrection, cancelRound };
}

/** Ações de resultado: pontuar e avançar para a próxima rodada. A remoção de
 * uma rodada do histórico é da aba "Configuração" (apaga da partida que está
 * sendo exibida lá, não necessariamente da partida ativa do painel). */
export function buildRoundResultActions({ token, guard, game, round, setGrid, setGroupedGrid, setTab, reloadGame }) {
  const scoreRound = () =>
    guard(async () => {
      await api.scoreRound(token, round.id);
      await reloadGame();
      setTab("control");
    });

  const nextRound = (payload) =>
    guard(async () => {
      await api.nextRound(token, game.id, payload);
      setGrid(null);
      setGroupedGrid(null);
      setTab("control");
      await reloadGame();
    });

  return { scoreRound, nextRound };
}

/** Ações de correção: marcar uma resposta, ou um grupo agregado inteiro de uma vez (spec 18). */
export function buildAnswerReviewActions({ token, guard, round, setGrid, loadGrid }) {
  const review = (answerId, reviewState) =>
    guard(async () => {
      await api.reviewAnswer(token, answerId, reviewState);
      setGrid((current) => {
        if (!current) return current;
        return {
          ...current,
          players: current.players.map((player) => ({
            ...player,
            answers: player.answers.map((answer) =>
              answer.id === answerId ? { ...answer, reviewState } : answer,
            ),
          })),
        };
      });
    });

  const reviewGroup = (answerIds, reviewState) =>
    guard(async () => {
      await api.reviewAnswers(
        token,
        answerIds.map((answerId) => ({ answerId, reviewState })),
      );
      await loadGrid(round.id);
    });

  return { review, reviewGroup };
}

/** Envolve uma ação assíncrona com o indicador de ocupado e a mensagem de erro compartilhados pelo painel. */
export function useGuard(setBusy, setError) {
  return useCallback(
    async (task) => {
      setBusy(true);
      setError(null);
      try {
        return await task();
      } catch (taskError) {
        setError(taskError.message ?? "Falha na operação");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [setBusy, setError],
  );
}

/** Junta os quatro grupos de ações do painel em um único objeto para as abas consumirem. */
export function buildDashboardActions(deps) {
  return {
    ...buildGameLifecycleActions(deps),
    ...buildRoundFlowActions(deps),
    ...buildRoundResultActions(deps),
    ...buildAnswerReviewActions(deps),
  };
}

/**
 * O painel do professor nunca fica em tela cheia (o professor precisa
 * alternar entre janelas/abas livremente) — sai se algo deixou o navegador
 * nesse estado antes de chegar aqui (ex.: tocou na home antes de navegar
 * para /teacher, o que ja disparou o fullscreen automatico).
 */
export function useExitFullscreenOnMount() {
  useEffect(() => {
    const active = document.fullscreenElement ?? document.webkitFullscreenElement;
    if (!active) return;
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    exit?.call(document)?.catch?.(() => {});
  }, []);
}

/** Carrega a grade de correção assim que a rodada entra em STOPPED/CORRECTION/SCORED e ainda não há grade. */
export function useGridAutoload(round, grid, loadGrid) {
  useEffect(() => {
    if (round && ["STOPPED", "CORRECTION", "SCORED"].includes(round.status) && !grid) {
      loadGrid(round.id);
    }
  }, [round?.id, round?.status, grid, loadGrid]);
}
