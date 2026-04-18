import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { extractApiErrorCode, extractApiErrorMessage } from './apiError';

describe('apiError', () => {
  it('prefers details.reason over a generic top-level message', () => {
    const error = new AxiosError(
      'Failed to create statement',
      undefined,
      undefined,
      undefined,
      {
        data: {
          message: 'Failed to create statement',
          details: {
            reason: 'statement_queue_failed',
          },
        },
      } as never,
    );

    expect(extractApiErrorCode(error)).toBe('statement_queue_failed');
    expect(extractApiErrorMessage(error, 'Fallback')).toBe(
      'The PDF uploaded, but RetailSync could not start statement processing. Retry in a moment.',
    );
  });
});
