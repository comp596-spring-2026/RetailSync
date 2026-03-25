import { SheetsHttpError } from "../../integrations/google/sheetsReader";
import { SheetsConfigError } from "../../integrations/google/sourceResolver";

export class GoogleSheetsApplicationError extends Error {
  statusCode: number;
  details?: unknown;

  constructor(message: string, statusCode = 400, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

export const toGoogleSheetsErrorStatus = (error: unknown, fallback = 400) => {
  if (error instanceof GoogleSheetsApplicationError) return error.statusCode;
  if (error instanceof SheetsConfigError) return error.statusCode;
  if (error instanceof SheetsHttpError) return error.statusCode;
  return fallback;
};

export const toGoogleSheetsErrorMessage = (
  error: unknown,
  fallback: string,
) => (error instanceof Error ? error.message : fallback);

export const toGoogleSheetsErrorDetails = (error: unknown) =>
  error instanceof GoogleSheetsApplicationError ? error.details : undefined;
