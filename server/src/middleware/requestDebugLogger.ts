import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { buildRequestLogContext, debugLog, sanitizeForLogs } from '../utils/debugLogger';
import { setRequestContext } from '../config/requestContext';

export const requestDebugLogger = (req: Request, res: Response, next: NextFunction) => {
  const requestId = req.header('x-request-id')?.trim() || randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  setRequestContext({ requestId });

  const startedAt = process.hrtime.bigint();
  debugLog('[api.request.start]', {
    ...buildRequestLogContext(req),
    ip: req.ip,
    contentType: req.get('content-type') ?? null,
    contentLength: req.get('content-length') ?? null,
    hasAuthorization: Boolean(req.get('authorization')),
    hasCookie: Boolean(req.get('cookie')),
    query: sanitizeForLogs(req.query)
  });

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    debugLog('[api.request.finish]', {
      ...buildRequestLogContext(req),
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      contentLength: res.getHeader('content-length') ?? null,
      body: sanitizeForLogs(req.body)
    });
  });

  next();
};
