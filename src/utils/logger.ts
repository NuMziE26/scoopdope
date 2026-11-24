import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import pino from 'pino';

export interface RequestLogContext {
  correlationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestLogContext>();

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    log(object) {
      const store = requestContext.getStore();
      if (store?.correlationId) {
        return { ...object, correlationId: store.correlationId };
      }
      return object;
    },
  },
});

export function generateCorrelationId(): string {
  return randomUUID();
}

export function getCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return requestContext.run({ correlationId }, fn);
}

export interface RequestLogFields {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
}

export function logRequest(fields: RequestLogFields): void {
  logger.info(fields, 'request completed');
}
