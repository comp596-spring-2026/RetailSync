import { NextFunction, Request, Response } from 'express';
import { fail } from '../utils/apiResponse';

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  return fail(res, 'Internal server error', 500);
};
