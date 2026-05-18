import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildStatementProgress, persistStatementFailure } from './bankStatementPersistence';

const updateOneMock = vi.fn();
const findOneMock = vi.fn();

vi.mock('../models/BankStatement', () => ({
  BankStatement: {
    updateOne: (...args: unknown[]) => updateOneMock(...args),
    findOne: (...args: unknown[]) => findOneMock(...args)
  }
}));

describe('bankStatementPersistence', () => {
  beforeEach(() => {
    updateOneMock.mockReset();
    findOneMock.mockReset();
    updateOneMock.mockResolvedValue({ acknowledged: true });
  });

  it('builds failed progress with remaining counts', () => {
    const progress = buildStatementProgress('failed', {
      totalChecks: 10,
      checksReady: 3,
      checksFailed: 2
    });
    expect(progress.phase).toBe('failed');
    expect(progress.completedChecks).toBe(5);
    expect(progress.remainingChecks).toBe(5);
  });

  it('persists statement failure with updateOne instead of save', async () => {
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        progress: { totalChecks: 4, checksReady: 1, checksFailed: 0 },
        issues: ['existing issue'],
        artifacts: { stageTimestamps: { uploadedAt: '2026-01-01T00:00:00.000Z' } }
      })
    });

    await persistStatementFailure({
      companyId: 'company-a',
      statementId: 'statement-a',
      message: 'Rendering failed'
    });

    expect(updateOneMock).toHaveBeenCalledTimes(1);
    const [, update] = updateOneMock.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set.status).toBe('failed');
    expect(update.$set.progress).toMatchObject({ phase: 'failed' });
    expect(update.$set.issues).toEqual(expect.arrayContaining(['existing issue', 'Rendering failed']));
    expect(update.$set['artifacts.stageTimestamps.failedAt']).toEqual(expect.any(String));
  });

  it('swallows persistence errors without throwing', async () => {
    findOneMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ progress: {}, issues: [] })
    });
    updateOneMock.mockRejectedValue(new Error('mongo unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(
      persistStatementFailure({
        companyId: 'company-a',
        statementId: 'statement-a',
        message: 'failed'
      })
    ).resolves.toBeUndefined();

    errorSpy.mockRestore();
  });
});
