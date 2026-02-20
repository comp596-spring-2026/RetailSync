import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { fail } from '../utils/apiResponse';

export const validate = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return fail(res, 'Validation failed', 422, error.flatten());
    }
    return fail(res, 'Validation failed', 422);
  }
};
