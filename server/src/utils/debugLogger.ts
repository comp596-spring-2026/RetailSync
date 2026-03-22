import type { Request } from 'express';
import { env } from '../config/env';
import { getRequestContext } from '../config/requestContext';

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 4;
const MAX_ARRAY_ITEMS = 20;
const MAX_STRING_LENGTH = 500;

const sensitiveKeys = new Set([
  'access_token',
  'accesstoken',
  'authorization',
  'client_secret',
  'clientsecret',
  'cookie',
  'encryptedpayload',
  'google_service_account_json',
  'googleserviceaccountjson',
  'id_token',
  'idtoken',
  'internal_tasks_secret',
  'internaltaskssecret',
  'jwt_access_secret',
  'jwt_refresh_secret',
  'password',
  'passwordhash',
  'privatekey',
  'refresh_token',
  'refreshtoken',
  'secret',
  'service_secret',
  'servicesecret',
  'token',
  'x-service-secret',
  'xservicesecret'
]);

const normalizeKey = (key: string) => key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

const truncateString = (value: string) =>
  value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}…(${value.length - MAX_STRING_LENGTH} more chars)`
    : value;

const summarizeUnknownObject = (value: object) => {
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: env.debugVerboseApi ? truncateString(value.stack ?? '') : undefined
    };
  }
  return null;
};

export const sanitizeForLogs = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[Array(${value.length})]`;
    const truncated = value.slice(0, MAX_ARRAY_ITEMS).map((entry) => sanitizeForLogs(entry, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) {
      truncated.push(`…(${value.length - MAX_ARRAY_ITEMS} more items)`);
    }
    return truncated;
  }

  if (typeof value === 'object') {
    const special = summarizeUnknownObject(value);
    if (special !== null) return special;
    if (depth >= MAX_DEPTH) return '[MaxDepth]';

    const source = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(source)) {
      if (sensitiveKeys.has(normalizeKey(key))) {
        output[key] = REDACTED;
        continue;
      }
      output[key] = sanitizeForLogs(entryValue, depth + 1);
    }
    return output;
  }

  return String(value);
};

const serializeError = (error: unknown) => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...(typeof error === 'object' && error && 'code' in error
        ? { code: (error as { code?: unknown }).code }
        : {})
    };
  }
  return sanitizeForLogs(error);
};

export const buildRequestLogContext = (req?: Request) => {
  const context = getRequestContext();
  return {
    requestId: req?.requestId ?? context?.requestId ?? null,
    method: req?.method ?? null,
    path: req?.originalUrl ?? req?.url ?? null,
    userId: req?.user?.id ?? context?.userId ?? null,
    companyId: req?.companyId ?? context?.tenantId ?? null
  };
};

export const debugLog = (event: string, payload?: Record<string, unknown>) => {
  if (!env.debugVerboseApi) return;
  if (payload) {
    console.info(event, sanitizeForLogs(payload));
    return;
  }
  console.info(event);
};

export const debugError = (
  event: string,
  error: unknown,
  payload?: Record<string, unknown>
) => {
  if (!env.debugVerboseApi) return;
  console.error(event, sanitizeForLogs({
    ...(payload ?? {}),
    error: serializeError(error)
  }));
};
