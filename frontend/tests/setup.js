// Node 24+ ships an experimental global `localStorage`/`sessionStorage`
// (backed by a file that isn't configured here) whose accessor shadows
// jsdom's real Web Storage implementation: vitest's jsdom environment only
// copies a jsdom global onto `global` when the key isn't already present,
// and Node's own storage globals win that check. Without this shim,
// `window.localStorage` throws/returns undefined in every test file,
// breaking anything that reads or writes localStorage/sessionStorage
// (AuthContext, PlayerContext, etc.). Replace both with a plain in-memory
// implementation of the Web Storage interface before any test runs.
class MemoryStorage {
  #store = new Map();

  get length() {
    return this.#store.size;
  }

  key(index) {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  getItem(key) {
    return this.#store.has(String(key)) ? this.#store.get(String(key)) : null;
  }

  setItem(key, value) {
    this.#store.set(String(key), String(value));
  }

  removeItem(key) {
    this.#store.delete(String(key));
  }

  clear() {
    this.#store.clear();
  }
}

for (const prop of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, prop, {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  if (typeof window !== "undefined") {
    Object.defineProperty(window, prop, {
      value: globalThis[prop],
      configurable: true,
      writable: true,
    });
  }
}

import "@testing-library/jest-dom/vitest";
