import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Grid2 as Grid,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  Typography
} from '@mui/material';
import type {
  BankStatementDetail,
  StatementCheck,
  StatementSuggestionItem,
  StatementSuggestionsResponse
} from '@retailsync/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { formatDate } from '../../../utils/date';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';

type StatementViewerTab =
  | 'pdf'
  | 'ocrText'
  | 'ocrJson'
  | 'normalized'
  | 'transactions'
  | 'checksCleared'
  | 'sections'
  | 'extractedChecks';

type ArtifactKind = 'blob' | 'text';
type StepState = 'done' | 'active' | 'waiting' | 'failed';
type WorkspaceTab = 'overview' | 'artifacts' | 'suggestions';

type ArtifactDescriptor<TTab extends string> = {
  key: TTab;
  label: string;
  path: string;
  kind: ArtifactKind;
  emptyMessage: string;
};

const statusColor = (status: StatementCheck['status']) => {
  if (status === 'ready') return 'success';
  if (status === 'needs_review') return 'warning';
  if (status === 'failed') return 'error';
  if (status === 'processing') return 'info';
  return 'default';
};

const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

const formatMaybeDate = (value?: string | null) => {
  if (!value) return '-';
  return formatDate(value, 'short');
};

const formatProgressSummary = (progress: BankStatementDetail['progress']) =>
  `${progress.completedChecks} done • ${progress.remainingChecks} left`;

const formatStatusLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const getCheckSourceLabel = (check: StatementCheck) => {
  const source = check.extracted?.source;
  if (source) return source;
  if (check.autoFill) return 'legacy';
  return 'unknown';
};

const getCheckArtifactFlags = (check: StatementCheck) => {
  const flags: string[] = [];
  if (check.artifacts?.pageNumber != null) flags.push(`Page ${check.artifacts.pageNumber}`);
  if (check.artifacts?.cropImagePath) flags.push('Crop ready');
  if (check.artifacts?.ocrTextPath || check.artifacts?.ocrJsonPath) flags.push('OCR ready');
  if (check.gcs.structuredPath) flags.push('Structured ready');
  if (check.processing.retryCount > 0) flags.push(`Retries ${check.processing.retryCount}`);
  return flags;
};

const getProposalMode = (check: StatementCheck) => {
  if (!check.proposal?.qbTxnType) {
    return {
      label: 'No recommendation yet',
      color: 'default' as const,
      detail: 'The check has not been assigned a proposal yet.'
    };
  }

  if (check.ai?.source === 'fallback') {
    return {
      label: 'Deterministic fallback',
      color: 'warning' as const,
      detail: check.ai.degradedReason ?? 'Rules and historical matches were used without Gemini.'
    };
  }

  if (check.ai?.providerStatus === 'healthy') {
    return {
      label: 'Gemini-assisted',
      color: 'success' as const,
      detail:
        check.ai.source === 'hybrid'
          ? 'Gemini helped refine a hybrid recommendation.'
          : 'Gemini helped shape this recommendation.'
    };
  }

  if (check.ai?.providerStatus === 'degraded') {
    return {
      label: 'AI degraded',
      color: 'warning' as const,
      detail: check.ai.degradedReason ?? 'Gemini returned a degraded result.'
    };
  }

  if (check.ai?.providerStatus === 'unavailable') {
    return {
      label: 'AI unavailable',
      color: 'error' as const,
      detail: check.ai.degradedReason ?? 'Gemini was unavailable, so fallback logic was used.'
    };
  }

  return {
    label: 'Deterministic fallback',
    color: 'warning' as const,
    detail: 'No AI metadata was returned.'
  };
};

const getProposalSummary = (check: StatementCheck) => {
  const proposal = check.proposal;
  if (!proposal?.qbTxnType) return 'No recommendation yet';

  const target =
    proposal.payeeName ??
    proposal.categoryAccountId ??
    proposal.transferTargetAccountId ??
    proposal.bankAccountId ??
    'an account';

  switch (proposal.qbTxnType) {
    case 'Check':
      return `Check to ${target}`;
    case 'Expense':
      return `Expense for ${target}`;
    case 'Deposit':
      return `Deposit to ${target}`;
    case 'Transfer':
      return `Transfer to ${target}`;
    default:
      return proposal.qbTxnType;
  }
};

const isImagePath = (value: string) => /\.(png|jpe?g|webp)$/i.test(value);

const formatArtifactText = (path: string, value: string) => {
  if (/\.json$/i.test(path)) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return value;
};

const getStatementArtifactItems = (statement: BankStatementDetail) => {
  const artifacts = statement.artifacts;
  if (!artifacts) return [];

  return [
    ['PDF path', statement.gcs.pdfPath],
    ['Root prefix', statement.gcs.rootPrefix],
    ['OCR text', artifacts.ocrTextPath],
    ['OCR JSON', artifacts.ocrPath],
    ['Normalized JSON', artifacts.geminiPath],
    ['Transactions table', artifacts.transactionsTablePath],
    ['Checks cleared table', artifacts.checksClearedTablePath],
    ['Transaction sections', artifacts.transactionSectionsPath],
    ['Extracted checks', artifacts.extractedChecksPath]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
};

const getStatementViewerArtifacts = (
  statement: BankStatementDetail
): Array<ArtifactDescriptor<StatementViewerTab>> => {
  const artifacts = statement.artifacts;

  return [
    {
      key: 'pdf',
      label: 'Source PDF',
      path: statement.gcs.pdfPath,
      kind: 'blob',
      emptyMessage: 'The original PDF is not available.'
    },
    artifacts?.ocrTextPath
      ? {
          key: 'ocrText',
          label: 'OCR Text',
          path: artifacts.ocrTextPath,
          kind: 'text',
          emptyMessage: 'OCR text is not ready yet.'
        }
      : null,
    artifacts?.ocrPath
      ? {
          key: 'ocrJson',
          label: 'OCR JSON',
          path: artifacts.ocrPath,
          kind: 'text',
          emptyMessage: 'OCR JSON is not ready yet.'
        }
      : null,
    artifacts?.geminiPath
      ? {
          key: 'normalized',
          label: 'Normalized JSON',
          path: artifacts.geminiPath,
          kind: 'text',
          emptyMessage: 'Normalized JSON is not ready yet.'
        }
      : null,
    artifacts?.transactionsTablePath
      ? {
          key: 'transactions',
          label: 'Transactions',
          path: artifacts.transactionsTablePath,
          kind: 'text',
          emptyMessage: 'The transactions table is not ready yet.'
        }
      : null,
    artifacts?.checksClearedTablePath
      ? {
          key: 'checksCleared',
          label: 'Checks Cleared',
          path: artifacts.checksClearedTablePath,
          kind: 'text',
          emptyMessage: 'The checks-cleared table is not ready yet.'
        }
      : null,
    artifacts?.transactionSectionsPath
      ? {
          key: 'sections',
          label: 'Sections',
          path: artifacts.transactionSectionsPath,
          kind: 'text',
          emptyMessage: 'Transaction sections are not ready yet.'
        }
      : null,
    artifacts?.extractedChecksPath
      ? {
          key: 'extractedChecks',
          label: 'Extracted Checks',
          path: artifacts.extractedChecksPath,
          kind: 'text',
          emptyMessage: 'No extracted checks artifact is available yet.'
        }
      : null
  ].filter((entry): entry is ArtifactDescriptor<StatementViewerTab> => Boolean(entry));
};

const getProcessingActivityItems = (statement: BankStatementDetail) => {
  const timestamps = statement.artifacts?.stageTimestamps;

  return [
    ['Uploaded', timestamps?.uploadedAt],
    ['Extracting', timestamps?.extractingAt],
    ['Structuring', timestamps?.structuringAt],
    ['Checks queued', timestamps?.checksQueuedAt],
    ['Ready for review', timestamps?.readyForReviewAt],
    ['Failed', timestamps?.failedAt]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
};

const getStatementStepState = (
  statement: BankStatementDetail,
  step: Exclude<BankStatementDetail['status'], 'failed'>
): StepState => {
  if (statement.status === 'failed') {
    if (step === 'uploaded') return 'done';
    if (step === 'extracting' && statement.artifacts?.stageTimestamps?.extractingAt) return 'done';
    if (step === 'structuring' && statement.artifacts?.stageTimestamps?.structuringAt) return 'done';
    if (step === 'checks_queued' && statement.artifacts?.stageTimestamps?.checksQueuedAt) return 'done';
    if (step === 'ready_for_review') return 'failed';
    return 'failed';
  }

  const order: Array<Exclude<BankStatementDetail['status'], 'failed'>> = [
    'uploaded',
    'extracting',
    'structuring',
    'checks_queued',
    'ready_for_review'
  ];
  const currentIndex = order.indexOf(statement.status as Exclude<BankStatementDetail['status'], 'failed'>);
  const stepIndex = order.indexOf(step);

  if (currentIndex === -1 || stepIndex === -1) return 'waiting';
  if (stepIndex < currentIndex) return 'done';
  if (stepIndex === currentIndex) return 'active';
  return 'waiting';
};

const getStatementProcessSteps = (statement: BankStatementDetail) => [
  {
    key: 'uploaded',
    label: 'Upload saved',
    detail: 'The statement PDF is stored and the MongoDB record exists.',
    state: getStatementStepState(statement, 'uploaded'),
    timestamp: statement.artifacts?.stageTimestamps?.uploadedAt
  },
  {
    key: 'extracting',
    label: 'OCR extraction',
    detail: 'RetailSync is reading the PDF and generating OCR outputs.',
    state: getStatementStepState(statement, 'extracting'),
    timestamp: statement.artifacts?.stageTimestamps?.extractingAt
  },
  {
    key: 'structuring',
    label: 'Structure transactions',
    detail: 'The extracted content is being normalized into statement artifacts.',
    state: getStatementStepState(statement, 'structuring'),
    timestamp: statement.artifacts?.stageTimestamps?.structuringAt
  },
  {
    key: 'checks_queued',
    label: 'Queue check review',
    detail: 'Detected checks are queued for check-level processing and matching.',
    state: getStatementStepState(statement, 'checks_queued'),
    timestamp: statement.artifacts?.stageTimestamps?.checksQueuedAt
  },
  {
    key: 'ready_for_review',
    label: 'Ready for review',
    detail: 'Artifacts and check results are ready for accounting review.',
    state: getStatementStepState(statement, 'ready_for_review'),
    timestamp: statement.artifacts?.stageTimestamps?.readyForReviewAt
  }
];

const getStepChipColor = (state: StepState) => {
  if (state === 'done') return 'success';
  if (state === 'active') return 'primary';
  if (state === 'failed') return 'error';
  return 'default';
};

const getStepChipLabel = (state: StepState) => {
  if (state === 'done') return 'Done';
  if (state === 'active') return 'In progress';
  if (state === 'failed') return 'Failed';
  return 'Waiting';
};

const getSelectedCheckPathItems = (check: StatementCheck | null) => {
  if (!check) return [];

  return [
    ['Front image', check.gcs.frontPath],
    ['Crop image', check.artifacts?.cropImagePath],
    ['OCR text', check.artifacts?.ocrTextPath],
    ['OCR JSON', check.artifacts?.ocrJsonPath],
    ['Structured JSON', check.gcs.structuredPath]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
};

const getSuggestionBucketLabel = (item: StatementSuggestionItem) => {
  if (item.proposedTxnType) return item.proposedTxnType;
  if (item.source === 'check') return 'Check review';
  return item.direction === 'credit' ? 'Credit review' : 'Debit review';
};

const getSuggestionBucketSummary = (summary: StatementSuggestionsResponse['summary']) => [
  ['Deposits', summary.deposits],
  ['Expenses', summary.expenses],
  ['Transfers', summary.transfers],
  ['Checks', summary.checksSuggested],
  ['Needs review', summary.uncategorized]
];

export const StatementDetailPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'bankStatements', 'view');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');
  const canDelete = hasPermission(permissions, 'bankStatements', 'delete');

  const [statement, setStatement] = useState<BankStatementDetail | null>(null);
  const [checks, setChecks] = useState<StatementCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('artifacts');
  const [statementViewerTab, setStatementViewerTab] = useState<StatementViewerTab>('transactions');
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<StatementSuggestionsResponse | null>(null);
  const [artifactText, setArtifactText] = useState<Record<string, string>>({});
  const [artifactBlobUrls, setArtifactBlobUrls] = useState<Record<string, string>>({});
  const [artifactLoading, setArtifactLoading] = useState<Record<string, boolean>>({});
  const [artifactErrors, setArtifactErrors] = useState<Record<string, string>>({});
  const blobUrlsRef = useRef<Record<string, string>>({});

  const load = async () => {
    if (!statementId) return;
    setLoading(true);
    setError(null);
    try {
      const [statementResponse, checksResponse, suggestionsResponse] = await Promise.all([
        accountingApi.getStatement(statementId),
        accountingApi.listStatementChecks(statementId),
        accountingApi.getStatementSuggestions(statementId)
      ]);
      setStatement(statementResponse.data.data);
      setChecks(checksResponse.data.data.checks);
      setSuggestions(suggestionsResponse.data.data);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load statement'));
    } finally {
      setLoading(false);
    }
  };

  const refreshProcessingPanel = async () => {
    if (!statementId || !statement) return;

    try {
      const [statusResponse, checksResponse, suggestionsResponse] = await Promise.all([
        accountingApi.getStatementStatus(statementId),
        accountingApi.listStatementChecks(statementId),
        accountingApi.getStatementSuggestions(statementId)
      ]);

      setStatement((current) =>
        current
          ? {
              ...current,
              status: statusResponse.data.data.status,
              progress: statusResponse.data.data.progress,
              updatedAt: statusResponse.data.data.updatedAt,
              issues: statusResponse.data.data.issues,
              artifacts: statusResponse.data.data.artifacts ?? current.artifacts
            }
          : current
      );
      setChecks(checksResponse.data.data.checks);
      setSuggestions(suggestionsResponse.data.data);
    } catch {
      // Keep the currently loaded page visible if background polling fails once.
    }
  };

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, statementId]);

  useEffect(() => {
    if (!statementId || !canView || !statement) return;
    const inFlight =
      statement.status === 'extracting' ||
      statement.status === 'structuring' ||
      statement.status === 'checks_queued';
    if (!inFlight) return;

    const interval = window.setInterval(() => {
      void refreshProcessingPanel();
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [statementId, canView, statement]);

  useEffect(() => {
    blobUrlsRef.current = artifactBlobUrls;
  }, [artifactBlobUrls]);

  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach((value) => URL.revokeObjectURL(value));
    };
  }, []);

  const retryCheck = async (checkId: string) => {
    if (!statementId) return;
    try {
      await accountingApi.retryStatementCheck(statementId, checkId);
      dispatch(showSnackbar({ message: 'Check retry queued', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to retry check'),
          severity: 'error'
        })
      );
    }
  };

  const deleteCurrentStatement = async () => {
    if (!statementId || !statement) return;
    const confirmed = window.confirm(
      `Delete ${statement.fileName}? This removes the statement and its extracted processing records.`
    );
    if (!confirmed) return;

    try {
      await accountingApi.deleteStatement(statementId);
      dispatch(showSnackbar({ message: 'Statement deleted', severity: 'success' }));
      navigate('/dashboard/accounting/statements');
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to delete statement'),
          severity: 'error'
        })
      );
    }
  };

  const reprocessCurrentStatement = async () => {
    if (!statementId) return;
    try {
      await accountingApi.reprocessStatement(statementId);
      dispatch(showSnackbar({ message: 'Statement reprocess started', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to reprocess statement'),
          severity: 'error'
        })
      );
    }
  };

  const sortedChecks = useMemo(
    () =>
      [...checks].sort((a, b) => {
        const rank = (value: StatementCheck['status']) => {
          if (value === 'processing') return 0;
          if (value === 'queued') return 1;
          if (value === 'needs_review') return 2;
          if (value === 'ready') return 3;
          return 4;
        };
        return rank(a.status) - rank(b.status);
      }),
    [checks]
  );

  const selectedCheck = useMemo(
    () => sortedChecks.find((check) => check.id === selectedCheckId) ?? null,
    [sortedChecks, selectedCheckId]
  );

  useEffect(() => {
    if (sortedChecks.length === 0) {
      setSelectedCheckId(null);
      return;
    }

    if (!selectedCheckId || !sortedChecks.some((check) => check.id === selectedCheckId)) {
      setSelectedCheckId(sortedChecks[0].id);
    }
  }, [sortedChecks, selectedCheckId]);

  const artifactItems = useMemo(
    () => (statement ? getStatementArtifactItems(statement) : []),
    [statement]
  );

  const statementViewerArtifacts = useMemo(
    () => (statement ? getStatementViewerArtifacts(statement) : []),
    [statement]
  );

  useEffect(() => {
    if (statementViewerArtifacts.length === 0) return;
    if (!statementViewerArtifacts.some((artifact) => artifact.key === statementViewerTab)) {
      setStatementViewerTab(statementViewerArtifacts[0].key);
    }
  }, [statementViewerArtifacts, statementViewerTab]);
  const currentArtifact = useMemo(
    () => statementViewerArtifacts.find((artifact) => artifact.key === statementViewerTab) ?? null,
    [statementViewerArtifacts, statementViewerTab]
  );

  const loadBlobArtifact = async (path: string) => {
    if (!statementId || blobUrlsRef.current[path] || artifactLoading[path]) return;

    setArtifactLoading((current) => ({ ...current, [path]: true }));
    try {
      const response = await accountingApi.getStatementArtifactBlob(statementId, path);
      const nextUrl = URL.createObjectURL(response.data);

      setArtifactBlobUrls((current) => {
        if (current[path]) {
          URL.revokeObjectURL(nextUrl);
          return current;
        }

        return { ...current, [path]: nextUrl };
      });
      setArtifactErrors((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
    } catch (apiError) {
      setArtifactErrors((current) => ({
        ...current,
        [path]: extractApiErrorMessage(apiError, 'Failed to load artifact')
      }));
    } finally {
      setArtifactLoading((current) => ({ ...current, [path]: false }));
    }
  };

  const loadTextArtifact = async (path: string) => {
    if (!statementId || artifactText[path] || artifactLoading[path]) return;

    setArtifactLoading((current) => ({ ...current, [path]: true }));
    try {
      const response = await accountingApi.getStatementArtifactText(statementId, path);
      setArtifactText((current) => ({ ...current, [path]: formatArtifactText(path, response.data) }));
      setArtifactErrors((current) => {
        const next = { ...current };
        delete next[path];
        return next;
      });
    } catch (apiError) {
      setArtifactErrors((current) => ({
        ...current,
        [path]: extractApiErrorMessage(apiError, 'Failed to load artifact')
      }));
    } finally {
      setArtifactLoading((current) => ({ ...current, [path]: false }));
    }
  };

  useEffect(() => {
    if (!currentArtifact) return;

    if (currentArtifact.kind === 'blob') {
      void loadBlobArtifact(currentArtifact.path);
      return;
    }

    void loadTextArtifact(currentArtifact.path);
  }, [currentArtifact?.kind, currentArtifact?.path, statementId]);

  const progressPercent = useMemo(() => {
    if (!statement) return 0;
    if (statement.progress.totalChecks <= 0) {
      return statement.status === 'ready_for_review' ? 100 : statement.status === 'failed' ? 100 : 15;
    }
    return Math.max(
      0,
      Math.min(
        100,
        Math.round((statement.progress.completedChecks / statement.progress.totalChecks) * 100)
      )
    );
  }, [statement]);

  const processingActivity = useMemo(
    () => (statement ? getProcessingActivityItems(statement) : []),
    [statement]
  );
  const processSteps = useMemo(() => (statement ? getStatementProcessSteps(statement) : []), [statement]);

  const technicalCheckItems = useMemo(
    () => getSelectedCheckPathItems(selectedCheck),
    [selectedCheck]
  );
  const suggestionGroups = useMemo(() => {
    const groups = new Map<string, StatementSuggestionItem[]>();
    for (const item of suggestions?.items ?? []) {
      const key = getSuggestionBucketLabel(item);
      const current = groups.get(key) ?? [];
      current.push(item);
      groups.set(key, current);
    }
    return [...groups.entries()];
  }, [suggestions]);

  const renderViewerBody = () => {
    if (!currentArtifact) {
      return (
        <Alert severity="info">No viewable statement artifact is available yet.</Alert>
      );
    }

    if (artifactLoading[currentArtifact.path]) {
      return (
        <Stack spacing={1.5}>
          <LinearProgress />
          <Typography variant="body2" color="text.secondary">
            Loading {currentArtifact.label.toLowerCase()}...
          </Typography>
        </Stack>
      );
    }

    if (artifactErrors[currentArtifact.path]) {
      return <Alert severity="error">{artifactErrors[currentArtifact.path]}</Alert>;
    }

    if (currentArtifact.kind === 'blob') {
      const objectUrl = artifactBlobUrls[currentArtifact.path];
      if (!objectUrl) {
        return <Alert severity="info">{currentArtifact.emptyMessage}</Alert>;
      }

      if (isImagePath(currentArtifact.path)) {
        return (
          <Box
            component="img"
            src={objectUrl}
            alt={currentArtifact.label}
            sx={{
              width: '100%',
              minHeight: 360,
              maxHeight: 820,
              objectFit: 'contain',
              bgcolor: 'grey.50',
              borderRadius: 1
            }}
          />
        );
      }

      return (
        <Box
          component="iframe"
          title={currentArtifact.label}
          src={objectUrl}
          sx={{
            width: '100%',
            minHeight: 720,
            border: 0,
            borderRadius: 1,
            bgcolor: 'grey.50'
          }}
        />
      );
    }

    const text = artifactText[currentArtifact.path];
    if (!text) {
      return <Alert severity="info">{currentArtifact.emptyMessage}</Alert>;
    }

    return (
      <Box
        component="pre"
        sx={{
          m: 0,
          p: 2,
          maxHeight: 820,
          overflow: 'auto',
          borderRadius: 1,
          bgcolor: 'grey.50',
          fontFamily: 'monospace',
          fontSize: 13,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word'
        }}
      >
        {text}
      </Box>
    );
  };

  const renderOverviewBody = () => (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle2">Review status</Typography>
          <Typography variant="body2" color="text.secondary">
            RetailSync stores the PDF, runs OCR and structuring, detects checks, and then prepares suggested accounting entries for review.
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip size="small" variant="outlined" label={`Checks ${statement?.progress.totalChecks ?? 0}`} />
            <Chip size="small" variant="outlined" label={`Artifacts ${artifactItems.length}`} />
            <Chip
              size="small"
              variant="outlined"
              label={`Suggestions ${suggestions?.summary.totalItems ?? 0}`}
            />
          </Stack>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
        <Stack spacing={0.75}>
          <Typography variant="subtitle2">What happens next</Typography>
          <Typography variant="body2" color="text.secondary">
            Use the process panel on the right to monitor progress. Once the statement is ready, switch to Suggestions to review proposed checks, deposits, debits, and transfers before opening ledger review.
          </Typography>
        </Stack>
      </Paper>

      {selectedCheck ? (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'background.default' }}>
          <Stack spacing={1}>
            <Typography variant="subtitle2">Selected check snapshot</Typography>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Check {selectedCheck.extracted?.checkNumber ?? selectedCheck.id.slice(-6)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {formatMoney(selectedCheck.extracted?.amount ?? selectedCheck.autoFill?.amount)} •{' '}
              {selectedCheck.extracted?.payeeName ?? selectedCheck.autoFill?.payeeName ?? 'Unknown payee'}
            </Typography>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip size="small" color={statusColor(selectedCheck.status) as never} label={formatStatusLabel(selectedCheck.status)} />
              {selectedCheck.proposal?.qbTxnType ? (
                <Chip size="small" variant="outlined" label={`Suggested ${selectedCheck.proposal.qbTxnType}`} />
              ) : null}
            </Stack>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );

  const renderSuggestionsBody = () => {
    if (!suggestions || suggestions.items.length === 0) {
      return <Alert severity="info">Suggested entries will appear here once structuring and matching have produced review data.</Alert>;
    }

    return (
      <Stack spacing={2}>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {getSuggestionBucketSummary(suggestions.summary).map(([label, count]) => (
            <Chip key={label} size="small" variant="outlined" label={`${label} ${count}`} />
          ))}
        </Stack>

        {suggestionGroups.map(([group, items]) => (
          <Paper key={group} variant="outlined" sx={{ p: 1.5 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2">{group}</Typography>
                <Chip size="small" variant="outlined" label={`${items.length} item${items.length === 1 ? '' : 's'}`} />
              </Stack>
              {items.map((item) => (
                <Paper key={`${group}:${item.id}`} variant="outlined" sx={{ p: 1.25, bgcolor: 'background.default' }}>
                  <Stack spacing={0.75}>
                    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1}>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {item.description}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.date ? formatMaybeDate(item.date) : 'Date pending'} • {item.source === 'check' ? 'Check candidate' : item.direction === 'credit' ? 'Credit transaction' : 'Debit transaction'}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {formatMoney(item.amount)}
                      </Typography>
                    </Stack>

                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                      {item.proposedTxnType ? (
                        <Chip size="small" color="primary" label={item.proposedTxnType} />
                      ) : (
                        <Chip size="small" variant="outlined" label="Needs classification" />
                      )}
                      {item.checkNumber ? (
                        <Chip size="small" variant="outlined" label={`Check ${item.checkNumber}`} />
                      ) : null}
                      {item.reviewStatus ? (
                        <Chip size="small" variant="outlined" label={`Review ${formatStatusLabel(item.reviewStatus)}`} />
                      ) : null}
                      {item.postingStatus ? (
                        <Chip size="small" variant="outlined" label={`Posting ${formatStatusLabel(item.postingStatus)}`} />
                      ) : null}
                    </Stack>

                    {item.reasons.length > 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        Why: {item.reasons.join(' • ')}
                      </Typography>
                    ) : null}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        ))}
      </Stack>
    );
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title={`Statement Processing${statement ? ` • ${statement.statementMonth}` : ''}`}
        subtitle="Review the source PDF, inspect derived artifacts, and monitor processing without leaving the statement."
        icon={<DescriptionIcon />}
      />
      {error && <Alert severity="error">{error}</Alert>}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !statement}
        loadingLabel="Loading statement..."
        emptyMessage="Statement not found"
      >
        {statement && (
          <>
            <Paper sx={{ p: 2 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1.5}
                justifyContent="space-between"
                alignItems={{ md: 'center' }}
              >
                <Stack>
                  <Typography variant="h6">{statement.fileName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatStatusLabel(statement.status)} • Updated {formatDate(statement.updatedAt, 'short')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Month {statement.statementMonth} • {formatProgressSummary(statement.progress)}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <Button variant="outlined" onClick={() => navigate('/dashboard/accounting/statements')}>
                    Back
                  </Button>
                  {canEdit ? (
                    <Button variant="outlined" onClick={() => void reprocessCurrentStatement()}>
                      Reprocess
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => void deleteCurrentStatement()}
                    >
                      Delete
                    </Button>
                  ) : null}
                  <Button
                    variant="contained"
                    onClick={() => navigate('/dashboard/accounting/ledger')}
                    disabled={statement.status !== 'ready_for_review'}
                  >
                    Open Ledger Review
                  </Button>
                </Stack>
              </Stack>

              <Stack spacing={1.25} sx={{ mt: 1.5 }}>
                <LinearProgress
                  variant="determinate"
                  value={progressPercent}
                  sx={{ height: 10, borderRadius: 999 }}
                  color={
                    statement.status === 'failed'
                      ? 'error'
                      : statement.status === 'ready_for_review'
                        ? 'success'
                        : 'primary'
                  }
                />
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                  <Chip size="small" variant="outlined" label={`Phase: ${formatStatusLabel(statement.progress.phase)}`} />
                  <Chip size="small" variant="outlined" label={formatProgressSummary(statement.progress)} />
                  <Chip size="small" variant="outlined" label={`Total ${statement.progress.totalChecks}`} />
                  <Chip size="small" variant="outlined" label={`Queued ${statement.progress.checksQueued}`} />
                  <Chip size="small" variant="outlined" label={`Processing ${statement.progress.checksProcessing}`} />
                  <Chip size="small" variant="outlined" label={`Ready ${statement.progress.checksReady}`} />
                  <Chip size="small" variant="outlined" label={`Failed ${statement.progress.checksFailed}`} />
                </Stack>
              </Stack>
            </Paper>

            {statement.issues.length > 0 && <Alert severity="warning">{statement.issues.join(' | ')}</Alert>}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Checks ready
                  </Typography>
                  <Typography variant="h5">{statement.progress.checksReady}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    In progress
                  </Typography>
                  <Typography variant="h5">
                    {statement.progress.checksQueued + statement.progress.checksProcessing}
                  </Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Failed checks
                  </Typography>
                  <Typography variant="h5">{statement.progress.checksFailed}</Typography>
                </Paper>
              </Grid>
              <Grid size={{ xs: 12, md: 3 }}>
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    Saved artifacts
                  </Typography>
                  <Typography variant="h5">{artifactItems.length}</Typography>
                </Paper>
              </Grid>
            </Grid>

            <Grid container spacing={2} alignItems="stretch">
              <Grid size={{ xs: 12, lg: 8 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: 'column', md: 'row' }}
                      spacing={1}
                      justifyContent="space-between"
                      alignItems={{ md: 'center' }}
                    >
                      <Stack>
                        <Typography variant="subtitle1">Statement workspace</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Keep the review surface stable on the left while the live process panel updates on the right.
                        </Typography>
                      </Stack>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={
                          workspaceTab === 'artifacts'
                            ? `Open artifact: ${
                                statementViewerArtifacts.find((artifact) => artifact.key === statementViewerTab)?.label ??
                                'Source PDF'
                              }`
                            : workspaceTab === 'suggestions'
                              ? `Suggestions ${suggestions?.summary.totalItems ?? 0}`
                              : 'Overview'
                        }
                      />
                    </Stack>

                    <Divider />

                    <Tabs
                      value={workspaceTab}
                      onChange={(_, next: WorkspaceTab) => setWorkspaceTab(next)}
                    >
                      <Tab value="overview" label="Overview" />
                      <Tab value="artifacts" label="Artifacts" />
                      <Tab value="suggestions" label="Suggestions" />
                    </Tabs>

                    {workspaceTab === 'artifacts' ? (
                      <>
                        <Tabs
                          value={statementViewerTab}
                          onChange={(_, next: StatementViewerTab) => setStatementViewerTab(next)}
                          variant="scrollable"
                          allowScrollButtonsMobile
                        >
                          {statementViewerArtifacts.map((artifact) => (
                            <Tab key={artifact.key} value={artifact.key} label={artifact.label} />
                          ))}
                        </Tabs>
                        {renderViewerBody()}
                      </>
                    ) : null}

                    {workspaceTab === 'overview' ? renderOverviewBody() : null}
                    {workspaceTab === 'suggestions' ? renderSuggestionsBody() : null}
                  </Stack>
                </Paper>
              </Grid>

              <Grid size={{ xs: 12, lg: 4 }}>
                <Stack spacing={2}>
                  <Accordion defaultExpanded>
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Stack>
                        <Typography variant="subtitle2">Process checklist</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Step-by-step view of what has finished, what is active, and what is still waiting.
                        </Typography>
                      </Stack>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Stack spacing={1.25}>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Chip
                            size="small"
                            color={
                              statement.status === 'failed'
                                ? 'error'
                                : statement.status === 'ready_for_review'
                                  ? 'success'
                                  : 'primary'
                            }
                            label={formatStatusLabel(statement.status)}
                          />
                          <Chip
                            size="small"
                            variant="outlined"
                            label={
                              statement.status === 'extracting' ||
                              statement.status === 'structuring' ||
                              statement.status === 'checks_queued'
                                ? 'Polling every 3s'
                                : 'Polling idle'
                            }
                          />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                          Last updated {formatDate(statement.updatedAt, 'short')}
                        </Typography>
                        <Button size="small" variant="outlined" onClick={() => void refreshProcessingPanel()}>
                          Refresh live status
                        </Button>
                        <Stack spacing={1}>
                          {processSteps.map((step) => (
                            <Paper
                              key={step.key}
                              variant="outlined"
                              sx={{
                                p: 1.25,
                                bgcolor: step.state === 'active' ? 'action.hover' : 'background.default',
                                borderColor:
                                  step.state === 'active'
                                    ? 'primary.main'
                                    : step.state === 'failed'
                                      ? 'error.main'
                                      : 'divider'
                              }}
                            >
                              <Stack spacing={0.75}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {step.label}
                                  </Typography>
                                  <Chip
                                    size="small"
                                    color={getStepChipColor(step.state)}
                                    label={getStepChipLabel(step.state)}
                                  />
                                </Stack>
                                <Typography variant="caption" color="text.secondary">
                                  {step.detail}
                                </Typography>
                                {step.timestamp ? (
                                  <Typography variant="caption" color="text.secondary">
                                    Updated {formatDate(step.timestamp, 'short')}
                                  </Typography>
                                ) : null}
                              </Stack>
                            </Paper>
                          ))}
                        </Stack>
                        <Divider />
                        <Stack spacing={0.75}>
                          <Typography variant="subtitle2">Processing activity</Typography>
                          <Typography variant="caption" color="text.secondary">
                            Raw stage timestamps and issue updates from the pipeline.
                          </Typography>
                        </Stack>
                        {processingActivity.length > 0 ? (
                          <Stack spacing={1}>
                            {processingActivity.map(([label, value]) => (
                              <Paper
                                key={`${label}:${value}`}
                                variant="outlined"
                                sx={{ p: 1.25, bgcolor: 'background.default' }}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  {label}
                                </Typography>
                                <Typography variant="body2">{formatDate(value, 'short')}</Typography>
                              </Paper>
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            No stage timestamps have been recorded yet.
                          </Typography>
                        )}
                        {statement.issues.length > 0 ? (
                          <Alert severity="warning">
                            {statement.issues.join(' | ')}
                          </Alert>
                        ) : null}
                      </Stack>
                    </AccordionDetails>
                  </Accordion>

                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Stack spacing={1.5}>
                      <Stack spacing={0.25}>
                        <Typography variant="subtitle2">Checks queue</Typography>
                        <Typography variant="body2" color="text.secondary">
                          Select a check to anchor the review context while the workspace stays on overview, artifacts, or suggestions.
                        </Typography>
                      </Stack>

                      {sortedChecks.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No check candidates detected yet.
                        </Typography>
                      ) : (
                        <Stack spacing={1}>
                          {sortedChecks.map((check) => {
                            const proposalMode = getProposalMode(check);
                            const proposalSummary = getProposalSummary(check);
                            const selected = check.id === selectedCheckId;

                            return (
                              <Paper
                                key={check.id}
                                variant="outlined"
                                sx={{
                                  p: 1.5,
                                  borderColor: selected ? 'primary.main' : 'divider',
                                  bgcolor: selected ? 'action.hover' : 'background.paper'
                                }}
                              >
                                <Stack spacing={1}>
                                  <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Stack spacing={0.25}>
                                      <Typography variant="subtitle2">
                                        Check {check.extracted?.checkNumber ?? check.id.slice(-6)}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        Source: {getCheckSourceLabel(check)}
                                      </Typography>
                                    </Stack>
                                    <Chip
                                      size="small"
                                      color={statusColor(check.status) as never}
                                      label={formatStatusLabel(check.status)}
                                    />
                                  </Stack>

                                  <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                                    <Chip size="small" variant="outlined" label={proposalMode.label} />
                                    {getCheckArtifactFlags(check).map((flag) => (
                                      <Chip key={flag} size="small" variant="outlined" label={flag} />
                                    ))}
                                  </Stack>

                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {proposalSummary}
                                  </Typography>

                                  <Typography variant="body2" color="text.secondary">
                                    {formatMoney(check.extracted?.amount ?? check.autoFill?.amount)} •{' '}
                                    {check.extracted?.payeeName ?? check.autoFill?.payeeName ?? 'Unknown payee'}
                                  </Typography>

                                  {check.match?.reasons?.length ? (
                                    <Typography variant="caption" color="text.secondary">
                                      Why: {check.match.reasons.join(' • ')}
                                    </Typography>
                                  ) : null}

                                  {check.processing.lastError ? (
                                    <Alert severity="error">{check.processing.lastError}</Alert>
                                  ) : null}

                                  <Stack direction="row" spacing={1}>
                                    <Button
                                      size="small"
                                      variant={selected ? 'contained' : 'outlined'}
                                      onClick={() => setSelectedCheckId(check.id)}
                                    >
                                      Select check
                                    </Button>
                                    {canEdit && check.status === 'failed' ? (
                                      <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={() => void retryCheck(check.id)}
                                      >
                                        Retry
                                      </Button>
                                    ) : null}
                                  </Stack>
                                </Stack>
                              </Paper>
                            );
                          })}
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                </Stack>
              </Grid>
            </Grid>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack>
                  <Typography variant="subtitle2">Technical details</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Raw storage paths for statement and selected-check artifacts.
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">Statement artifacts</Typography>
                      {artifactItems.map(([label, value]) => (
                        <Paper
                          key={`${label}:${value}`}
                          variant="outlined"
                          sx={{ p: 1, bgcolor: 'background.default' }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {label}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                          >
                            {value}
                          </Typography>
                        </Paper>
                      ))}
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Stack spacing={1}>
                      <Typography variant="subtitle2">Selected check artifacts</Typography>
                      {technicalCheckItems.length > 0 ? (
                        technicalCheckItems.map(([label, value]) => (
                          <Paper
                            key={`${label}:${value}`}
                            variant="outlined"
                            sx={{ p: 1, bgcolor: 'background.default' }}
                          >
                            <Typography variant="caption" color="text.secondary">
                              {label}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
                            >
                              {value}
                            </Typography>
                          </Paper>
                        ))
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Select a check with saved artifacts to inspect its raw storage paths.
                        </Typography>
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};

export default StatementDetailPage;
