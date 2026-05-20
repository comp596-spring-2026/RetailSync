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

  it('extracts RBAC role delete and assign-role API messages', () => {
    const deleteError = new AxiosError('Bad Request', undefined, undefined, undefined, {
      data: {
        status: 'error',
        message: 'Cannot delete this role because users are assigned to it. Reassign users first.'
      }
    } as never);
    const selfAssignError = new AxiosError('Bad Request', undefined, undefined, undefined, {
      data: { status: 'error', message: 'You cannot change your own role.' }
    } as never);
    const systemRoleError = new AxiosError('Bad Request', undefined, undefined, undefined, {
      data: { status: 'error', message: 'System roles are read-only.' }
    } as never);

    expect(extractApiErrorMessage(deleteError, 'Fallback')).toBe(
      'Cannot delete this role because users are assigned to it. Reassign users first.'
    );
    expect(extractApiErrorMessage(selfAssignError, 'Fallback')).toBe('You cannot change your own role.');
    expect(extractApiErrorMessage(systemRoleError, 'Fallback')).toBe('System roles are read-only.');
  });
});
