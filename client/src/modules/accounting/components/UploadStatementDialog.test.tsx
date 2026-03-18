import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { accountingApi } from '../api';
import { UploadStatementDialog } from './UploadStatementDialog';

vi.mock('../api', () => ({
  accountingApi: {
    detectStatementMonth: vi.fn(),
    requestUploadUrl: vi.fn(),
    getStatementStatus: vi.fn(),
    createStatement: vi.fn(),
  },
}));

vi.mock('axios', () => ({
  default: {
    put: vi.fn(),
  },
}));

const detectStatementMonthMock = vi.mocked(accountingApi.detectStatementMonth);
const requestUploadUrlMock = vi.mocked(accountingApi.requestUploadUrl);
const getStatementStatusMock = vi.mocked(accountingApi.getStatementStatus);
const createStatementMock = vi.mocked(accountingApi.createStatement);
const axiosPutMock = vi.mocked(axios.put);

const detectedMonthPayload = {
  statementMonth: '2025-12',
  confidence: 'high' as const,
  source: 'pdf_text' as const,
  summary: 'This looks like a December 2025 statement.',
  evidence: 'Statement Ending 12/31/2025',
};

type StatementStatusResponse = {
  data: {
    data: {
      statementId: string;
      status: 'uploaded' | 'extracting' | 'structuring' | 'checks_queued' | 'ready_for_review' | 'failed';
      progress: {
        totalChecks: number;
        checksQueued: number;
        checksProcessing: number;
        checksReady: number;
        checksFailed: number;
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
    expect((await screen.findAllByText(/December 2025/i)).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('2025-12')).toBeInTheDocument();
    expect(screen.getByText(/Statement Ending 12\/31\/2025/i)).toBeInTheDocument();
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
          status: 'structuring',
          progress: {
            totalChecks: 0,
            checksQueued: 0,
            checksProcessing: 0,
            checksReady: 0,
            checksFailed: 0,
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
    expect((await screen.findAllByText(/December 2025/i)).length).toBeGreaterThan(0);

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
    expect(getStatementStatusMock).toHaveBeenCalledWith('statement-a');
    expect(axiosPutMock).toHaveBeenCalledTimes(1);
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a processing state while waiting for extraction to advance', async () => {
    let statusResolver!: (value: StatementStatusResponse) => void;
    const statusPromise = new Promise<StatementStatusResponse>((resolve) => {
      statusResolver = resolve;
    });

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
    getStatementStatusMock.mockReturnValue(statusPromise as never);
    axiosPutMock.mockResolvedValue({} as never);

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

    expect(await screen.findByText(/Processing statement/i)).toBeInTheDocument();
    expect(screen.getByText(/Extracting statement pages and text now/i)).toBeInTheDocument();

    statusResolver({
      data: {
        data: {
          statementId: 'statement-a',
          status: 'structuring',
          progress: {
            totalChecks: 0,
            checksQueued: 0,
            checksProcessing: 0,
            checksReady: 0,
            checksFailed: 0,
          },
          updatedAt: '2026-03-18T18:52:02.000Z',
          issues: [],
        },
      },
    });
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
      await screen.findByText(/verify the accounting bucket CORS policy allows http:\/\/localhost:4630/i),
    ).toBeInTheDocument();
    expect(createStatementMock).not.toHaveBeenCalled();
  });
});
