import { Response } from 'express';
import { buildRequestLogContext, debugLog, sanitizeForLogs } from './debugLogger';

export const ok = <T>(res: Response, data: T, statusCode = 200) =>
  res.status(statusCode).json({ status: 'ok', data });

export const fail = (
  res: Response,
  message: string,
  statusCode = 400,
  details?: unknown
) => {
  debugLog('[api.response.fail]', {
    ...buildRequestLogContext(res.req),
    statusCode,
    message,
    details: sanitizeForLogs(details)
  });

  return res.status(statusCode).json({ status: 'error', message, ...(details ? { details } : {}) });
};
