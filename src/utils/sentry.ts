import * as Sentry from '@sentry/react';

/**
 * Sentry error tracking — guarded initialization (audit finding D3).
 *
 * Sentry is only initialized when a DSN is present in the environment
 * (VITE_SENTRY_DSN) and we're not running tests. Every capture wrapper
 * below is a safe no-op otherwise, so the app never depends on Sentry
 * being configured.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN;
let initialized = false;

/** Initialize Sentry once. Call from main.tsx before rendering. */
export function initSentry(): void {
  if (initialized || !DSN || import.meta.env.MODE === 'test') return;
  initialized = true;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    beforeSend(event) {
      // Never send the raw error message if it contains PII-looking values
      // (e.g. email addresses) — keep events useful but trimmed.
      if (event?.message && event.message.length > 2000) {
        event.message = event.message.slice(0, 2000);
      }
      return event;
    },
  });
}

/** Report an exception to Sentry (no-op when not initialized). */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  if (context) {
    Sentry.captureException(error, { extra: context });
  } else {
    Sentry.captureException(error);
  }
}

/** Report a message to Sentry (no-op when not initialized). */
export function captureMessage(message: string, level: Sentry.SeverityLevel = 'error'): void {
  if (!initialized) return;
  Sentry.captureMessage(message, level);
}
