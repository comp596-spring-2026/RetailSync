export const sleep = async (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const withRetries = async <T>({
  attempts,
  shouldRetry,
  run,
  onRetry
}: {
  attempts: number;
  shouldRetry: (error: unknown, attempt: number) => boolean;
  run: (attempt: number) => Promise<T>;
  onRetry?: (error: unknown, attempt: number) => Promise<void> | void;
}) => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error, attempt)) {
        throw error;
      }
      await onRetry?.(error, attempt);
    }
  }

  throw lastError;
};
