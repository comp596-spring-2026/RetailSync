import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { within } from '@testing-library/react';
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
  listStatementEntriesMock,
  getStatementStatusMock,
  listStatementRulesMock,
  createStatementRuleFromTransactionMock,
  getStatementArtifactBlobMock,
  getStatementArtifactTextMock
} = vi.hoisted(() => ({
  getStatementMock: vi.fn(),
  listStatementChecksMock: vi.fn(),
  getStatementSuggestionsMock: vi.fn(),
  listStatementEntriesMock: vi.fn(),
  getStatementStatusMock: vi.fn(),
  listStatementRulesMock: vi.fn(),
  createStatementRuleFromTransactionMock: vi.fn(),
  getStatementArtifactBlobMock: vi.fn(),
  getStatementArtifactTextMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getStatement: (...args: unknown[]) => getStatementMock(...args),
    listStatementChecks: (...args: unknown[]) => listStatementChecksMock(...args),
    getStatementSuggestions: (...args: unknown[]) => getStatementSuggestionsMock(...args),
    listStatementEntries: (...args: unknown[]) => listStatementEntriesMock(...args),
    getStatementStatus: (...args: unknown[]) => getStatementStatusMock(...args),
    listStatementRules: (...args: unknown[]) => listStatementRulesMock(...args),
    createStatementRuleFromTransaction: (...args: unknown[]) => createStatementRuleFromTransactionMock(...args),
    getStatementStreamUrl: vi.fn(() => 'http://localhost/accounting/statements/statement-1/stream'),
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
              section: 'electronic_debits',
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
              section: 'deposits',
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

    listStatementEntriesMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-1',
          entries: [
            {
              id: 'txn-1',
              statementId: 'statement-1',
              companyId: 'company-a',
              postDate: '2026-03-08',
              description: 'Staples payment',
              merchant: 'Staples',
              amount: 123.45,
              type: 'debit',
              classification: 'expense',
              reviewStatus: 'proposed',
              posting: { status: 'not_posted' }
            }
          ]
        }
      }
    });

    getStatementStatusMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-1',
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
          liveMetrics: {
            entryCount: 1,
            debitCount: 1,
            creditCount: 0,
            startingBalance: null,
            endingBalance: null
          },
          updatedAt: '2026-03-18T18:51:49.113Z',
          artifacts: {
            ocrTextPath: 'companies/company-a/statements/2026/03/statement-1/derived/ocr/text.txt'
          },
          checkImagePreview: [],
          issues: []
        }
      }
    });

    listStatementRulesMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-1',
          rules: []
        }
      }
    });

    createStatementRuleFromTransactionMock.mockResolvedValue({
      data: {
        data: {
          rule: {
            id: 'rule-1'
          }
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

    expect(await screen.findByRole('tab', { name: /^Overview$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Review Transactions$/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /^Source Proof$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Reprocess$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Back$/i })).toBeInTheDocument();
    expect(screen.getByTestId('statement-summary-card')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Source Proof$/i }));
    expect(screen.getByRole('button', { name: /Structured Tables 4/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /^Review Transactions$/i }));
    expect(screen.getByRole('button', { name: /Filters/i })).toBeInTheDocument();
    expect(screen.getByText(/sections · .*review rows/i)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Review/i }).length).toBeGreaterThan(0);
  });

  it('shows section-grouped review rows for the statement review workflow', async () => {
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

    await screen.findByRole('tab', { name: /^Overview$/i });
    await user.click(screen.getByRole('tab', { name: /^Review Transactions$/i }));

    expect(screen.getAllByText(/Store deposit/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Staples payment/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/All \d+ rows|Showing 1-/i).length).toBeGreaterThan(0);
  });
});
