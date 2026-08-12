// ─── Global Toast Event System ─────────────────────────────────────────────
// This module bridges the gap between plain utility functions and React's
// component tree. Components subscribe to receive toast notifications,
// and non-React code dispatches events via dispatchToast.

import { captureError } from './sentry';

type ToastListener = (message: string, type: 'error' | 'warning' | 'success' | 'info') => void;

const listeners = new Set<ToastListener>();

/**
 * Subscribe to toast events. Returns an unsubscribe function.
 */
export function onToast(listener: ToastListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Dispatch a toast notification from anywhere in the app.
 */
export function dispatchToast(message: string, type: 'error' | 'warning' | 'success' | 'info' = 'info'): void {
  listeners.forEach(fn => {
    try { fn(message, type); } catch (e) { console.error('Toast listener error:', e); }
  });
}

/**
 * Log an error to the console AND show a toast notification.
 */
export function notifyError(message: string, details: unknown = null): void {
  console.error(message, details);
  // Surface unexpected errors to Sentry (no-op unless a DSN is configured).
  const error =
    details instanceof Error
      ? details
      : new Error(typeof message === 'string' ? message : 'An unexpected error occurred.');
  captureError(error, details === null ? { message } : { message, details: String(details) });
  dispatchToast(
    typeof message === 'string' ? message : 'An unexpected error occurred.',
    'error'
  );
}
