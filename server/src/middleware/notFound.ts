import { Request, Response } from 'express';
import { fail } from '../utils/apiResponse';

export const notFound = (_req: Request, res: Response) => fail(res, 'Route not found', 404);
