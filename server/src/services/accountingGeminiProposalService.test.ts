import { beforeEach, describe, expect, it, vi } from 'vitest';

const matchingMock = vi.hoisted(() => vi.fn());
const geminiMock = vi.hoisted(() => vi.fn());
const storageWrites = vi.hoisted(() => ({
  writes: [] as Array<{ objectPath: string; value: string; contentType?: string }>
}));
const mockEnv = vi.hoisted(() => ({
  env: {
    statementGeminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    statementGeminiModel: 'gemini-2.5-flash',
    statementGeminiApiKey: undefined as string | undefined,
    statementGeminiTimeoutMs: 120000,
    statementGeminiTemperature: 0.2,
    statementGeminiMaxOutputTokens: 1024,
    statementGeminiMinConfidence: 0.65
  }
}));

vi.mock('./matchingEngine', () => ({
  buildMatchingProposal: matchingMock
}));

vi.mock('../integrations/google/gemini.client', () => ({
  generateGeminiContent: geminiMock,
  GeminiClientError: class GeminiClientError extends Error {
    code: string;

    retryable: boolean;

    constructor(code: string, message: string, options: { retryable?: boolean } = {}) {
      super(message);
      this.name = 'GeminiClientError';
      this.code = code;
      this.retryable = Boolean(options.retryable ?? false);
    }
  }
}));

vi.mock('../integrations/google/storage.client', () => ({
  getStorageClient: () => ({
    bucket: (bucketName: string) => ({
      file: (objectPath: string) => ({
        save: async (value: Buffer | string, options?: { contentType?: string }) => {
          storageWrites.writes.push({
            objectPath: `${bucketName}::${objectPath}`,
            value: Buffer.isBuffer(value) ? value.toString('utf8') : String(value),
            contentType: options?.contentType
          });
        }
      })
    })
  })
}));

vi.mock('../config/env', () => mockEnv);

describe('accountingGeminiProposalService', () => {
  beforeEach(() => {
    matchingMock.mockReset();
    geminiMock.mockReset();
    storageWrites.writes = [];
    mockEnv.env.statementGeminiApiKey = undefined;
    mockEnv.env.statementGeminiMinConfidence = 0.65;
  });

  it('falls back to deterministic matching when Gemini is unavailable', async () => {
    matchingMock.mockResolvedValue({
      qbTxnType: 'Check',
      categoryAccountId: 'Office Supplies',
      payeeType: 'vendor',
      payeeId: 'qb-vendor-1',
      payeeName: 'Acme Plumbing',
      memo: 'invoice 441',
      confidence: 0.72,
      reasons: ['Deterministic fallback'],
      version: 'v1'
    });

    const { runAccountingGeminiProposal } = await import('./accountingGeminiProposalService');

    const result = await runAccountingGeminiProposal({
      companyId: 'company-1',
      description: 'Check for plumbing invoice',
      merchant: 'Acme Plumbing',
      amount: 1250,
      type: 'debit',
      persistArtifacts: true,
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      checkKey: 'check-001'
    });

    expect(matchingMock).toHaveBeenCalledTimes(1);
    expect(geminiMock).not.toHaveBeenCalled();
    expect(result.providerStatus).toBe('unavailable');
    expect(result.source).toBe('fallback');
    expect(result.proposal.payeeName).toBe('Acme Plumbing');
    expect(result.reasons.join(' ')).toContain('Gemini unavailable');
    expect(result.artifacts).toMatchObject({
      promptPath:
        'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.prompt.v1.txt',
      rawPath:
        'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.raw.v1.json',
      normalizedPath:
        'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.normalized.v1.json'
    });
    expect(storageWrites.writes.map((entry) => entry.objectPath)).toEqual([
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.prompt.v1.txt',
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.raw.v1.json',
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.normalized.v1.json'
    ]);
  });

  it('merges a strong Gemini proposal with deterministic fallback', async () => {
    mockEnv.env.statementGeminiApiKey = 'test-api-key';
    matchingMock.mockResolvedValue({
      qbTxnType: 'Expense',
      categoryAccountId: 'Office Supplies',
      memo: 'invoice 441',
      confidence: 0.72,
      reasons: ['Deterministic fallback'],
      version: 'v1'
    });
    geminiMock.mockResolvedValue({
      text: JSON.stringify({
        qbTxnType: 'Check',
        payeeType: 'vendor',
        payeeName: 'Acme Plumbing',
        payeeId: 'qb-vendor-1',
        memo: 'Pay plumbing invoice 441',
        confidence: 0.91,
        reasons: ['Vendor matched from OCR evidence'],
        version: 'v1'
      }),
      raw: {
        candidates: [{ finishReason: 'STOP' }]
      }
    });

    const { runAccountingGeminiProposal } = await import('./accountingGeminiProposalService');

    const result = await runAccountingGeminiProposal({
      companyId: 'company-1',
      description: 'Check for plumbing invoice',
      merchant: 'Acme Plumbing',
      amount: 1250,
      type: 'debit',
      persistArtifacts: true,
      bucketName: 'accounting-bucket',
      rootPrefix: 'companies/company-a/statements/2026/03/statement-a',
      checkKey: 'check-001'
    });

    expect(geminiMock).toHaveBeenCalledTimes(1);
    expect(result.providerStatus).toBe('healthy');
    expect(result.source).toBe('hybrid');
    expect(result.proposal.qbTxnType).toBe('Check');
    expect(result.proposal.payeeName).toBe('Acme Plumbing');
    expect(result.artifacts).toMatchObject({
      promptPath:
        'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.prompt.v1.txt',
      rawPath:
        'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.raw.v1.json',
      normalizedPath:
        'companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.normalized.v1.json'
    });
    expect(result.proposal.reasons).toEqual(
      expect.arrayContaining(['Deterministic fallback', 'Vendor matched from OCR evidence'])
    );
    expect(storageWrites.writes.map((entry) => entry.objectPath)).toEqual([
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.prompt.v1.txt',
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.raw.v1.json',
      'accounting-bucket::companies/company-a/statements/2026/03/statement-a/derived/checks/extracted/check-001/proposal.normalized.v1.json'
    ]);
  });

  it('falls back when Gemini confidence is too low', async () => {
    mockEnv.env.statementGeminiApiKey = 'test-api-key';
    matchingMock.mockResolvedValue({
      qbTxnType: 'Expense',
      categoryAccountId: 'Office Supplies',
      memo: 'invoice 441',
      confidence: 0.72,
      reasons: ['Deterministic fallback'],
      version: 'v1'
    });
    geminiMock.mockResolvedValue({
      text: JSON.stringify({
        qbTxnType: 'Check',
        payeeName: 'Acme Plumbing',
        confidence: 0.1,
        reasons: ['Uncertain'],
        version: 'v1'
      }),
      raw: {
        candidates: [{ finishReason: 'STOP' }]
      }
    });

    const { runAccountingGeminiProposal } = await import('./accountingGeminiProposalService');

    const result = await runAccountingGeminiProposal({
      companyId: 'company-1',
      description: 'Check for plumbing invoice',
      merchant: 'Acme Plumbing',
      amount: 1250,
      type: 'debit'
    });

    expect(result.providerStatus).toBe('degraded');
    expect(result.source).toBe('fallback');
    expect(result.proposal.qbTxnType).toBe('Expense');
    expect(result.degradedReason).toContain('confidence below threshold');
  });
});
