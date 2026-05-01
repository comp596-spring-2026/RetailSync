import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import type {
  BankStatementStatus,
  DetectStatementMonthResponse,
  QuickBooksHubChartAccount
} from '@retailsync/shared';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import { formatStatementMonthShort } from '../utils/statementDisplay';

type UploadStatementDialogProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => Promise<void>;
  onSaveError?: (message: string) => void;
};

type PreparedUpload = {
  fileName: string;
  statementMonth: string;
  statementId: string;
  gcsPath: string;
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

const formatStatementMonthLabel = (statementMonth: string) => {
  const [year, month] = statementMonth.split('-');
  const date = new Date(`${year}-${month}-01T00:00:00.000Z`);
  return date.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

const formatFileSize = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const isPdfFile = (nextFile: File) =>
  nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf');

const isDevelopment = import.meta.env.DEV;
const EXTRACTION_ACTIVE_STATUSES: BankStatementStatus[] = ['uploaded', 'extracting'];
const EXTRACTION_ADVANCED_STATUSES: BankStatementStatus[] = [
  'structuring',
  'checks_queued',
  'ready_for_review',
];
const PROCESSING_POLL_INTERVAL_MS = 1500;
const PROCESSING_WAIT_TIMEOUT_MS = 30000;
const PROCESSING_BACKGROUND_POLL_MS = 4000;

type StatementProgress = {
  phase: BankStatementStatus;
  totalChecks: number;
  checksQueued: number;
  checksProcessing: number;
  checksReady: number;
  checksFailed: number;
  completedChecks: number;
  remainingChecks: number;
};

type StatementCheckImagePreview = {
  id: string;
  status: string;
  pageNumber?: number;
  cropImagePath?: string;
  frontPath?: string;
};

const getDetectionSummaryLine = (
  detection: DetectStatementMonthResponse,
  statementMonth: string,
) => {
  if (!detection.statementMonth) {
    return detection.summary?.trim() || 'Could not detect the month — pick it above.';
  }
  const short = formatStatementMonthShort(detection.statementMonth);
  if (detection.statementMonth === statementMonth) {
    return `${short} from the PDF${detection.autoApply ? ' (applied)' : ''}.`;
  }
  return `Detected ${short} — use the button or keep ${formatStatementMonthShort(statementMonth)}.`;
};

const getStorageUploadFailureMessage = (requestUrl: string) => {
  const isStorageUploadFailure =
    typeof requestUrl === 'string' && requestUrl.includes('storage.googleapis.com');
  const currentOrigin =
    typeof window !== 'undefined' && typeof window.location?.origin === 'string'
      ? window.location.origin
      : null;

  if (!isStorageUploadFailure) return null;
  if (!isDevelopment) {
    return 'Upload to secure storage failed. Please try again. If the problem continues, contact support.';
  }
  return `Upload to secure storage failed. If you are running locally, verify the accounting bucket CORS policy allows ${currentOrigin ?? 'your local client origin'}.`;
};

const extractApiErrorReason = (error: unknown) => {
  if (!axios.isAxiosError(error)) return null;
  const payload = error.response?.data;
  if (!payload || typeof payload !== 'object') return null;
  const details =
    'details' in payload && payload.details && typeof payload.details === 'object'
      ? payload.details
      : null;
  const reason = details && 'reason' in details ? details.reason : null;
  return typeof reason === 'string' ? reason : null;
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const formatStatementStatusLabel = (status: BankStatementStatus) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const getProcessingSummary = (status: BankStatementStatus | null) => {
  switch (status) {
    case 'uploaded':
      return 'Preparing the statement for extraction.';
    case 'extracting':
      return 'Extracting statement pages and text.';
    case 'structuring':
      return 'Building transactions and review data.';
    case 'checks_queued':
      return 'Queuing checks and review tasks.';
    case 'ready_for_review':
      return 'Processing complete. Ready for review.';
    case 'failed':
      return 'Statement processing failed.';
    default:
      return 'Starting statement processing.';
  }
};

const isProcessingStatusActive = (status: BankStatementStatus | null) =>
  status === 'uploaded' || status === 'extracting' || status === 'structuring' || status === 'checks_queued';

export const UploadStatementDialog = ({ open, onClose, onUploaded, onSaveError }: UploadStatementDialogProps) => {
  const [statementMonth, setStatementMonth] = useState(currentMonth());
  const [statementMonthTouched, setStatementMonthTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitStageMessage, setSubmitStageMessage] = useState<string | null>(null);
  const [processingStatement, setProcessingStatement] = useState(false);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<BankStatementStatus | null>(null);
  const [processingProgress, setProcessingProgress] = useState<StatementProgress | null>(null);
  const [processingIssues, setProcessingIssues] = useState<string[]>([]);
  const [processingWaitingForBackend, setProcessingWaitingForBackend] = useState(false);
  const [processingOriginalStatementPath, setProcessingOriginalStatementPath] = useState<string | null>(null);
  const [processingCheckImagePreview, setProcessingCheckImagePreview] = useState<
    StatementCheckImagePreview[]
  >([]);
  const [detectingStatementMonth, setDetectingStatementMonth] = useState(false);
  const [detection, setDetection] = useState<DetectStatementMonthResponse | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preparedUpload, setPreparedUpload] = useState<PreparedUpload | null>(null);
  const [activeStatementId, setActiveStatementId] = useState<string | null>(null);
  const [existingMonthConflict, setExistingMonthConflict] = useState<{
    statementCount: number;
    latestStatus: string;
  } | null>(null);
  const [bankAccounts, setBankAccounts] = useState<QuickBooksHubChartAccount[]>([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [bankAccountsError, setBankAccountsError] = useState<string | null>(null);
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const statementMonthTouchedRef = useRef(false);
  const detectionRequestIdRef = useRef(0);
  const processingRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const finalizingBackgroundRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setStatementMonth(currentMonth());
    setStatementMonthTouched(false);
    setFile(null);
    setUploadProgress(0);
    setUploading(false);
    setFinalizing(false);
    setSubmitError(null);
    setSubmitStageMessage(null);
    setProcessingStatement(false);
    setProcessingTimedOut(false);
    setProcessingStatus(null);
    setProcessingProgress(null);
    setProcessingIssues([]);
    setProcessingWaitingForBackend(false);
    setProcessingOriginalStatementPath(null);
    setProcessingCheckImagePreview([]);
    setDetectingStatementMonth(false);
    setDetection(null);
    setDetectionError(null);
    setDragActive(false);
    setPreparedUpload(null);
    setActiveStatementId(null);
    setExistingMonthConflict(null);
    setBankAccountId('');
    setBankAccountsError(null);
    statementMonthTouchedRef.current = false;
    detectionRequestIdRef.current += 1;
    processingRequestIdRef.current += 1;
  }, [open]);

  useEffect(() => {
    statementMonthTouchedRef.current = statementMonthTouched;
  }, [statementMonthTouched]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadBankAccounts = async () => {
      setBankAccountsLoading(true);
      setBankAccountsError(null);
      try {
        const response = await accountingApi.getQuickbooksHubChartOfAccounts({
          type: 'Bank',
          status: 'active',
          page: 1,
          pageSize: 100,
          sort: 'name'
        });
        if (cancelled) return;
        const items = response.data.data.items ?? [];
        setBankAccounts(items);
        setBankAccountId((current) => {
          if (current) return current;
          return items.length === 1 ? items[0].id : '';
        });
      } catch (error) {
        if (cancelled) return;
        setBankAccountsError(
          extractApiErrorMessage(
            error,
            'Could not load bank accounts from QuickBooks. You can continue without selecting one.'
          )
        );
      } finally {
        if (!cancelled) {
          setBankAccountsLoading(false);
        }
      }
    };
    void loadBankAccounts();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const run = async () => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(statementMonth)) {
        setExistingMonthConflict(null);
        return;
      }
      try {
        const res = await accountingApi.getStatementMonthSummary(statementMonth);
        if (!cancelled) {
          setExistingMonthConflict({
            statementCount: res.data.data.statementCount,
            latestStatus: res.data.data.latestStatus
          });
        }
      } catch (error: unknown) {
        const status =
          error &&
          typeof error === 'object' &&
          'response' in error &&
          (error as { response?: { status?: number } }).response?.status;
        if (status === 404) {
          if (!cancelled) setExistingMonthConflict(null);
          return;
        }
        if (!cancelled) setExistingMonthConflict(null);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, statementMonth]);

  const uploadDisabled = useMemo(() => {
    if (uploading) return true;
    if (finalizing) return true;
    if (detectingStatementMonth) return true;
    if (!file) return true;
    if (!statementMonth) return true;
    return false;
  }, [detectingStatementMonth, file, finalizing, statementMonth, uploading]);

  const busy = uploading || finalizing;

  const waitForExtractionAdvance = async (
    statementId: string,
    initialStatus: BankStatementStatus,
    initialProgress: StatementProgress | null,
  ): Promise<{
    kind: 'advanced' | 'failed' | 'timeout' | 'cancelled';
    status: BankStatementStatus;
    progress: StatementProgress | null;
    issues: string[];
  }> => {
    processingRequestIdRef.current += 1;
    const requestId = processingRequestIdRef.current;
    const startedAt = Date.now();
    let latestStatus = initialStatus;
    let latestIssues: string[] = [];

    setProcessingStatement(true);
    setProcessingTimedOut(false);
    setProcessingStatus(initialStatus);
    setProcessingProgress(initialProgress);
    setProcessingIssues([]);
    setProcessingWaitingForBackend(false);

    while (requestId === processingRequestIdRef.current) {
      let response: Awaited<ReturnType<typeof accountingApi.getStatementStatus>> | null = null;
      try {
        response = await accountingApi.getStatementStatus(statementId);
      } catch {
        setProcessingWaitingForBackend(true);
        if (Date.now() - startedAt >= PROCESSING_WAIT_TIMEOUT_MS) {
          setProcessingStatement(false);
          setProcessingTimedOut(true);
          return { kind: 'timeout', status: latestStatus, progress: initialProgress, issues: latestIssues };
        }
        await sleep(PROCESSING_POLL_INTERVAL_MS);
        continue;
      }

      if (requestId !== processingRequestIdRef.current) {
        return { kind: 'cancelled', status: latestStatus, progress: initialProgress, issues: latestIssues };
      }

      setProcessingWaitingForBackend(false);
      latestStatus = response.data.data.status;
      latestIssues = response.data.data.issues ?? [];
      setProcessingStatus(latestStatus);
      setProcessingProgress(response.data.data.progress ?? null);
      setProcessingIssues(latestIssues);
      setProcessingOriginalStatementPath(response.data.data.gcs?.pdfPath ?? null);
      setProcessingCheckImagePreview(response.data.data.checkImagePreview ?? []);

      if (latestStatus === 'failed') {
        setProcessingStatement(false);
        return { kind: 'failed', status: latestStatus, progress: response.data.data.progress ?? null, issues: latestIssues };
      }

      if (EXTRACTION_ADVANCED_STATUSES.includes(latestStatus)) {
        setProcessingStatement(false);
        return { kind: 'advanced', status: latestStatus, progress: response.data.data.progress ?? null, issues: latestIssues };
      }

      if (!EXTRACTION_ACTIVE_STATUSES.includes(latestStatus)) {
        setProcessingStatement(false);
        return { kind: 'advanced', status: latestStatus, progress: response.data.data.progress ?? null, issues: latestIssues };
      }

      if (Date.now() - startedAt >= PROCESSING_WAIT_TIMEOUT_MS) {
        setProcessingStatement(false);
        setProcessingTimedOut(true);
        return { kind: 'timeout', status: latestStatus, progress: response.data.data.progress ?? null, issues: latestIssues };
      }

      await sleep(PROCESSING_POLL_INTERVAL_MS);
    }

    return { kind: 'cancelled', status: latestStatus, progress: initialProgress, issues: latestIssues };
  };

  const inspectSelectedFile = async (nextFile: File | null) => {
    detectionRequestIdRef.current += 1;
    const requestId = detectionRequestIdRef.current;

    if (!nextFile) {
      setDetectingStatementMonth(false);
      setDetection(null);
      setDetectionError(null);
      return;
    }

    setDetectingStatementMonth(true);
    setDetection(null);
    setDetectionError(null);

    try {
      const response = await accountingApi.detectStatementMonth(nextFile);
      if (requestId !== detectionRequestIdRef.current) return;

      const nextDetection = response.data.data;
      setDetection(nextDetection);

      if (nextDetection.statementMonth && nextDetection.autoApply && !statementMonthTouchedRef.current) {
        setStatementMonth(nextDetection.statementMonth);
        setStatementMonthTouched(false);
      }
    } catch (error) {
      if (requestId !== detectionRequestIdRef.current) return;
      setDetectionError(extractApiErrorMessage(error, 'Failed to inspect PDF for statement month'));
    } finally {
      if (requestId === detectionRequestIdRef.current) {
        setDetectingStatementMonth(false);
      }
    }
  };

  const handleSelectedFile = async (nextFile: File | null) => {
    if (!nextFile) {
      setFile(null);
      setDetection(null);
      setDetectionError(null);
      setPreparedUpload(null);
      setActiveStatementId(null);
      setProcessingStatement(false);
      setProcessingTimedOut(false);
      setProcessingStatus(null);
      setProcessingIssues([]);
      setProcessingOriginalStatementPath(null);
      setProcessingCheckImagePreview([]);
      detectionRequestIdRef.current += 1;
      processingRequestIdRef.current += 1;
      return;
    }

    if (!isPdfFile(nextFile)) {
      setFile(null);
      setDetection(null);
      setDetectionError('Please choose a PDF statement file.');
      setPreparedUpload(null);
      setActiveStatementId(null);
      setProcessingStatement(false);
      setProcessingTimedOut(false);
      setProcessingStatus(null);
      setProcessingIssues([]);
      setProcessingOriginalStatementPath(null);
      setProcessingCheckImagePreview([]);
      detectionRequestIdRef.current += 1;
      processingRequestIdRef.current += 1;
      return;
    }

    setFile(nextFile);
    setPreparedUpload(null);
    await inspectSelectedFile(nextFile);
  };

  const applyDetectedMonth = () => {
    if (!detection?.statementMonth) return;
    setStatementMonth(detection.statementMonth);
    setStatementMonthTouched(true);
  };

  const finalizeStatementInBackground = async (payload: PreparedUpload) => {
    finalizingBackgroundRef.current = true;
    try {
      const created = await accountingApi.createStatement({
        statementId: payload.statementId,
        fileName: payload.fileName,
        statementMonth: payload.statementMonth,
        gcsPath: payload.gcsPath,
        source: 'upload',
        bankAccountId: bankAccountId || undefined
      });
      if (mountedRef.current) {
        setActiveStatementId(created.data.data.statement.id);
        setPreparedUpload(null);
      }
      void onUploaded().catch(() => {
        // Background list refresh failures should not bubble up.
      });
    } catch (error) {
      const message = extractApiErrorMessage(
        error,
        'The PDF upload finished, but RetailSync could not create the statement. Please try uploading again.'
      );
      if (onSaveError) {
        onSaveError(message);
      } else if (mountedRef.current) {
        setSubmitError(message);
      }
    } finally {
      finalizingBackgroundRef.current = false;
      if (mountedRef.current) {
        setFinalizing(false);
        setSubmitStageMessage(null);
      }
    }
  };

  const submit = async () => {
    if (!file) return;

    setSubmitError(null);
    setSubmitStageMessage(null);
    setProcessingTimedOut(false);
    setProcessingIssues([]);
    setProcessingProgress(null);

    try {
      let payload = preparedUpload;

      if (!payload || payload.fileName !== file.name || payload.statementMonth !== statementMonth) {
        setUploading(true);
        setUploadProgress(0);
        setSubmitStageMessage('Uploading PDF to secure storage…');

        const signed = await accountingApi.requestUploadUrl({
          fileName: file.name,
          statementMonth,
          contentType: 'application/pdf'
        });

        payload = {
          fileName: file.name,
          statementMonth,
          statementId: signed.data.data.statementId,
          gcsPath: signed.data.data.gcsPath
        };

        await axios.put(signed.data.data.uploadUrl, file, {
          headers: {
            'Content-Type': 'application/pdf'
          },
          onUploadProgress: (event) => {
            if (!event.total) return;
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(Math.max(0, Math.min(100, percent)));
          }
        });

        setPreparedUpload(payload);
      }

      // PDF is safely in storage — close the dialog immediately and finalize
      // the statement record in the background. The user no longer has to wait
      // on a second backend round-trip with a loading spinner.
      setUploading(false);
      setFinalizing(true);
      setSubmitStageMessage(null);
      onClose();
      void finalizeStatementInBackground(payload);
      return;
    } catch (error) {
      const maybeAxiosError = error as {
        response?: unknown;
        config?: { url?: string };
      } | null;
      const requestUrl = maybeAxiosError?.config?.url ?? '';
      const storageUploadFailureMessage =
        !maybeAxiosError?.response ? getStorageUploadFailureMessage(requestUrl) : null;
      const submitFailureReason = extractApiErrorReason(error);

      if (
        submitFailureReason === 'statement_pdf_missing' ||
        submitFailureReason === 'statement_storage_access_denied'
      ) {
        setPreparedUpload(null);
      }

      setSubmitError(
        storageUploadFailureMessage ??
          extractApiErrorMessage(error, 'Failed to upload statement'),
      );
      setUploading(false);
      setFinalizing(false);
      setSubmitStageMessage(null);
    }
  };

  const clearSelectedFile = () => {
    setFile(null);
    setDetection(null);
    setDetectionError(null);
    setSubmitError(null);
    setSubmitStageMessage(null);
    setProcessingStatement(false);
    setProcessingTimedOut(false);
    setProcessingStatus(null);
    setProcessingProgress(null);
    setProcessingIssues([]);
    setDetectingStatementMonth(false);
    setPreparedUpload(null);
    setActiveStatementId(null);
    detectionRequestIdRef.current += 1;
    processingRequestIdRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const refreshProcessingStatus = async () => {
    if (!activeStatementId) return;
    try {
      const response = await accountingApi.getStatementStatus(activeStatementId);
      setProcessingStatus(response.data.data.status);
      setProcessingProgress(response.data.data.progress ?? null);
      setProcessingIssues(response.data.data.issues ?? []);
      setProcessingWaitingForBackend(false);
      setProcessingOriginalStatementPath(response.data.data.gcs?.pdfPath ?? null);
      setProcessingCheckImagePreview(response.data.data.checkImagePreview ?? []);
      setProcessingTimedOut(false);
    } catch (error) {
      setProcessingWaitingForBackend(true);
      setSubmitError(null);
    }
  };

  useEffect(() => {
    if (!activeStatementId) return;
    if (processingStatement) return;
    if (!processingTimedOut && !isProcessingStatusActive(processingStatus)) return;
    const timer = window.setInterval(() => {
      void refreshProcessingStatus();
    }, PROCESSING_BACKGROUND_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeStatementId, processingStatus, processingStatement, processingTimedOut]);

  const retryProcessing = async () => {
    if (!activeStatementId) return;
    try {
      setSubmitError(null);
      setSubmitStageMessage('Restarting statement processing…');
      await accountingApi.reprocessStatement(activeStatementId);
      const response = await accountingApi.getStatementStatus(activeStatementId);
      setProcessingOriginalStatementPath(response.data.data.gcs?.pdfPath ?? null);
      setProcessingCheckImagePreview(response.data.data.checkImagePreview ?? []);
      await waitForExtractionAdvance(
        activeStatementId,
        response.data.data.status,
        response.data.data.progress ?? null
      );
    } catch (error) {
      setSubmitError(extractApiErrorMessage(error, 'Failed to restart statement processing'));
    } finally {
      setSubmitStageMessage(null);
    }
  };


  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload bank statement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Paper
            variant="outlined"
            aria-label="Statement PDF drop zone"
            onDragOver={(event) => {
              event.preventDefault();
              if (busy) return;
              setDragActive(true);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (busy) return;
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              const nextTarget = event.relatedTarget as Node | null;
              if (nextTarget && event.currentTarget.contains(nextTarget)) return;
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (busy) return;
              setDragActive(false);
              const picked = event.dataTransfer.files?.[0] ?? null;
              void handleSelectedFile(picked);
            }}
            sx={{
              p: 2.5,
              borderStyle: 'dashed',
              borderWidth: 2,
              borderColor: dragActive ? 'primary.main' : 'divider',
              bgcolor: dragActive ? 'action.hover' : 'background.paper',
              transition: 'border-color 0.2s ease, background-color 0.2s ease',
            }}
          >
            <Stack spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
              <Stack spacing={1} alignItems={{ xs: 'flex-start', sm: 'center' }}>
                <UploadFileOutlinedIcon color={dragActive ? 'primary' : 'action'} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {file ? 'PDF selected' : 'Drop a PDF here'}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign={{ sm: 'center' }}>
                  {file ? 'We suggest a statement month below; change it if needed.' : 'Or use the button to choose a file.'}
                </Typography>
              </Stack>

              {file ? (
                <Paper
                  variant="outlined"
                  sx={{
                    width: '100%',
                    p: 1.5,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    justifyContent="space-between"
                    alignItems={{ sm: 'center' }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="flex-start">
                      <DescriptionOutlinedIcon color="action" sx={{ mt: 0.25 }} />
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {formatStatementMonthShort(statementMonth)} bank statement
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(file.size)} · PDF
                        </Typography>
                      </Stack>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={busy}
                      >
                        Change
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        startIcon={<DeleteOutlineIcon />}
                        onClick={clearSelectedFile}
                        disabled={busy}
                      >
                        Clear
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              ) : null}

              <Button
                variant={file ? 'outlined' : 'contained'}
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                startIcon={<UploadFileOutlinedIcon />}
              >
                {file ? 'Replace PDF' : 'Choose PDF'}
              </Button>

              <input
                ref={fileInputRef}
                data-testid="statement-pdf-input"
                hidden
                type="file"
                accept="application/pdf,.pdf"
                onChange={(event) => {
                  const picked = event.target.files?.[0] ?? null;
                  void handleSelectedFile(picked);
                }}
              />
            </Stack>
          </Paper>

          <TextField
            label="Statement month"
            type="month"
            value={statementMonth}
            onChange={(event) => {
              setStatementMonth(event.target.value);
              setStatementMonthTouched(true);
            }}
            disabled={busy}
            InputLabelProps={{ shrink: true }}
            helperText="We read the period from the PDF when we can; change this field if it is wrong."
            InputProps={{
              startAdornment: (
                <Box
                  component="span"
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    color: 'text.secondary',
                    mr: 1,
                  }}
                >
                  <CalendarMonthOutlinedIcon fontSize="small" />
                </Box>
              ),
            }}
          />



          {existingMonthConflict ? (
            <Alert severity="warning">
              {formatStatementMonthLabel(statementMonth)} already has{' '}
              {existingMonthConflict.statementCount === 1 ? 'a statement' : `${existingMonthConflict.statementCount} statements`}{' '}
              (latest: {formatStatementStatusLabel(existingMonthConflict.latestStatus as BankStatementStatus)}). Uploading
              replaces the existing statement for this month.
            </Alert>
          ) : null}

          {detectingStatementMonth ? (
            <Typography variant="body2" color="text.secondary">
              Reading the statement month from the PDF…
            </Typography>
          ) : null}

          {!detectingStatementMonth && detection ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} flexWrap="wrap" useFlexGap>
              <Typography variant="body2" color="text.secondary">
                {getDetectionSummaryLine(detection, statementMonth)}
              </Typography>
              {detection.statementMonth && !detection.autoApply && detection.statementMonth !== statementMonth ? (
                <Button size="small" variant="outlined" onClick={applyDetectedMonth}>
                  Use {formatStatementMonthShort(detection.statementMonth)}
                </Button>
              ) : null}
            </Stack>
          ) : null}

          {!detectingStatementMonth && detectionError ? (
            <Alert severity="warning">{detectionError}</Alert>
          ) : null}

          {submitStageMessage ? (
            <Alert severity="info">{submitStageMessage}</Alert>
          ) : null}

          {submitError ? <Alert severity="error">{submitError}</Alert> : null}

          {(uploading || finalizing) && (
            <Stack spacing={1}>
              <LinearProgress
                variant={uploading ? 'determinate' : 'indeterminate'}
                value={uploading ? uploadProgress : undefined}
              />
              <Typography variant="caption" color="text.secondary">
                {uploading ? `Uploading ${uploadProgress}%` : 'Saving statement…'}
              </Typography>
            </Stack>
          )}

          {processingStatement || processingTimedOut ? (
            <Alert
              severity={
                processingStatus === 'failed'
                  ? 'error'
                  : processingTimedOut
                    ? 'warning'
                    : 'info'
              }
            >
              <Stack spacing={1}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  flexWrap="wrap"
                  useFlexGap
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {processingStatement ? 'Processing' : 'Still running'}
                  </Typography>
                  {processingStatus ? (
                    <Chip
                      size="small"
                      label={formatStatementStatusLabel(processingStatus)}
                      variant="outlined"
                    />
                  ) : null}
                  {processingProgress ? (
                    <Chip
                      size="small"
                      label={`Phase: ${formatStatementStatusLabel(processingProgress.phase)}`}
                      variant="outlined"
                    />
                  ) : null}
                </Stack>
                <Typography variant="body2">
                  {processingTimedOut
                    ? 'Upload finished. You can close this dialog; status updates on the statements list.'
                    : getProcessingSummary(processingStatus)}
                </Typography>
                {processingWaitingForBackend ? (
                  <Typography variant="caption" color="text.secondary">
                    Waiting for a status update…
                  </Typography>
                ) : null}
                {processingProgress && processingProgress.totalChecks > 0 ? (
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip size="small" label={`Done ${processingProgress.completedChecks}`} variant="outlined" />
                    <Chip size="small" label={`Left ${processingProgress.remainingChecks}`} variant="outlined" />
                    <Chip size="small" label={`Queued ${processingProgress.checksQueued}`} variant="outlined" />
                    <Chip size="small" label={`Processing ${processingProgress.checksProcessing}`} variant="outlined" />
                    <Chip size="small" label={`Ready ${processingProgress.checksReady}`} variant="outlined" />
                    <Chip size="small" label={`Failed ${processingProgress.checksFailed}`} variant="outlined" />
                  </Stack>
                ) : null}
                {processingStatement ? <LinearProgress /> : null}
                {processingIssues.length > 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    {processingIssues[0]}
                  </Typography>
                ) : null}
              </Stack>
            </Alert>
          ) : null}

          {isDevelopment &&
          (processingOriginalStatementPath || processingCheckImagePreview.length > 0) ? (
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Stack spacing={0.75}>
                <Typography variant="subtitle2">Debug artifacts</Typography>
                {processingOriginalStatementPath ? (
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    PDF: {processingOriginalStatementPath}
                  </Typography>
                ) : null}
                {processingCheckImagePreview.length > 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    Check image previews: {processingCheckImagePreview.length}
                  </Typography>
                ) : null}
              </Stack>
            </Paper>
          ) : null}

          {activeStatementId ? (
            <Alert severity="success">
              Upload received. You can close this and follow progress from Bank Statements or open the workspace.
            </Alert>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        {activeStatementId && !busy && (processingTimedOut || processingStatus === 'failed') ? (
          <Button onClick={() => void refreshProcessingStatus()} variant="outlined">
            Refresh Status
          </Button>
        ) : null}
        {activeStatementId && !busy && (processingTimedOut || processingStatus === 'failed') ? (
          <Button onClick={() => void retryProcessing()} variant="outlined">
            Retry Processing
          </Button>
        ) : null}
        <Button onClick={() => void submit()} variant="contained" disabled={uploadDisabled}>
          {uploading ? 'Uploading...' : 'Upload & Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
