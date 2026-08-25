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
import ConnectionBadge from "../components/common/ConnectionBadge.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import Alert from "../components/common/Alert.jsx";

const TABS = [
  { key: "control", label: "Controle da partida" },
  { key: "correction", label: "Correção" },
  { key: "config", label: "Configuração" },
  { key: "categories", label: "Categorias" },
];

const GAME_KEY = "stop:teacher:game";

export function TeacherDashboardPage() {
  const { token, authenticated, checking, teacher, logout } = useAuth();
  const { sync, now } = useServerClock();
  const emojiBursts = useEmojiBursts();

  // O painel do professor nunca fica em tela cheia (o professor precisa
  // alternar entre janelas/abas livremente) — sai se algo deixou o
  // navegador nesse estado antes de chegar aqui (ex.: tocou na home antes
  // de navegar para /teacher, o que ja disparou o fullscreen automatico).
  useEffect(() => {
    const active = document.fullscreenElement ?? document.webkitFullscreenElement;
    if (!active) return;
    const exit = document.exitFullscreen ?? document.webkitExitFullscreen;
    exit?.call(document)?.catch?.(() => {});
  }, []);

  const [tab, setTab] = useState("control");
  const [classes, setClasses] = useState([]);
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(null);
  const [room, setRoom] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [categorySets, setCategorySets] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [usedLetters, setUsedLetters] = useState([]);
  const [grid, setGrid] = useState(null);
  const [groupedGrid, setGroupedGrid] = useState(null);
  const [correctionView, setCorrectionView] = useState("grouped");
  const [collabProgress, setCollabProgress] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const guard = useCallback(async (task) => {
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
  }, []);

  // Cadastros basicos ---------------------------------------------------
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
  }, [token, loadBasics]);

  useEffect(() => {
    if (!token || !selectedClassId) {
      setStudents([]);
      return;
    }
    api
      .listStudents(token, selectedClassId)
      .then(setStudents)
      .catch((listError) => setError(listError.message));
  }, [token, selectedClassId]);

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

  // Estado em tempo real ------------------------------------------------
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
    }),
    [loadGrid, reloadGame, sync, emojiBursts],
  );

  const { connected, state } = useRoomSocket({
    roomCode: room?.code,
    role: "teacher",
    adminToken: token,
    handlers,
    enabled: Boolean(room?.code && token),
  });

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

  useEffect(() => {
    if (round && ["STOPPED", "CORRECTION", "SCORED"].includes(round.status) && !grid) {
      loadGrid(round.id);
    }
  }, [round?.id, round?.status, grid, loadGrid]);

  useEffect(() => {
    if (!token || !game) return;
    if (tab !== "config" && round?.status !== "SCORED") return;
    Promise.all([api.gameStatistics(token, game.id), api.gameHistory(token, game.id)])
      .then(([stats, hist]) => {
        setStatistics(stats);
        setHistory(hist);
      })
      .catch((statsError) => setError(statsError.message));
  }, [token, game?.id, round?.status, tab]);

  // Acoes ---------------------------------------------------------------
  const createGame = (payload) =>
    guard(async () => {
      const created = await api.createGame(token, payload);
      const full = await api.getGame(token, created.id);
      setGame(full);
      await loadBasics();
    });

  const createRoom = () =>
    guard(async () => {
      const created = await api.createRoom(token, game.id);
      setRoom(created);
      await reloadGame();
    });

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

  /** Encerra a partida e volta para a selecao/criacao de outra. */
  const finishGame = () =>
    guard(async () => {
      await api.finishGame(token, game.id);
      setGame(null);
      setGrid(null);
      setGroupedGrid(null);
      window.localStorage.removeItem(GAME_KEY);
      await loadBasics();
    });

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

  /** Marca todas as respostas de um grupo agregado de uma vez (spec 18). */
  const reviewGroup = (answerIds, reviewState) =>
    guard(async () => {
      await api.reviewAnswers(
        token,
        answerIds.map((answerId) => ({ answerId, reviewState })),
      );
      await loadGrid(round.id);
    });

  if (checking) return <div className="container">Carregando...</div>;
  if (!authenticated) return <TeacherLoginPage />;

  return (
    <div className="teacher">
      <header className="topbar">
        <span className="topbar__brand">STOP · PROFESSOR</span>
        <nav className="tabs" role="tablist" aria-label="Seções do painel">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              className="tab"
              aria-selected={tab === item.key}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="row small">
          {room ? <ConnectionBadge connected={connected} /> : null}
          <span className="muted">{teacher?.name}</span>
          <button type="button" className="btn btn--ghost" onClick={logout}>
            Sair
          </button>
        </div>
      </header>

      <div className="container">
        <Alert kind="error">{error}</Alert>
      </div>

      {tab === "control" ? (
        <div className="panel panel--control">
          <div className="stack">
            {/*
              Barra de acoes rapidas: "finalizar rodada" e "finalizar
              partida" sempre alcancaveis nesta aba, sem depender da fase
              atual do RoundControl nem de rolar ate o card da sala.
            */}
            {game ? (
              <div className="card row spread">
                <span className="small muted">Ações rápidas</span>
                <div className="row">
                  {round && round.status === "PLAYING" ? (
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={busy}
                      onClick={stopRound}
                    >
                      Finalizar rodada
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Encerrar esta partida e começar outra?")) finishGame();
                    }}
                  >
                    Finalizar partida
                  </button>
                </div>
              </div>
            ) : null}
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
                onCreateRound={createRound}
                onDrawLetter={drawLetter}
                onStart={startRound}
                onStop={stopRound}
                onCancel={cancelRound}
                collabProgress={collabProgress}
                onFinishCollaborativeCorrection={finishCollaborativeCorrection}
                onScore={scoreRound}
                onNextRound={nextRound}
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
              onCreateGame={createGame}
              onSelectGame={async (selected) => {
                if (!selected) {
                  setGame(null);
                  window.localStorage.removeItem(GAME_KEY);
                  return;
                }
                setGame(await api.getGame(token, selected.id));
              }}
              onCreateRoom={createRoom}
            />
          </div>

          <div className="stack">
            <PlayerMonitor
              players={view?.players ?? []}
              requiredCount={view?.requiredCount ?? 0}
            />
            <RankingPanel ranking={view?.ranking ?? []} />
          </div>
        </div>
      ) : null}

      {tab === "correction" ? (
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
            <GroupedCorrectionPanel grid={groupedGrid} onReviewGroup={reviewGroup} busy={busy} />
          ) : (
            <CorrectionPanel grid={grid} onReview={review} busy={busy} />
          )}
          {round?.status === "CORRECTION" || round?.status === "STOPPED" ? (
            <button type="button" className="btn btn--success" disabled={busy} onClick={scoreRound}>
              Pontuar rodada e atualizar ranking
            </button>
          ) : null}
          <RankingPanel ranking={view?.ranking ?? []} />
        </div>
      ) : null}

      {tab === "config" ? (
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
          />
          <StatisticsPanel statistics={statistics} history={history} onDeleteRound={deleteRound} busy={busy} />
        </div>
      ) : null}

      {tab === "categories" ? (
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
      ) : null}

      <EmojiBursts items={emojiBursts.items} />
    </div>
  );
}

export default TeacherDashboardPage;
