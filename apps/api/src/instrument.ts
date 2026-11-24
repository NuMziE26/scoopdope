import * as Sentry from '@sentry/node';

/**
 * Sentry must be initialized before any other module is imported so that
 * auto-instrumentation and unhandled-exception capture work correctly.
 * Import this file at the very top of `main.ts`.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    // No DSN configured (e.g. local development) — skip initialization.
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Performance monitoring is out of scope for this integration.
    tracesSampleRate: 0,
  });
}

initSentry();

export { Sentry };
