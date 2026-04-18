import { AxiosError } from 'axios';
import { APP_ERROR_MESSAGES } from '../constants/errorCodes';

type ErrorPayload = {
  message?: string;
  details?: {
    reason?: string;
    clientMessage?: string;
    message?: string;
  };
  data?: {
    message?: string;
  };
};

export const extractApiErrorCode = (error: unknown): string | null => {
  if (!(error instanceof AxiosError)) return null;
  const payload = error.response?.data as ErrorPayload | undefined;
  const message =
    payload?.details?.reason ?? payload?.message ?? payload?.details?.message ?? payload?.data?.message;
  return typeof message === 'string' ? message.trim().toLowerCase() : null;
};

export const extractApiErrorMessage = (error: unknown, fallback = 'Something went wrong') => {
  if (error instanceof AxiosError) {
    const payload = error.response?.data as ErrorPayload | undefined;
    const reason = payload?.details?.reason ?? payload?.message ?? payload?.data?.message;
    if (typeof reason === 'string') {
      const normalizedReason = reason.trim().toLowerCase();
      const mapped = APP_ERROR_MESSAGES[normalizedReason];
      if (mapped) return mapped;
    }

    const clientMessage = payload?.details?.clientMessage;
    if (typeof clientMessage === 'string' && clientMessage.trim()) {
      return clientMessage.trim();
    }
  }

  const code = extractApiErrorCode(error);
  if (!code) return fallback;
  return APP_ERROR_MESSAGES[code] ?? code;
};
