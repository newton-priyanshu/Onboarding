// ─── Global Toast Event System ─────────────────────────────────────────────
// This module bridges the gap between plain utility functions and React's
// component tree. Components subscribe to receive toast notifications,
// and non-React code dispatches events via dispatchToast.

const listeners = new Set();

/**
 * Subscribe to toast events. Returns an unsubscribe function.
 * @param {(message: string, type: 'error'|'warning'|'success'|'info') => void} listener
 * @returns {() => void} unsubscribe
 */
export function onToast(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Dispatch a toast notification from anywhere in the app.
 * @param {string} message
 * @param {'error'|'warning'|'success'|'info'} type
 */
export function dispatchToast(message, type = 'info') {
  listeners.forEach(fn => {
    try { fn(message, type); } catch (e) { console.error('Toast listener error:', e); }
  });
}

/**
 * Log an error to the console AND show a toast notification.
 * Future: Replace with a more sophisticated error reporting service.
 *
 * @param {string} message - Human-readable description of the error
 * @param {any} [details] - Optional error object or details to log
 */
export function notifyError(message, details = null) {
  console.error(message, details);
  dispatchToast(
    typeof message === 'string' ? message : 'An unexpected error occurred.',
    'error'
  );
}
