// Node 24+ ships an experimental global `localStorage`/`sessionStorage`
// (backed by a file that isn't configured here) whose accessor shadows
// jsdom's real Web Storage implementation: vitest's jsdom environment only
// copies a jsdom global onto `global` when the key isn't already present,
// and Node's own storage globals win that check. Without this shim,
// `window.localStorage` throws/returns undefined in every test file,
// breaking anything that reads or writes localStorage/sessionStorage
// (AuthContext, PlayerContext, etc.). Replace both with a plain in-memory
// implementation of the Web Storage interface before any test runs.
/** In-memory Web Storage implementation replacing Node's shadowing globals. */
class MemoryStorage {
  #store = new Map();

  /** Number of stored key/value pairs. */
  get length() {
    return this.#store.size;
  }

  /** Returns the key at the given index, or null when out of range. */
  key(index) {
    return Array.from(this.#store.keys())[index] ?? null;
  }

  /** Returns the value for a key, or null when absent. */
  getItem(key) {
    return this.#store.has(String(key)) ? this.#store.get(String(key)) : null;
  }

  /** Stores a string value under a stringified key. */
  setItem(key, value) {
    this.#store.set(String(key), String(value));
  }

  /** Deletes the entry for the given key. */
  removeItem(key) {
    this.#store.delete(String(key));
  }

  /** Removes every stored entry. */
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

// jsdom does not implement layout, so `Element.prototype.scrollIntoView` is
// missing entirely — any component that calls it (e.g. focus-and-scroll
// navigation helpers) would throw "scrollIntoView is not a function" the
// moment a test exercises that path. Stub it as a no-op.
if (typeof window !== "undefined" && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};
}

import "@testing-library/jest-dom/vitest";
