import { Request, Response } from 'express';
import { ok } from '../utils/apiResponse';

export const moduleShellHandler = (moduleName: string, action: string) => (_req: Request, res: Response) =>
  ok(res, { status: 'ok', module: moduleName, action, message: `${moduleName} ${action} placeholder` });
