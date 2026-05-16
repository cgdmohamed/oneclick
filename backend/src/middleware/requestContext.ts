/**
 * OBS-01: Request-ID + pino-http binding.
 *
 * - Reads (or generates) `x-request-id` for trace correlation.
 * - Echoes it back in the response so clients/proxies can correlate too.
 * - Binds a per-request child logger to `req.log`.
 */
import { randomUUID } from 'node:crypto';
import pinoHttp from 'pino-http';
import type { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

// Note: pino-http already augments Request with `id` and `log`, so we don't
// re-declare them here (doing so causes type incompatibilities).

const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = (req.headers['x-request-id'] as string | undefined)?.trim();
    const id = incoming && incoming.length <= 64 ? incoming : randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: req.url,
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});

export function requestContext(req: Request, res: Response, next: NextFunction) {
  httpLogger(req, res, next);
}
