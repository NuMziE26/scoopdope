import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';
import { NextFunction, Request, Response } from 'express';
import pino from 'pino';

export interface RequestLogContext {
  correlationId: string;
}

export const requestContext = new AsyncLocalStorage<RequestLogContext>();

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    log(object) {
      const store = requestContext.getStore();
      return store ? { ...object, correlationId: store.correlationId } : object;
    },
  },
});

export function getCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-correlation-id');
  const correlationId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();

  res.setHeader('X-Correlation-Id', correlationId);

  const start = process.hrtime.bigint();

  requestContext.run({ correlationId }, () => {
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
      logger.info(
        {
          correlationId,
          method: req.method,
          path: req.originalUrl ?? req.url,
          statusCode: res.statusCode,
          durationMs: Math.round(durationMs * 1000) / 1000,
        },
        'request completed',
      );
    });

    next();
  });
}
