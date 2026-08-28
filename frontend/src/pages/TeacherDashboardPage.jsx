import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api.js";
import { useAuth } from "../state/AuthContext.jsx";
import useRoomSocket from "../hooks/useRoomSocket.js";
import { useCountdown, useServerClock } from "../hooks/useServerClock.js";
import useEmojiBursts from "../hooks/useEmojiBursts.js";
import TeacherLoginPage from "./TeacherLoginPage.jsx";
import RoomControl from "../components/teacher/RoomControl.jsx";
import RoundControl from "../components/teacher/RoundControl.jsx";
import PlayerMonitor from "../components/teacher/PlayerMonitor.jsx";
import CorrectionPanel from "../components/teacher/CorrectionPanel.jsx";
import GroupedCorrectionPanel from "../components/teacher/GroupedCorrectionPanel.jsx";
import RankingPanel from "../components/teacher/RankingPanel.jsx";
import StatisticsPanel from "../components/teacher/StatisticsPanel.jsx";
import ConfigPanel from "../components/teacher/ConfigPanel.jsx";
import CategorySetsPanel from "../components/teacher/CategorySetsPanel.jsx";
import ReportsPanel from "../components/teacher/ReportsPanel.jsx";
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import Alert from "../components/common/Alert.jsx";

const TABS = [
  { key: "control", label: "Controle da partida" },
  { key: "correction", label: "Correção" },
  { key: "config", label: "Configuração" },
  { key: "categories", label: "Categorias" },
  { key: "reports", label: "Relatórios" },
];

const GAME_KEY = "stop:teacher:game";

/** Cadastros básicos (turmas/partidas/conjuntos de categorias/alunos da turma selecionada) e a lista completa de alunos usada pelo filtro de relatórios. */
function useDashboardCatalog(token, tab, setError) {
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
function useDashboardGame(token) {
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
function useDashboardGrids(token) {
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
function useDashboardSocket({ token, room, handlers }) {
  return useRoomSocket({
    roomCode: room?.code,
    role: "teacher",
    adminToken: token,
    handlers,
    enabled: Boolean(room?.code && token),
  });
}

/** Estado por REST (fallback antes do handshake) + derivação de `round`/contador a partir do estado ao vivo. */
function useDashboardView({ token, room, state, sync, now }) {
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
function useDashboardRealtime({ token, room, sync, now, emojiBursts, reloadGame, setError, setTab, loadGrid, setGrid, setGroupedGrid }) {
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

  const { connected, state } = useDashboardSocket({ token, room, handlers });
  const { view, round, seconds } = useDashboardView({ token, room, state, sync, now });

  // Toda projeção de estado completa (publish de troca de rodada, REST de
  // fallback) traz os `settings` autoritativos — a linha de base; o evento
  // leve apenas sobrepõe entre um publish e outro.
  useEffect(() => {
    if (view?.settings) {
      setLiveSettings((prev) => ({ ...(prev ?? {}), ...view.settings }));
    }
  }, [view?.settings]);

  return { connected, view, round, seconds, collabProgress, setCollabProgress, liveSettings, setLiveSettings };
}

/** Estatísticas/histórico da partida atual — recarregados na aba "Configuração" ou assim que uma rodada é pontuada. */
function useDashboardStats({ token, game, tab, roundStatus, setError }) {
  const [statistics, setStatistics] = useState(null);
  const [history, setHistory] = useState(null);

  useEffect(() => {
    if (!token || !game) return;
    if (tab !== "config" && roundStatus !== "SCORED") return;
    Promise.all([api.gameStatistics(token, game.id), api.gameHistory(token, game.id)])
      .then(([stats, hist]) => {
        setStatistics(stats);
        setHistory(hist);
      })
      .catch((statsError) => setError(statsError.message));
  }, [token, game?.id, roundStatus, tab, setError]);

  return { statistics, setStatistics, history, setHistory };
}

/** Ações de partida/sala: criar, selecionar, abrir sala, encerrar. Sempre por `guard`, exceto `selectGame` (ver nota). */
function buildGameLifecycleActions({
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
  setStatistics,
  setHistory,
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
      // Sem isso, "Histórico das rodadas" (aba Configuração) continua
      // mostrando as rodadas da partida anterior, com "Remover" ativo —
      // clicar chama api.deleteRound(token, game.id, ...) com game=null
      // e falha silenciosamente (o erro cai dentro do catch do guard()
      // dos outros handlers, mas aqui nem chega a isso: so nao apaga nada).
      setStatistics(null);
      setHistory(null);
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
function buildRoundFlowActions({ token, guard, game, round, usedLetters, setUsedLetters, setGrid, setGroupedGrid, setCollabProgress, setTab, reloadGame }) {
  const createRound = (payload) =>
    guard(async () => {
      await api.createRound(token, { ...payload, gameId: game.id });
      setGrid(null);
      setGroupedGrid(null);
      await reloadGame();
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

/** Ações de resultado: pontuar, avançar para a próxima rodada, apagar uma rodada do histórico. */
function buildRoundResultActions({ token, guard, game, round, setGrid, setGroupedGrid, setTab, reloadGame, setStatistics, setHistory }) {
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

  const deleteRound = (roundId) =>
    guard(async () => {
      await api.deleteRound(token, game.id, roundId);
      const [stats, hist] = await Promise.all([
        api.gameStatistics(token, game.id),
        api.gameHistory(token, game.id),
      ]);
      setStatistics(stats);
      setHistory(hist);
      await reloadGame();
    });

  return { scoreRound, nextRound, deleteRound };
}

/** Ações de correção: marcar uma resposta, ou um grupo agregado inteiro de uma vez (spec 18). */
function buildAnswerReviewActions({ token, guard, round, setGrid, loadGrid }) {
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
function useGuard(setBusy, setError) {
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
function buildDashboardActions(deps) {
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
function useExitFullscreenOnMount() {
  useEffect(() => {
    const active = document.fullscreenElement ?? document.webkitFullscreenElement;
    if (!active) return;
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    exit?.call(document)?.catch?.(() => {});
  }, []);
}

/** Carrega a grade de correção assim que a rodada entra em STOPPED/CORRECTION/SCORED e ainda não há grade. */
function useGridAutoload(round, grid, loadGrid) {
  useEffect(() => {
    if (round && ["STOPPED", "CORRECTION", "SCORED"].includes(round.status) && !grid) {
      loadGrid(round.id);
    }
  }, [round?.id, round?.status, grid, loadGrid]);
}

/**
 * Painel de uma aba. Só monta o conteúdo da aba ativa (as demais abas
 * disparam requisições ao montar, então mantê-las montadas custaria
 * tráfego à toa), mas preserva a ligação `tabpanel` ↔ `tab` do padrão.
 */
function TabPanel({ tabKey, active, children }) {
  if (tabKey !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${tabKey}`} aria-labelledby={`tab-${tabKey}`} tabIndex={-1}>
      {children}
    </div>
  );
}

function DashboardHeader({ tab, setTab, room, connected, teacher, logout, syncStats }) {
  const syncing = syncStats && syncStats.expected > 0 && syncStats.synchronized < syncStats.expected;
  return (
    <header className="topbar">
      <span className="topbar__brand">STOP · PROFESSOR</span>
      {/*
        Padrao de abas da WAI-ARIA: alem de `role`/`aria-selected`, cada aba
        aponta para o painel que controla e a navegacao por teclado usa as
        setas com "roving tabindex" (so a aba ativa e tabulavel). Sem isso a
        estrutura anunciava "aba" para leitores de tela sem entregar o
        comportamento que o padrao promete.
      */}
      <nav
        className="tabs"
        role="tablist"
        aria-label="Seções do painel"
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
          if (!step) return;
          event.preventDefault();
          const index = TABS.findIndex((item) => item.key === tab);
          setTab(TABS[(index + step + TABS.length) % TABS.length].key);
        }}
      >
        {TABS.map((item) => {
          const selected = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`tab-${item.key}`}
              aria-controls={`panel-${item.key}`}
              className="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="row small">
        {room ? <ConnectionBadge connected={connected} /> : null}
        {room && syncing ? (
          <span
            className="badge badge--eliminated"
            role="status"
            title={`${syncStats.stale ?? 0} alunos defasados do estado autoritativo`}
          >
            Sincronizando {syncStats.synchronized}/{syncStats.expected}
          </span>
        ) : room && syncStats ? (
          <span className="badge badge--playing" role="status">
            Sincronizado {syncStats.synchronized}/{syncStats.expected}
          </span>
        ) : null}
        <span className="muted">{teacher?.name}</span>
        <button type="button" className="btn btn--ghost" onClick={logout}>
          Sair
        </button>
      </div>
    </header>
  );
}

/**
 * Barra de acoes rapidas: "finalizar rodada" e "finalizar partida" sempre
 * alcancaveis na aba de controle, sem depender da fase atual do RoundControl
 * nem de rolar ate o card da sala.
 */
function QuickActions({ game, round, busy, actions }) {
  if (!game) return null;

  // Partida encerrada nao tem mais acao de jogo possivel: "Finalizar
  // partida" some (clicar de novo nao faz sentido) e da lugar ao unico
  // caminho que resta — comecar uma partida nova.
  const finished = game.status === "FINISHED";
  const playing = Boolean(round) && round.status === "PLAYING";

  return (
    <div className="card gamebar" aria-label="Ações rápidas">
      {/* Estado do sistema sempre visivel: o professor nunca precisa
          deduzir em que fase a partida esta a partir dos botoes. */}
      <div className="gamebar__status">
        <span className="small muted">Ações rápidas</span>
        <div className="gamebar__title">
          <strong>{game.name}</strong>
          <span className={`badge ${finished ? "badge--finished" : "badge--playing"}`}>
            {finished ? "Partida encerrada" : playing ? "Rodada em andamento" : "Partida aberta"}
          </span>
        </div>
      </div>

      <div className="gamebar__actions">
        {finished ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => actions.selectGame(null)}
          >
            Nova partida
          </button>
        ) : (
          <>
            {playing ? (
              <button type="button" className="btn btn--danger" disabled={busy} onClick={actions.stopRound}>
                Finalizar rodada
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Encerrar esta partida e começar outra?")) actions.finishGame();
              }}
            >
              Finalizar partida
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** Aba "Controle da partida": ações rápidas, RoundControl, RoomControl, monitor de jogadores e ranking ao vivo. */
function ControlTab({ catalog, gameState, realtime, busy, actions, setTab, token, guard, onRoomSettings }) {
  const { game, room, qrCode, usedLetters } = gameState;
  const { round, seconds, view, collabProgress, liveSettings } = realtime;
  const { classes, games, categorySets } = catalog;
  return (
    <div className="panel panel--control">
      <div className="stack">
        <QuickActions game={game} round={round} busy={busy} actions={actions} />
        {/*
          RoundControl vem antes da sala: e o painel de acao (criar/
          sortear/iniciar/encerrar rodada) que o professor usa a cada
          rodada. RoomControl (QR code, codigo da sala) e configuracao
          feita uma vez so — deixa-la depois evita empurrar o botao de
          acao para fora da tela em telas menores.
        */}
        {room ? (
          <RoundControl
            round={round}
            categorySets={categorySets}
            usedLetters={usedLetters}
            seconds={seconds}
            busy={busy}
            disabled={!room}
            onCreateRound={actions.createRound}
            onDrawLetter={actions.drawLetter}
            onStart={actions.startRound}
            onStop={actions.stopRound}
            onCancel={actions.cancelRound}
            collabProgress={collabProgress}
            onFinishCollaborativeCorrection={actions.finishCollaborativeCorrection}
            onScore={actions.scoreRound}
            onNextRound={actions.nextRound}
            onGoToCorrection={() => setTab("correction")}
          />
        ) : null}
        <RoomControl
          classes={classes}
          games={games}
          game={game}
          room={room}
          qrCode={qrCode}
          busy={busy}
          settings={liveSettings ?? view?.settings}
          onToggleHidePoints={(hidePoints) => onRoomSettings({ hidePoints })}
          onVolumeChange={(volume) => onRoomSettings({ volume })}
          onToggleMuted={(muted) => onRoomSettings({ muted })}
          onCreateGame={actions.createGame}
          onSelectGame={actions.selectGame}
          onCreateRoom={actions.createRoom}
        />
      </div>

      <div className="stack">
        <PlayerMonitor players={view?.players ?? []} requiredCount={view?.requiredCount ?? 0} />
        <RankingPanel ranking={view?.ranking ?? []} />
      </div>
    </div>
  );
}

/** Aba "Correção": alterna entre grade agregada por resposta e grade por aluno, mais pontuar/ranking. */
function CorrectionTab({ round, busy, grids, view, actions }) {
  const { grid, groupedGrid, correctionView, setCorrectionView } = grids;
  return (
    <div className="panel">
      <div className="row small">
        <button
          type="button"
          className="tab"
          role="tab"
          aria-selected={correctionView === "grouped"}
          onClick={() => setCorrectionView("grouped")}
        >
          Agregada por resposta
        </button>
        <button
          type="button"
          className="tab"
          role="tab"
          aria-selected={correctionView === "grid"}
          onClick={() => setCorrectionView("grid")}
        >
          Grade por aluno
        </button>
      </div>
      {correctionView === "grouped" ? (
        <GroupedCorrectionPanel grid={groupedGrid} onReviewGroup={actions.reviewGroup} busy={busy} />
      ) : (
        <CorrectionPanel grid={grid} onReview={actions.review} busy={busy} />
      )}
      {round?.status === "CORRECTION" || round?.status === "STOPPED" ? (
        <button type="button" className="btn btn--success" disabled={busy} onClick={actions.scoreRound}>
          Pontuar rodada e atualizar ranking
        </button>
      ) : null}
      <RankingPanel ranking={view?.ranking ?? []} />
    </div>
  );
}

/** Aba "Configuração": turmas/alunos (ConfigPanel) e estatísticas/histórico da partida atual. */
function ConfigTab({ catalog, token, guard, stats, deleteRound, busy }) {
  const { classes, students, selectedClassId, setSelectedClassId, loadBasics, setStudents } = catalog;
  const { statistics, history } = stats;
  return (
    <div className="panel">
      <ConfigPanel
        classes={classes}
        students={students}
        selectedClassId={selectedClassId}
        onSelectClass={setSelectedClassId}
        onCreateClass={(payload) =>
          guard(async () => {
            await api.createClass(token, payload);
            await loadBasics();
          })
        }
        onUpdateClass={(id, payload) =>
          guard(async () => {
            await api.updateClass(token, id, payload);
            await loadBasics();
          })
        }
        onDeleteClass={(id) =>
          guard(async () => {
            await api.deleteClass(token, id);
            if (id === selectedClassId) setSelectedClassId(null);
            await loadBasics();
          })
        }
        onCreateStudent={(payload) =>
          guard(async () => {
            await api.createStudent(token, payload);
            setStudents(await api.listStudents(token, selectedClassId));
          })
        }
        onUpdateStudent={(id, payload) =>
          guard(async () => {
            await api.updateStudent(token, id, payload);
            setStudents(await api.listStudents(token, selectedClassId));
          })
        }
        onBulkStudents={(payload) =>
          guard(async () => {
            await api.bulkStudents(token, payload);
            setStudents(await api.listStudents(token, selectedClassId));
          })
        }
        onDeleteStudent={(id) =>
          guard(async () => {
            await api.deleteStudent(token, id);
            setStudents(await api.listStudents(token, selectedClassId));
          })
        }
        onExportBackup={() => guard(async () => api.exportBackup(token))}
        onEraseHistory={() =>
          guard(async () => {
            const result = await api.eraseHistory(token);
            // O jogo/sala selecionados no painel podem ter sido apagados
            // junto — recarregar e o jeito mais simples de garantir que
            // nada na tela continue apontando para uma partida que não
            // existe mais (o próprio localStorage se autocorrige ao
            // tentar buscar um jogo que já não existe, ver useDashboardGame).
            window.localStorage.removeItem(GAME_KEY);
            setTimeout(() => window.location.reload(), 900);
            return result;
          })
        }
        onRestoreBackup={(backup) =>
          guard(async () => {
            await api.restoreBackup(token, backup);
            // Restaurar troca até as contas de professor — não há estado
            // local que sobreviva a isso de forma confiável, então a
            // saída limpa é recarregar a página inteira.
            window.localStorage.removeItem(GAME_KEY);
            setTimeout(() => window.location.reload(), 900);
            return true;
          })
        }
        busy={busy}
      />
      <StatisticsPanel statistics={statistics} history={history} onDeleteRound={deleteRound} busy={busy} />
    </div>
  );
}

/** Aba "Categorias": CRUD de conjuntos de categorias/categorias. */
function CategoriesTab({ categorySets, token, guard, loadBasics }) {
  return (
    <div className="panel">
      <CategorySetsPanel
        categorySets={categorySets}
        onCreateCategorySet={(payload) =>
          guard(async () => {
            await api.createCategorySet(token, payload);
            await loadBasics();
          })
        }
        onUpdateCategorySet={(id, payload) =>
          guard(async () => {
            await api.updateCategorySet(token, id, payload);
            await loadBasics();
          })
        }
        onDeleteCategorySet={(id) =>
          guard(async () => {
            await api.deleteCategorySet(token, id);
            await loadBasics();
          })
        }
        onCreateCategory={(payload) =>
          guard(async () => {
            await api.createCategory(token, payload);
            await loadBasics();
          })
        }
        onUpdateCategory={(id, payload) =>
          guard(async () => {
            await api.updateCategory(token, id, payload);
            await loadBasics();
          })
        }
        onDeleteCategory={(id) =>
          guard(async () => {
            await api.deleteCategory(token, id);
            await loadBasics();
          })
        }
      />
    </div>
  );
}

/** Aba "Relatórios": busca filtrada de resultados e desempenho por categoria. */
function ReportsTab({ catalog, reportResults, setReportResults, categoryStats, setCategoryStats, token, guard, busy }) {
  return (
    <div className="panel">
      <ReportsPanel
        classes={catalog.classes}
        students={catalog.allStudents}
        games={catalog.games}
        results={reportResults}
        categoryStats={categoryStats}
        busy={busy}
        onSearch={(filters) =>
          guard(async () => {
            setReportResults(await api.searchReports(token, filters));
          })
        }
        onCategoryStats={(filters) =>
          guard(async () => {
            setCategoryStats(await api.categoryStats(token, filters));
          })
        }
      />
    </div>
  );
}

export function TeacherDashboardPage() {
  const { token, authenticated, checking, teacher, logout } = useAuth();
  const { sync, now } = useServerClock();
  const emojiBursts = useEmojiBursts();
  useExitFullscreenOnMount();

  const [tab, setTab] = useState("control");
  const [reportResults, setReportResults] = useState([]);
  const [categoryStats, setCategoryStats] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const guard = useGuard(setBusy, setError);

  const catalog = useDashboardCatalog(token, tab, setError);
  const gameState = useDashboardGame(token);
  const grids = useDashboardGrids(token);
  const realtime = useDashboardRealtime({ token, sync, now, emojiBursts, setError, setTab, ...gameState, ...grids });
  const stats = useDashboardStats({ token, game: gameState.game, tab, roundStatus: realtime.round?.status, setError });
  useGridAutoload(realtime.round, grids.grid, grids.loadGrid);

  const actions = buildDashboardActions({ token, guard, setTab, loadBasics: catalog.loadBasics, ...gameState, ...grids, ...realtime, ...stats });

  if (checking) return <div className="container">Carregando...</div>;
  if (!authenticated) return <TeacherLoginPage />;

  return (
    <div className="teacher">
      <DashboardHeader tab={tab} setTab={setTab} room={gameState.room} connected={realtime.connected} teacher={teacher} logout={logout} syncStats={realtime.view?.syncStats} />

      <div className="container">
        <Alert kind="error">{error}</Alert>
      </div>

      {/* Cada aba renderiza dentro do seu proprio `tabpanel`, ligado de
          volta a aba que o controla (`aria-labelledby`). */}
      <TabPanel tabKey="control" active={tab}>
        <ControlTab catalog={catalog} gameState={gameState} realtime={realtime} busy={busy} actions={actions} setTab={setTab} token={token} guard={guard} onRoomSettings={actions.updateRoomSettings} />
      </TabPanel>

      <TabPanel tabKey="correction" active={tab}>
        <CorrectionTab round={realtime.round} busy={busy} grids={grids} view={realtime.view} actions={actions} />
      </TabPanel>

      <TabPanel tabKey="config" active={tab}>
        <ConfigTab catalog={catalog} token={token} guard={guard} stats={stats} deleteRound={actions.deleteRound} busy={busy} />
      </TabPanel>

      <TabPanel tabKey="categories" active={tab}>
        <CategoriesTab categorySets={catalog.categorySets} token={token} guard={guard} loadBasics={catalog.loadBasics} />
      </TabPanel>

      <TabPanel tabKey="reports" active={tab}>
        <ReportsTab
          catalog={catalog}
          reportResults={reportResults}
          setReportResults={setReportResults}
          categoryStats={categoryStats}
          setCategoryStats={setCategoryStats}
          token={token}
          guard={guard}
          busy={busy}
        />
      </TabPanel>

      <EmojiBursts items={emojiBursts.items} />
    </div>
  );
}

export default TeacherDashboardPage;
