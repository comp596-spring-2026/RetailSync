import { AxiosError } from 'axios';
import { APP_ERROR_MESSAGES } from '../constants/errorCodes';

type ErrorPayload = {
  message?: string;
  data?: {
    message?: string;
  };
};

export const extractApiErrorCode = (error: unknown): string | null => {
  if (!(error instanceof AxiosError)) return null;
  const payload = error.response?.data as ErrorPayload | undefined;
  const message = payload?.message ?? payload?.data?.message;
  return typeof message === 'string' ? message.trim().toLowerCase() : null;
};

export const extractApiErrorMessage = (error: unknown, fallback = 'Something went wrong') => {
  const code = extractApiErrorCode(error);
  if (!code) return fallback;
  return APP_ERROR_MESSAGES[code] ?? code;
};

