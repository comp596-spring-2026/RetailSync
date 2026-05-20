import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshIcon from '@mui/icons-material/Refresh';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import FilterListIcon from '@mui/icons-material/FilterList';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  ButtonGroup,
  Chip,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  FormControlLabel,
  Checkbox,
  Grow,
  MenuList,
  Popper,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  Grid2 as Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  TextField,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import type {
  BankStatementDetail,
  QuickBooksHubChartAccount,
  QuickBooksHubItem,
  StatementCheck,
  StatementTransaction,
  StatementReviewStatus,
  StatementSuggestionItem,
  StatementSuggestionsResponse,
  StatementProposalPatch
} from '@retailsync/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { formatDate } from '../../../utils/date';
import { extractApiErrorMessage } from '../../../utils/apiError';
import { hasPermission } from '../../../utils/permissions';
import { accountingApi } from '../api';
import {
  readDefaultStatementBankAccountId,
  writeDefaultStatementBankAccountId
} from '../constants/statementBankAccount';
import { useMonthCloseWorkspaceState } from '../hooks/useMonthCloseWorkspaceState';
import { useStatementLiveStream } from '../hooks/useStatementLiveStream';
import { useStatementProcessingStatus } from '../hooks/useStatementProcessingStatus';
import { formatStatementMonthShort } from '../utils/statementDisplay';
import { STATEMENT_DETAIL_POLL_MS, getStatementStageProgress } from '../utils/statementStatus';
import type { StatementViewerTab, WorkspaceTab } from '../utils/statementDetailHelpers';
import {
  formatArtifactText,
  formatMaybeDate,
  formatMoney,
  formatProgressSummary,
  formatStatusLabel,
  getStatementViewerArtifacts,
  isCheckSuggestionItem,
  isImagePath,
  filterDepositLineAccounts,
  filterExpenseLineAccounts,
  formatDepositLineAccountLabel,
  isGenericBankDepositRow,
  pickDefaultDepositLineAccount,
  pickDefaultExpenseLineAccount,
  resolveLineAccountRefFromPool,
  resolveCategoryAccountSeed,
  resolveCheckNumberForReview,
  resolveLinkedCheck,
  resolvePayeeNameForReview
} from '../utils/statementDetailHelpers';
import {
  QUICKBOOKS_HUB_MAX_PAGE_SIZE,
  StatementBankAccountAutocomplete,
  chartAccountRefValue
} from '../components/StatementBankAccountAutocomplete';
import { StatementOverviewTab } from '../components/statementDetail/StatementOverviewTab';
import { StatementSourceProofTab } from '../components/statementDetail/StatementSourceProofTab';
import { buildStatementOverview, sectionWorkflowHint } from '../utils/statementOverviewModel';
import {
  mapWorkflowToProposedType,
  suggestCategoryPreset,
  suggestWorkflowType,
  type WorkflowTxnType
} from '../utils/statementCategoryPresets';

const shouldLogStatementProgress = import.meta.env.DEV;

const REVIEW_SECTION_PAGE_SIZE = 20;

const rowIssueLabels = (item: StatementSuggestionItem): string[] => {
  const labels: string[] = [];
  const reasons = item.reasons ?? [];
  if (reasons.some((r) => /duplicate/i.test(r))) labels.push('Possible duplicate');
  if (!item.payeeName?.trim() && ['vendor_payment', 'tax_payment'].includes(String(item.transactionFamily ?? ''))) {
    labels.push('Missing vendor');
  }
  if (
    item.transactionFamily === 'transfer' &&
    ['needs_internal_account_match', 'needs_chart_of_accounts_account'].includes(
      String(item.transferResolutionStatus ?? '')
    )
  ) {
    labels.push('Needs account match');
  }
  return labels;
};

const workflowDisplayLabel = (item: StatementSuggestionItem, sectionKey: string): string =>
  item.proposedTxnType ?? sectionWorkflowHint(sectionKey).primary;

const defaultSectionVisibleCount = (total: number) =>
  total <= REVIEW_SECTION_PAGE_SIZE ? total : REVIEW_SECTION_PAGE_SIZE;

const getSectionVisibleCount = (limits: Record<string, number>, sectionKey: string, total: number) => {
  const stored = limits[sectionKey];
  const target = stored ?? defaultSectionVisibleCount(total);
  return Math.min(target, total);
};

const reviewStatusFilterLabel = (value: string) => {
  if (value === 'proposed') return 'Needs review';
  if (value === 'approved') return 'Approved';
  if (value === 'excluded') return 'Excluded';
  return formatStatusLabel(value);
};

export const StatementDetailPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { statementId } = useParams<{ statementId: string }>();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'bankStatements', 'view');
  const canEdit = hasPermission(permissions, 'bankStatements', 'edit');
  const canDelete = hasPermission(permissions, 'bankStatements', 'delete');

  const [statement, setStatement] = useState<BankStatementDetail | null>(null);
  const effectiveBankAccountId = useMemo(
    () => (statement?.bankAccountId?.trim() || readDefaultStatementBankAccountId()).trim(),
    [statement?.bankAccountId]
  );
  const [checks, setChecks] = useState<StatementCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [statementViewerTab, setStatementViewerTab] = useState<StatementViewerTab>('transactions');
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<StatementSuggestionsResponse | null>(null);
  const [entries, setEntries] = useState<StatementTransaction[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<{
    entryCount: number;
    debitCount: number;
    creditCount: number;
    startingBalance: number | null;
    endingBalance: number | null;
  } | null>(null);
  const [artifactText, setArtifactText] = useState<Record<string, string>>({});
  const [artifactBlobUrls, setArtifactBlobUrls] = useState<Record<string, string>>({});
  const [artifactLoading, setArtifactLoading] = useState<Record<string, boolean>>({});
  const [artifactErrors, setArtifactErrors] = useState<Record<string, string>>({});
  const [mutating, setMutating] = useState(false);
  const [streamConnected, setStreamConnected] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [workflowFilter, setWorkflowFilter] = useState<'all' | 'Expense' | 'Deposit' | 'Transfer' | 'Check'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'confidence' | 'page' | 'category' | 'review'>('date');
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [showEmptyGroups, setShowEmptyGroups] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [sectionRowLimit, setSectionRowLimit] = useState<Record<string, number>>({});
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<StatementSuggestionItem | null>(null);
  const [saveAndNext, setSaveAndNext] = useState(false);
  const [workflowType, setWorkflowType] = useState<WorkflowTxnType>('Expense');
  const [workflowForm, setWorkflowForm] = useState<{
    vendor: string;
    customer: string;
    categoryLabel: string;
    customCategory: string;
    salesItemRefId: string;
    linkedInvoiceTxnId: string;
    depositToAccount: string;
    transferFromAccount: string;
    transferToAccount: string;
    memo: string;
    checkNumber: string;
    lineAccountRef: string;
    vendorQbId: string;
    customerQbId: string;
    matchExistingCheck: boolean;
  }>({
    vendor: '',
    customer: '',
    categoryLabel: '',
    customCategory: '',
    salesItemRefId: '',
    linkedInvoiceTxnId: '',
    depositToAccount: '',
    transferFromAccount: '',
    transferToAccount: '',
    memo: '',
    checkNumber: '',
    lineAccountRef: '',
    vendorQbId: '',
    customerQbId: '',
    matchExistingCheck: true
  });
  const [contactOptions, setContactOptions] = useState<Record<'vendor' | 'customer', Array<{ id: string; qbId: string; displayName: string }>>>({
    vendor: [],
    customer: []
  });
  const [contactLoading, setContactLoading] = useState<Record<'vendor' | 'customer', boolean>>({
    vendor: false,
    customer: false
  });
  const [contactSearch, setContactSearch] = useState<Record<'vendor' | 'customer', string>>({
    vendor: '',
    customer: ''
  });
  const [contactCreating, setContactCreating] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<QuickBooksHubChartAccount[]>([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);
  const [bankAccountSearch, setBankAccountSearch] = useState('');
  const [lineAccounts, setLineAccounts] = useState<QuickBooksHubChartAccount[]>([]);
  const [lineAccountSearch, setLineAccountSearch] = useState('');
  const [depositLineAccounts, setDepositLineAccounts] = useState<QuickBooksHubChartAccount[]>([]);
  const [lineAccountsLoading, setLineAccountsLoading] = useState(false);
  const [depositLineAccountsLoading, setDepositLineAccountsLoading] = useState(false);
  const [depositLineAccountSearch, setDepositLineAccountSearch] = useState('');
  const [depositLineAccountInput, setDepositLineAccountInput] = useState('');
  const [refreshingQuickBooksAccounts, setRefreshingQuickBooksAccounts] = useState(false);
  const [reviewQuickBooksBootstrapping, setReviewQuickBooksBootstrapping] = useState(false);
  const bankAccountsRef = useRef<QuickBooksHubChartAccount[]>([]);
  const reviewQuickBooksBootstrapGenRef = useRef(0);
  const lineAccountPrefilledRef = useRef<string | null>(null);
  const approveMenuAnchorRef = useRef<HTMLDivElement>(null);
  const [approveMenuOpen, setApproveMenuOpen] = useState(false);
  const [createBankAccountOpen, setCreateBankAccountOpen] = useState(false);
  const [createBankAccountTarget, setCreateBankAccountTarget] = useState<
    'transferFrom' | 'transferTo' | 'depositTo' | 'check' | null
  >(null);
  const [createBankAccountForm, setCreateBankAccountForm] = useState<{
    name: string;
    accountNumber: string;
    detailType: 'Checking' | 'Savings' | 'CashOnHand';
  }>({ name: '', accountNumber: '', detailType: 'Checking' });
  const [createBankAccountSubmitting, setCreateBankAccountSubmitting] = useState(false);
  const [createLineAccountOpen, setCreateLineAccountOpen] = useState(false);
  const [createLineAccountKind, setCreateLineAccountKind] = useState<'expense' | 'income'>('expense');
  const [createLineAccountName, setCreateLineAccountName] = useState('');
  const [createLineAccountSubmitting, setCreateLineAccountSubmitting] = useState(false);
  const [qbItems, setQbItems] = useState<QuickBooksHubItem[]>([]);
  const [qbItemsLoading, setQbItemsLoading] = useState(false);
  const [qbItemSearch, setQbItemSearch] = useState('');
  const [qbItemCreating, setQbItemCreating] = useState(false);
  const [openInvoices, setOpenInvoices] = useState<
    Array<{ qbTxnId: string; label: string; balanceAmount: number | null }>
  >([]);
  const [openInvoicesLoading, setOpenInvoicesLoading] = useState(false);
  const blobUrlsRef = useRef<Record<string, string>>({});
  const [reviewCheckImageUrl, setReviewCheckImageUrl] = useState<string | null>(null);
  const [reviewCheckImageLoading, setReviewCheckImageLoading] = useState(false);
  const lastProgressLogRef = useRef<string>('');
  const lastCheckLogRef = useRef<string>('');

  useEffect(() => {
    setSectionRowLimit({});
  }, [
    statementId,
    sectionFilter,
    statusFilter,
    familyFilter,
    workflowFilter,
    dateFrom,
    dateTo,
    amountMin,
    amountMax,
    quickFilter,
    sortBy,
    showEmptyGroups
  ]);

  const logProgressSnapshot = useCallback((source: 'refresh' | 'stream', payload: {
    status: string;
    progress: BankStatementDetail['progress'];
    liveMetrics?: {
      entryCount: number;
      debitCount: number;
      creditCount: number;
      startingBalance: number | null;
      endingBalance: number | null;
    } | null;
    artifacts?: BankStatementDetail['artifacts'];
    issues?: string[];
  }) => {
    if (!shouldLogStatementProgress) return;
    const artifactFlags = {
      ocrText: Boolean(payload.artifacts?.ocrTextPath),
      ocrJson: Boolean(payload.artifacts?.ocrPath),
      transactionsJson: Boolean(payload.artifacts?.transactionsTablePath),
      checksClearedJson: Boolean(payload.artifacts?.checksClearedTablePath),
      extractedChecksJson: Boolean(payload.artifacts?.extractedChecksPath),
      suggestionsJson: Boolean(payload.artifacts?.suggestionsOutputPath),
      processingSummaryJson: Boolean(payload.artifacts?.processingSummaryPath)
    };
    const fingerprint = JSON.stringify({
      source,
      status: payload.status,
      progress: payload.progress,
      liveMetrics: payload.liveMetrics,
      artifactFlags,
      issues: payload.issues ?? []
    });
    if (fingerprint === lastProgressLogRef.current) return;
    lastProgressLogRef.current = fingerprint;
    // eslint-disable-next-line no-console
    console.info('[accounting.progress.snapshot]', {
      source,
      status: payload.status,
      totalChecks: payload.progress.totalChecks,
      checksQueued: payload.progress.checksQueued,
      checksProcessing: payload.progress.checksProcessing,
      checksReady: payload.progress.checksReady,
      checksFailed: payload.progress.checksFailed,
      completedChecks: payload.progress.completedChecks,
      remainingChecks: payload.progress.remainingChecks,
      startingBalance: payload.liveMetrics?.startingBalance ?? null,
      endingBalance: payload.liveMetrics?.endingBalance ?? null,
      entryCount: payload.liveMetrics?.entryCount ?? null,
      debitCount: payload.liveMetrics?.debitCount ?? null,
      creditCount: payload.liveMetrics?.creditCount ?? null,
      artifactFlags,
      issues: payload.issues ?? []
    });
  }, []);

  const logCheckSnapshot = useCallback((source: 'refresh' | 'stream', nextChecks: StatementCheck[]) => {
    if (!shouldLogStatementProgress) return;
    const summary = {
      total: nextChecks.length,
      queued: nextChecks.filter((check) => check.status === 'queued').length,
      processing: nextChecks.filter((check) => check.status === 'processing').length,
      ready: nextChecks.filter((check) => check.status === 'ready').length,
      needsReview: nextChecks.filter((check) => check.status === 'needs_review').length,
      failed: nextChecks.filter((check) => check.status === 'failed').length
    };
    const doneCheckNumbers = nextChecks
      .filter((check) => check.status === 'ready' || check.status === 'needs_review')
      .map((check) => check.extracted?.checkNumber ?? check.autoFill?.checkNumber ?? check.id.slice(-6))
      .slice(0, 30);
    const fingerprint = JSON.stringify({ source, summary, doneCheckNumbers });
    if (fingerprint === lastCheckLogRef.current) return;
    lastCheckLogRef.current = fingerprint;
    // eslint-disable-next-line no-console
    console.info('[accounting.checks.snapshot]', {
      source,
      ...summary,
      doneCheckNumbers
    });
  }, []);

  const load = useCallback(async () => {
    if (!statementId) return;
    setLoading(true);
    setError(null);
    try {
      const [statementResponse, checksResponse, suggestionsResponse, entriesResponse, statusResponse] =
        await Promise.all([
        accountingApi.getStatement(statementId),
        accountingApi.listStatementChecks(statementId),
        accountingApi.getStatementSuggestions(statementId),
        accountingApi.listStatementEntries(statementId),
        accountingApi.getStatementStatus(statementId)
      ]);
      setStatement(statementResponse.data.data);
      setChecks(checksResponse.data.data.checks);
      setSuggestions(suggestionsResponse.data.data);
      setEntries(entriesResponse.data.data.entries);
      setLiveMetrics(statusResponse.data.data.liveMetrics);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load statement'));
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  const refreshProcessingPanel = useCallback(async () => {
    if (!statementId) return;

    try {
      const [statusResponse, checksResponse, suggestionsResponse, entriesResponse] = await Promise.all([
        accountingApi.getStatementStatus(statementId),
        accountingApi.listStatementChecks(statementId),
        accountingApi.getStatementSuggestions(statementId),
        accountingApi.listStatementEntries(statementId)
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
      setEntries(entriesResponse.data.data.entries);
      setLiveMetrics(statusResponse.data.data.liveMetrics);
      logProgressSnapshot('refresh', {
        status: statusResponse.data.data.status,
        progress: statusResponse.data.data.progress,
        liveMetrics: statusResponse.data.data.liveMetrics,
        artifacts: statusResponse.data.data.artifacts,
        issues: statusResponse.data.data.issues
      });
      logCheckSnapshot('refresh', checksResponse.data.data.checks);
    } catch {
      // Keep the currently loaded page visible if background polling fails once.
    }
  }, [logCheckSnapshot, logProgressSnapshot, statementId]);

  useEffect(() => {
    if (!canView) return;
    void load();
  }, [canView, statementId]);

  useEffect(() => {
    if (!statementId || !canEdit) return;
    const stored = statement?.bankAccountId?.trim();
    const preferred = readDefaultStatementBankAccountId().trim();
    if (stored) {
      writeDefaultStatementBankAccountId(stored);
      return;
    }
    if (!preferred) return;

    let cancelled = false;
    void accountingApi
      .assignStatementBankAccount(statementId, { bankAccountId: preferred })
      .then((response) => {
        if (cancelled) return;
        const assigned = response.data.data.statement.bankAccountId?.trim() ?? preferred;
        setStatement((current) => (current ? { ...current, bankAccountId: assigned } : current));
        writeDefaultStatementBankAccountId(assigned);
      })
      .catch(() => {
        // UI still falls back to preferred via effectiveBankAccountId.
      });

    return () => {
      cancelled = true;
    };
  }, [canEdit, statement?.bankAccountId, statementId]);

  useStatementProcessingStatus({
    status: statement?.status,
    enabled: Boolean(statementId && canView),
    suspended: streamConnected,
    pollMs: STATEMENT_DETAIL_POLL_MS,
    onPoll: refreshProcessingPanel
  });

  const liveRefreshTimerRef = useRef<number | null>(null);
  const queueLiveRefresh = useCallback(() => {
    if (liveRefreshTimerRef.current != null) return;
    liveRefreshTimerRef.current = window.setTimeout(() => {
      liveRefreshTimerRef.current = null;
      void refreshProcessingPanel();
    }, 400);
  }, [refreshProcessingPanel]);

  useStatementLiveStream({
    statementId,
    enabled: Boolean(statementId && canView),
    onProgressEvent: (event) => {
      if (event.liveMetrics) {
        setLiveMetrics(event.liveMetrics);
      }
      logProgressSnapshot('stream', {
        status: event.status,
        progress: event.progress,
        liveMetrics: event.liveMetrics ?? null,
        artifacts: event.artifacts as BankStatementDetail['artifacts'],
        issues: event.issues
      });
      setStatement((current) =>
        current
          ? {
              ...current,
              status: event.status,
              progress: event.progress,
              updatedAt: event.updatedAt,
              issues: event.issues,
              artifacts: (event.artifacts as BankStatementDetail['artifacts']) ?? current.artifacts
            }
          : current
      );
    },
    onCheckEvent: (incomingCheck) => {
      setChecks((current) => {
        const next = [...current];
        const index = next.findIndex((item) => item.id === incomingCheck.id);
        if (index >= 0) {
          next[index] = incomingCheck;
        } else {
          next.unshift(incomingCheck);
        }
        logCheckSnapshot('stream', next);
        return next;
      });
    },
    onLiveEvent: queueLiveRefresh,
    onConnectionChange: setStreamConnected
  });

  useEffect(() => {
    blobUrlsRef.current = artifactBlobUrls;
  }, [artifactBlobUrls]);

  useEffect(() => {
    return () => {
      if (liveRefreshTimerRef.current != null) {
        window.clearTimeout(liveRefreshTimerRef.current);
      }
    };
  }, []);

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

  const openDeleteDialog = () => {
    if (!statementId || !statement) return;
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (deleting) return;
    setDeleteDialogOpen(false);
  };

  const confirmDeleteCurrentStatement = async () => {
    if (!statementId || !statement || deleting) return;
    setDeleting(true);
    try {
      await accountingApi.deleteStatement(statementId);
      dispatch(showSnackbar({ message: 'Statement deleted', severity: 'success' }));
      setDeleteDialogOpen(false);
      navigate('/dashboard/accounting/statements', {
        state: { refreshStatementsAt: Date.now() }
      });
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to delete statement'),
          severity: 'error'
        })
      );
    } finally {
      setDeleting(false);
    }
  };

  const reprocessCurrentStatement = async () => {
    if (!statementId || reprocessing) return;
    setReprocessing(true);
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
    } finally {
      setReprocessing(false);
    }
  };

  const editModalLinkedCheck = useMemo(
    () => (editItem ? resolveLinkedCheck(editItem, checks) : undefined),
    [editItem, checks]
  );

  const depositLineAccountOptions = useMemo(
    () => filterDepositLineAccounts(depositLineAccounts),
    [depositLineAccounts]
  );
  const expenseLineAccountOptions = useMemo(() => filterExpenseLineAccounts(lineAccounts), [lineAccounts]);

  const resolveSelectedLineAccountRef = useCallback(
    (forWorkflow: WorkflowTxnType) => {
      const pool = forWorkflow === 'Deposit' ? depositLineAccountOptions : expenseLineAccountOptions;
      return resolveLineAccountRefFromPool(pool, {
        lineAccountRef: workflowForm.lineAccountRef,
        lineAccountInput: forWorkflow === 'Deposit' ? depositLineAccountInput : undefined,
        categorySeed: editItem ? resolveCategoryAccountSeed(editItem, editModalLinkedCheck) : undefined,
        chartAccountRefValue
      });
    },
    [
      depositLineAccountOptions,
      depositLineAccountInput,
      editItem,
      editModalLinkedCheck,
      expenseLineAccountOptions,
      workflowForm.lineAccountRef
    ]
  );

  const reviewModalQuickBooksLoading = editModalOpen && reviewQuickBooksBootstrapping;

  const postingBlockingErrors = useMemo(() => {
    if (!editModalOpen || !editItem || !statement) return [];
    const errors: string[] = [];
    if (reviewModalQuickBooksLoading) {
      errors.push('Loading QuickBooks accounts for this transaction…');
      return errors;
    }
    const qb = mapWorkflowToProposedType(workflowType);
    const lineRef =
      workflowType === 'Deposit'
        ? resolveSelectedLineAccountRef('Deposit')
        : resolveSelectedLineAccountRef(workflowType);
    const effectiveCheckNumber = resolveCheckNumberForReview(editItem, editModalLinkedCheck);
    const effectiveVendor =
      workflowForm.vendor.trim() || resolvePayeeNameForReview(editItem, editModalLinkedCheck);
    const bankPaidFrom = (workflowForm.transferFromAccount || effectiveBankAccountId || '').trim();
    const depositTo = (workflowForm.depositToAccount || effectiveBankAccountId || '').trim();

    if (['JournalEntry', 'Bill', 'BillPayment'].includes(workflowType)) {
      errors.push(
        'This workflow is not supported for automated statement posting yet. Choose Deposit, Customer Payment, Sales Receipt, Expense, Check, or Transfer.'
      );
    }

    if (workflowType === 'Transfer') {
      if (!workflowForm.transferFromAccount.trim()) errors.push('Select the transfer from bank account.');
      if (!workflowForm.transferToAccount.trim()) errors.push('Select the transfer to bank account.');
      if (
        workflowForm.transferFromAccount &&
        workflowForm.transferToAccount &&
        workflowForm.transferFromAccount === workflowForm.transferToAccount
      ) {
        errors.push('Transfer from and to accounts must be different.');
      }
    }

    if (qb === 'Deposit') {
      if (!depositTo) errors.push('Select the bank account to deposit into.');
      if (!lineRef) errors.push('Select a deposit line account.');
      if (depositTo && lineRef && depositTo === lineRef) {
        errors.push('Deposit-to bank and deposit line accounts must differ.');
      }
    }

    if (qb === 'Expense' || qb === 'Check') {
      if (!bankPaidFrom) errors.push('Select the bank account paid from.');
      if (!effectiveVendor) errors.push('Enter a vendor or payee.');
      if (!lineRef) errors.push('Select a QuickBooks expense line account.');
      if (workflowType === 'Check' && !effectiveCheckNumber) errors.push('Enter the check number.');
      if (bankPaidFrom && lineRef && bankPaidFrom === lineRef) errors.push('Bank account and expense line must differ.');
    }

    if (workflowType === 'SalesReceipt') {
      if (!depositTo) errors.push('Select the deposit-to bank account.');
      if (!workflowForm.customer.trim()) errors.push('Select a customer.');
      if (!workflowForm.salesItemRefId.trim()) errors.push('Select a QuickBooks product or service item.');
    }

    if (workflowType === 'CustomerPayment') {
      if (!depositTo) errors.push('Select the deposit-to bank account.');
      if (!workflowForm.customer.trim()) errors.push('Select a customer for the payment.');
    }

    return errors;
  }, [
    editModalOpen,
    editItem,
    editModalLinkedCheck,
    effectiveBankAccountId,
    resolveSelectedLineAccountRef,
    reviewModalQuickBooksLoading,
    statement,
    workflowType,
    workflowForm
  ]);

  const primaryApproveLabel = useMemo(() => {
    switch (workflowType) {
      case 'Deposit':
        return 'Post deposit';
      case 'SalesReceipt':
        return 'Post sale';
      case 'CustomerPayment':
        return 'Post payment';
      case 'Transfer':
        return 'Post transfer';
      case 'Check':
        return 'Post check';
      case 'Expense':
        return 'Post expense';
      default:
        return 'Approve';
    }
  }, [workflowType]);

  const buildStatementProposalPatch = useCallback(
    (overrides?: { lineRef?: string }): StatementProposalPatch | undefined => {
    if (!statement || !editItem) return undefined;
    if (['JournalEntry', 'Bill', 'BillPayment'].includes(workflowType)) return undefined;
    const qbTxnType = mapWorkflowToProposedType(workflowType);
    if (!qbTxnType) return undefined;

    let lineRef =
      overrides?.lineRef ??
      (workflowType === 'Deposit' ||
      workflowType === 'Expense' ||
      workflowType === 'Check'
        ? resolveSelectedLineAccountRef(workflowType === 'Deposit' ? 'Deposit' : workflowType)
        : workflowForm.lineAccountRef.trim() || resolveCategoryAccountSeed(editItem, editModalLinkedCheck));
    if (workflowType === 'Deposit' && !lineRef && depositLineAccountOptions.length > 0) {
      const fallbackLine = pickDefaultDepositLineAccount(depositLineAccounts);
      if (fallbackLine) lineRef = chartAccountRefValue(fallbackLine);
    }
    const memo = workflowForm.memo.trim() || undefined;
    const payeeName =
      workflowType === 'SalesReceipt' || workflowType === 'CustomerPayment'
        ? workflowForm.customer.trim() || resolvePayeeNameForReview(editItem, editModalLinkedCheck)
        : workflowType === 'Deposit'
          ? workflowForm.customer.trim() || undefined
          : workflowForm.vendor.trim() || resolvePayeeNameForReview(editItem, editModalLinkedCheck);
    const payeeId =
      workflowType === 'SalesReceipt' || workflowType === 'CustomerPayment'
        ? workflowForm.customerQbId.trim() || undefined
        : workflowType === 'Deposit'
          ? workflowForm.customerQbId.trim() || undefined
          : workflowForm.vendorQbId.trim() || undefined;

    if (qbTxnType === 'Transfer') {
      return {
        qbTxnType: 'Transfer',
        bankAccountId: workflowForm.transferFromAccount.trim() || undefined,
        transferTargetAccountId: workflowForm.transferToAccount.trim() || undefined,
        payeeName: payeeName || undefined,
        memo
      };
    }

    const bankForDeposit = (workflowForm.depositToAccount || effectiveBankAccountId || '').trim() || undefined;
    const bankForOutflow = (workflowForm.transferFromAccount || effectiveBankAccountId || '').trim() || undefined;
    const bankAccountId =
      qbTxnType === 'Deposit' || qbTxnType === 'SalesReceipt' || qbTxnType === 'Payment'
        ? bankForDeposit
        : bankForOutflow;

    const patch: StatementProposalPatch = { qbTxnType };
    if (bankAccountId) patch.bankAccountId = bankAccountId;
    if (qbTxnType !== 'SalesReceipt' && qbTxnType !== 'Payment' && lineRef) {
      patch.categoryAccountId = lineRef;
    } else if (qbTxnType === 'Deposit' && !lineRef) {
      const fallbackLine = pickDefaultDepositLineAccount(depositLineAccounts);
      if (fallbackLine) patch.categoryAccountId = chartAccountRefValue(fallbackLine);
    }
    if (payeeName) patch.payeeName = payeeName;
    if (payeeId) patch.payeeId = payeeId;
    if (memo) patch.memo = memo;
    if (workflowType === 'Check') {
      const checkNumber =
        resolveCheckNumberForReview(editItem, editModalLinkedCheck) || workflowForm.checkNumber.trim();
      if (checkNumber) patch.checkNumber = checkNumber;
      patch.matchExistingCheck = workflowForm.matchExistingCheck;
    }
    if (workflowType === 'SalesReceipt' && workflowForm.salesItemRefId.trim()) {
      patch.salesItemRefId = workflowForm.salesItemRefId.trim();
    }
    if (workflowType === 'CustomerPayment' && workflowForm.linkedInvoiceTxnId.trim()) {
      patch.linkedInvoiceTxnId = workflowForm.linkedInvoiceTxnId.trim();
    }
    return patch;
  },
  [
    statement,
    editItem,
    editModalLinkedCheck,
    depositLineAccountOptions,
    depositLineAccounts,
    effectiveBankAccountId,
    resolveSelectedLineAccountRef,
    workflowType,
    workflowForm
  ]);

  const updateSuggestionReviewStatus = async (
    suggestion: StatementSuggestionItem,
    reviewStatus: StatementReviewStatus,
    proposal?: StatementProposalPatch,
    postToQuickBooks = false
  ) => {
    if (!statementId || mutating) return;
    setMutating(true);
    try {
      const response = await accountingApi.updateStatementSuggestionReview(
        statementId,
        suggestion.id,
        suggestion.source,
        reviewStatus,
        proposal,
        postToQuickBooks
      );
      const qb = response.data.data.quickbooks;
      if (reviewStatus === 'approved' && postToQuickBooks && qb?.posted) {
        dispatch(
          showSnackbar({
            message: qb.matchedExisting
              ? `Matched existing QuickBooks check · ID ${qb.qbTxnId ?? ''}`
              : `${qb.registerSummary ?? 'Posted to QuickBooks'}${qb.qbTxnId ? ` · ID ${qb.qbTxnId}` : ''}`,
            severity: 'success'
          })
        );
      } else if (reviewStatus === 'approved' && postToQuickBooks && qb && !qb.posted && qb.error) {
        dispatch(showSnackbar({ message: qb.error, severity: 'error' }));
        return;
      } else {
        dispatch(showSnackbar({ message: 'Suggestion updated', severity: 'success' }));
      }
      await refreshProcessingPanel();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to update suggestion'),
          severity: 'error'
        })
      );
    } finally {
      setMutating(false);
    }
  };

  const resolveTransferWithExistingAccount = async (suggestion: StatementSuggestionItem) => {
    if (!statementId || mutating) return;
    setMutating(true);
    try {
      await accountingApi.resolveTransferSuggestion(statementId, suggestion.id, {
        action: 'match_existing'
      });
      dispatch(showSnackbar({ message: 'Transfer account matched', severity: 'success' }));
      await refreshProcessingPanel();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Unable to match transfer account'),
          severity: 'error'
        })
      );
    } finally {
      setMutating(false);
    }
  };

  const createTransferCoaAccount = async (suggestion: StatementSuggestionItem) => {
    if (!statementId || mutating) return;
    setMutating(true);
    try {
      await accountingApi.resolveTransferSuggestion(statementId, suggestion.id, {
        action: 'create_coa_account',
        accountName: `Bank ${suggestion.counterpartyBankHint ?? suggestion.id.slice(-4)}`,
        detailType: 'Checking'
      });
      dispatch(showSnackbar({ message: 'Created account and linked transfer', severity: 'success' }));
      await refreshProcessingPanel();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Unable to create and link bank account'),
          severity: 'error'
        })
      );
    } finally {
      setMutating(false);
    }
  };

  const loadContactOptions = useCallback(async (entityType: 'vendor' | 'customer', search = '') => {
    setContactLoading((current) => ({ ...current, [entityType]: true }));
    try {
      const response = await accountingApi.getQuickbooksHubEntities(entityType, {
        page: 1,
        pageSize: 50,
        sort: 'displayName',
        status: 'active',
        search: search.trim() || undefined
      });
      const items = response.data.data.items.map((item) => ({
        id: item.id,
        qbId: item.qbId,
        displayName: item.displayName
      }));
      setContactOptions((current) => ({ ...current, [entityType]: items }));
    } catch (apiError) {
      setContactOptions((current) => ({ ...current, [entityType]: [] }));
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(
            apiError,
            `Unable to load ${entityType} list. Sync QuickBooks reference data from Settings or ask an admin for access.`
          ),
          severity: 'warning'
        })
      );
    } finally {
      setContactLoading((current) => ({ ...current, [entityType]: false }));
    }
  }, [dispatch]);

  const createContact = useCallback(async (entityType: 'vendor' | 'customer', displayName: string) => {
    if (!displayName.trim()) return;
    setContactCreating(true);
    try {
      const response = await accountingApi.postQuickbooksContact(entityType, { displayName: displayName.trim() });
      const detail = response.data.data;
      const newOption = { id: detail.id, qbId: detail.qbId, displayName: detail.displayName };
      setContactOptions((current) => ({
        ...current,
        [entityType]: [newOption, ...current[entityType].filter((opt) => opt.qbId !== detail.qbId)]
      }));
      setWorkflowForm((form) =>
        entityType === 'vendor'
          ? { ...form, vendor: detail.displayName, vendorQbId: detail.qbId }
          : { ...form, customer: detail.displayName, customerQbId: detail.qbId }
      );
      dispatch(
        showSnackbar({
          message: `${entityType === 'vendor' ? 'Vendor' : 'Customer'} "${detail.displayName}" created in QuickBooks`,
          severity: 'success'
        })
      );
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, `Unable to create ${entityType}`),
          severity: 'error'
        })
      );
    } finally {
      setContactCreating(false);
    }
  }, [dispatch]);

  const loadBankAccounts = useCallback(async (search = ''): Promise<QuickBooksHubChartAccount[]> => {
    setBankAccountsLoading(true);
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        accountKind: 'bank',
        status: 'active',
        page: 1,
        pageSize: QUICKBOOKS_HUB_MAX_PAGE_SIZE,
        sort: 'name',
        search: search.trim() || undefined
      });
      const items = response.data.data.items ?? [];
      bankAccountsRef.current = items;
      setBankAccounts(items);
      return items;
    } catch {
      return bankAccountsRef.current;
    } finally {
      setBankAccountsLoading(false);
    }
  }, []);

  const loadLineAccounts = useCallback(async (search = ''): Promise<QuickBooksHubChartAccount[]> => {
    setLineAccountsLoading(true);
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        accountKind: 'expense',
        status: 'active',
        page: 1,
        pageSize: QUICKBOOKS_HUB_MAX_PAGE_SIZE,
        sort: 'name',
        search: search.trim() || undefined
      });
      const items = response.data.data.items ?? [];
      setLineAccounts(items);
      return items;
    } catch (apiError) {
      setLineAccounts([]);
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Could not load QuickBooks expense accounts.'),
          severity: 'warning'
        })
      );
      return [];
    } finally {
      setLineAccountsLoading(false);
    }
  }, [dispatch]);

  const loadDepositLineAccounts = useCallback(async (search = ''): Promise<QuickBooksHubChartAccount[]> => {
    setDepositLineAccountsLoading(true);
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        accountKind: 'deposit_line',
        status: 'active',
        page: 1,
        pageSize: QUICKBOOKS_HUB_MAX_PAGE_SIZE,
        sort: 'name',
        search: search.trim() || undefined
      });
      const items = response.data.data.items ?? [];
      setDepositLineAccounts(items);
      return items;
    } catch (apiError) {
      setDepositLineAccounts([]);
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(
            apiError,
            'Could not load QuickBooks deposit line accounts. Check your QuickBooks connection.'
          ),
          severity: 'warning'
        })
      );
      return [];
    } finally {
      setDepositLineAccountsLoading(false);
    }
  }, [dispatch]);

  const refreshQuickBooksAccounts = useCallback(async () => {
    setRefreshingQuickBooksAccounts(true);
    try {
      await accountingApi.refreshQuickbooksReferenceData();
      await Promise.all([loadBankAccounts(), loadLineAccounts(), loadDepositLineAccounts()]);
      dispatch(showSnackbar({ message: 'QuickBooks accounts refreshed', severity: 'success' }));
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to refresh QuickBooks accounts'),
          severity: 'error'
        })
      );
    } finally {
      setRefreshingQuickBooksAccounts(false);
    }
  }, [dispatch, loadBankAccounts, loadDepositLineAccounts, loadLineAccounts]);

  useEffect(() => {
    void loadBankAccounts();
  }, [loadBankAccounts]);

  useEffect(() => {
    void loadLineAccounts();
    void loadDepositLineAccounts();
  }, [loadDepositLineAccounts, loadLineAccounts]);

  useEffect(() => {
    if (!editModalOpen) return;
    const timer = setTimeout(() => {
      void loadBankAccounts(bankAccountSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [bankAccountSearch, editModalOpen, loadBankAccounts]);

  useEffect(() => {
    if (!editModalOpen || workflowType !== 'Deposit') return;
    const timer = setTimeout(() => {
      void loadDepositLineAccounts(depositLineAccountSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [depositLineAccountSearch, editModalOpen, loadDepositLineAccounts, workflowType]);

  useEffect(() => {
    if (!editModalOpen || !['Expense', 'Check', 'Bill', 'BillPayment'].includes(workflowType)) return;
    const timer = setTimeout(() => {
      void loadLineAccounts(lineAccountSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [editModalOpen, lineAccountSearch, loadLineAccounts, workflowType]);

  useEffect(() => {
    if (!editModalOpen) {
      lineAccountPrefilledRef.current = null;
      setDepositLineAccountSearch('');
      setDepositLineAccountInput('');
      setBankAccountSearch('');
      setLineAccountSearch('');
    }
  }, [editModalOpen]);

  const openCreateBankAccountDialog = useCallback(
    (target: 'transferFrom' | 'transferTo' | 'depositTo' | 'check') => {
      setCreateBankAccountTarget(target);
      setCreateBankAccountForm({ name: '', accountNumber: '', detailType: 'Checking' });
      setCreateBankAccountOpen(true);
    },
    []
  );

  const closeCreateBankAccountDialog = useCallback(() => {
    if (createBankAccountSubmitting) return;
    setCreateBankAccountOpen(false);
    setCreateBankAccountTarget(null);
  }, [createBankAccountSubmitting]);

  const submitCreateBankAccount = useCallback(async () => {
    const trimmedName = createBankAccountForm.name.trim();
    if (!trimmedName) {
      dispatch(showSnackbar({ message: 'Account name is required', severity: 'error' }));
      return;
    }
    setCreateBankAccountSubmitting(true);
    try {
      const response = await accountingApi.createQuickbooksHubChartAccount({
        accountKind: 'bank',
        name: trimmedName,
        accountNumber: createBankAccountForm.accountNumber.trim() || undefined,
        detailType: createBankAccountForm.detailType
      });
      const created = response.data.data.account;
      await loadBankAccounts();
      const newAccountId = chartAccountRefValue(created);
      if (newAccountId) {
        writeDefaultStatementBankAccountId(newAccountId);
        if (statementId) {
          try {
            const assignResponse = await accountingApi.assignStatementBankAccount(statementId, {
              bankAccountId: newAccountId
            });
            const assigned = assignResponse.data.data.statement.bankAccountId?.trim() ?? newAccountId;
            setStatement((current) => (current ? { ...current, bankAccountId: assigned } : current));
          } catch {
            // Form still uses the new QuickBooks account id.
          }
        }
        setWorkflowForm((form) => {
          if (createBankAccountTarget === 'transferFrom' || createBankAccountTarget === 'check') {
            return { ...form, transferFromAccount: newAccountId };
          }
          if (createBankAccountTarget === 'transferTo') {
            return { ...form, transferToAccount: newAccountId };
          }
          if (createBankAccountTarget === 'depositTo') {
            return { ...form, depositToAccount: newAccountId };
          }
          return form;
        });
      }
      setCreateBankAccountOpen(false);
      setCreateBankAccountTarget(null);
      dispatch(showSnackbar({ message: 'Bank chart account created', severity: 'success' }));
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to create bank chart account'),
          severity: 'error'
        })
      );
    } finally {
      setCreateBankAccountSubmitting(false);
    }
  }, [
    createBankAccountForm,
    createBankAccountTarget,
    dispatch,
    loadBankAccounts,
    statementId
  ]);

  const openCreateLineAccountDialog = useCallback((kind: 'expense' | 'income') => {
    setCreateLineAccountKind(kind);
    setCreateLineAccountName('');
    setCreateLineAccountOpen(true);
  }, []);

  const closeCreateLineAccountDialog = useCallback(() => {
    if (createLineAccountSubmitting) return;
    setCreateLineAccountOpen(false);
  }, [createLineAccountSubmitting]);

  const submitCreateLineAccount = useCallback(async () => {
    const trimmedName = createLineAccountName.trim();
    if (!trimmedName) {
      dispatch(showSnackbar({ message: 'Account name is required', severity: 'error' }));
      return;
    }
    setCreateLineAccountSubmitting(true);
    try {
      const response = await accountingApi.createQuickbooksHubChartAccount({
        accountKind: createLineAccountKind,
        name: trimmedName
      });
      const created = response.data.data.account;
      await loadLineAccounts();
      const newAccountId = chartAccountRefValue(created);
      if (newAccountId) {
        setWorkflowForm((form) => ({ ...form, lineAccountRef: newAccountId }));
        if (createLineAccountKind === 'income') {
          setDepositLineAccountInput(created.name);
        }
      }
      setCreateLineAccountOpen(false);
      dispatch(
        showSnackbar({
          message: `${createLineAccountKind === 'income' ? 'Income' : 'Expense'} account created in QuickBooks`,
          severity: 'success'
        })
      );
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to create chart account'),
          severity: 'error'
        })
      );
    } finally {
      setCreateLineAccountSubmitting(false);
    }
  }, [createLineAccountKind, createLineAccountName, dispatch, loadLineAccounts]);

  const loadQbItems = useCallback(async (search = '') => {
    setQbItemsLoading(true);
    try {
      const response = await accountingApi.getQuickbooksHubItems({
        page: 1,
        pageSize: 100,
        search: search.trim() || undefined
      });
      setQbItems(response.data.data.items ?? []);
    } catch {
      setQbItems([]);
    } finally {
      setQbItemsLoading(false);
    }
  }, []);

  const ensureReviewQuickBooksData = useCallback(async () => {
    const tasks: Array<Promise<unknown>> = [loadBankAccounts(bankAccountSearch)];
    if (workflowType === 'Deposit') {
      tasks.push(loadDepositLineAccounts(depositLineAccountSearch));
    }
    if (['Expense', 'Check', 'Bill', 'BillPayment'].includes(workflowType)) {
      tasks.push(loadLineAccounts(lineAccountSearch));
    }
    if (workflowType === 'SalesReceipt') {
      tasks.push(loadQbItems(qbItemSearch));
    }
    if (
      workflowType === 'SalesReceipt' ||
      workflowType === 'CustomerPayment' ||
      workflowType === 'Deposit'
    ) {
      tasks.push(loadContactOptions('customer', contactSearch.customer));
    }
    if (
      workflowType === 'Expense' ||
      workflowType === 'Check' ||
      workflowType === 'Bill' ||
      workflowType === 'BillPayment'
    ) {
      tasks.push(loadContactOptions('vendor', contactSearch.vendor));
    }
    await Promise.all(tasks);
  }, [
    bankAccountSearch,
    contactSearch.customer,
    contactSearch.vendor,
    depositLineAccountSearch,
    lineAccountSearch,
    loadBankAccounts,
    loadContactOptions,
    loadDepositLineAccounts,
    loadLineAccounts,
    loadQbItems,
    qbItemSearch,
    workflowType
  ]);

  useEffect(() => {
    if (!editModalOpen || !editItem) {
      setReviewQuickBooksBootstrapping(false);
      return;
    }
    const generation = reviewQuickBooksBootstrapGenRef.current + 1;
    reviewQuickBooksBootstrapGenRef.current = generation;
    setReviewQuickBooksBootstrapping(true);
    void ensureReviewQuickBooksData().finally(() => {
      if (reviewQuickBooksBootstrapGenRef.current === generation) {
        setReviewQuickBooksBootstrapping(false);
      }
    });
    return () => {
      reviewQuickBooksBootstrapGenRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once per modal/item/workflow; avoid reload loop
  }, [editModalOpen, editItem?.id, workflowType]);

  const createQbItem = useCallback(async (rawName: string) => {
    const trimmedName = rawName.trim();
    if (!trimmedName) {
      dispatch(showSnackbar({ message: 'Item name is required', severity: 'error' }));
      return;
    }
    setQbItemCreating(true);
    try {
      const response = await accountingApi.createQuickbooksHubItem({
        name: trimmedName,
        type: 'Service'
      });
      const created = response.data.data.item;
      setQbItems((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== created.id);
        return [created, ...withoutDuplicate];
      });
      setQbItemSearch(created.name);
      setWorkflowForm((form) => ({
        ...form,
        salesItemRefId: created.id
      }));
      dispatch(showSnackbar({ message: 'QuickBooks product/service item created', severity: 'success' }));
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to create QuickBooks item'),
          severity: 'error'
        })
      );
    } finally {
      setQbItemCreating(false);
    }
  }, [dispatch]);

  const loadOpenInvoices = useCallback(async (customerQbId: string) => {
    if (!customerQbId.trim()) {
      setOpenInvoices([]);
      return;
    }
    setOpenInvoicesLoading(true);
    try {
      const response = await accountingApi.getQuickbooksWriteInvoices({
        customerId: customerQbId,
        page: 1,
        pageSize: 100
      });
      const items = (response.data.data.items ?? [])
        .filter((row) => (row.balanceAmount ?? 0) > 0)
        .map((row) => {
          const doc = row.docNumber?.trim();
          const balance = row.balanceAmount ?? 0;
          const date = row.txnDate ?? '';
          const label = doc
            ? `Invoice #${doc} · ${formatMoney(balance)} open${date ? ` · ${date}` : ''}`
            : `Invoice ${row.qbTxnId} · ${formatMoney(balance)} open`;
          return { qbTxnId: row.qbTxnId, label, balanceAmount: row.balanceAmount };
        });
      setOpenInvoices(items);
    } catch {
      setOpenInvoices([]);
    } finally {
      setOpenInvoicesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!editModalOpen) return;
    const timer = setTimeout(() => { void loadContactOptions('vendor', contactSearch.vendor); }, 250);
    return () => clearTimeout(timer);
  }, [editModalOpen, contactSearch.vendor, loadContactOptions]);

  useEffect(() => {
    if (!editModalOpen) return;
    const timer = setTimeout(() => { void loadContactOptions('customer', contactSearch.customer); }, 250);
    return () => clearTimeout(timer);
  }, [editModalOpen, contactSearch.customer, loadContactOptions]);

  useEffect(() => {
    if (!editModalOpen || workflowType !== 'SalesReceipt') return;
    const timer = setTimeout(() => { void loadQbItems(qbItemSearch); }, 250);
    return () => clearTimeout(timer);
  }, [editModalOpen, workflowType, qbItemSearch, loadQbItems]);

  useEffect(() => {
    if (!editModalOpen || workflowType !== 'CustomerPayment') {
      setOpenInvoices([]);
      return;
    }
    const customerQbId = workflowForm.customerQbId.trim();
    if (!customerQbId) {
      setOpenInvoices([]);
      return;
    }
    void loadOpenInvoices(customerQbId);
  }, [editModalOpen, workflowType, workflowForm.customerQbId, loadOpenInvoices]);

  const openEditModal = (item: StatementSuggestionItem, autoSaveAndNext = false) => {
    setEditItem(item);
    setSaveAndNext(autoSaveAndNext);
    setEditModalOpen(true);
    setDepositLineAccountSearch('');
    setDepositLineAccountInput('');
    const linkedCheck = resolveLinkedCheck(item, checks);
    const initialType = isCheckSuggestionItem(item)
      ? 'Check'
      : isGenericBankDepositRow(item)
        ? 'Deposit'
        : suggestWorkflowType({
            direction: item.direction,
            description: item.description ?? '',
            transactionFamily: item.transactionFamily,
            proposedTxnType: item.proposedTxnType,
            checkNumber: item.checkNumber,
            section: item.section,
            rowType: item.rowType
          });
    setWorkflowType(initialType);
    const suggestion = suggestCategoryPreset({
      direction: item.direction,
      description: item.description ?? ''
    });
    const defaultBankAccountId = effectiveBankAccountId;
    const payeeSeed = resolvePayeeNameForReview(item, linkedCheck);
    const categorySeed = resolveCategoryAccountSeed(item, linkedCheck);
    const checkNumberSeed = resolveCheckNumberForReview(item, linkedCheck);
    // For Transfer rows, the upload account is one side of the move and the
    // counterparty (e.g. xxx3588 hint) is the other side. Direction tells us
    // which side the upload account is on:
    //   debit  → money LEAVES the upload account → from = upload, to = counterparty
    //   credit → money ARRIVES in the upload account → from = counterparty, to = upload
    let defaultTransferFromAccount = '';
    let defaultTransferToAccount = '';
    if (initialType === 'Transfer') {
      if (item.direction === 'debit') {
        defaultTransferFromAccount = defaultBankAccountId;
        defaultTransferToAccount = ''; // user picks the destination from dropdown
      } else {
        defaultTransferFromAccount = ''; // user picks the source from dropdown
        defaultTransferToAccount = defaultBankAccountId;
      }
    } else if (initialType === 'Check') {
      defaultTransferFromAccount = defaultBankAccountId || (item.statementAccountMask ?? '');
    }
    lineAccountPrefilledRef.current = null;
    setWorkflowForm({
      vendor: item.direction === 'debit' ? payeeSeed : '',
      customer: item.direction === 'credit' ? payeeSeed : '',
      categoryLabel: suggestion?.label ?? '',
      customCategory: '',
      salesItemRefId: '',
      linkedInvoiceTxnId: '',
      depositToAccount:
        (initialType === 'Deposit' || initialType === 'SalesReceipt' || initialType === 'CustomerPayment') &&
        defaultBankAccountId
          ? defaultBankAccountId
          : '',
      transferFromAccount: defaultTransferFromAccount,
      transferToAccount: defaultTransferToAccount,
      memo: linkedCheck?.extracted?.memo ?? item.sourceText ?? '',
      checkNumber: checkNumberSeed,
      lineAccountRef: categorySeed,
      vendorQbId: linkedCheck?.proposal?.payeeId?.trim() ?? '',
      customerQbId: '',
      matchExistingCheck: true
    });
  };

  useEffect(() => {
    if (!editModalOpen) return;
    const defaultBankAccountId = effectiveBankAccountId;
    if (!defaultBankAccountId) return;
    if (workflowType === 'Check' || workflowType === 'Expense' || workflowType === 'Bill' || workflowType === 'BillPayment') {
      setWorkflowForm((form) => (form.transferFromAccount ? form : { ...form, transferFromAccount: defaultBankAccountId }));
    }
    if (workflowType === 'Transfer' && editItem) {
      if (editItem.direction === 'debit') {
        setWorkflowForm((form) =>
          form.transferFromAccount ? form : { ...form, transferFromAccount: defaultBankAccountId }
        );
      } else if (editItem.direction === 'credit') {
        setWorkflowForm((form) =>
          form.transferToAccount ? form : { ...form, transferToAccount: defaultBankAccountId }
        );
      }
    }
    if (workflowType === 'Deposit' || workflowType === 'SalesReceipt' || workflowType === 'CustomerPayment') {
      setWorkflowForm((form) => (form.depositToAccount ? form : { ...form, depositToAccount: defaultBankAccountId }));
    }
  }, [editModalOpen, editItem, effectiveBankAccountId, workflowType]);

  useEffect(() => {
    if (!editModalOpen || !editItem) return;
    const prefillKey = `${editItem.id}:${workflowType}`;
    if (lineAccountPrefilledRef.current === prefillKey) return;

    const prefillFromPool = (
      pool: QuickBooksHubChartAccount[],
      defaultPicker: (accounts: QuickBooksHubChartAccount[]) => QuickBooksHubChartAccount | undefined
    ) => {
      const seed = resolveCategoryAccountSeed(editItem, editModalLinkedCheck);
      if (seed) {
        const normalizedSeed = seed.toLowerCase();
        const byId = pool.find(
          (account) =>
            chartAccountRefValue(account) === seed ||
            account.id === seed ||
            account.name.trim().toLowerCase() === normalizedSeed
        );
        if (byId) {
          setWorkflowForm((form) => ({
            ...form,
            lineAccountRef: chartAccountRefValue(byId)
          }));
          if (workflowType === 'Deposit') {
            setDepositLineAccountInput(byId.name);
          }
          lineAccountPrefilledRef.current = prefillKey;
          return true;
        }
        if (pool.length > 0) {
          return false;
        }
        setWorkflowForm((form) => ({
          ...form,
          lineAccountRef: seed
        }));
        if (workflowType === 'Deposit') {
          setDepositLineAccountInput(seed);
        }
        lineAccountPrefilledRef.current = prefillKey;
        return true;
      }
      const preset = suggestCategoryPreset({
        direction: editItem.direction,
        description: editItem.description ?? ''
      });
      if (preset) {
        const fuzzy = pool.find((account) => account.name === preset.label);
        if (fuzzy) {
          setWorkflowForm((form) => ({
            ...form,
            categoryLabel: preset.label,
            lineAccountRef: chartAccountRefValue(fuzzy)
          }));
          if (workflowType === 'Deposit') {
            setDepositLineAccountInput(fuzzy.name);
          }
          lineAccountPrefilledRef.current = prefillKey;
          return true;
        }
      }
      const fallback = defaultPicker(pool);
      if (fallback) {
        setWorkflowForm((form) => ({
          ...form,
          lineAccountRef: chartAccountRefValue(fallback)
        }));
        if (workflowType === 'Deposit') {
          setDepositLineAccountInput(fallback.name);
        }
        lineAccountPrefilledRef.current = prefillKey;
        return true;
      }
      return false;
    };

    if (workflowType === 'Deposit') {
      if (depositLineAccountsLoading || depositLineAccounts.length === 0) return;
      prefillFromPool(depositLineAccounts, pickDefaultDepositLineAccount);
      return;
    }

    if (lineAccountsLoading || lineAccounts.length === 0) return;

    if (workflowType === 'SalesReceipt') {
      const revenuePool = depositLineAccounts.filter((account) => account.type === 'revenue');
      if (revenuePool.length > 0) {
        prefillFromPool(revenuePool, pickDefaultDepositLineAccount);
        return;
      }
    }

    if (workflowType === 'Check' || workflowType === 'Expense') {
      const expenseAccount = pickDefaultExpenseLineAccount(lineAccounts);
      if (expenseAccount) {
        setLineAccountSearch(expenseAccount.name);
        setWorkflowForm((form) => ({
          ...form,
          lineAccountRef: chartAccountRefValue(expenseAccount)
        }));
      }
    }
    lineAccountPrefilledRef.current = prefillKey;
  }, [
    editModalOpen,
    editItem,
    editModalLinkedCheck,
    depositLineAccounts,
    depositLineAccountsLoading,
    lineAccounts,
    lineAccountsLoading,
    workflowType
  ]);

  useEffect(() => {
    if (!editModalOpen || !statementId) {
      setReviewCheckImageUrl(null);
      setReviewCheckImageLoading(false);
      return;
    }

    const cropPath = editModalLinkedCheck?.artifacts?.cropImagePath?.trim();
    if (!cropPath) {
      setReviewCheckImageUrl(null);
      setReviewCheckImageLoading(false);
      return;
    }

    if (blobUrlsRef.current[cropPath]) {
      setReviewCheckImageUrl(blobUrlsRef.current[cropPath]);
      return;
    }

    let cancelled = false;
    setReviewCheckImageLoading(true);
    void accountingApi
      .getStatementArtifactBlob(statementId, cropPath)
      .then((response) => {
        if (cancelled) return;
        const nextUrl = URL.createObjectURL(response.data);
        setArtifactBlobUrls((current) => ({ ...current, [cropPath]: nextUrl }));
        setReviewCheckImageUrl(nextUrl);
      })
      .catch(() => {
        if (!cancelled) setReviewCheckImageUrl(null);
      })
      .finally(() => {
        if (!cancelled) setReviewCheckImageLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editModalOpen, editModalLinkedCheck?.artifacts?.cropImagePath, statementId]);

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditItem(null);
    setSaveAndNext(false);
    setApproveMenuOpen(false);
    setReviewCheckImageUrl(null);
  };

  const saveEditModal = async (action: 'save' | 'save_next' | 'mark_non_posting') => {
    if (!editItem || !statement || mutating) return;
    if (action !== 'mark_non_posting' && postingBlockingErrors.length > 0) {
      dispatch(
        showSnackbar({
          message: postingBlockingErrors[0],
          severity: 'error'
        })
      );
      return;
    }

    setMutating(true);
    let resolvedLineAccountRef = '';
    let proposalPatch: StatementProposalPatch | undefined;
    try {
      if (action !== 'mark_non_posting') {
        await ensureReviewQuickBooksData();
        const loadedDepositLines =
          workflowType === 'Deposit' ? await loadDepositLineAccounts(depositLineAccountSearch) : depositLineAccounts;
        const loadedExpenseLines =
          workflowType === 'Expense' || workflowType === 'Check'
            ? await loadLineAccounts(lineAccountSearch)
            : lineAccounts;
        const depositPool = filterDepositLineAccounts(loadedDepositLines);
        const expensePool = filterExpenseLineAccounts(loadedExpenseLines);
        const pool = workflowType === 'Deposit' ? depositPool : expensePool;
        resolvedLineAccountRef = resolveLineAccountRefFromPool(pool, {
          lineAccountRef: workflowForm.lineAccountRef,
          lineAccountInput: workflowType === 'Deposit' ? depositLineAccountInput : undefined,
          categorySeed: resolveCategoryAccountSeed(editItem, editModalLinkedCheck),
          chartAccountRefValue
        });
        if (!resolvedLineAccountRef && workflowType === 'Deposit') {
          const fallbackLine = pickDefaultDepositLineAccount(loadedDepositLines);
          if (fallbackLine) resolvedLineAccountRef = chartAccountRefValue(fallbackLine);
        }
        if (!resolvedLineAccountRef && (workflowType === 'Expense' || workflowType === 'Check')) {
          const fallbackLine = pickDefaultExpenseLineAccount(loadedExpenseLines);
          if (fallbackLine) resolvedLineAccountRef = chartAccountRefValue(fallbackLine);
        }
        const bankPaidFrom = (workflowForm.transferFromAccount || effectiveBankAccountId || '').trim();
        const depositTo = (workflowForm.depositToAccount || effectiveBankAccountId || '').trim();
        const qb = mapWorkflowToProposedType(workflowType);
        if (qb === 'Deposit' && (!depositTo || !resolvedLineAccountRef)) {
          dispatch(
            showSnackbar({
              message: !depositTo
                ? 'Select the bank account to deposit into.'
                : 'Select a deposit line account.',
              severity: 'error'
            })
          );
          return;
        }
        if ((qb === 'Expense' || qb === 'Check') && (!bankPaidFrom || !resolvedLineAccountRef)) {
          dispatch(
            showSnackbar({
              message: !bankPaidFrom
                ? 'Select the bank account paid from.'
                : 'Select a QuickBooks expense line account.',
              severity: 'error'
            })
          );
          return;
        }
        proposalPatch = buildStatementProposalPatch({ lineRef: resolvedLineAccountRef });
      }

      const mergedSuggestion: StatementSuggestionItem = {
        ...editItem,
        payeeName:
          workflowType === 'SalesReceipt' || workflowType === 'Deposit' || workflowType === 'CustomerPayment'
            ? workflowForm.customer || editItem.payeeName
            : workflowForm.vendor || editItem.payeeName,
        categoryAccountId: resolvedLineAccountRef || editItem.categoryAccountId,
        proposedTxnType: mapWorkflowToProposedType(workflowType) ?? editItem.proposedTxnType,
        resolvedRelatedAccountId:
          workflowType === 'Transfer'
            ? workflowForm.transferToAccount || editItem.resolvedRelatedAccountId
            : editItem.resolvedRelatedAccountId,
        checkNumber: workflowType === 'Check' ? workflowForm.checkNumber || editItem.checkNumber : editItem.checkNumber,
        bankAccountId:
          workflowType === 'Deposit' || workflowType === 'SalesReceipt' || workflowType === 'CustomerPayment'
            ? workflowForm.depositToAccount || effectiveBankAccountId || editItem.bankAccountId
            : workflowForm.transferFromAccount || effectiveBankAccountId || editItem.bankAccountId
      };

      if (action === 'mark_non_posting') {
        await updateSuggestionReviewStatus(mergedSuggestion, 'excluded', undefined, false);
      } else {
        await updateSuggestionReviewStatus(mergedSuggestion, 'approved', proposalPatch, true);
      }
    } finally {
      setMutating(false);
    }
    if (action === 'save_next' || saveAndNext) {
      const currentId = editItem.id;
      const ordered = suggestions?.items ?? [];
      const idx = ordered.findIndex((row) => row.id === currentId);
      const next = idx >= 0 ? ordered[idx + 1] : null;
      if (next) {
        openEditModal(next, false);
        return;
      }
    }
    closeEditModal();
  };

  const completeMonth = async () => {
    if (!statementId || mutating) return;
    setMutating(true);
    try {
      await accountingApi.completeStatementMonth(statementId);
      dispatch(showSnackbar({ message: 'Month marked complete', severity: 'success' }));
      await load();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Month cannot be completed yet'),
          severity: 'error'
        })
      );
    } finally {
      setMutating(false);
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

  useEffect(() => {
    if (sortedChecks.length === 0) {
      setSelectedCheckId(null);
      return;
    }

    if (!selectedCheckId || !sortedChecks.some((check) => check.id === selectedCheckId)) {
      setSelectedCheckId(sortedChecks[0].id);
    }
  }, [sortedChecks, selectedCheckId]);

  const statementViewerArtifacts = useMemo(
    () => (statement ? getStatementViewerArtifacts(statement) : []),
    [statement]
  );

  const checkViewerArtifacts = useMemo(() => {
    return checks.flatMap((check) => {
      const cropPath = check.artifacts?.cropImagePath;
      if (!cropPath) return [];
      const checkNumber = check.extracted?.checkNumber ?? check.autoFill?.checkNumber ?? check.id.slice(-6);
      return [{
        key: `check-${check.id}-crop`,
        label: `Check ${checkNumber}`,
        path: cropPath,
        kind: 'blob' as const,
        emptyMessage: `Cropped image for check ${checkNumber} is not available yet.`
      }];
    });
  }, [checks]);

  const fileManagerArtifacts = useMemo(
    () => [...statementViewerArtifacts, ...checkViewerArtifacts],
    [statementViewerArtifacts, checkViewerArtifacts]
  );

  useEffect(() => {
    if (fileManagerArtifacts.length === 0) return;
    if (!fileManagerArtifacts.some((artifact) => artifact.key === statementViewerTab)) {
      setStatementViewerTab(fileManagerArtifacts[0].key);
    }
  }, [fileManagerArtifacts, statementViewerTab]);
  const currentArtifact = useMemo(
    () => fileManagerArtifacts.find((artifact) => artifact.key === statementViewerTab) ?? null,
    [fileManagerArtifacts, statementViewerTab]
  );
  const artifactGroups = useMemo(() => {
    const folderOrder = ['Source', 'Extraction', 'Structured Tables', 'Checks', 'AI & Processing', 'Other'] as const;
    const grouped = new Map<string, typeof fileManagerArtifacts>();

    const folderForArtifact = (key: StatementViewerTab) => {
      if (key.startsWith('check-')) return 'Checks';
      if (key === 'pdf') return 'Source';
      if (key === 'ocrText' || key === 'ocrJson' || key === 'normalized') return 'Extraction';
      if (
        key === 'transactions' ||
        key === 'checksCleared' ||
        key === 'sections' ||
        key === 'extractedChecks' ||
        key === 'structuredStatement' ||
        key === 'offlineExtraction'
      ) {
        return 'Structured Tables';
      }
      if (key === 'classificationOutput' || key === 'suggestionsOutput' || key === 'processingSummary') {
        return 'AI & Processing';
      }
      return 'Other';
    };

    for (const artifact of fileManagerArtifacts) {
      const folder = folderForArtifact(artifact.key);
      const existing = grouped.get(folder) ?? [];
      existing.push(artifact);
      grouped.set(folder, existing);
    }

    return folderOrder
      .map((folder) => ({
        folder,
        items: grouped.get(folder) ?? []
      }))
      .filter((group) => group.items.length > 0);
  }, [fileManagerArtifacts]);

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

  const { canCompleteMonth } = useMonthCloseWorkspaceState(statement, suggestions);

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

  const renderSuggestionsBody = () => {
    if (!suggestions) {
      return <Alert severity="info">Suggestions are loading.</Alert>;
    }

    const groupTotals = (rows: StatementSuggestionItem[]) => ({
      count: rows.length,
      total: rows.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0)
    });

    const matchesFilters = (item: StatementSuggestionItem) => {
      const needle = searchTerm.trim().toLowerCase();
      if (needle) {
        const haystack = [
          item.description,
          item.sourceText,
          item.payeeName,
          item.checkNumber,
          String(Math.abs(item.amount)),
          item.counterpartyBankHint,
          item.statementAccountMask
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (dateFrom && (item.date ?? '') < dateFrom) return false;
      if (dateTo && (item.date ?? '') > dateTo) return false;
      if (amountMin && Math.abs(item.amount) < Number(amountMin)) return false;
      if (amountMax && Math.abs(item.amount) > Number(amountMax)) return false;
      if (sectionFilter !== 'all' && item.section !== sectionFilter) return false;
      if (familyFilter !== 'all' && item.transactionFamily !== familyFilter) return false;
      if (statusFilter !== 'all' && item.reviewStatus !== statusFilter) return false;
      if (workflowFilter !== 'all' && item.proposedTxnType !== workflowFilter) return false;
      if (quickFilter === 'unresolved' && !['needs_internal_account_match', 'needs_chart_of_accounts_account', 'needs_review'].includes(String(item.transferResolutionStatus))) return false;
      if (quickFilter === 'needs_review' && item.reviewStatus !== 'proposed') return false;
      if (
        quickFilter === 'missing_vendor' &&
        !(!item.payeeName?.trim() && ['vendor_payment', 'tax_payment'].includes(String(item.transactionFamily ?? '')))
      ) {
        return false;
      }
      if (quickFilter === 'transfers' && item.transactionFamily !== 'transfer') return false;
      if (quickFilter === 'checks' && item.source !== 'check' && item.proposedTxnType !== 'Check') return false;
      if (quickFilter === 'high_amount' && Math.abs(item.amount) < 1000) return false;
      if (quickFilter === 'posting' && item.reviewStatus === 'excluded') return false;
      if (quickFilter === 'unknown' && (item.transactionFamily ?? 'other') !== 'other') return false;
      return true;
    };

    const scopedSuggestions = suggestions.items.filter((item) => matchesFilters(item));

    const sortedItems = [...scopedSuggestions].sort((a, b) => {
      if (sortBy === 'amount') return Math.abs(b.amount) - Math.abs(a.amount);
      if (sortBy === 'page') return (a.sourcePage ?? 999) - (b.sourcePage ?? 999);
      if (sortBy === 'confidence') return (b.proposalConfidence ?? 0) - (a.proposalConfidence ?? 0);
      return String(a.date ?? '').localeCompare(String(b.date ?? ''));
    });

    const totalReviewRows = sortedItems.length;
    const approvedRows = sortedItems.filter((item) => item.reviewStatus === 'approved').length;
    const needsReviewRows = sortedItems.filter((item) => item.reviewStatus === 'proposed').length;

    const resetReviewFilters = () => {
      setSearchTerm('');
      setDateFrom('');
      setDateTo('');
      setAmountMin('');
      setAmountMax('');
      setSectionFilter('all');
      setFamilyFilter('all');
      setStatusFilter('all');
      setWorkflowFilter('all');
      setQuickFilter(null);
      setSortBy('date');
      setShowEmptyGroups(false);
      setSectionRowLimit({});
    };

    const quickFilterTitle: Record<string, string> = {
      unresolved: 'Unresolved transfers',
      needs_review: 'Needs review',
      missing_vendor: 'Missing vendor',
      transfers: 'Transfers',
      checks: 'Checks',
      high_amount: 'High amount',
      posting: 'Posting candidates',
      unknown: 'Unknown classification'
    };

    const activeFilterParts: string[] = [];
    if (sectionFilter !== 'all') activeFilterParts.push(`Section: ${formatStatusLabel(sectionFilter)}`);
    if (statusFilter !== 'all') activeFilterParts.push(`Status: ${reviewStatusFilterLabel(statusFilter)}`);
    if (familyFilter !== 'all') activeFilterParts.push(`Type: ${formatStatusLabel(familyFilter)}`);
    if (workflowFilter !== 'all') activeFilterParts.push(`Workflow: ${workflowFilter}`);
    if (quickFilter) activeFilterParts.push(`Quick: ${quickFilterTitle[quickFilter] ?? quickFilter}`);
    if (dateFrom || dateTo) activeFilterParts.push('Date range set');
    if (amountMin || amountMax) activeFilterParts.push('Amount range set');

    const sectionMeta = statementOverview?.sections ?? [];
    const sectionKeysFromOverview = sectionMeta.map((section) => section.key);
    const sectionKeysFromItems = Array.from(
      new Set(scopedSuggestions.map((item) => String(item.section ?? 'unknown')))
    );
    const orderedSectionKeys = [
      ...sectionKeysFromOverview,
      ...sectionKeysFromItems.filter((key) => !sectionKeysFromOverview.includes(key))
    ].filter((key, index, array) => array.indexOf(key) === index);

    const sectionGroups = orderedSectionKeys.map((sectionKey) => {
      const meta = sectionMeta.find((section) => section.key === sectionKey);
      const rows = sortedItems.filter((item) => String(item.section ?? 'unknown') === sectionKey);
      const totals = groupTotals(rows);
      const pending = rows.filter((item) => item.reviewStatus === 'proposed').length;
      const sectionStatus =
        rows.length === 0 ? 'Empty' : pending > 0 ? 'Needs review' : 'Ready';
      return {
        key: sectionKey,
        label: meta?.label ?? formatStatusLabel(sectionKey),
        direction: meta?.direction ?? (rows[0]?.direction === 'credit' ? 'credit' : 'debit'),
        count: meta?.count.value ?? totals.count,
        total: meta?.total.value ?? totals.total,
        sourceLabel: meta?.sourceLabel,
        status: sectionStatus,
        rows
      };
    });
    const visibleSectionGroups = sectionGroups.filter((group) => showEmptyGroups || group.rows.length > 0);
    const firstVisibleSectionKey = visibleSectionGroups[0]?.key;

    return (
      <Stack spacing={2}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Review Transactions
        </Typography>

        <Paper variant="outlined" sx={{ p: 1.5, position: 'sticky', top: 8, zIndex: 3, bgcolor: 'background.paper' }}>
          <Stack spacing={1.25}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
              <TextField
                size="small"
                placeholder="Search description, amount, check #, source line…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                fullWidth
              />
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<FilterListIcon />}
                  onClick={() => setFilterDrawerOpen(true)}
                >
                  Filters
                </Button>
                <Button size="small" variant="text" onClick={resetReviewFilters}>
                  Clear
                </Button>
              </Stack>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {visibleSectionGroups.length} sections · {totalReviewRows} review rows · {approvedRows} approved ·{' '}
              {needsReviewRows} needs review
            </Typography>
            {activeFilterParts.length > 0 ? (
              <Typography variant="caption" color="text.secondary">
                Active filters: {activeFilterParts.join(' · ')}
              </Typography>
            ) : null}
          </Stack>
        </Paper>

        <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 600 }}>
          Statement sections
        </Typography>

        {visibleSectionGroups.length === 0 ? (
          <Alert severity="info">No transactions match the current filters.</Alert>
        ) : (
          visibleSectionGroups.map((group) => {
            const isChecks = group.key === 'checks_cleared';
            const showAccountCol = group.rows.some((item) => item.transactionFamily === 'transfer');
            const sectionExpanded =
              expandedRows[`section:${group.key}`] ?? group.key === firstVisibleSectionKey;
            const directionLabel =
              group.direction === 'credit' ? 'Credit' : group.direction === 'debit' ? 'Debit' : 'Unknown';
            const totals = groupTotals(group.rows);
            const totalInSection = group.rows.length;
            const visibleCount = getSectionVisibleCount(sectionRowLimit, group.key, totalInSection);
            const displayedRows = group.rows.slice(0, visibleCount);
            const canShowMore = visibleCount < totalInSection;

            return (
              <Accordion
                key={group.key}
                expanded={sectionExpanded}
                onChange={(_event, expanded) =>
                  setExpandedRows((current) => ({ ...current, [`section:${group.key}`]: expanded }))
                }
                disableGutters
                variant="outlined"
                sx={{ borderRadius: 1, bgcolor: 'background.paper', '&:before': { display: 'none' } }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, py: 1 }}>
                  <Box sx={{ width: '100%', pr: 0.5 }}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                        {group.label}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
                        <Typography variant="body2" color="text.secondary">
                          {group.status}
                        </Typography>
                        <Tooltip
                          title={
                            group.status === 'Needs review'
                              ? 'This section still has rows that need review.'
                              : 'No proposed rows in this section for the current filters.'
                          }
                        >
                          <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
                        </Tooltip>
                      </Stack>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
                      <Typography variant="body2" color="text.secondary" component="span">
                        {totalInSection} items · {formatMoney(totals.total)} · {directionLabel} ·{' '}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" component="span">
                        {group.sourceLabel ? `Source: ${group.sourceLabel}` : 'Source unknown'}
                      </Typography>
                      <Tooltip title="How this section total and source were derived from the statement.">
                        <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', ml: 0.25 }} />
                      </Tooltip>
                    </Stack>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ pt: 0, px: 0, pb: 0 }}>
                  <Paper variant="outlined" sx={{ borderRadius: 0, borderLeft: 0, borderRight: 0, borderBottom: 0 }}>
                    <Box
                      sx={{
                        px: 1.25,
                        py: 1,
                        display: 'grid',
                        gap: 1,
                        borderBottom: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'grey.50',
                        ...(isChecks
                          ? { gridTemplateColumns: '92px 80px 100px minmax(160px,1fr) 88px 88px 72px' }
                          : showAccountCol
                            ? {
                                gridTemplateColumns:
                                  '100px minmax(180px,1fr) 100px minmax(100px,1fr) 100px 100px 100px 72px'
                              }
                            : { gridTemplateColumns: '100px minmax(200px,1fr) 100px 100px 100px 72px' })
                      }}
                    >
                      {isChecks ? (
                        <>
                          <Typography variant="caption" color="text.secondary">
                            Date
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Check #
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Amount
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Payee hint
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Workflow
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Status
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Action
                          </Typography>
                        </>
                      ) : (
                        <>
                          <Typography variant="caption" color="text.secondary">
                            Date
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Description
                          </Typography>
                          <Typography variant="caption" color="text.secondary" textAlign="right">
                            Amount
                          </Typography>
                          {showAccountCol ? (
                            <Typography variant="caption" color="text.secondary">
                              Account hint
                            </Typography>
                          ) : null}
                          <Typography variant="caption" color="text.secondary">
                            Workflow
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Status
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            Action
                          </Typography>
                        </>
                      )}
                    </Box>
                    {group.rows.length === 0 ? (
                      <Box sx={{ p: 2 }}>
                        <Typography variant="body2" color="text.secondary">
                          No rows in this section for the current filters.
                        </Typography>
                      </Box>
                    ) : (
                      displayedRows.map((item) => {
                        const statusText =
                          item.transferResolutionStatus && item.transferResolutionStatus !== 'matched_transfer_ready'
                            ? formatStatusLabel(item.transferResolutionStatus)
                            : formatStatusLabel(item.reviewStatus ?? 'proposed');
                        const issues = rowIssueLabels(item);
                        return (
                          <Box
                            key={item.id}
                            sx={{
                              px: 1.25,
                              py: 1,
                              display: 'grid',
                              gap: 1,
                              alignItems: 'flex-start',
                              borderBottom: '1px solid',
                              borderColor: 'divider',
                              ...(isChecks
                                ? { gridTemplateColumns: '92px 80px 100px minmax(160px,1fr) 88px 88px 72px' }
                                : showAccountCol
                                  ? {
                                      gridTemplateColumns:
                                        '100px minmax(180px,1fr) 100px minmax(100px,1fr) 100px 100px 100px 72px'
                                    }
                                  : { gridTemplateColumns: '100px minmax(200px,1fr) 100px 100px 100px 72px' })
                            }}
                          >
                            {isChecks ? (
                              <>
                                <Typography variant="body2">{formatMaybeDate(item.date)}</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {item.checkNumber ?? '—'}
                                </Typography>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {formatMoney(Math.abs(item.amount))}
                                  </Typography>
                                  {issues.length > 0 ? (
                                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                                      {issues.map((label) => (
                                        <Chip
                                          key={label}
                                          size="small"
                                          variant="outlined"
                                          color="warning"
                                          label={label}
                                        />
                                      ))}
                                    </Stack>
                                  ) : null}
                                </Box>
                                <Typography variant="body2" color="text.secondary" noWrap title={item.payeeName ?? ''}>
                                  {item.payeeName ?? '—'}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {workflowDisplayLabel(item, group.key)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {statusText}
                                </Typography>
                                <Button size="small" onClick={() => openEditModal(item)}>
                                  Review
                                </Button>
                              </>
                            ) : (
                              <>
                                <Typography variant="body2">{formatMaybeDate(item.date)}</Typography>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" noWrap title={item.description}>
                                    {item.description}
                                  </Typography>
                                  {issues.length > 0 ? (
                                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                                      {issues.map((label) => (
                                        <Chip
                                          key={label}
                                          size="small"
                                          variant="outlined"
                                          color="warning"
                                          label={label}
                                        />
                                      ))}
                                    </Stack>
                                  ) : null}
                                </Box>
                                <Typography
                                  variant="subtitle2"
                                  sx={{
                                    textAlign: 'right',
                                    color: item.direction === 'credit' ? 'success.main' : 'error.main'
                                  }}
                                >
                                  {item.direction === 'credit' ? '+' : '-'}
                                  {formatMoney(Math.abs(item.amount))}
                                </Typography>
                                {showAccountCol ? (
                                  <Typography variant="body2" color="text.secondary" noWrap>
                                    {item.transactionFamily === 'transfer'
                                      ? item.counterpartyBankHint ?? item.statementAccountMask ?? '—'
                                      : '—'}
                                  </Typography>
                                ) : null}
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                  {workflowDisplayLabel(item, group.key)}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {statusText}
                                </Typography>
                                <Button size="small" onClick={() => openEditModal(item)}>
                                  Review
                                </Button>
                              </>
                            )}
                          </Box>
                        );
                      })
                    )}
                    {totalInSection > 0 ? (
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        justifyContent="space-between"
                        alignItems={{ sm: 'center' }}
                        spacing={1}
                        sx={{ px: 1.5, py: 1.25, bgcolor: 'grey.50', borderTop: '1px solid', borderColor: 'divider' }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {totalInSection <= REVIEW_SECTION_PAGE_SIZE
                            ? `All ${totalInSection} rows`
                            : `Showing 1-${visibleCount} of ${totalInSection}`}
                        </Typography>
                        {canShowMore ? (
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              setSectionRowLimit((prev) => ({
                                ...prev,
                                [group.key]: Math.min(
                                  totalInSection,
                                  visibleCount + REVIEW_SECTION_PAGE_SIZE
                                )
                              }))
                            }
                          >
                            Show {REVIEW_SECTION_PAGE_SIZE} more
                          </Button>
                        ) : null}
                      </Stack>
                    ) : null}
                  </Paper>
                </AccordionDetails>
              </Accordion>
            );
          })
        )}

        <Drawer
          anchor="right"
          open={filterDrawerOpen}
          onClose={() => setFilterDrawerOpen(false)}
          PaperProps={{ sx: { width: { xs: '100%', sm: 400 }, maxWidth: '100%' } }}
        >
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Filters
            </Typography>
            <IconButton aria-label="Close filters" onClick={() => setFilterDrawerOpen(false)} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
          <Divider />
          <Stack spacing={2} sx={{ p: 2, overflow: 'auto', pb: 3 }}>
            <TextField
              size="small"
              label="Search"
              placeholder="Description, amount, check #, source line…"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              fullWidth
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Section</InputLabel>
              <Select
                value={sectionFilter}
                label="Section"
                onChange={(event) => setSectionFilter(String(event.target.value))}
              >
                <MenuItem value="all">All sections</MenuItem>
                <MenuItem value="deposits">Deposits</MenuItem>
                <MenuItem value="electronic_credits">Electronic Credits</MenuItem>
                <MenuItem value="other_credits">Other Credits</MenuItem>
                <MenuItem value="electronic_debits">Electronic Debits</MenuItem>
                <MenuItem value="checks_cleared">Checks Cleared</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select value={statusFilter} label="Status" onChange={(event) => setStatusFilter(String(event.target.value))}>
                <MenuItem value="all">All states</MenuItem>
                <MenuItem value="proposed">Needs review</MenuItem>
                <MenuItem value="approved">Approved</MenuItem>
                <MenuItem value="excluded">Excluded</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={familyFilter} label="Type" onChange={(event) => setFamilyFilter(String(event.target.value))}>
                <MenuItem value="all">All types</MenuItem>
                <MenuItem value="transfer">Transfer</MenuItem>
                <MenuItem value="tax_payment">Tax payment</MenuItem>
                <MenuItem value="vendor_payment">Vendor payment</MenuItem>
                <MenuItem value="settlement">Settlement</MenuItem>
                <MenuItem value="check">Check</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
              <InputLabel>Workflow</InputLabel>
              <Select
                value={workflowFilter}
                label="Workflow"
                onChange={(event) =>
                  setWorkflowFilter(event.target.value as typeof workflowFilter)
                }
              >
                <MenuItem value="all">All workflows</MenuItem>
                <MenuItem value="Expense">Expense</MenuItem>
                <MenuItem value="Deposit">Deposit</MenuItem>
                <MenuItem value="Transfer">Transfer</MenuItem>
                <MenuItem value="Check">Check</MenuItem>
              </Select>
            </FormControl>
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Date range
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="From"
                  type="date"
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="To"
                  type="date"
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Stack>
            </Stack>
            <Stack spacing={1}>
              <Typography variant="caption" color="text.secondary">
                Amount range
              </Typography>
              <Stack direction="row" spacing={1}>
                <TextField
                  size="small"
                  label="Min $"
                  value={amountMin}
                  onChange={(event) => setAmountMin(event.target.value)}
                  fullWidth
                />
                <TextField
                  size="small"
                  label="Max $"
                  value={amountMax}
                  onChange={(event) => setAmountMax(event.target.value)}
                  fullWidth
                />
              </Stack>
            </Stack>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Quick filters
              </Typography>
              <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                {(
                  [
                    ['Needs review', 'needs_review'],
                    ['Missing vendor', 'missing_vendor'],
                    ['Transfers', 'transfers'],
                    ['Checks', 'checks'],
                    ['High amount', 'high_amount']
                  ] as const
                ).map(([label, key]) => (
                  <Chip
                    key={key}
                    size="small"
                    label={label}
                    color={quickFilter === key ? 'primary' : 'default'}
                    variant={quickFilter === key ? 'filled' : 'outlined'}
                    onClick={() => setQuickFilter((current) => (current === key ? null : key))}
                  />
                ))}
              </Stack>
            </Box>
            <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">Advanced filters</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <FormControl size="small" fullWidth>
                    <InputLabel>Sort by</InputLabel>
                    <Select
                      value={sortBy}
                      label="Sort by"
                      onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
                    >
                      <MenuItem value="date">Date</MenuItem>
                      <MenuItem value="amount">Amount</MenuItem>
                      <MenuItem value="page">Page</MenuItem>
                      <MenuItem value="confidence">Confidence</MenuItem>
                      <MenuItem value="category">Category</MenuItem>
                      <MenuItem value="review">Review</MenuItem>
                    </Select>
                  </FormControl>
                  <Button
                    size="small"
                    variant={showEmptyGroups ? 'contained' : 'outlined'}
                    onClick={() => setShowEmptyGroups((v) => !v)}
                  >
                    {showEmptyGroups ? 'Showing empty sections' : 'Show empty sections'}
                  </Button>
                  <Chip
                    size="small"
                    label="Unresolved transfers"
                    color={quickFilter === 'unresolved' ? 'primary' : 'default'}
                    variant={quickFilter === 'unresolved' ? 'filled' : 'outlined'}
                    onClick={() => setQuickFilter((c) => (c === 'unresolved' ? null : 'unresolved'))}
                  />
                  <Chip
                    size="small"
                    label="Posting candidates"
                    color={quickFilter === 'posting' ? 'primary' : 'default'}
                    variant={quickFilter === 'posting' ? 'filled' : 'outlined'}
                    onClick={() => setQuickFilter((c) => (c === 'posting' ? null : 'posting'))}
                  />
                  <Chip
                    size="small"
                    label="Unknown classification"
                    color={quickFilter === 'unknown' ? 'primary' : 'default'}
                    variant={quickFilter === 'unknown' ? 'filled' : 'outlined'}
                    onClick={() => setQuickFilter((c) => (c === 'unknown' ? null : 'unknown'))}
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>
            <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ pt: 1 }}>
              <Button
                color="inherit"
                onClick={() => {
                  resetReviewFilters();
                }}
              >
                Reset
              </Button>
              <Button variant="contained" onClick={() => setFilterDrawerOpen(false)}>
                Apply
              </Button>
            </Stack>
          </Stack>
        </Drawer>

        <Dialog open={editModalOpen} onClose={closeEditModal} fullWidth maxWidth="md">
          <DialogTitle sx={{ pb: 1 }}>
            {editItem ? (
              <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                <Stack>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {editItem.source === 'check' || editItem.rowType === 'check_cleared' || editItem.checkNumber
                        ? `Review check #${editItem.checkNumber ?? editItem.id.slice(-6)}`
                        : 'Review transaction'}
                    </Typography>
                    {formatMaybeDate(editItem.date) ? (
                      <Chip
                        size="small"
                        variant="outlined"
                        label={formatMaybeDate(editItem.date)}
                        sx={{ flexShrink: 0 }}
                      />
                    ) : null}
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {formatStatusLabel(editItem.reviewStatus ?? 'proposed')}
                  </Typography>
                </Stack>
                <Typography
                  variant="h6"
                  sx={{ color: editItem.direction === 'credit' ? 'success.main' : 'error.main', fontWeight: 700 }}
                >
                  {editItem.direction === 'credit' ? '+' : '-'}{formatMoney(Math.abs(Number(editItem.amount ?? 0)))}
                </Typography>
              </Stack>
            ) : (
              'Review transaction'
            )}
          </DialogTitle>
          <DialogContent dividers sx={{ bgcolor: 'background.default' }}>
            {editItem ? (
              <Stack spacing={2}>
                {postingBlockingErrors.length > 0 ? (
                  <Alert severity="warning">
                    <Stack component="ul" sx={{ m: 0, pl: 2 }}>
                      {postingBlockingErrors.map((msg) => (
                        <Typography key={msg} component="li" variant="body2">
                          {msg}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                ) : null}
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                    {editItem.description}
                  </Typography>
                  <Box
                    sx={{
                      mt: 1,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                      columnGap: 3,
                      rowGap: 0.5
                    }}
                  >
                    {(
                      [
                        ['Posted date', formatMaybeDate(editItem.date) || '—'],
                        ['Direction', formatStatusLabel(editItem.direction)],
                        ['Section', formatStatusLabel(editItem.section ?? 'unknown')],
                        ['Family', formatStatusLabel(editItem.transactionFamily ?? 'other')],
                        ['Row type', editItem.rowType ? formatStatusLabel(editItem.rowType) : '—'],
                        ['Check #', editItem.checkNumber ?? '—'],
                        ['Source page', editItem.sourcePage != null ? String(editItem.sourcePage) : '—'],
                        ['Statement account', editItem.statementAccountMask ?? '—'],
                        ['Counterparty hint', editItem.counterpartyBankHint ?? '—']
                      ] as Array<[string, string]>
                    ).map(([label, value]) => (
                      <Stack
                        key={label}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="baseline"
                        spacing={1.5}
                        sx={{ borderBottom: '1px dashed', borderColor: 'divider', py: 0.4 }}
                      >
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {label}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontWeight: 500,
                            textAlign: 'right',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0
                          }}
                          title={value}
                        >
                          {value}
                        </Typography>
                      </Stack>
                    ))}
                  </Box>
                </Paper>

                <Grid container spacing={1.5}>
                  {editModalLinkedCheck?.artifacts?.cropImagePath ? (
                    <Grid size={{ xs: 12, md: 5 }}>
                      <Paper variant="outlined" sx={{ p: 1.5, height: '100%' }}>
                        <Typography variant="overline" color="text.secondary">
                          Check image
                        </Typography>
                        <Box
                          sx={{
                            mt: 0.75,
                            minHeight: 180,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'background.default',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            overflow: 'hidden'
                          }}
                        >
                          {reviewCheckImageLoading ? (
                            <CircularProgress size={28} />
                          ) : reviewCheckImageUrl ? (
                            <Box
                              component="img"
                              src={reviewCheckImageUrl}
                              alt={`Check ${resolveCheckNumberForReview(editItem, editModalLinkedCheck) || 'scan'}`}
                              sx={{ width: '100%', maxHeight: 320, objectFit: 'contain' }}
                            />
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              Check image is not available yet.
                            </Typography>
                          )}
                        </Box>
                      </Paper>
                    </Grid>
                  ) : null}
                  <Grid size={{ xs: 12, md: editModalLinkedCheck?.artifacts?.cropImagePath ? 7 : 12 }}>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="overline" color="text.secondary">Source proof</Typography>
                      <Box
                        sx={{
                          mt: 0.75,
                          p: 1,
                          bgcolor: 'background.default',
                          border: '1px dashed',
                          borderColor: 'divider',
                          borderRadius: 1,
                          fontFamily: 'Menlo, monospace',
                          fontSize: 12,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          minHeight: 60
                        }}
                      >
                        {editItem.sourceText ?? 'No raw source line captured.'}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        Page {editItem.sourcePage ?? '-'} · {formatStatusLabel(editItem.section ?? 'unknown')}
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>

                      {(workflowType === 'Expense' || workflowType === 'Check' || workflowType === 'Bill' || workflowType === 'BillPayment') ? (
                        <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Autocomplete
                              size="small"
                              freeSolo
                              options={contactOptions.vendor}
                              loading={contactLoading.vendor}
                              getOptionLabel={(option) => (typeof option === 'string' ? option : option.displayName)}
                              filterOptions={(options, state) => {
                                const input = state.inputValue.trim().toLowerCase();
                                const matches = options.filter((option) => option.displayName.toLowerCase().includes(input));
                                const hasExact = input && options.some((option) => option.displayName.toLowerCase() === input);
                                if (input && !hasExact) {
                                  return [
                                    ...matches,
                                    { id: '__create__', qbId: '__create__', displayName: `+ Add new vendor "${state.inputValue.trim()}"` }
                                  ];
                                }
                                return matches;
                              }}
                              value={workflowForm.vendor}
                              onInputChange={(_event, value) => {
                                setWorkflowForm((form) => ({ ...form, vendor: value }));
                                setContactSearch((current) => ({ ...current, vendor: value }));
                              }}
                              onChange={(_event, value) => {
                                if (!value) {
                                  setWorkflowForm((form) => ({ ...form, vendor: '' }));
                                  return;
                                }
                                if (typeof value === 'string') {
                                  setWorkflowForm((form) => ({ ...form, vendor: value }));
                                  return;
                                }
                                if (value.qbId === '__create__') {
                                  void createContact('vendor', workflowForm.vendor);
                                  return;
                                }
                                setWorkflowForm((form) => ({
                                  ...form,
                                  vendor: value.displayName,
                                  vendorQbId: value.qbId
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Vendor / Payee"
                                  placeholder="Search QuickBooks vendors"
                                  InputLabelProps={{ shrink: true }}
                                  InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {(contactLoading.vendor || contactCreating) ? <CircularProgress size={14} /> : null}
                                        {params.InputProps.endAdornment}
                                      </>
                                    )
                                  }}
                                />
                              )}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Stack direction="row" spacing={0.75} alignItems="flex-start">
                              <Autocomplete
                                size="small"
                                openOnFocus
                                sx={{ flex: 1 }}
                                options={expenseLineAccountOptions}
                                loading={lineAccountsLoading}
                                getOptionLabel={(option) => option.name}
                                isOptionEqualToValue={(option, value) =>
                                  chartAccountRefValue(option) === chartAccountRefValue(value)
                                }
                                filterOptions={(options) => [
                                  ...options,
                                  {
                                    id: '__create_line__',
                                    qbId: null,
                                    name: '+ Create expense account in QuickBooks…',
                                    type: 'expense',
                                    detailType: null,
                                    status: 'active' as const,
                                    balance: null
                                  }
                                ]}
                                value={
                                  expenseLineAccountOptions.find(
                                    (row) => chartAccountRefValue(row) === workflowForm.lineAccountRef
                                  ) ?? null
                                }
                                inputValue={lineAccountSearch}
                                onInputChange={(_event, value, reason) => {
                                  if (reason === 'reset') return;
                                  setLineAccountSearch(value);
                                  if (reason === 'input' && workflowForm.lineAccountRef) {
                                    setWorkflowForm((form) => ({ ...form, lineAccountRef: '' }));
                                  }
                                }}
                                onChange={(_event, value) => {
                                  if (value?.id === '__create_line__') {
                                    openCreateLineAccountDialog('expense');
                                    return;
                                  }
                                  setLineAccountSearch(value?.name ?? '');
                                  setWorkflowForm((form) => ({
                                    ...form,
                                    lineAccountRef: value ? chartAccountRefValue(value) : ''
                                  }));
                                }}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Expense category (QuickBooks account)"
                                    placeholder="Search expense / COGS accounts"
                                    InputLabelProps={{ shrink: true }}
                                    InputProps={{
                                      ...params.InputProps,
                                      endAdornment: (
                                        <>
                                          {lineAccountsLoading ? <CircularProgress size={14} /> : null}
                                          {params.InputProps.endAdornment}
                                        </>
                                      )
                                    }}
                                  />
                                )}
                              />
                              <Tooltip title="Refresh QuickBooks expense accounts">
                                <span>
                                  <IconButton
                                    size="small"
                                    aria-label="Refresh QuickBooks expense accounts"
                                    onClick={() => void refreshQuickBooksAccounts()}
                                    disabled={refreshingQuickBooksAccounts}
                                    sx={{ mt: 0.5 }}
                                  >
                                    {refreshingQuickBooksAccounts ? (
                                      <CircularProgress size={18} />
                                    ) : (
                                      <RefreshIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </Grid>
                          {workflowType === 'Check' ? (
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                size="small"
                                label="Check #"
                                placeholder="e.g. 1045"
                                value={workflowForm.checkNumber}
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, checkNumber: event.target.value }))}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                          ) : null}
                          {workflowType === 'Check' ? (
                            <Grid size={{ xs: 12 }}>
                              <FormControlLabel
                                control={
                                  <Checkbox
                                    size="small"
                                    checked={workflowForm.matchExistingCheck}
                                    onChange={(event) =>
                                      setWorkflowForm((form) => ({
                                        ...form,
                                        matchExistingCheck: event.target.checked
                                      }))
                                    }
                                  />
                                }
                                label="Match existing QuickBooks check with same number and amount (recommended)"
                              />
                            </Grid>
                          ) : null}
                          <Grid size={{ xs: 12, md: 6 }}>
                            <StatementBankAccountAutocomplete
                              label="Paid from (bank account)"
                              placeholder="Search QuickBooks bank accounts"
                              value={workflowForm.transferFromAccount}
                              onChange={(accountRef) =>
                                setWorkflowForm((form) => ({ ...form, transferFromAccount: accountRef }))
                              }
                              onInputChange={setBankAccountSearch}
                              accounts={bankAccounts}
                              loading={bankAccountsLoading}
                              refreshing={refreshingQuickBooksAccounts}
                              onRefresh={() => void refreshQuickBooksAccounts()}
                              onCreateNew={() => openCreateBankAccountDialog('check')}
                              helperText={
                                effectiveBankAccountId &&
                                workflowForm.transferFromAccount === effectiveBankAccountId
                                  ? 'Defaulted to the bank chart account selected at upload.'
                                  : undefined
                              }
                              required
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              size="small"
                              label="Memo"
                              value={workflowForm.memo}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, memo: event.target.value }))}
                              fullWidth
                              multiline
                              minRows={2}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      ) : null}

                      {workflowType === 'Deposit' ? (
                        <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <StatementBankAccountAutocomplete
                              label="Deposit to (bank account)"
                              placeholder="Search QuickBooks bank accounts"
                              value={workflowForm.depositToAccount}
                              onChange={(accountRef) =>
                                setWorkflowForm((form) => ({ ...form, depositToAccount: accountRef }))
                              }
                              onInputChange={setBankAccountSearch}
                              accounts={bankAccounts}
                              loading={bankAccountsLoading}
                              refreshing={refreshingQuickBooksAccounts}
                              onRefresh={() => void refreshQuickBooksAccounts()}
                              onCreateNew={() => openCreateBankAccountDialog('depositTo')}
                              helperText={
                                effectiveBankAccountId &&
                                workflowForm.depositToAccount === effectiveBankAccountId
                                  ? 'Defaulted to the bank selected at upload.'
                                  : 'QuickBooks bank account where this deposit lands.'
                              }
                              required
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Stack direction="row" spacing={0.75} alignItems="flex-start">
                              <Autocomplete
                                size="small"
                                openOnFocus
                                sx={{ flex: 1 }}
                                options={depositLineAccountOptions}
                                loading={depositLineAccountsLoading}
                                noOptionsText={
                                  depositLineAccountsLoading
                                    ? 'Loading deposit line accounts…'
                                    : 'No deposit line accounts found. Refresh QuickBooks accounts or create an account in QuickBooks.'
                                }
                                getOptionLabel={(option) => formatDepositLineAccountLabel(option)}
                                isOptionEqualToValue={(option, value) =>
                                  chartAccountRefValue(option) === chartAccountRefValue(value)
                                }
                                filterOptions={(options) => [
                                  ...options,
                                  {
                                    id: '__create_line__',
                                    qbId: null,
                                    name: '+ Create account in QuickBooks…',
                                    type: 'revenue',
                                    detailType: null,
                                    status: 'active' as const,
                                    balance: null
                                  }
                                ]}
                                value={
                                  depositLineAccountOptions.find(
                                    (row) => chartAccountRefValue(row) === workflowForm.lineAccountRef
                                  ) ?? null
                                }
                                inputValue={depositLineAccountInput}
                                onInputChange={(_event, value, reason) => {
                                  if (reason === 'reset') return;
                                  setDepositLineAccountSearch(value);
                                  setDepositLineAccountInput(value);
                                  if (reason === 'input' && workflowForm.lineAccountRef) {
                                    setWorkflowForm((form) => ({ ...form, lineAccountRef: '' }));
                                  }
                                }}
                                onChange={(_event, value) => {
                                  if (value?.id === '__create_line__') {
                                    openCreateLineAccountDialog('income');
                                    return;
                                  }
                                  setDepositLineAccountInput(value?.name ?? '');
                                  setWorkflowForm((form) => ({
                                    ...form,
                                    lineAccountRef: value ? chartAccountRefValue(value) : ''
                                  }));
                                }}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    label="Deposit line account (QuickBooks)"
                                    placeholder="Search income, liability, equity, or clearing accounts"
                                    required
                                    InputLabelProps={{ shrink: true }}
                                    helperText={
                                      depositLineAccountsLoading
                                        ? 'Loading deposit line accounts from QuickBooks…'
                                        : depositLineAccountOptions.length === 0
                                          ? 'No deposit line accounts found. Refresh QuickBooks accounts or create an account in QuickBooks.'
                                          : undefined
                                    }
                                    error={!depositLineAccountsLoading && depositLineAccountOptions.length === 0}
                                    InputProps={{
                                      ...params.InputProps,
                                      endAdornment: (
                                        <>
                                          {depositLineAccountsLoading ? <CircularProgress size={14} /> : null}
                                          {params.InputProps.endAdornment}
                                        </>
                                      )
                                    }}
                                  />
                                )}
                              />
                              <Tooltip title="Refresh QuickBooks accounts">
                                <span>
                                  <IconButton
                                    size="small"
                                    aria-label="Refresh QuickBooks accounts"
                                    onClick={() => void refreshQuickBooksAccounts()}
                                    disabled={refreshingQuickBooksAccounts}
                                    sx={{ mt: 0.5 }}
                                  >
                                    {refreshingQuickBooksAccounts ? (
                                      <CircularProgress size={18} />
                                    ) : (
                                      <RefreshIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Autocomplete
                              size="small"
                              freeSolo
                              options={contactOptions.customer}
                              loading={contactLoading.customer}
                              getOptionLabel={(option) => (typeof option === 'string' ? option : option.displayName)}
                              filterOptions={(options, state) => {
                                const input = state.inputValue.trim().toLowerCase();
                                const matches = options.filter((option) => option.displayName.toLowerCase().includes(input));
                                const hasExact = input && options.some((option) => option.displayName.toLowerCase() === input);
                                if (input && !hasExact) {
                                  return [
                                    ...matches,
                                    { id: '__create__', qbId: '__create__', displayName: `+ Add new customer "${state.inputValue.trim()}"` }
                                  ];
                                }
                                return matches;
                              }}
                              value={workflowForm.customer}
                              onInputChange={(_event, value) => {
                                setWorkflowForm((form) => ({ ...form, customer: value }));
                                setContactSearch((current) => ({ ...current, customer: value }));
                              }}
                              onChange={(_event, value) => {
                                if (!value) {
                                  setWorkflowForm((form) => ({ ...form, customer: '' }));
                                  return;
                                }
                                if (typeof value === 'string') {
                                  setWorkflowForm((form) => ({ ...form, customer: value }));
                                  return;
                                }
                                if (value.qbId === '__create__') {
                                  void createContact('customer', workflowForm.customer);
                                  return;
                                }
                                setWorkflowForm((form) => ({
                                  ...form,
                                  customer: value.displayName,
                                  customerQbId: value.qbId
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Received from (optional)"
                                  placeholder="Search QuickBooks customers"
                                  InputLabelProps={{ shrink: true }}
                                  helperText="Not required to post a bank deposit in QuickBooks."
                                  InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {(contactLoading.customer || contactCreating) ? <CircularProgress size={14} /> : null}
                                        {params.InputProps.endAdornment}
                                      </>
                                    )
                                  }}
                                />
                              )}
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              size="small"
                              label="Memo"
                              value={workflowForm.memo}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, memo: event.target.value }))}
                              fullWidth
                              multiline
                              minRows={2}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      ) : null}

                      {workflowType === 'CustomerPayment' ? (
                        <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Autocomplete
                              size="small"
                              freeSolo
                              options={contactOptions.customer}
                              loading={contactLoading.customer}
                              getOptionLabel={(option) => (typeof option === 'string' ? option : option.displayName)}
                              value={workflowForm.customer}
                              onInputChange={(_event, value) => {
                                setWorkflowForm((form) => ({ ...form, customer: value }));
                                setContactSearch((current) => ({ ...current, customer: value }));
                              }}
                              onChange={(_event, value) => {
                                if (!value) {
                                  setWorkflowForm((form) => ({
                                    ...form,
                                    customer: '',
                                    customerQbId: '',
                                    linkedInvoiceTxnId: ''
                                  }));
                                  return;
                                }
                                if (typeof value === 'string') {
                                  setWorkflowForm((form) => ({
                                    ...form,
                                    customer: value,
                                    customerQbId: '',
                                    linkedInvoiceTxnId: ''
                                  }));
                                  return;
                                }
                                if (value.qbId === '__create__') {
                                  void createContact('customer', workflowForm.customer);
                                  return;
                                }
                                setWorkflowForm((form) => ({
                                  ...form,
                                  customer: value.displayName,
                                  customerQbId: value.qbId,
                                  linkedInvoiceTxnId: ''
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Customer"
                                  placeholder="Search QuickBooks customers"
                                  InputLabelProps={{ shrink: true }}
                                />
                              )}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <StatementBankAccountAutocomplete
                              label="Deposit to account"
                              placeholder="Search QuickBooks bank accounts"
                              value={workflowForm.depositToAccount}
                              onChange={(accountRef) =>
                                setWorkflowForm((form) => ({ ...form, depositToAccount: accountRef }))
                              }
                              onInputChange={setBankAccountSearch}
                              accounts={bankAccounts}
                              loading={bankAccountsLoading}
                              refreshing={refreshingQuickBooksAccounts}
                              onRefresh={() => void refreshQuickBooksAccounts()}
                              onCreateNew={() => openCreateBankAccountDialog('depositTo')}
                              required
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Autocomplete
                              size="small"
                              options={openInvoices}
                              loading={openInvoicesLoading}
                              disabled={!workflowForm.customerQbId.trim()}
                              getOptionLabel={(option) => option.label}
                              isOptionEqualToValue={(option, value) => option.qbTxnId === value.qbTxnId}
                              value={
                                openInvoices.find((row) => row.qbTxnId === workflowForm.linkedInvoiceTxnId) ?? null
                              }
                              onChange={(_event, value) => {
                                setWorkflowForm((form) => ({
                                  ...form,
                                  linkedInvoiceTxnId: value?.qbTxnId ?? ''
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Apply to invoice (optional)"
                                  placeholder={
                                    workflowForm.customerQbId
                                      ? 'Open invoices for this customer'
                                      : 'Select a customer first'
                                  }
                                  InputLabelProps={{ shrink: true }}
                                  helperText="Leave blank to record an unapplied customer payment."
                                  InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {openInvoicesLoading ? <CircularProgress size={14} /> : null}
                                        {params.InputProps.endAdornment}
                                      </>
                                    )
                                  }}
                                />
                              )}
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              size="small"
                              label="Memo"
                              value={workflowForm.memo}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, memo: event.target.value }))}
                              fullWidth
                              multiline
                              minRows={2}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      ) : null}

                      {workflowType === 'SalesReceipt' ? (
                        <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Autocomplete
                              size="small"
                              freeSolo
                              options={contactOptions.customer}
                              loading={contactLoading.customer}
                              getOptionLabel={(option) => (typeof option === 'string' ? option : option.displayName)}
                              filterOptions={(options, state) => {
                                const input = state.inputValue.trim().toLowerCase();
                                const matches = options.filter((option) => option.displayName.toLowerCase().includes(input));
                                const hasExact = input && options.some((option) => option.displayName.toLowerCase() === input);
                                if (input && !hasExact) {
                                  return [
                                    ...matches,
                                    { id: '__create__', qbId: '__create__', displayName: `+ Add new customer "${state.inputValue.trim()}"` }
                                  ];
                                }
                                return matches;
                              }}
                              value={workflowForm.customer}
                              onInputChange={(_event, value) => {
                                setWorkflowForm((form) => ({ ...form, customer: value }));
                                setContactSearch((current) => ({ ...current, customer: value }));
                              }}
                              onChange={(_event, value) => {
                                if (!value) {
                                  setWorkflowForm((form) => ({ ...form, customer: '', customerQbId: '' }));
                                  return;
                                }
                                if (typeof value === 'string') {
                                  setWorkflowForm((form) => ({ ...form, customer: value, customerQbId: '' }));
                                  return;
                                }
                                if (value.qbId === '__create__') {
                                  void createContact('customer', workflowForm.customer);
                                  return;
                                }
                                setWorkflowForm((form) => ({
                                  ...form,
                                  customer: value.displayName,
                                  customerQbId: value.qbId
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Customer"
                                  placeholder="Walk-in / POS daily sales"
                                  InputLabelProps={{ shrink: true }}
                                  InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {(contactLoading.customer || contactCreating) ? <CircularProgress size={14} /> : null}
                                        {params.InputProps.endAdornment}
                                      </>
                                    )
                                  }}
                                />
                              )}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <Autocomplete
                              size="small"
                              freeSolo
                              options={qbItems}
                              loading={qbItemsLoading || qbItemCreating}
                              getOptionLabel={(option) =>
                                typeof option === 'string'
                                  ? option
                                  : option.type ? `${option.name} · ${option.type}` : option.name
                              }
                              filterOptions={(options, state) => {
                                const input = state.inputValue.trim().toLowerCase();
                                const matches = options.filter((option) =>
                                  `${option.name} ${option.type ?? ''}`.toLowerCase().includes(input)
                                );
                                const hasExact = input && options.some((option) => option.name.toLowerCase() === input);
                                if (input && !hasExact) {
                                  return [
                                    ...matches,
                                    {
                                      id: '__create__',
                                      name: `+ Create product/service item "${state.inputValue.trim()}"`,
                                      type: 'Service',
                                      active: true
                                    }
                                  ];
                                }
                                return matches;
                              }}
                              isOptionEqualToValue={(option, value) => option.id === value.id}
                              value={qbItems.find((row) => row.id === workflowForm.salesItemRefId) ?? null}
                              onInputChange={(_event, value) => setQbItemSearch(value)}
                              onChange={(_event, value) => {
                                if (!value) {
                                  setWorkflowForm((form) => ({
                                    ...form,
                                    salesItemRefId: ''
                                  }));
                                  return;
                                }
                                if (typeof value === 'string') {
                                  void createQbItem(value);
                                  return;
                                }
                                if (value.id === '__create__') {
                                  const raw = value.name.match(/"(.+)"$/)?.[1] ?? qbItemSearch;
                                  void createQbItem(raw);
                                  return;
                                }
                                setWorkflowForm((form) => ({
                                  ...form,
                                  salesItemRefId: value.id
                                }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Product / service item"
                                  placeholder="Search QuickBooks items"
                                  InputLabelProps={{ shrink: true }}
                                  InputProps={{
                                    ...params.InputProps,
                                    endAdornment: (
                                      <>
                                        {(qbItemsLoading || qbItemCreating) ? <CircularProgress size={14} /> : null}
                                        {params.InputProps.endAdornment}
                                      </>
                                    )
                                  }}
                                />
                              )}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <StatementBankAccountAutocomplete
                              label="Deposit to account"
                              placeholder="e.g. Checking or Undeposited Funds"
                              value={workflowForm.depositToAccount}
                              onChange={(accountRef) =>
                                setWorkflowForm((form) => ({ ...form, depositToAccount: accountRef }))
                              }
                              onInputChange={setBankAccountSearch}
                              accounts={bankAccounts}
                              loading={bankAccountsLoading}
                              refreshing={refreshingQuickBooksAccounts}
                              onRefresh={() => void refreshQuickBooksAccounts()}
                              onCreateNew={() => openCreateBankAccountDialog('depositTo')}
                              required
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              size="small"
                              label="Memo"
                              value={workflowForm.memo}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, memo: event.target.value }))}
                              fullWidth
                              multiline
                              minRows={2}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      ) : null}

                      {workflowType === 'Transfer' ? (
                        <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              size="small"
                              select
                              label="Transfer from account"
                              value={workflowForm.transferFromAccount}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === '__create__') {
                                  openCreateBankAccountDialog('transferFrom');
                                  return;
                                }
                                setWorkflowForm((form) => ({ ...form, transferFromAccount: value }));
                              }}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              helperText={
                                effectiveBankAccountId &&
                                workflowForm.transferFromAccount === effectiveBankAccountId
                                  ? 'Defaulted to the bank chart account selected at upload.'
                                  : 'Choose the bank account that money is leaving.'
                              }
                              SelectProps={{ displayEmpty: true }}
                            >
                              <MenuItem value="">
                                <em>— Select bank account —</em>
                              </MenuItem>
                              {bankAccounts.map((account) => {
                                const ref = chartAccountRefValue(account);
                                return (
                                  <MenuItem key={`from-${account.id}`} value={ref}>
                                    {account.name}
                                  </MenuItem>
                                );
                              })}
                              <Divider sx={{ my: 0.5 }} component="li" />
                              <MenuItem value="__create__" sx={{ color: 'primary.main', fontWeight: 600 }}>
                                + Create new bank account…
                              </MenuItem>
                            </TextField>
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              size="small"
                              select
                              label="Transfer to account"
                              value={workflowForm.transferToAccount}
                              onChange={(event) => {
                                const value = event.target.value;
                                if (value === '__create__') {
                                  openCreateBankAccountDialog('transferTo');
                                  return;
                                }
                                setWorkflowForm((form) => ({ ...form, transferToAccount: value }));
                              }}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              helperText={
                                editItem.counterpartyBankHint
                                  ? `Hint from statement: ${editItem.counterpartyBankHint}`
                                  : 'Choose the bank account that money is arriving in.'
                              }
                              SelectProps={{ displayEmpty: true }}
                            >
                              <MenuItem value="">
                                <em>— Select bank account —</em>
                              </MenuItem>
                              {bankAccounts.map((account) => {
                                return (
                                  <MenuItem key={`to-${account.id}`} value={chartAccountRefValue(account)}>
                                    {account.name}
                                  </MenuItem>
                                );
                              })}
                              <Divider sx={{ my: 0.5 }} component="li" />
                              <MenuItem value="__create__" sx={{ color: 'primary.main', fontWeight: 600 }}>
                                + Create new bank account…
                              </MenuItem>
                            </TextField>
                          </Grid>
                          {editItem.transferResolutionStatus && editItem.transferResolutionStatus !== 'matched_transfer_ready' ? (
                            <Grid size={{ xs: 12 }}>
                              <Alert severity="warning" sx={{ py: 0.5 }}>
                                {formatStatusLabel(editItem.transferResolutionStatus)}
                              </Alert>
                            </Grid>
                          ) : null}
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              size="small"
                              label="Memo"
                              value={workflowForm.memo}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, memo: event.target.value }))}
                              fullWidth
                              multiline
                              minRows={2}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      ) : null}

                      {workflowType === 'JournalEntry' ? (
                        <Grid container spacing={1.25} sx={{ mt: 0.25 }}>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              size="small"
                              label="Debit account"
                              value={workflowForm.transferFromAccount}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, transferFromAccount: event.target.value }))}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              size="small"
                              label="Credit account"
                              value={workflowForm.transferToAccount}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, transferToAccount: event.target.value }))}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <TextField
                              size="small"
                              label="Memo"
                              value={workflowForm.memo}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, memo: event.target.value }))}
                              fullWidth
                              multiline
                              minRows={2}
                              InputLabelProps={{ shrink: true }}
                            />
                          </Grid>
                        </Grid>
                      ) : null}

                      {(() => {
                        const suggestion = suggestCategoryPreset({
                          direction: editItem.direction,
                          description: editItem.description ?? ''
                        });
                        if (!suggestion || workflowForm.categoryLabel === suggestion.label) return null;
                        return (
                          <Alert
                            severity="info"
                            action={
                              <Button
                                color="inherit"
                                size="small"
                                onClick={() => {
                                  const match = lineAccounts.find((a) => a.name === suggestion.label);
                                  setWorkflowForm((form) => ({
                                    ...form,
                                    categoryLabel: suggestion.label,
                                    lineAccountRef: match ? chartAccountRefValue(match) : form.lineAccountRef
                                  }));
                                }}
                              >
                                Apply
                              </Button>
                            }
                            sx={{ mt: 1, py: 0.25 }}
                          >
                            Suggested category: <strong>{suggestion.label}</strong>
                          </Alert>
                        );
                      })()}
                    </Paper>
                  </Grid>

                </Grid>
              </Stack>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 2, py: 1 }}>
            <Button onClick={closeEditModal} color="inherit">Cancel</Button>
            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                color="error"
                onClick={() => editItem && void updateSuggestionReviewStatus(editItem, 'excluded', undefined, false)}
                disabled={!editItem || mutating}
              >
                Exclude
              </Button>
              <ButtonGroup variant="contained" ref={approveMenuAnchorRef} disabled={!editItem || mutating || postingBlockingErrors.length > 0}>
                <Button onClick={() => void saveEditModal('save')}>
                  {primaryApproveLabel}
                </Button>
                <Button
                  size="small"
                  aria-label="More approve actions"
                  onClick={() => setApproveMenuOpen((open) => !open)}
                >
                  <ArrowDropDownIcon />
                </Button>
              </ButtonGroup>
              <Popper
                open={approveMenuOpen}
                anchorEl={approveMenuAnchorRef.current}
                placement="top-end"
                transition
                sx={{ zIndex: (theme) => theme.zIndex.modal + 2 }}
              >
                {({ TransitionProps }) => (
                  <Grow {...TransitionProps}>
                    <Paper elevation={8}>
                      <ClickAwayListener onClickAway={() => setApproveMenuOpen(false)}>
                        <MenuList dense>
                          <MenuItem
                            onClick={() => {
                              setApproveMenuOpen(false);
                              void saveEditModal('save_next');
                            }}
                          >
                            {primaryApproveLabel} &amp; next
                          </MenuItem>
                        </MenuList>
                      </ClickAwayListener>
                    </Paper>
                  </Grow>
                )}
              </Popper>
            </Stack>
          </DialogActions>
        </Dialog>
      </Stack>
    );
  };

  const statementOverview = useMemo(
    () =>
      statement
        ? buildStatementOverview({
            statement,
            entries,
            liveMetrics,
            ocrText: statement.artifacts?.ocrTextPath
              ? artifactText[statement.artifacts.ocrTextPath]
              : null
          })
        : null,
    [statement, entries, liveMetrics, artifactText]
  );

  const renderOverviewBody = () => {
    if (!statementOverview) {
      return <Alert severity="info">Statement overview is loading.</Alert>;
    }
    return <StatementOverviewTab overview={statementOverview} />;
  };

  if (!canView) {
    return <NoAccess />;
  }

  const stageIndicator = (() => {
    if (!statement) return null;
    const progress = statement.progress ?? ({} as any);
    const totalChecks = Number(progress.totalChecks ?? 0);
    const checksReady = Number(progress.checksReady ?? 0);
    const checksFailed = Number(progress.checksFailed ?? 0);
    const checksProcessing = Number(progress.checksProcessing ?? 0);
    const checksQueued = Number(progress.checksQueued ?? 0);
    const checksDone = checksReady + checksFailed;

    switch (statement.status) {
      case 'uploaded':
        return { label: 'Uploaded — awaiting extraction', determinate: false, color: 'info' as const };
      case 'extracting':
        return { label: 'Extracting statement text', determinate: false, color: 'info' as const };
      case 'structuring':
        return { label: 'Parsing transactions', determinate: false, color: 'info' as const };
      case 'checks_queued': {
        if (totalChecks === 0) {
          return { label: 'Queueing checks', determinate: false, color: 'info' as const };
        }
        const currentLabel = checksProcessing > 0
          ? `Check extraction ${checksDone}/${totalChecks}`
          : checksQueued > 0 && checksDone < totalChecks
            ? `Check saving ${checksDone}/${totalChecks}`
            : `Check review ${checksDone}/${totalChecks}`;
        const value = totalChecks > 0 ? Math.round((checksDone / totalChecks) * 100) : 0;
        return { label: currentLabel, determinate: true, value, color: 'info' as const };
      }
      case 'ready_for_review':
        return { label: 'Ready for review', determinate: true, value: 100, color: 'success' as const };
      case 'needs_parser_review':
        return { label: 'Needs parser review', determinate: true, value: 100, color: 'warning' as const };
      case 'failed':
        return { label: 'Processing failed', determinate: true, value: 100, color: 'error' as const };
      default:
        return null;
    }
  })();

  const stageProgressInfo = statement
    ? getStatementStageProgress(statement.status, statement.progress)
    : null;

  const renderStageIcon = (state: 'done' | 'current' | 'pending' | 'error') => {
    if (state === 'done') return <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />;
    if (state === 'current') return <FiberManualRecordIcon sx={{ fontSize: 16, color: 'info.main' }} />;
    if (state === 'error') return <ErrorOutlineIcon sx={{ fontSize: 16, color: 'error.main' }} />;
    return <RadioButtonUncheckedIcon sx={{ fontSize: 16, color: 'text.disabled' }} />;
  };

  const renderStageIndicator = () => {
    if (!stageIndicator || !stageProgressInfo) return null;
    const tooltipContent = (
      <Stack spacing={0.75} sx={{ py: 0.5 }}>
        <Typography variant="caption" sx={{ opacity: 0.75 }}>
          {stageIndicator.label} · Step {stageProgressInfo.stepNumber}/{stageProgressInfo.totalSteps}
        </Typography>
        <Stack spacing={0.5}>
          {stageProgressInfo.steps.map((step, index) => (
            <Stack key={step.key} direction="row" spacing={0.75} alignItems="center">
              {renderStageIcon(step.state)}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: step.state === 'current' ? 600 : 400,
                  color:
                    step.state === 'pending'
                      ? 'text.disabled'
                      : step.state === 'error'
                        ? 'error.light'
                        : 'text.primary'
                }}
              >
                {index + 1}. {step.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
    );

    return (
      <Tooltip
        arrow
        placement="bottom-start"
        title={tooltipContent}
        componentsProps={{ tooltip: { sx: { bgcolor: 'background.paper', color: 'text.primary', border: '1px solid', borderColor: 'divider', boxShadow: 3, maxWidth: 300 } } }}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mr: 0.5, cursor: 'help', '&:hover': { opacity: 0.85 } }}
        >
          <Box sx={{ position: 'relative', display: 'inline-flex', width: 36, height: 36 }}>
            {stageIndicator.determinate ? (
              <CircularProgress
                variant="determinate"
                value={stageIndicator.value ?? 0}
                size={36}
                thickness={4}
                color={stageIndicator.color}
              />
            ) : (
              <CircularProgress size={36} thickness={4} color={stageIndicator.color} />
            )}
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: 'absolute',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Typography variant="caption" component="div" sx={{ fontSize: 10, fontWeight: 700 }}>
                {`${stageProgressInfo.stepNumber}/${stageProgressInfo.totalSteps}`}
              </Typography>
            </Box>
          </Box>
          <Stack spacing={0} sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.1 }}>
              Stage {stageProgressInfo.stepNumber}/{stageProgressInfo.totalSteps}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {stageIndicator.label}
            </Typography>
          </Stack>
        </Stack>
      </Tooltip>
    );
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            justifyContent="space-between"
            sx={{ width: '100%' }}
          >
            <Stack
              direction="row"
              spacing={1.25}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
              sx={{ minWidth: 0, flexGrow: 1, mr: 2 }}
            >
              <Button variant="outlined" onClick={() => navigate('/dashboard/accounting/statements')}>
                Back
              </Button>
              <Typography variant="h5" sx={{ minWidth: 0 }}>
                {statement
                  ? `${formatStatementMonthShort(statement.statementMonth)} statement`
                  : 'Statement'}
              </Typography>
            </Stack>
            <Stack
              direction="row"
              spacing={1.25}
              useFlexGap
              flexWrap="wrap"
              justifyContent="flex-end"
              alignItems="center"
              sx={{ ml: 'auto', flexShrink: 0 }}
            >
              {renderStageIndicator()}
              {statement &&
              canEdit &&
              canCompleteMonth &&
              statement.monthClose?.status !== 'completed' ? (
                <Button variant="contained" color="success" onClick={() => void completeMonth()} disabled={mutating}>
                  Complete Month
                </Button>
              ) : null}
              {statement && canEdit ? (
                <Button
                  variant="outlined"
                  onClick={() => void reprocessCurrentStatement()}
                  disabled={reprocessing}
                  startIcon={reprocessing ? <CircularProgress size={14} /> : undefined}
                >
                  {reprocessing ? 'Reprocessing...' : 'Reprocess'}
                </Button>
              ) : null}
              {statement && canDelete ? (
                <Tooltip title="Delete statement">
                  <span>
                    <IconButton
                      color="error"
                      onClick={openDeleteDialog}
                      disabled={deleting}
                      sx={{
                        border: (theme) => `1px solid ${theme.palette.error.main}`,
                        '&:hover': {
                          backgroundColor: (theme) => theme.palette.error.main + '14'
                        }
                      }}
                      aria-label="Delete statement"
                    >
                      {deleting ? <CircularProgress size={16} color="error" /> : <DeleteOutlineIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
              ) : null}
            </Stack>
          </Stack>
        }
      />
      {error && <Alert severity="error">{error}</Alert>}

      <Dialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        maxWidth="xs"
        fullWidth
        aria-labelledby="statement-delete-confirm-title"
      >
        <DialogTitle id="statement-delete-confirm-title">Delete statement?</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={1}>
            <Typography variant="body2">
              {statement
                ? `You're about to permanently delete the ${statement.statementMonth} statement "${statement.fileName ?? ''}".`
                : 'You are about to permanently delete this statement.'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              This removes the uploaded PDF, all extracted transactions, checks, and review decisions. This cannot be undone.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1 }}>
          <Button onClick={closeDeleteDialog} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => void confirmDeleteCurrentStatement()}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon />}
          >
            {deleting ? 'Deleting...' : 'Delete statement'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createBankAccountOpen}
        onClose={closeCreateBankAccountDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Create new bank account</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ mt: 0.5 }}>
            <TextField
              label="Account name"
              value={createBankAccountForm.name}
              onChange={(event) =>
                setCreateBankAccountForm((form) => ({ ...form, name: event.target.value }))
              }
              autoFocus
              required
              size="small"
              InputLabelProps={{ shrink: true }}
              placeholder="e.g. Operating Checking"
            />
            <TextField
              label="Account number (optional)"
              value={createBankAccountForm.accountNumber}
              onChange={(event) =>
                setCreateBankAccountForm((form) => ({ ...form, accountNumber: event.target.value }))
              }
              size="small"
              InputLabelProps={{ shrink: true }}
              placeholder="last 4 digits or full number"
            />
            <TextField
              select
              label="Detail type"
              value={createBankAccountForm.detailType}
              onChange={(event) =>
                setCreateBankAccountForm((form) => ({
                  ...form,
                  detailType: event.target.value as 'Checking' | 'Savings' | 'CashOnHand'
                }))
              }
              size="small"
              InputLabelProps={{ shrink: true }}
            >
              <MenuItem value="Checking">Checking</MenuItem>
              <MenuItem value="Savings">Savings</MenuItem>
              <MenuItem value="CashOnHand">Cash on hand</MenuItem>
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateBankAccountDialog} disabled={createBankAccountSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitCreateBankAccount()}
            disabled={createBankAccountSubmitting}
            startIcon={createBankAccountSubmitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {createBankAccountSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={createLineAccountOpen}
        onClose={closeCreateLineAccountDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {createLineAccountKind === 'income' ? 'Create income account' : 'Create expense account'}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Account name"
            value={createLineAccountName}
            onChange={(event) => setCreateLineAccountName(event.target.value)}
            autoFocus
            required
            size="small"
            fullWidth
            sx={{ mt: 0.5 }}
            InputLabelProps={{ shrink: true }}
            placeholder={createLineAccountKind === 'income' ? 'e.g. Sales of Product Income' : 'e.g. Office Supplies'}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeCreateLineAccountDialog} disabled={createLineAccountSubmitting}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void submitCreateLineAccount()}
            disabled={createLineAccountSubmitting}
            startIcon={createLineAccountSubmitting ? <CircularProgress size={14} color="inherit" /> : undefined}
          >
            {createLineAccountSubmitting ? 'Creating…' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !statement}
        loadingLabel="Loading statement..."
        emptyMessage="Statement not found"
      >
        {statement && (
          <>
            <Grid container spacing={2} alignItems="stretch">
              <Grid size={{ xs: 12, lg: 12 }}>
                <Paper
                  variant="outlined"
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                >
                  <Tabs
                    value={workspaceTab}
                    onChange={(_, next: WorkspaceTab) => setWorkspaceTab(next)}
                    variant="fullWidth"
                    scrollButtons={false}
                    sx={{
                      flexShrink: 0,
                      borderBottom: 1,
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                      minHeight: 48,
                      '& .MuiTabs-flexContainer': { gap: 0 },
                      '& .MuiTab-root': {
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.9375rem',
                        letterSpacing: 0,
                        minHeight: 48,
                        py: 1.25
                      },
                      '& .MuiTabs-indicator': {
                        height: 2
                      }
                    }}
                  >
                    <Tab value="overview" label="Overview" />
                    <Tab value="review_transactions" label="Review Transactions" />
                    <Tab value="source_proof" label="Source Proof" />
                  </Tabs>

                  <Stack spacing={2} sx={{ p: 2, flex: 1, minHeight: 0, overflow: 'auto' }}>
                    {workspaceTab === 'overview' ? renderOverviewBody() : null}
                    {workspaceTab === 'source_proof' ? (
                      <StatementSourceProofTab
                        statement={statement}
                        checks={checks}
                        artifactGroups={artifactGroups}
                        statementViewerTab={statementViewerTab}
                        onSelectViewerTab={setStatementViewerTab}
                        artifactText={artifactText}
                        artifactBlobUrls={artifactBlobUrls}
                        artifactLoading={artifactLoading}
                        artifactErrors={artifactErrors}
                        renderViewerBody={renderViewerBody}
                      />
                    ) : null}

                    {workspaceTab === 'review_transactions' ? renderSuggestionsBody() : null}
                  </Stack>
                </Paper>
              </Grid>

            </Grid>

          </>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};

export default StatementDetailPage;
