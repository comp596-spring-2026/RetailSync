import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

type RequestContext = {
  tenantId?: string;
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const withRequestContext = (_req: Request, _res: Response, next: NextFunction) => {
  storage.run({}, () => next());
};

export const setRequestContext = (partial: RequestContext) => {
  const store = storage.getStore();
  if (!store) return;

  if (partial.tenantId !== undefined) {
    store.tenantId = partial.tenantId;
  }
  if (partial.userId !== undefined) {
    store.userId = partial.userId;
  }
};

export const getRequestContext = () => storage.getStore();
