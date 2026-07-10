// Vitest global setup — loaded once before every test file (see vitest.config.ts).
// Adds jest-dom's DOM-specific matchers (toBeInTheDocument, toHaveTextContent, ...)
// on top of vitest's `expect`, and cleans up any rendered React trees between tests
// so component tests never leak DOM nodes/state into one another.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
