/**
 * OBS-01: Structured logging with request IDs.
 * Single shared pino logger — use everywhere instead of console.*.
 */
import pino from 'pino';
import { env } from '../config/env.js';

const isDev = env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  base: { service: 'hesabat-api', env: env.NODE_ENV },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.token',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  transport: isDev
    ? { target: 'pino/file', options: { destination: 1, colorize: false } }
    : undefined,
});
