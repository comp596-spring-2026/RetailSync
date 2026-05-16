import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import axios, { AxiosError } from 'axios';
import { accountingApi } from '../api';
import { UploadStatementDialog } from './UploadStatementDialog';

vi.mock('../api', () => ({
  accountingApi: {
    detectStatementMonth: vi.fn(),
    requestUploadUrl: vi.fn(),
    getStatementStatus: vi.fn(),
    createStatement: vi.fn(),
    reprocessStatement: vi.fn(),
    getStatementMonthSummary: vi.fn().mockRejectedValue({ response: { status: 404 } })
  },
}));

vi.mock('axios', () => ({
  AxiosError: class AxiosError extends Error {
    response?: unknown;
    config?: unknown;

    constructor(message?: string, response?: unknown, config?: unknown) {
      super(message);
      this.name = 'AxiosError';
      this.response = response;
      this.config = config;
    }
  },
  default: {
    isAxiosError: vi.fn((error: unknown) => error instanceof Error && error.name === 'AxiosError'),
    put: vi.fn(),
  },
}));

const detectStatementMonthMock = vi.mocked(accountingApi.detectStatementMonth);
const requestUploadUrlMock = vi.mocked(accountingApi.requestUploadUrl);
const getStatementStatusMock = vi.mocked(accountingApi.getStatementStatus);
const createStatementMock = vi.mocked(accountingApi.createStatement);
const reprocessStatementMock = vi.mocked(accountingApi.reprocessStatement);
const axiosPutMock = vi.mocked(axios.put);

const detectedMonthPayload = {
  statementMonth: '2025-12',
  confidence: 'high' as const,
  source: 'pdf_text' as const,
  summary: 'This looks like a December 2025 statement.',
  evidence: 'Statement Ending 12/31/2025',
  autoApply: true,
};

type StatementStatusResponse = {
  data: {
    data: {
      statementId: string;
      status: 'uploaded' | 'extracting' | 'structuring' | 'checks_queued' | 'ready_for_review' | 'failed';
      progress: {
        phase: 'uploaded' | 'extracting' | 'structuring' | 'checks_queued' | 'ready_for_review' | 'failed';
        totalChecks: number;
        checksQueued: number;
        checksProcessing: number;
        checksReady: number;
        checksFailed: number;
        completedChecks: number;
        remainingChecks: number;
      };
      updatedAt: string;
      issues: string[];
    };
  };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('UploadStatementDialog', () => {
  it('detects the statement month after selecting a PDF', async () => {
    detectStatementMonthMock.mockResolvedValue({
      data: { data: detectedMonthPayload },
    } as never);

    render(
      <UploadStatementDialog
        open
        onClose={vi.fn()}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByTestId('statement-pdf-input') as HTMLInputElement;
    const file = new File(['sample pdf'], 'testStatmentPDF.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(detectStatementMonthMock).toHaveBeenCalledWith(file));
    await waitFor(() => {
      expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    });
    expect(await screen.findByText(/Dec 2025 bank statement/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    expect(await screen.findByText(/Dec 2025 from the PDF/i)).toBeInTheDocument();
    expect(screen.queryByText(/Confidence:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Source:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Evidence preview:/i)).not.toBeInTheDocument();
  });

  it('supports drag and drop and uploads using the detected month', async () => {
    detectStatementMonthMock.mockResolvedValue({
      data: { data: detectedMonthPayload },
    } as never);
    requestUploadUrlMock.mockResolvedValue({
      data: {
        data: {
          uploadUrl: 'https://storage.example.com/upload',
          gcsPath: 'companies/company-a/statements/2025/12/statement-a/original/statement.pdf',
          statementId: 'statement-a',
          rootPrefix: 'companies/company-a/statements/2025/12/statement-a',
          expiresAt: '2026-03-18T18:51:49.113Z',
        },
      },
    } as never);
    createStatementMock.mockResolvedValue({
      data: {
        data: {
          statement: {
            id: 'statement-a',
            statementMonth: '2025-12',
            fileName: 'testStatmentPDF.pdf',
            source: 'upload',
            status: 'extracting',
            progress: {
              phase: 'extracting',
              totalChecks: 0,
              checksQueued: 0,
              checksProcessing: 0,
              checksReady: 0,
              checksFailed: 0,
              completedChecks: 0,
              remainingChecks: 0,
            },
            issuesCount: 0,
            updatedAt: '2026-03-18T18:51:49.113Z',
            createdAt: '2026-03-18T18:51:49.113Z',
          },
          queue: null,
        },
      },
    } as never);
    getStatementStatusMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-a',
          status: 'structuring',
          progress: {
            phase: 'structuring',
            totalChecks: 0,
            checksQueued: 0,
            checksProcessing: 0,
            checksReady: 0,
            checksFailed: 0,
            completedChecks: 0,
            remainingChecks: 0,
          },
          updatedAt: '2026-03-18T18:52:02.000Z',
          issues: [],
        },
      },
    } as never);
    axiosPutMock.mockResolvedValue({} as never);
    const onUploaded = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <UploadStatementDialog
        open
        onClose={onClose}
        onUploaded={onUploaded}
      />,
    );

    const file = new File(['sample pdf'], 'testStatmentPDF.pdf', {
      type: 'application/pdf',
    });

    fireEvent.drop(screen.getByLabelText(/Statement PDF drop zone/i), {
      dataTransfer: { files: [file] },
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    });
    expect(await screen.findByText(/Dec 2025 from the PDF/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Upload & Start/i }));

    await waitFor(() =>
      expect(requestUploadUrlMock).toHaveBeenCalledWith({
        fileName: 'testStatmentPDF.pdf',
        statementMonth: '2025-12',
        contentType: 'application/pdf',
      }),
    );
    await waitFor(() =>
      expect(createStatementMock).toHaveBeenCalledWith({
        statementId: 'statement-a',
        fileName: 'testStatmentPDF.pdf',
        statementMonth: '2025-12',
        gcsPath: 'companies/company-a/statements/2025/12/statement-a/original/statement.pdf',
        source: 'upload',
      }),
    );
    expect(axiosPutMock).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes immediately after statement save starts processing', async () => {
    detectStatementMonthMock.mockResolvedValue({
      data: { data: detectedMonthPayload },
    } as never);
    requestUploadUrlMock.mockResolvedValue({
      data: {
        data: {
          uploadUrl: 'https://storage.example.com/upload',
          gcsPath: 'companies/company-a/statements/2025/12/statement-a/original/statement.pdf',
          statementId: 'statement-a',
          rootPrefix: 'companies/company-a/statements/2025/12/statement-a',
          expiresAt: '2026-03-18T18:51:49.113Z',
        },
      },
    } as never);
    createStatementMock.mockResolvedValue({
      data: {
        data: {
          statement: {
            id: 'statement-a',
            statementMonth: '2025-12',
            fileName: 'testStatmentPDF.pdf',
            source: 'upload',
            status: 'extracting',
            progress: {
              totalChecks: 0,
              checksQueued: 0,
              checksProcessing: 0,
              checksReady: 0,
              checksFailed: 0,
            },
            issuesCount: 0,
            updatedAt: '2026-03-18T18:51:49.113Z',
            createdAt: '2026-03-18T18:51:49.113Z',
          },
          queue: null,
        },
      },
    } as never);
    getStatementStatusMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-a',
          status: 'extracting',
          progress: {
            phase: 'extracting',
            totalChecks: 0,
            checksQueued: 0,
            checksProcessing: 0,
            checksReady: 0,
            checksFailed: 0,
            completedChecks: 0,
            remainingChecks: 0,
          },
          updatedAt: '2026-03-18T18:52:02.000Z',
          issues: [],
        },
      },
    } as never);
    axiosPutMock.mockResolvedValue({} as never);
    const onClose = vi.fn();

    render(
      <UploadStatementDialog
        open
        onClose={onClose}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByTestId('statement-pdf-input') as HTMLInputElement;
    const file = new File(['sample pdf'], 'testStatmentPDF.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Start/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/^Processing$/i)).not.toBeInTheDocument();
  });

  it('shows a helpful error when direct storage upload is blocked', async () => {
    detectStatementMonthMock.mockResolvedValue({
      data: { data: detectedMonthPayload },
    } as never);
    requestUploadUrlMock.mockResolvedValue({
      data: {
        data: {
          uploadUrl: 'https://storage.googleapis.com/retailsync-accounting-dev/path/to/object.pdf',
          gcsPath: 'companies/company-a/statements/2025/12/statement-a/original/statement.pdf',
          statementId: 'statement-a',
          rootPrefix: 'companies/company-a/statements/2025/12/statement-a',
          expiresAt: '2026-03-18T18:51:49.113Z',
        },
      },
    } as never);
    axiosPutMock.mockRejectedValue({
      config: {
        url: 'https://storage.googleapis.com/retailsync-accounting-dev/path/to/object.pdf',
      },
    } as never);

    render(
      <UploadStatementDialog
        open
        onClose={vi.fn()}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByTestId('statement-pdf-input') as HTMLInputElement;
    const file = new File(['sample pdf'], 'testStatmentPDF.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Start/i }));

    expect(
      await screen.findByText(/verify the accounting bucket CORS policy allows http:\/\/localhost/i),
    ).toBeInTheDocument();
    expect(createStatementMock).not.toHaveBeenCalled();
  });

  it('closes the dialog after upload and surfaces finalize failure via onSaveError', async () => {
    detectStatementMonthMock.mockResolvedValue({
      data: { data: detectedMonthPayload },
    } as never);
    requestUploadUrlMock.mockResolvedValue({
      data: {
        data: {
          uploadUrl: 'https://storage.example.com/upload',
          gcsPath: 'companies/company-a/statements/2025/12/statement-a/original/statement.pdf',
          statementId: 'statement-a',
          rootPrefix: 'companies/company-a/statements/2025/12/statement-a',
          expiresAt: '2026-03-18T18:51:49.113Z',
        },
      },
    } as never);
    axiosPutMock.mockResolvedValue({} as never);
    createStatementMock.mockRejectedValue(
      new AxiosError(
        'statement_queue_failed',
        {
          data: {
            message: 'statement_queue_failed',
          },
        } as never,
      ) as never,
    );

    const onClose = vi.fn();
    const onSaveError = vi.fn();

    render(
      <UploadStatementDialog
        open
        onClose={onClose}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
        onSaveError={onSaveError}
      />,
    );

    const input = screen.getByTestId('statement-pdf-input') as HTMLInputElement;
    const file = new File(['sample pdf'], 'testStatmentPDF.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Start/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(createStatementMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onSaveError).toHaveBeenCalledTimes(1));
    expect(typeof onSaveError.mock.calls[0][0]).toBe('string');
    expect(onSaveError.mock.calls[0][0].length).toBeGreaterThan(0);
    expect(axiosPutMock).toHaveBeenCalledTimes(1);
    expect(requestUploadUrlMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Retry Save/i })).not.toBeInTheDocument();
  });

  it('does not block upload flow waiting for extraction retries in dialog', async () => {
    detectStatementMonthMock.mockResolvedValue({
      data: { data: detectedMonthPayload },
    } as never);
    requestUploadUrlMock.mockResolvedValue({
      data: {
        data: {
          uploadUrl: 'https://storage.example.com/upload',
          gcsPath: 'companies/company-a/statements/2025/12/statement-a/original/statement.pdf',
          statementId: 'statement-a',
          rootPrefix: 'companies/company-a/statements/2025/12/statement-a',
          expiresAt: '2026-03-18T18:51:49.113Z',
        },
      },
    } as never);
    axiosPutMock.mockResolvedValue({} as never);
    createStatementMock.mockResolvedValue({
      data: {
        data: {
          statement: {
            id: 'statement-a',
            statementMonth: '2025-12',
            fileName: 'testStatmentPDF.pdf',
            source: 'upload',
            status: 'extracting',
            progress: {
              phase: 'extracting',
              totalChecks: 0,
              checksQueued: 0,
              checksProcessing: 0,
              checksReady: 0,
              checksFailed: 0,
              completedChecks: 0,
              remainingChecks: 0,
            },
            issuesCount: 0,
            updatedAt: '2026-03-18T18:51:49.113Z',
            createdAt: '2026-03-18T18:51:49.113Z',
          },
          queue: null,
        },
      },
    } as never);
    getStatementStatusMock.mockResolvedValue({
      data: {
        data: {
          statementId: 'statement-a',
          status: 'failed',
          progress: {
            phase: 'failed',
            totalChecks: 0,
            checksQueued: 0,
            checksProcessing: 0,
            checksReady: 0,
            checksFailed: 0,
            completedChecks: 0,
            remainingChecks: 0,
          },
          updatedAt: '2026-03-18T18:52:02.000Z',
          issues: ['Extraction failed'],
        },
      },
    } as never);
    reprocessStatementMock.mockResolvedValue({ data: { data: {} } } as never);
    const onClose = vi.fn();

    render(
      <UploadStatementDialog
        open
        onClose={onClose}
        onUploaded={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByTestId('statement-pdf-input') as HTMLInputElement;
    const file = new File(['sample pdf'], 'testStatmentPDF.pdf', {
      type: 'application/pdf',
    });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Upload & Start/i }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: /Retry processing/i })).not.toBeInTheDocument();
    expect(reprocessStatementMock).not.toHaveBeenCalled();
  });
});
