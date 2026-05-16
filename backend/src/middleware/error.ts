import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reqId = req.id;
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'validation_error', details: err.flatten(), request_id: reqId });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: err.code ?? 'error',
      message: err.message,
      details: err.details,
      request_id: reqId,
    });
  }
  (req.log ?? logger).error({ err, reqId }, 'unhandled error');
  return res.status(500).json({ error: 'internal_error', message: 'Something went wrong', request_id: reqId });
};
