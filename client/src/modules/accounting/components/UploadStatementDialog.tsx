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
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import type { BankStatementStatus, DetectStatementMonthResponse } from '@retailsync/shared';
import axios from 'axios';
import { useEffect, useMemo, useRef, useState } from 'react';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { accountingApi } from '../api';
import { useStatementUploadFlow } from '../hooks/useStatementUploadFlow';
import { StatementStageTimeline } from './StatementStageTimeline';

type UploadStatementDialogProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => Promise<void>;
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

const getDetectionMessage = (
  detection: DetectStatementMonthResponse,
  statementMonth: string,
) => {
  if (!detection.statementMonth) {
    return detection.summary || 'RetailSync could not confidently identify the statement month.';
  }

  const monthLabel = formatStatementMonthLabel(detection.statementMonth);
  if (detection.statementMonth === statementMonth) {
    return detection.autoApply
      ? `Applied the ${monthLabel} month from the PDF. You can still adjust it before upload.`
      : `This looks like a ${monthLabel} statement. You can adjust the month before upload if needed.`;
  }

  return detection.summary || `This looks like a ${monthLabel} statement.`;
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

export const UploadStatementDialog = ({ open, onClose, onUploaded }: UploadStatementDialogProps) => {
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
  const statementMonthTouchedRef = useRef(false);
  const detectionRequestIdRef = useRef(0);
  const processingRequestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
    statementMonthTouchedRef.current = false;
    detectionRequestIdRef.current += 1;
    processingRequestIdRef.current += 1;
  }, [open]);

  useEffect(() => {
    statementMonthTouchedRef.current = statementMonthTouched;
  }, [statementMonthTouched]);

  const uploadDisabled = useMemo(() => {
    if (uploading) return true;
    if (finalizing) return true;
    if (processingStatement) return true;
    if (detectingStatementMonth) return true;
    if (!file) return true;
    if (!statementMonth) return true;
    return false;
  }, [detectingStatementMonth, file, finalizing, processingStatement, processingTimedOut, statementMonth, uploading]);

  const workflowStepsWithState = useStatementUploadFlow({
    fileSelected: Boolean(file),
    detectingStatementMonth,
    statementMonth,
    uploading,
    finalizing,
    preparedUpload: Boolean(preparedUpload),
    activeStatementId: Boolean(activeStatementId),
    processingStatement,
    processingTimedOut,
    processingStatus,
    submitError,
    detection
  });

  const busy = uploading || finalizing || processingStatement;

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

  const submit = async () => {
    if (!file) return;

    setSubmitError(null);
    setSubmitStageMessage(null);
    setProcessingTimedOut(false);
    setProcessingIssues([]);
    setProcessingProgress(null);
    let finalizingAttempt = false;

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

      finalizingAttempt = true;
      setUploading(false);
      setFinalizing(true);
      setSubmitStageMessage('Saving the uploaded statement and starting processing…');

      const created = await accountingApi.createStatement({
        statementId: payload.statementId,
        fileName: file.name,
        statementMonth,
        gcsPath: payload.gcsPath,
        source: 'upload'
      });
      setActiveStatementId(created.data.data.statement.id);

      await onUploaded();
      const result = await waitForExtractionAdvance(
        created.data.data.statement.id,
        created.data.data.statement.status,
        {
          phase: created.data.data.statement.status,
          totalChecks: created.data.data.statement.progress.totalChecks,
          checksQueued: created.data.data.statement.progress.checksQueued,
          checksProcessing: created.data.data.statement.progress.checksProcessing,
          checksReady: created.data.data.statement.progress.checksReady,
          checksFailed: created.data.data.statement.progress.checksFailed,
          completedChecks: created.data.data.statement.progress.completedChecks,
          remainingChecks: created.data.data.statement.progress.remainingChecks,
        }
      );

      if (result.kind === 'advanced') {
        setPreparedUpload(null);
        onClose();
        return;
      }

      if (result.kind === 'failed') {
        setSubmitError(result.issues[0] || 'Statement upload finished, but extraction failed.');
      }
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
          extractApiErrorMessage(
            error,
            finalizingAttempt
              ? 'The PDF upload finished, but RetailSync could not create the statement. Retry from this dialog.'
              : 'Failed to upload statement'
          ),
      );
    } finally {
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
      <DialogTitle>Upload Bank Statement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Drop in a bank statement PDF and RetailSync will detect the statement month before upload.
          </Typography>

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
                  {file ? 'Statement PDF ready' : 'Drag and drop a PDF here'}
                </Typography>
                <Typography variant="body2" color="text.secondary" textAlign={{ sm: 'center' }}>
                  {file ? 'Month detection runs automatically after you pick a PDF.' : 'Or browse for a PDF from your computer.'}
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
                        <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
                          {file.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatFileSize(file.size)} • PDF
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
                {file ? 'Choose another PDF' : 'Choose PDF'}
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
            label="Statement Month"
            type="month"
            value={statementMonth}
            onChange={(event) => {
              setStatementMonth(event.target.value);
              setStatementMonthTouched(true);
            }}
            disabled={busy}
            InputLabelProps={{ shrink: true }}
            helperText="RetailSync will auto-detect the month when confidence is high. You can override it anytime."
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

          {detectingStatementMonth ? (
            <Alert severity="info">
              Detecting the statement month…
            </Alert>
          ) : null}

          {submitStageMessage ? (
            <Alert severity="info">{submitStageMessage}</Alert>
          ) : null}

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
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {processingStatement ? 'Processing statement' : 'Extraction still running'}
                  </Typography>
                  {processingStatus ? (
                    <Chip
                      size="small"
                      label={formatStatementStatusLabel(processingStatus)}
                      variant="outlined"
                    />
                  ) : null}
                  {processingProgress ? (
                    <Chip size="small" label={`Phase: ${formatStatementStatusLabel(processingProgress.phase)}`} variant="outlined" />
                  ) : null}
                </Stack>
                <Typography variant="body2">
                  {processingTimedOut
                    ? 'Upload finished and processing continues in the background.'
                    : getProcessingSummary(processingStatus)}
                </Typography>
                {processingWaitingForBackend ? (
                  <Typography variant="caption" color="text.secondary">
                    Waiting for backend update...
                  </Typography>
                ) : null}
                {(processingTimedOut || isProcessingStatusActive(processingStatus)) && !processingWaitingForBackend ? (
                  <Typography variant="caption" color="text.secondary">
                    Live status updates run quietly in the background every few seconds.
                  </Typography>
                ) : null}
                {processingProgress ? (
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
                    Latest issue: {processingIssues[0]}
                  </Typography>
                ) : null}
                {processingOriginalStatementPath ? (
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    Original statement: {processingOriginalStatementPath}
                  </Typography>
                ) : null}
                {processingCheckImagePreview.length > 0 ? (
                  <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
                    Check images ready: {processingCheckImagePreview.length} (latest:{' '}
                    {processingCheckImagePreview[processingCheckImagePreview.length - 1]?.cropImagePath ??
                      processingCheckImagePreview[processingCheckImagePreview.length - 1]?.frontPath ??
                      'n/a'}
                    )
                  </Typography>
                ) : null}
              </Stack>
            </Alert>
          ) : null}

          {!detectingStatementMonth && detection ? (
            <Alert
              severity={detection.statementMonth ? 'success' : 'info'}
              action={
                detection.statementMonth && !detection.autoApply && detection.statementMonth !== statementMonth ? (
                  <Button color="inherit" size="small" onClick={applyDetectedMonth}>
                    Use {detection.statementMonth}
                  </Button>
                ) : undefined
              }
              icon={<AutoFixHighOutlinedIcon fontSize="inherit" />}
            >
              <Stack spacing={0.75}>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  {detection.statementMonth ? (
                    <Chip
                      size="small"
                      label={formatStatementMonthLabel(detection.statementMonth)}
                      color="success"
                      variant="outlined"
                    />
                  ) : null}
                  {detection.autoApply ? (
                    <Chip size="small" label="Auto-applied" color="success" variant="outlined" />
                  ) : null}
                </Stack>
                <Typography variant="body2">
                  {getDetectionMessage(detection, statementMonth)}
                </Typography>
              </Stack>
            </Alert>
          ) : null}

          {!detectingStatementMonth && detectionError ? (
            <Alert severity="warning">{detectionError}</Alert>
          ) : null}

          <StatementStageTimeline
            title="Workflow"
            subtitle="Uploading a statement starts a background pipeline. You can close this dialog while processing continues."
            steps={workflowStepsWithState}
          />

          {submitError ? <Alert severity="error">{submitError}</Alert> : null}

          <Typography variant="body2" color="text.secondary">
            Uploaded file is stored in secure object storage and processed in background jobs.
          </Typography>
          {activeStatementId ? (
            <Alert severity="success">
              Upload successful. Background processing started for statement {activeStatementId}. You can close this dialog anytime and continue working.
            </Alert>
          ) : null}

          {(uploading || finalizing) && (
            <Stack spacing={1}>
              <LinearProgress
                variant={uploading ? 'determinate' : 'indeterminate'}
                value={uploading ? uploadProgress : undefined}
              />
              <Typography variant="caption" color="text.secondary">
                {uploading ? `Uploading ${uploadProgress}%` : 'Creating statement record…'}
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          {processingStatement || processingTimedOut ? 'Close (keep processing)' : 'Cancel'}
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
          {uploading
            ? 'Uploading...'
            : finalizing
              ? 'Saving...'
            : processingStatement
              ? 'Waiting for extraction...'
              : preparedUpload
                ? 'Retry Save'
              : 'Upload & Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
