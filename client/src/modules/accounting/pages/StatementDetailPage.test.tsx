import { cleanup, render, screen } from '@testing-library/react';
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

const { getStatementMock, listStatementChecksMock } = vi.hoisted(() => ({
  getStatementMock: vi.fn(),
  listStatementChecksMock: vi.fn()
}));

vi.mock('../api', () => ({
  accountingApi: {
    getStatement: (...args: unknown[]) => getStatementMock(...args),
    listStatementChecks: (...args: unknown[]) => listStatementChecksMock(...args)
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
  });

  beforeEach(() => {
    vi.clearAllMocks();
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
          issues: []
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
                  promptPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/proposal.prompt.v1.txt',
                  rawPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/proposal.raw.v1.json',
                  normalizedPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/proposal.normalized.v1.json'
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
                cropImagePath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/front.jpg',
                ocrTextPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/ocr.txt',
                ocrJsonPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/ocr.json'
              },
              gcs: {
                frontPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/front.jpg',
                structuredPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-1/structured.v1.json'
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
                  promptPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/proposal.prompt.v1.txt',
                  rawPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/proposal.raw.v1.json',
                  normalizedPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/proposal.normalized.v1.json'
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
                cropImagePath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/front.jpg',
                ocrTextPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/ocr.txt',
                ocrJsonPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/ocr.json'
              },
              gcs: {
                frontPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/front.jpg',
                structuredPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-2/structured.v1.json'
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
                  promptPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/proposal.prompt.v1.txt',
                  rawPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/proposal.raw.v1.json',
                  normalizedPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/proposal.normalized.v1.json'
                }
              },
              extracted: {
                checkNumber: '1003',
                date: '2026-03-10',
                payeeName: 'Internal Transfer',
                amount: 250.0,
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
                cropImagePath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/front.jpg',
                ocrTextPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/ocr.txt',
                ocrJsonPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/ocr.json'
              },
              gcs: {
                frontPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/front.jpg',
                structuredPath: 'companies/company-a/statements/2026/03/statement-1/derived/checks/extracted/check-3/structured.v1.json'
              }
            }
          ]
        }
      }
    });
  });

  it('renders phase and remaining progress for the statement detail view', async () => {
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
    expect(screen.getByText(/2 done • 3 left/i)).toBeInTheDocument();
    expect(screen.getByText(/Queued 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Processing 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Ready 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed 0/i)).toBeInTheDocument();
    expect(screen.getByText(/^Payee: Staples$/i)).toBeInTheDocument();
    expect(screen.getByText(/Check No: 1001/i)).toBeInTheDocument();
    expect(screen.getByText(/Source: ocr/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Crop ready/i)).toHaveLength(3);
    expect(screen.getAllByText(/OCR ready/i)).toHaveLength(3);
    expect(screen.getAllByText(/Structured ready/i)).toHaveLength(3);
    expect(screen.getByText(/Retries: 2/i)).toBeInTheDocument();
    expect(screen.getByText(/Vision OCR timed out/i)).toBeInTheDocument();
    expect(screen.getByText(/^Gemini-assisted$/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended: Check to Staples/i)).toBeInTheDocument();
    expect(screen.getByText(/^Deterministic fallback$/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended: Expense for Office Depot/i)).toBeInTheDocument();
    expect(screen.getByText(/^AI degraded$/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended: Transfer to Savings/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposal reasons: Gemini matched Staples • Amount aligned with history/i)).toBeInTheDocument();
    expect(screen.getByText(/AI note: Gemini was unavailable, using deterministic fallback\./i)).toBeInTheDocument();
    expect(screen.getByText(/AI note: Gemini rate limited during classification\./i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/i })).toBeInTheDocument();
  });
});
