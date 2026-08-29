import { useState } from "react";
import { useAuth } from "../state/AuthContext.jsx";
import { useServerClock } from "../hooks/useServerClock.js";
import useEmojiBursts from "../hooks/useEmojiBursts.js";
import TeacherLoginPage from "./TeacherLoginPage.jsx";
import EmojiBursts from "../components/common/EmojiBursts.jsx";
import Alert from "../components/common/Alert.jsx";
import {
  useDashboardCatalog,
  useDashboardGame,
  useDashboardGrids,
  useDashboardRealtime,
  useGuard,
  useGridAutoload,
  useExitFullscreenOnMount,
  buildDashboardActions,
} from "./TeacherDashboardPage.hooks.jsx";
import {
  TabPanel,
  DashboardHeader,
  ControlTab,
  CorrectionTab,
  ConfigTab,
  CategoriesTab,
  ReportsTab,
} from "./TeacherDashboardPage.tabs.jsx";

/**
 * O painel do professor: estado por REST + tempo real, abas de controle,
 * correção, configuração, categorias e relatórios.
 */
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
  useGridAutoload(realtime.round, grids.grid, grids.loadGrid);

  const actions = buildDashboardActions({ token, guard, setTab, loadBasics: catalog.loadBasics, ...gameState, ...grids, ...realtime });

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
        <ConfigTab catalog={catalog} token={token} guard={guard} busy={busy} setError={setError} game={gameState.game} onRefreshDashboardGame={gameState.reloadGame} />
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
