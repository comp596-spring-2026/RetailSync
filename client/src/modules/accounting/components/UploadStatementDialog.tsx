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

type UploadStatementDialogProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => Promise<void>;
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

const getDetectionMessage = (
  detection: DetectStatementMonthResponse,
  statementMonth: string,
) => {
  if (!detection.statementMonth) {
    return detection.summary || 'RetailSync could not confidently identify the statement month.';
  }

  const monthLabel = formatStatementMonthLabel(detection.statementMonth);
  if (detection.statementMonth === statementMonth) {
    return `This looks like a ${monthLabel} statement. You can adjust the month before upload if needed.`;
  }

  return detection.summary || `This looks like a ${monthLabel} statement.`;
};

const getStorageUploadFailureMessage = (requestUrl: string) => {
  const isStorageUploadFailure =
    typeof requestUrl === 'string' && requestUrl.includes('storage.googleapis.com');

  if (!isStorageUploadFailure) return null;
  if (!isDevelopment) {
    return 'Upload to secure storage failed. Please try again. If the problem continues, contact support.';
  }
  return 'Upload to secure storage failed. If you are running locally, verify the accounting bucket CORS policy allows http://localhost:4630.';
};

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

const formatStatementStatusLabel = (status: BankStatementStatus) =>
  status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const getProcessingSummary = (status: BankStatementStatus | null) => {
  switch (status) {
    case 'uploaded':
      return 'Upload complete. Preparing the statement for extraction.';
    case 'extracting':
      return 'Extracting statement pages and text now.';
    case 'structuring':
      return 'Extraction is complete. Building transactions and review data.';
    case 'checks_queued':
      return 'Extraction is complete. Queuing checks and review tasks.';
    case 'ready_for_review':
      return 'Processing is complete. The statement is ready for review.';
    case 'failed':
      return 'Statement processing failed. Review the details below and try again.';
    default:
      return 'Starting statement processing...';
  }
};

export const UploadStatementDialog = ({ open, onClose, onUploaded }: UploadStatementDialogProps) => {
  const [statementMonth, setStatementMonth] = useState(currentMonth());
  const [statementMonthTouched, setStatementMonthTouched] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [processingStatement, setProcessingStatement] = useState(false);
  const [processingTimedOut, setProcessingTimedOut] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<BankStatementStatus | null>(null);
  const [processingIssues, setProcessingIssues] = useState<string[]>([]);
  const [detectingStatementMonth, setDetectingStatementMonth] = useState(false);
  const [detection, setDetection] = useState<DetectStatementMonthResponse | null>(null);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
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
    setSubmitError(null);
    setProcessingStatement(false);
    setProcessingTimedOut(false);
    setProcessingStatus(null);
    setProcessingIssues([]);
    setDetectingStatementMonth(false);
    setDetection(null);
    setDetectionError(null);
    setDragActive(false);
    statementMonthTouchedRef.current = false;
    detectionRequestIdRef.current += 1;
    processingRequestIdRef.current += 1;
  }, [open]);

  useEffect(() => {
    statementMonthTouchedRef.current = statementMonthTouched;
  }, [statementMonthTouched]);

  const uploadDisabled = useMemo(() => {
    if (uploading) return true;
    if (processingStatement) return true;
    if (processingTimedOut) return true;
    if (detectingStatementMonth) return true;
    if (!file) return true;
    if (!statementMonth) return true;
    return false;
  }, [detectingStatementMonth, file, processingStatement, processingTimedOut, statementMonth, uploading]);

  const waitForExtractionAdvance = async (
    statementId: string,
    initialStatus: BankStatementStatus,
  ): Promise<{
    kind: 'advanced' | 'failed' | 'timeout' | 'cancelled';
    status: BankStatementStatus;
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
    setProcessingIssues([]);

    while (requestId === processingRequestIdRef.current) {
      const response = await accountingApi.getStatementStatus(statementId);
      if (requestId !== processingRequestIdRef.current) {
        return { kind: 'cancelled', status: latestStatus, issues: latestIssues };
      }

      latestStatus = response.data.data.status;
      latestIssues = response.data.data.issues ?? [];
      setProcessingStatus(latestStatus);
      setProcessingIssues(latestIssues);

      if (latestStatus === 'failed') {
        setProcessingStatement(false);
        return { kind: 'failed', status: latestStatus, issues: latestIssues };
      }

      if (EXTRACTION_ADVANCED_STATUSES.includes(latestStatus)) {
        setProcessingStatement(false);
        return { kind: 'advanced', status: latestStatus, issues: latestIssues };
      }

      if (!EXTRACTION_ACTIVE_STATUSES.includes(latestStatus)) {
        setProcessingStatement(false);
        return { kind: 'advanced', status: latestStatus, issues: latestIssues };
      }

      if (Date.now() - startedAt >= PROCESSING_WAIT_TIMEOUT_MS) {
        setProcessingStatement(false);
        setProcessingTimedOut(true);
        return { kind: 'timeout', status: latestStatus, issues: latestIssues };
      }

      await sleep(PROCESSING_POLL_INTERVAL_MS);
    }

    return { kind: 'cancelled', status: latestStatus, issues: latestIssues };
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

      if (nextDetection.statementMonth && !statementMonthTouchedRef.current) {
        setStatementMonth(nextDetection.statementMonth);
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
      setProcessingStatement(false);
      setProcessingTimedOut(false);
      setProcessingStatus(null);
      setProcessingIssues([]);
      detectionRequestIdRef.current += 1;
      processingRequestIdRef.current += 1;
      return;
    }

    if (!isPdfFile(nextFile)) {
      setFile(null);
      setDetection(null);
      setDetectionError('Please choose a PDF statement file.');
      setProcessingStatement(false);
      setProcessingTimedOut(false);
      setProcessingStatus(null);
      setProcessingIssues([]);
      detectionRequestIdRef.current += 1;
      processingRequestIdRef.current += 1;
      return;
    }

    setFile(nextFile);
    await inspectSelectedFile(nextFile);
  };

  const applyDetectedMonth = () => {
    if (!detection?.statementMonth) return;
    setStatementMonth(detection.statementMonth);
    setStatementMonthTouched(true);
  };

  const submit = async () => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setSubmitError(null);
    setProcessingTimedOut(false);
    setProcessingIssues([]);

    try {
      const signed = await accountingApi.requestUploadUrl({
        fileName: file.name,
        statementMonth,
        contentType: 'application/pdf'
      });

      const payload = signed.data.data;

      await axios.put(payload.uploadUrl, file, {
        headers: {
          'Content-Type': 'application/pdf'
        },
        onUploadProgress: (event) => {
          if (!event.total) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(Math.max(0, Math.min(100, percent)));
        }
      });

      const created = await accountingApi.createStatement({
        statementId: payload.statementId,
        fileName: file.name,
        statementMonth,
        gcsPath: payload.gcsPath,
        source: 'upload'
      });

      await onUploaded();
      const result = await waitForExtractionAdvance(
        created.data.data.statement.id,
        created.data.data.statement.status,
      );

      if (result.kind === 'advanced') {
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

      setSubmitError(
        storageUploadFailureMessage ??
          extractApiErrorMessage(error, 'Failed to upload statement'),
      );
    } finally {
      setUploading(false);
    }
  };

  const clearSelectedFile = () => {
    setFile(null);
    setDetection(null);
    setDetectionError(null);
    setSubmitError(null);
    setProcessingStatement(false);
    setProcessingTimedOut(false);
    setProcessingStatus(null);
    setProcessingIssues([]);
    setDetectingStatementMonth(false);
    detectionRequestIdRef.current += 1;
    processingRequestIdRef.current += 1;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={open} onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload Bank Statement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Drop in a bank statement PDF and RetailSync will inspect it before upload to suggest the statement month.
          </Typography>

          <Paper
            variant="outlined"
            aria-label="Statement PDF drop zone"
            onDragOver={(event) => {
              event.preventDefault();
              if (uploading || processingStatement || processingTimedOut) return;
              setDragActive(true);
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              if (uploading || processingStatement || processingTimedOut) return;
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
              if (uploading || processingStatement || processingTimedOut) return;
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
                  {file
                    ? 'Replace the file, review the suggested month, then start processing.'
                    : 'You can also browse for a PDF statement from your computer.'}
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
                        disabled={uploading || processingStatement || processingTimedOut}
                      >
                        Replace file
                      </Button>
                      <Button
                        size="small"
                        color="inherit"
                        startIcon={<DeleteOutlineIcon />}
                        onClick={clearSelectedFile}
                        disabled={uploading || processingStatement || processingTimedOut}
                      >
                        Remove
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              ) : null}

              <Button
                variant={file ? 'outlined' : 'contained'}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || processingStatement || processingTimedOut}
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
            disabled={uploading || processingStatement || processingTimedOut}
            InputLabelProps={{ shrink: true }}
            helperText="RetailSync will suggest a month from the PDF, but you can override it before upload."
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
              Scanning the PDF to suggest the statement month…
            </Alert>
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
                </Stack>
                <Typography variant="body2">
                  {processingTimedOut
                    ? 'Upload finished and extraction is still running in the background. You can close this dialog and monitor the statement from the list.'
                    : getProcessingSummary(processingStatus)}
                </Typography>
                {processingStatement ? <LinearProgress /> : null}
                {processingIssues.length > 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    Latest issue: {processingIssues[0]}
                  </Typography>
                ) : null}
              </Stack>
            </Alert>
          ) : null}

          {!detectingStatementMonth && detection ? (
            <Alert
              severity={detection.statementMonth ? 'success' : 'info'}
              action={
                detection.statementMonth && detection.statementMonth !== statementMonth ? (
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
                  {isDevelopment ? (
                    <Chip
                      size="small"
                      label={`Confidence: ${detection.confidence}`}
                      variant="outlined"
                    />
                  ) : null}
                  {isDevelopment ? (
                    <Chip
                      size="small"
                      label={
                        detection.source === 'pdf_text'
                          ? 'Source: PDF text'
                          : detection.source === 'filename'
                            ? 'Source: file name'
                            : 'Source: unknown'
                      }
                      variant="outlined"
                    />
                  ) : null}
                </Stack>
                <Typography variant="body2">
                  {getDetectionMessage(detection, statementMonth)}
                </Typography>
                {isDevelopment && detection.evidence ? (
                  <Typography variant="caption" color="text.secondary">
                    Evidence: {detection.evidence}
                  </Typography>
                ) : null}
              </Stack>
            </Alert>
          ) : null}

          {!detectingStatementMonth && detectionError ? (
            <Alert severity="warning">{detectionError}</Alert>
          ) : null}

          {submitError ? (
            <Alert severity="error">{submitError}</Alert>
          ) : null}

          <Typography variant="body2" color="text.secondary">
            Uploaded file is stored in secure object storage and processed in background jobs.
          </Typography>

          {uploading && (
            <Stack spacing={1}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" color="text.secondary">
                Uploading {uploadProgress}%
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>
          {processingStatement || processingTimedOut ? 'Continue in background' : 'Cancel'}
        </Button>
        <Button onClick={() => void submit()} variant="contained" disabled={uploadDisabled}>
          {uploading
            ? 'Uploading...'
            : processingStatement
              ? 'Waiting for extraction...'
              : 'Upload & Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
