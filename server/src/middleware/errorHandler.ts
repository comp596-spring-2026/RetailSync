import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { buildRequestLogContext, debugError, sanitizeForLogs } from '../utils/debugLogger';
import { fail } from '../utils/apiResponse';

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  debugError('[api.error]', err, {
    ...buildRequestLogContext(req),
    query: sanitizeForLogs(req.query),
    body: sanitizeForLogs(req.body)
  });
  if (!env.debugVerboseApi && !res.headersSent) {
    console.error('[api.error]', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      message: err instanceof Error ? err.message : String(err)
    });
  }
  return fail(res, 'Internal server error', 500);
};
