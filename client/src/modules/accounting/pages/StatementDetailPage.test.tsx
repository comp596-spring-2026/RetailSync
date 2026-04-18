import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { moduleKeys, type PermissionsMap } from '@retailsync/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer, { setAuthContext } from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { StatementDetailPage } from './StatementDetailPage';

const {
  getStatementMock,
  listStatementChecksMock,
  getStatementSuggestionsMock,
  getStatementArtifactBlobMock,
  getStatementArtifactTextMock
} = vi.hoisted(() => ({
  getStatementMock: vi.fn(),
  listStatementChecksMock: vi.fn(),
  getStatementSuggestionsMock: vi.fn(),
  getStatementArtifactBlobMock: vi.fn(),
  getStatementArtifactTextMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getStatement: (...args: unknown[]) => getStatementMock(...args),
    listStatementChecks: (...args: unknown[]) => listStatementChecksMock(...args),
    getStatementSuggestions: (...args: unknown[]) => getStatementSuggestionsMock(...args),
    getStatementArtifactBlob: (...args: unknown[]) => getStatementArtifactBlobMock(...args),
    getStatementArtifactText: (...args: unknown[]) => getStatementArtifactTextMock(...args)
  }
}));

const createPermissions = (): PermissionsMap => {
  const permissions = {} as PermissionsMap;
  for (const moduleKey of moduleKeys) {
    permissions[moduleKey] = {
      view: true,
      create: true,
      edit: true,
      delete: true,
      actions: ['*']
    };
  }
  permissions.bankStatements = {
    view: true,
    create: true,
    edit: true,
    delete: false,
    actions: ['create', 'edit']
  };
  return permissions;
};

const createStore = () => {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });

  store.dispatch(
    setAuthContext({
      user: {
        _id: 'u1',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        companyId: 'c1',
        roleId: 'r1'
      },
      role: null,
      permissions: createPermissions()
    })
  );

  return store;
};

describe('StatementDetailPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:statement-artifact'),
        revokeObjectURL: vi.fn()
      })
    );

    getStatementMock.mockResolvedValue({
      data: {
        data: {
          id: 'statement-1',
          statementMonth: '2026-03',
          fileName: 'march-statement.pdf',
          status: 'checks_queued',
          progress: {
            phase: 'checks_queued',
            totalChecks: 5,
            checksQueued: 2,
            checksProcessing: 1,
            checksReady: 2,
            checksFailed: 0,
            completedChecks: 2,
            remainingChecks: 3
          },
          updatedAt: '2026-03-18T18:51:49.113Z',
          gcs: {
            rootPrefix: 'companies/company-a/statements/2026/03/statement-1',
            pdfPath: 'companies/company-a/statements/2026/03/statement-1/original/statement.pdf'
          },
          artifacts: {
            ocrTextPath: 'companies/company-a/statements/2026/03/statement-1/derived/ocr/text.txt',
            ocrPath: 'companies/company-a/statements/2026/03/statement-1/derived/ocr/docai.json',
            geminiPath: 'companies/company-a/statements/2026/03/statement-1/derived/gemini/normalized.v1.json',
            transactionsTablePath:
              'companies/company-a/statements/2026/03/statement-1/derived/ocr/json/tables/transactions.json',
            checksClearedTablePath:
              'companies/company-a/statements/2026/03/statement-1/derived/ocr/json/tables/checks-cleared.json',
            transactionSectionsPath:
              'companies/company-a/statements/2026/03/statement-1/derived/ocr/json/tables/transaction-sections.json',
            extractedChecksPath:
              'companies/company-a/statements/2026/03/statement-1/derived/ocr/json/tables/extracted-checks.json',
            stageTimestamps: {
              uploadedAt: '2026-03-18T18:51:00.000Z',
              extractingAt: '2026-03-18T18:51:10.000Z',
              structuringAt: '2026-03-18T18:51:25.000Z',
              checksQueuedAt: '2026-03-18T18:51:35.000Z'
            }
          },
          issues: []
        }
      }
    });

    getStatementArtifactBlobMock.mockResolvedValue({
      data: new Blob(['pdf'], { type: 'application/pdf' })
    });
    getStatementArtifactTextMock.mockResolvedValue({
      data: JSON.stringify({ ok: true })
    });
    getStatementSuggestionsMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-1',
          summary: {
            totalItems: 3,
            checks: 2,
            deposits: 0,
            debits: 2,
            credits: 1,
            expenses: 1,
            transfers: 0,
            checksSuggested: 1,
            uncategorized: 1
          },
          items: [
            {
              id: 'txn-1',
              source: 'transaction',
              date: '2026-03-08',
              description: 'Staples payment',
              amount: 123.45,
              direction: 'debit',
              proposedTxnType: 'Expense',
              proposalConfidence: 0.96,
              reviewStatus: 'proposed',
              postingStatus: 'not_posted',
              status: 'structured',
              reasons: ['Gemini matched Staples'],
              linkedCheckId: 'check-1'
            },
            {
              id: 'txn-2',
              source: 'transaction',
              date: '2026-03-09',
              description: 'Store deposit',
              amount: 800,
              direction: 'credit',
              reviewStatus: 'proposed',
              postingStatus: 'not_posted',
              status: 'structured',
              reasons: []
            },
            {
              id: 'check-1',
              source: 'check',
              date: '2026-03-08',
              description: 'Staples',
              amount: 123.45,
              direction: 'debit',
              checkNumber: '1001',
              status: 'ready',
              reasons: ['Exact amount match'],
              linkedCheckId: 'check-1'
            }
          ]
        }
      }
    });

    listStatementChecksMock.mockResolvedValue({
      data: {
        data: {
          checks: [
            {
              id: 'check-1',
              statementId: 'statement-1',
              companyId: 'company-a',
              status: 'ready',
              confidence: { overall: 0.91 },
              proposal: {
                qbTxnType: 'Check',
                payeeName: 'Staples',
                categoryAccountId: 'Office Supplies',
                confidence: 0.96,
                reasons: ['Gemini matched Staples', 'Amount aligned with history'],
                status: 'proposed',
                version: 'v1'
              },
              ai: {
                provider: 'gemini',
                providerStatus: 'healthy',
                degraded: false,
                source: 'gemini',
                confidence: 0.96,
                reasons: ['Gemini selected the best match'],
                artifacts: {
                  promptPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/proposal.prompt.v1.txt',
                  rawPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/proposal.raw.v1.json',
                  normalizedPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/proposal.normalized.v1.json'
                }
              },
              extracted: {
                checkNumber: '1001',
                date: '2026-03-08',
                payeeName: 'Staples',
                amount: 123.45,
                memo: 'Office supplies',
                source: 'ocr'
              },
              processing: {
                retryCount: 0,
                queuedAt: '2026-03-18T18:52:00.000Z',
                processingAt: '2026-03-18T18:52:01.000Z',
                processedAt: '2026-03-18T18:52:02.000Z'
              },
              artifacts: {
                pageNumber: 2,
                cropBBox: [12, 34, 56, 78],
                cropImagePath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/front.jpg',
                ocrTextPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/ocr.txt',
                ocrJsonPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/ocr.json'
              },
              gcs: {
                frontPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/front.jpg',
                structuredPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/structured.v1.json'
              },
              match: {
                reasons: ['Exact amount match'],
                matchConfidence: 0.88
              }
            },
            {
              id: 'check-2',
              statementId: 'statement-1',
              companyId: 'company-a',
              status: 'needs_review',
              confidence: { overall: 0.41 },
              proposal: {
                qbTxnType: 'Expense',
                payeeName: 'Office Depot',
                categoryAccountId: 'Office Supplies',
                confidence: 0.62,
                reasons: ['Rules matched office supplies', 'Historical vendor pattern'],
                status: 'proposed',
                version: 'v1'
              },
              ai: {
                provider: 'gemini',
                providerStatus: 'unavailable',
                degraded: true,
                degradedReason: 'Gemini was unavailable, using deterministic fallback.',
                source: 'fallback',
                confidence: 0.62,
                reasons: ['Fallback proposal used'],
                artifacts: {
                  promptPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/proposal.prompt.v1.txt',
                  rawPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/proposal.raw.v1.json',
                  normalizedPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/proposal.normalized.v1.json'
                }
              },
              extracted: {
                checkNumber: '1002',
                date: '2026-03-09',
                payeeName: 'Office Depot',
                amount: 88.19,
                memo: 'Paper supplies',
                source: 'deterministic'
              },
              processing: {
                retryCount: 2,
                lastError: 'Vision OCR timed out',
                queuedAt: '2026-03-18T18:55:00.000Z',
                processingAt: '2026-03-18T18:55:05.000Z',
                processedAt: '2026-03-18T18:55:20.000Z'
              },
              artifacts: {
                pageNumber: 4,
                cropImagePath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/front.jpg',
                ocrTextPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/ocr.txt',
                ocrJsonPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/ocr.json'
              },
              gcs: {
                frontPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/front.jpg',
                structuredPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/structured.v1.json'
              }
            },
            {
              id: 'check-3',
              statementId: 'statement-1',
              companyId: 'company-a',
              status: 'failed',
              confidence: { overall: 0.52 },
              proposal: {
                qbTxnType: 'Transfer',
                transferTargetAccountId: 'Savings',
                confidence: 0.71,
                reasons: ['Gemini draft combined with transfer rules', 'Target account resolved'],
                status: 'proposed',
                version: 'v1'
              },
              ai: {
                provider: 'gemini',
                providerStatus: 'degraded',
                degraded: true,
                degradedReason: 'Gemini rate limited during classification.',
                source: 'hybrid',
                confidence: 0.71,
                reasons: ['Gemini returned a partial result'],
                artifacts: {
                  promptPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/proposal.prompt.v1.txt',
                  rawPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/proposal.raw.v1.json',
                  normalizedPath:
                    'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/proposal.normalized.v1.json'
                }
              },
              extracted: {
                checkNumber: '1003',
                date: '2026-03-10',
                payeeName: 'Internal Transfer',
                amount: 250,
                memo: 'Sweep to savings',
                source: 'gemini'
              },
              processing: {
                retryCount: 1,
                lastError: 'Gemini classification degraded',
                queuedAt: '2026-03-18T18:56:00.000Z',
                processingAt: '2026-03-18T18:56:01.000Z',
                processedAt: '2026-03-18T18:56:03.000Z'
              },
              artifacts: {
                pageNumber: 5,
                cropImagePath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/front.jpg',
                ocrTextPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/ocr.txt',
                ocrJsonPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/ocr.json'
              },
              gcs: {
                frontPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/front.jpg',
                structuredPath:
                  'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/structured.v1.json'
              }
            }
          ]
        }
      }
    });
  });

  it('renders the embedded viewer workspace and processing activity', async () => {
    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/accounting/statements/statement-1']}>
          <Routes>
            <Route path="/dashboard/accounting/statements/:statementId" element={<StatementDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    expect(await screen.findByText(/Phase: checks queued/i)).toBeInTheDocument();
    expect(screen.getByText(/Process checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/Statement workspace/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Artifacts/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Suggestions/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Source PDF/i })).toBeInTheDocument();
    expect(screen.getByText(/Open artifact:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reprocess$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/2 done • 3 left/i)).toHaveLength(2);
    expect(screen.getByText(/Queued 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Processing 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed 0/i)).toBeInTheDocument();
    expect(screen.getByText(/Upload saved/i)).toBeInTheDocument();
    expect(screen.getByText(/OCR extraction/i)).toBeInTheDocument();
    expect(screen.getByText(/Structure transactions/i)).toBeInTheDocument();
    expect(screen.getByText(/Queue check review/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready for review/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Refresh live status/i })).toBeInTheDocument();
    expect(screen.getByText(/Select a check to anchor the review context/i)).toBeInTheDocument();
    expect(screen.getByText(/Source: ocr/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Crop ready/i)).toHaveLength(3);
    expect(screen.getAllByText(/OCR ready/i)).toHaveLength(3);
    expect(screen.getAllByText(/Structured ready/i)).toHaveLength(3);
    expect(screen.getByText(/Retries 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Vision OCR timed out/i)).toBeInTheDocument();
    expect(screen.getByText(/^Gemini-assisted$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Check to Staples$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Deterministic fallback$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Expense for Office Depot$/i)).toBeInTheDocument();
    expect(screen.getByText(/^AI degraded$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Transfer to Savings$/i)).toBeInTheDocument();
    expect(screen.getByText(/Why: Exact amount match/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Select check/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });

  it('shows grouped suggestion buckets for the statement review workflow', async () => {
    const user = userEvent.setup();

    render(
      <Provider store={createStore()}>
        <MemoryRouter initialEntries={['/dashboard/accounting/statements/statement-1']}>
          <Routes>
            <Route path="/dashboard/accounting/statements/:statementId" element={<StatementDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    await screen.findByText(/Statement workspace/i);
    await user.click(screen.getByRole('tab', { name: /Suggestions/i }));

    expect(screen.getByText(/Suggestions 3/i)).toBeInTheDocument();
    expect(screen.getByText(/Store deposit/i)).toBeInTheDocument();
    expect(screen.getByText(/^Check review$/i)).toBeInTheDocument();
    expect(screen.getByText(/Staples payment/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Needs classification/i).length).toBeGreaterThan(0);
  });
});
