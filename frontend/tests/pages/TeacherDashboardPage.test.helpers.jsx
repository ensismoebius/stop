import { useState } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import TeacherDashboardPage from "../../src/pages/TeacherDashboardPage.jsx";
import { AuthProvider } from "../../src/state/AuthContext.jsx";

// Mocks compartilhados: declarados via vi.hoisted para ficarem disponíveis
// antes dos vi.mock abaixo (que referenciam esses spy nos factories).
const { api } = vi.hoisted(() => ({
  api: {
    me: vi.fn(),
    login: vi.fn(),
    listClasses: vi.fn(),
    listGames: vi.fn(),
    listCategorySets: vi.fn(),
    listStudents: vi.fn(),
    getGame: vi.fn(),
    roomQrCode: vi.fn(),
    usedLetters: vi.fn(),
    teacherState: vi.fn(),
    gameStatistics: vi.fn(),
    gameHistory: vi.fn(),
    createGame: vi.fn(),
    createRoom: vi.fn(),
    finishGame: vi.fn(),
    createRound: vi.fn(),
    drawLetter: vi.fn(),
    startRound: vi.fn(),
    stopRound: vi.fn(),
    finishCollaborativeCorrection: vi.fn(),
    cancelRound: vi.fn(),
    scoreRound: vi.fn(),
    nextRound: vi.fn(),
    deleteRound: vi.fn(),
    reviewAnswer: vi.fn(),
    reviewAnswers: vi.fn(),
    correctionGrid: vi.fn(),
    groupedCorrectionGrid: vi.fn(),
    createClass: vi.fn(),
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
    createStudent: vi.fn(),
    updateStudent: vi.fn(),
    bulkStudents: vi.fn(),
    deleteStudent: vi.fn(),
    createCategorySet: vi.fn(),
    updateCategorySet: vi.fn(),
    deleteCategorySet: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    searchReports: vi.fn(),
    categoryStats: vi.fn(),
    exportBackup: vi.fn(),
    restoreBackup: vi.fn(),
    eraseHistory: vi.fn(),
  },
}));

vi.mock("../../src/services/api.js", () => ({ default: api }));

// --- useRoomSocket: real-stateful stand-in seeded per test, capturing
// `handlers` so tests can fire socket events directly. `lastSetState` is
// captured too because — mirroring the real hook — `handlers.onState` is
// only a side-channel notification (sync the clock, etc.); the actual
// `state`/`round` the page renders comes from the hook's own `setState`,
// called separately whenever a live "roomState" push arrives.
let lastHandlers = null;
let lastSetState = null;
let seed = { connected: false, state: null };

/**
 * Define o estado inicial do socket usado no próximo render (via useRoomSocket).
 */
export function seedSocket(next) {
  seed = next;
}

/**
 * Simula um push ao vivo de `roomState`: atualiza `state` E notifica
 * handlers.onState, igual ao socket real.
 */
export function pushRoomState(payload) {
  lastSetState(payload);
  lastHandlers.onState?.(payload);
}

/**
 * Implementação real-stateful substituta do hook useRoomSocket: expõe o
 * socket, o estado conectado e o estado React da página, capturando os
 * handlers e o setState para os testes dispararem os eventos diretamente.
 */
export function useRoomSocketImpl(config) {
  lastHandlers = config.handlers;
  const [state, setState] = useState(seed.state);
  lastSetState = setState;
  return { socket: null, connected: seed.connected, state, setState, refresh: vi.fn(() => Promise.resolve({ ok: true })) };
}
vi.mock("../../src/hooks/useRoomSocket.js", () => ({
  default: (config) => useRoomSocketImpl(config),
}));

export const useCountdownMock = vi.fn(() => null);
vi.mock("../../src/hooks/useServerClock.js", () => ({
  useServerClock: () => ({ sync: vi.fn(), now: () => Date.now() }),
  useCountdown: (...args) => useCountdownMock(...args),
}));

// --- components/teacher/* and common widgets: out of scope here (owned/
// tested separately) — stubbed as markers exposing the props received and
// buttons to fire each callback, so this page's own wiring/derivation is
// what's under test, not the subcomponents' internal rendering.
vi.mock("../../src/components/teacher/RoomControl.jsx", () => ({
  default: (props) => (
    <div data-testid="room-control">
      room-control:{props.game?.name ?? "no-game"}:{props.room?.code ?? "no-room"}:{props.games.length}
      <button type="button" onClick={() => props.onCreateGame({ name: "Nova", classId: 1 })}>
        rc-create-game
      </button>
      <button type="button" onClick={() => props.onSelectGame({ id: 5, name: "Jogo 5" })}>
        rc-select-game
      </button>
      <button type="button" onClick={() => props.onSelectGame(null)}>
        rc-clear-game
      </button>
      <button type="button" onClick={() => props.onCreateRoom()}>
        rc-create-room
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/RoundControl.jsx", () => ({
  default: (props) => (
    <div data-testid="round-control">
      round-control:{props.round?.status ?? "no-round"}:{props.disabled ? "disabled" : "enabled"}:
      {props.usedLetters.length}
      <button type="button" onClick={() => props.onCreateRound({ categorySetId: 1, durationSeconds: 60 })}>
        rc-create-round
      </button>
      <button type="button" onClick={() => props.onDrawLetter()}>
        rc-draw-letter
      </button>
      <button type="button" onClick={() => props.onStart()}>
        rc-start
      </button>
      <button type="button" onClick={() => props.onStop()}>
        rc-stop
      </button>
      <button type="button" onClick={() => props.onCancel()}>
        rc-cancel
      </button>
      <button type="button" onClick={() => props.onFinishCollaborativeCorrection()}>
        rc-finish-collab
      </button>
      <button type="button" onClick={() => props.onScore()}>
        rc-score
      </button>
      <button type="button" onClick={() => props.onNextRound({ categorySetId: 2, durationSeconds: 90 })}>
        rc-next-round
      </button>
      <button type="button" onClick={() => props.onGoToCorrection()}>
        rc-goto-correction
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/PlayerMonitor.jsx", () => ({
  default: (props) => (
    <div data-testid="player-monitor">
      player-monitor:{props.players.length}:{props.requiredCount}
    </div>
  ),
}));
vi.mock("../../src/components/teacher/RankingPanel.jsx", () => ({
  default: (props) => <div data-testid="ranking-panel">ranking-panel:{props.ranking.length}</div>,
}));
vi.mock("../../src/components/teacher/CorrectionPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="correction-panel">
      correction-panel:{props.grid ? "has-grid" : "no-grid"}
      <button type="button" onClick={() => props.onReview("a1", "VALID")}>
        cp-review
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/GroupedCorrectionPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="grouped-correction-panel">
      grouped-panel:{props.grid ? "has-grid" : "no-grid"}
      <button type="button" onClick={() => props.onReviewGroup(["a1", "a2"], "INVALID")}>
        gcp-review-group
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/StatisticsPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="statistics-panel">
      statistics:{props.statistics ? "has-stats" : "no-stats"}
      <button type="button" onClick={() => props.onDeleteRound("round-1")}>
        sp-delete-round
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/ConfigPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="config-panel">
      config-panel:{props.classes.length}:{props.students.length}:{props.selectedClassId ?? "none"}
      <button type="button" onClick={() => props.onSelectClass(3)}>
        cfg-select-class
      </button>
      <button type="button" onClick={() => props.onCreateClass({ name: "Turma" })}>
        cfg-create-class
      </button>
      <button type="button" onClick={() => props.onUpdateClass(3, { name: "Nova" })}>
        cfg-update-class
      </button>
      <button type="button" onClick={() => props.onDeleteClass(3)}>
        cfg-delete-class
      </button>
      <button type="button" onClick={() => props.onCreateStudent({ name: "Aluno" })}>
        cfg-create-student
      </button>
      <button type="button" onClick={() => props.onUpdateStudent(9, { name: "Novo" })}>
        cfg-update-student
      </button>
      <button type="button" onClick={() => props.onBulkStudents({ students: [] })}>
        cfg-bulk-students
      </button>
      <button type="button" onClick={() => props.onDeleteStudent(9)}>
        cfg-delete-student
      </button>
      <button type="button" onClick={() => props.onExportBackup()}>
        cfg-export-backup
      </button>
      <button type="button" onClick={() => props.onRestoreBackup({ version: 1, data: {} })}>
        cfg-restore-backup
      </button>
      <button type="button" onClick={() => props.onEraseHistory()}>
        cfg-erase-history
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/CategorySetsPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="category-sets-panel">
      category-sets:{props.categorySets.length}
      <button type="button" onClick={() => props.onCreateCategorySet({ name: "Set" })}>
        cs-create-set
      </button>
      <button type="button" onClick={() => props.onUpdateCategorySet(1, { name: "Set2" })}>
        cs-update-set
      </button>
      <button type="button" onClick={() => props.onDeleteCategorySet(1)}>
        cs-delete-set
      </button>
      <button type="button" onClick={() => props.onCreateCategory({ name: "Cat" })}>
        cs-create-category
      </button>
      <button type="button" onClick={() => props.onUpdateCategory(2, { name: "Cat2" })}>
        cs-update-category
      </button>
      <button type="button" onClick={() => props.onDeleteCategory(2)}>
        cs-delete-category
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/teacher/ReportsPanel.jsx", () => ({
  default: (props) => (
    <div data-testid="reports-panel">
      reports:{props.classes.length}:{props.students.length}:{props.results.length}:
      {props.categoryStats ? "has-stats" : "no-stats"}
      <button type="button" onClick={() => props.onSearch({ discipline: "Bio" })}>
        rp-search
      </button>
      <button type="button" onClick={() => props.onCategoryStats({ classId: "1" })}>
        rp-category-stats
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/common/ConnectionBadge.jsx", () => ({
  default: ({ connected }) => <div data-testid="connection-badge">{connected ? "online" : "offline"}</div>,
}));
vi.mock("../../src/components/common/EmojiBursts.jsx", () => ({
  default: ({ items }) => <div data-testid="emoji-bursts">{items.length}</div>,
}));

/**
 * Renderiza o painel do professor dentro de um AuthProvider.
 */
export function renderDashboard() {
  return render(
    <AuthProvider>
      <TeacherDashboardPage />
    </AuthProvider>,
  );
}

/**
 * Prepara uma sessão de admin autenticada em localStorage e calibra o
 * `api.me` para devolver o professor informado.
 */
export async function loginSession({ token = "tok-1", teacher = { id: 1, name: "Prof" } } = {}) {
  window.localStorage.setItem("stop:admin", JSON.stringify({ token, teacher }));
  api.me.mockResolvedValue(teacher);
}

/** Últimos handlers registrados pelo `useRoomSocket` mockado. */
export function getLastHandlers() {
  return lastHandlers;
}

/** Restaura os mocks ao estado inicial antes de cada teste. */
export function resetSetup() {
  lastHandlers = null;
  seed = { connected: false, state: null };
  useCountdownMock.mockReturnValue(null);
  api.listClasses.mockResolvedValue([]);
  api.listGames.mockResolvedValue([]);
  api.listCategorySets.mockResolvedValue([]);
  api.listStudents.mockResolvedValue([]);
  api.getGame.mockResolvedValue(null);
  api.roomQrCode.mockResolvedValue(null);
  api.usedLetters.mockResolvedValue({ usedLetters: [] });
  api.teacherState.mockResolvedValue(null);
  api.gameStatistics.mockResolvedValue({ totals: {} });
  api.gameHistory.mockResolvedValue({ rounds: [] });
}

/** Limpa o estado persistido e reseta os mocks deixados pelos testes. */
export function teardown() {
  window.localStorage.clear();
  // resetAllMocks (not clearAllMocks): também descarta qualquer
  // mockResolvedValueOnce deixado por um teste incompleto/falho.
  vi.resetAllMocks();
}

export { api };
