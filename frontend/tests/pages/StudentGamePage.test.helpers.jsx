import { useState } from "react";
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import StudentGamePage from "../../src/pages/StudentGamePage.jsx";
import { PlayerProvider } from "../../src/state/PlayerContext.jsx";

// Mocks compartilhados: declarados via vi.hoisted para ficarem disponíveis
// antes dos vi.mock abaixo (que referenciam esses spy nos factories).
const { api, emitAck } = vi.hoisted(() => ({
  api: { playerState: vi.fn() },
  emitAck: vi.fn(),
}));

vi.mock("../../src/services/api.js", () => ({
  default: api,
}));

vi.mock("../../src/socket/socket.js", () => ({
  createSocket: vi.fn(() => ({ emit: vi.fn(), on: vi.fn() })),
  emitAck,
  // Idempotência roda na página via emitCommand; o shim simplesmente repassa
  // para o emitAck mockado para os testes continuarem spyando o envio.
  emitCommand: (socket, event, payload) => emitAck(socket, event, payload),
}));

// --- useRoomSocket: a real-stateful stand-in (backed by React state so
// `setState` calls from the page actually take effect, e.g. the REST
// fallback path), seeded per test via `seedSocket`. Captures `handlers` so
// tests can fire socket events directly.
let lastHandlers = null;
let seed = { connected: false, state: null };
let lastOnExit = null;

/**
 * Define o estado inicial do socket usado no próximo render (via useRoomSocket).
 * Aceita o payload completo: `connected`, `state` e, opcionalmente, `socket`
 * (null para exercitar os guards de socket ausente).
 */
export function seedSocket(next) {
  seed = next;
}

/**
 * Implementação real-stateful substituta do hook useRoomSocket: expõe o
 * socket, o estado conectado e o estado React da página, capturando os
 * handlers para os testes dispararem os eventos diretamente.
 */
export function useRoomSocketImpl(config) {
  lastHandlers = config.handlers;
  const [state, setState] = useState(seed.state);
  // `seed.socket` lets a test opt into a null socket (e.g. mid-handshake)
  // to exercise the `!socketInstance` guards; defaults to a live-looking one.
  const socket = "socket" in seed ? seed.socket : { emit: vi.fn(), on: vi.fn() };
  return { socket, connected: seed.connected, state, setState };
}
vi.mock("../../src/hooks/useRoomSocket.js", () => ({
  default: (config) => useRoomSocketImpl(config),
}));

// --- useServerClock: useCountdown fully controlled per test.
export const useCountdownMock = vi.fn(() => null);
vi.mock("../../src/hooks/useServerClock.js", () => ({
  useServerClock: () => ({ sync: vi.fn(), now: () => Date.now() }),
  useCountdown: (...args) => useCountdownMock(...args),
}));

// --- useAudio: stubbed for assertable play()/toggle()/unlock() calls.
export const audioMock = {
  play: vi.fn(),
  playVoice: vi.fn(),
  unlock: vi.fn(),
  enabled: true,
  volume: 0.4,
  toggle: vi.fn(),
  setVolume: vi.fn(),
};
vi.mock("../../src/hooks/useAudio.js", () => ({
  default: () => audioMock,
}));

// --- useFullscreen: stubbed so tests don't depend on jsdom's (nonexistent)
// Fullscreen API, and so enter/exit/onExit are directly assertable/callable.
export const fullscreenMock = {
  isFullscreen: false,
  supported: true,
  enter: vi.fn().mockResolvedValue(true),
  exit: vi.fn(),
};
vi.mock("../../src/hooks/useFullscreen.js", () => ({
  default: ({ onExit } = {}) => {
    lastOnExit = onExit;
    return fullscreenMock;
  },
}));

// --- components/student/*: out of scope here (owned by a different agent
// testing components/student directly) — stubbed as markers so this page's
// own state/branching wiring is what's under test.
vi.mock("../../src/components/student/GameHeader.jsx", () => ({
  default: ({ round, seconds, running, filled, total }) => (
    <div data-testid="game-header">
      {round?.status ?? "no-round"}|{running ? seconds : "stopped"}|{filled}/{total}
    </div>
  ),
}));
vi.mock("../../src/components/student/CategoryList.jsx", () => ({
  default: ({ categories, currentId, onSelect }) => (
    <ul data-testid="category-list">
      {categories.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={() => onSelect(c.id)} aria-pressed={c.id === currentId}>
            {c.name}
          </button>
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("../../src/components/student/AnswerEditor.jsx", () => ({
  default: ({ category, value, onChange, onCommit, onClose }) => (
    <div data-testid="answer-editor">
      <label htmlFor="answer-input">{category.name}</label>
      <input id="answer-input" value={value} onChange={(e) => onChange(category.id, e.target.value)} />
      <button type="button" onClick={() => onCommit(category.id)}>
        commit
      </button>
      <button type="button" onClick={onClose}>
        close-editor
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/student/StopButton.jsx", () => ({
  default: ({ disabled, filled, total, onClick }) => (
    <button type="button" data-testid="stop-button" disabled={disabled} onClick={onClick}>
      STOP {filled}/{total}
    </button>
  ),
}));
vi.mock("../../src/components/student/CollaborativeCorrection.jsx", () => ({
  default: ({ reviews, onDecide }) => (
    <div data-testid="collab-correction">
      collab:{reviews.length}
      <button type="button" onClick={() => reviews[0] && onDecide(reviews[0].reviewId, "VALID")}>
        decide-valid
      </button>
    </div>
  ),
}));
vi.mock("../../src/components/student/EmojiPicker.jsx", () => ({
  default: ({ onSend }) => (
    <button type="button" data-testid="emoji-send" onClick={() => onSend("🎉")}>
      send-emoji
    </button>
  ),
}));

export const PLAYER = {
  playerToken: "tok-1",
  room: { code: "STOP-1" },
  student: { name: "Ana", avatarUrl: null },
};

/**
 * Renderiza a página de jogo do aluno dentro de um PlayerProvider e rotas
 * enxutas (/play), preparando a sessão em sessionStorage.
 */
export function renderPage({ player = PLAYER } = {}) {
  if (player) {
    window.sessionStorage.setItem("stop:player", JSON.stringify(player));
  }
  return render(
    <MemoryRouter initialEntries={["/play"]}>
      <PlayerProvider>
        <Routes>
          <Route path="/" element={<div>home-screen</div>} />
          <Route path="/play" element={<StudentGamePage />} />
        </Routes>
      </PlayerProvider>
    </MemoryRouter>,
  );
}

/** Últimos handlers registrados pelo `useRoomSocket` mockado. */
export function getLastHandlers() {
  return lastHandlers;
}

/** Último callback de saída registrado pelo mock de fullscreen. */
export function getLastOnExit() {
  return lastOnExit;
}

/** Restaura os mocks ao estado inicial antes de cada teste. */
export function resetSetup() {
  lastHandlers = null;
  lastOnExit = null;
  seed = { connected: false, state: null };
  useCountdownMock.mockReturnValue(null);
  api.playerState.mockResolvedValue(null);
  emitAck.mockResolvedValue({ ok: true, data: {} });
  fullscreenMock.isFullscreen = false;
  fullscreenMock.supported = true;
}

/** Limpa o estado persistido deixado pelos testes. */
export function teardown() {
  window.sessionStorage.clear();
  vi.clearAllMocks();
}

export { api, emitAck };
