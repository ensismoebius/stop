import api from "../services/api.js";
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
import { GAME_KEY } from "./TeacherDashboardPage.hooks.jsx";

const TABS = [
  { key: "control", label: "Controle da partida" },
  { key: "correction", label: "Correção" },
  { key: "config", label: "Configuração" },
  { key: "categories", label: "Categorias" },
  { key: "reports", label: "Relatórios" },
];

/**
 * Painel de uma aba. Só monta o conteúdo da aba ativa (as demais abas
 * disparam requisições ao montar, então mantê-las montadas custaria
 * tráfego à toa), mas preserva a ligação `tabpanel` ↔ `tab` do padrão.
 */
export function TabPanel({ tabKey, active, children }) {
  if (tabKey !== active) return null;
  return (
    <div role="tabpanel" id={`panel-${tabKey}`} aria-labelledby={`tab-${tabKey}`} tabIndex={-1}>
      {children}
    </div>
  );
}

/** Barra de topo do painel: abas, badge de conexão/sincronização e saída. */
export function DashboardHeader({ tab, setTab, room, connected, teacher, logout, syncStats }) {
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
export function QuickActions({ game, round, busy, actions }) {
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
export function ControlTab({ catalog, gameState, realtime, busy, actions, setTab, token, guard, onRoomSettings }) {
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
export function CorrectionTab({ round, busy, grids, view, actions }) {
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
export function ConfigTab({ catalog, token, guard, stats, deleteRound, busy }) {
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
export function CategoriesTab({ categorySets, token, guard, loadBasics }) {
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
export function ReportsTab({ catalog, reportResults, setReportResults, categoryStats, setCategoryStats, token, guard, busy }) {
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
