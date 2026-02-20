import { Response } from 'express';

export const ok = <T>(res: Response, data: T, statusCode = 200) =>
  res.status(statusCode).json({ status: 'ok', data });

export const fail = (
  res: Response,
  message: string,
  statusCode = 400,
  details?: unknown
) => res.status(statusCode).json({ status: 'error', message, ...(details ? { details } : {}) });
