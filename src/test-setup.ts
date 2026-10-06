// Vitest global setup — loaded once before every test file (see vitest.config.ts).
// Adds jest-dom's DOM-specific matchers (toBeInTheDocument, toHaveTextContent, ...)
// on top of vitest's `expect`, and cleans up any rendered React trees between tests
// so component tests never leak DOM nodes/state into one another.
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node's native localStorage is unavailable in Vitest workers.
const storage = new Map<string, string>();
const testLocalStorage: Storage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => storage.delete(key),
  setItem: (key, value) => storage.set(key, value),
};

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: testLocalStorage,
});
vi.stubGlobal('localStorage', testLocalStorage);

afterEach(() => {
  cleanup();
  storage.clear();
});
