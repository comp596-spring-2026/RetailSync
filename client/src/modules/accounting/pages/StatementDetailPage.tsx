import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionIcon from '@mui/icons-material/Description';
import FilterListIcon from '@mui/icons-material/FilterList';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid2 as Grid,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Pagination,
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
  StatementCheck,
  StatementRule,
  StatementTransaction,
  StatementReviewStatus,
  StatementSuggestionItem,
  StatementSuggestionsResponse
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
  isImagePath
} from '../utils/statementDetailHelpers';
import {
  expenseCategoryPresets,
  incomeCategoryPresets,
  salesReceiptItemPresets,
  mapWorkflowToProposedType,
  suggestCategoryPreset,
  suggestWorkflowType,
  workflowTypeDescription,
  type WorkflowTxnType
} from '../utils/statementCategoryPresets';

const shouldLogStatementProgress = import.meta.env.DEV;

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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview');
  const [statementViewerTab, setStatementViewerTab] = useState<StatementViewerTab>('transactions');
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<StatementSuggestionsResponse | null>(null);
  const [entries, setEntries] = useState<StatementTransaction[]>([]);
  const [rules, setRules] = useState<StatementRule[]>([]);
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
  const [reviewQueue, setReviewQueue] = useState<
    'review' | 'credits' | 'debits' | 'transfers' | 'checks' | 'excluded'
  >('review');
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPageSize, setReviewPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'confidence' | 'page' | 'category' | 'review'>('date');
  const [quickFilter, setQuickFilter] = useState<string | null>(null);
  const [showEmptyGroups, setShowEmptyGroups] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    itemLabel: string;
    depositToAccount: string;
    transferFromAccount: string;
    transferToAccount: string;
    memo: string;
    checkNumber: string;
  }>({
    vendor: '',
    customer: '',
    categoryLabel: '',
    customCategory: '',
    itemLabel: '',
    depositToAccount: '',
    transferFromAccount: '',
    transferToAccount: '',
    memo: '',
    checkNumber: ''
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
  const blobUrlsRef = useRef<Record<string, string>>({});
  const lastProgressLogRef = useRef<string>('');
  const lastCheckLogRef = useRef<string>('');

  useEffect(() => {
    setReviewPage(1);
  }, [reviewQueue, statementId]);

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
      const [statementResponse, checksResponse, suggestionsResponse, entriesResponse, statusResponse, rulesResponse] = await Promise.all([
        accountingApi.getStatement(statementId),
        accountingApi.listStatementChecks(statementId),
        accountingApi.getStatementSuggestions(statementId),
        accountingApi.listStatementEntries(statementId),
        accountingApi.getStatementStatus(statementId),
        accountingApi.listStatementRules(statementId)
      ]);
      setStatement(statementResponse.data.data);
      setChecks(checksResponse.data.data.checks);
      setSuggestions(suggestionsResponse.data.data);
      setEntries(entriesResponse.data.data.entries);
      setLiveMetrics(statusResponse.data.data.liveMetrics);
      setRules(rulesResponse.data.data.rules);
    } catch (apiError) {
      setError(extractApiErrorMessage(apiError, 'Failed to load statement'));
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  const refreshProcessingPanel = useCallback(async () => {
    if (!statementId) return;

    try {
      const [statusResponse, checksResponse, suggestionsResponse, entriesResponse, rulesResponse] = await Promise.all([
        accountingApi.getStatementStatus(statementId),
        accountingApi.listStatementChecks(statementId),
        accountingApi.getStatementSuggestions(statementId),
        accountingApi.listStatementEntries(statementId),
        accountingApi.listStatementRules(statementId)
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
      setRules(rulesResponse.data.data.rules);
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
      navigate('/dashboard/accounting/statements');
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

  const updateSuggestionReviewStatus = async (
    suggestion: StatementSuggestionItem,
    reviewStatus: StatementReviewStatus
  ) => {
    if (!statementId || mutating) return;
    setMutating(true);
    try {
      await accountingApi.updateStatementSuggestionReview(
        statementId,
        suggestion.id,
        suggestion.source,
        reviewStatus
      );
      dispatch(showSnackbar({ message: 'Suggestion updated', severity: 'success' }));
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
          message: extractApiErrorMessage(apiError, `Unable to load ${entityType} list`),
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
      setWorkflowForm((form) => (entityType === 'vendor'
        ? { ...form, vendor: detail.displayName }
        : { ...form, customer: detail.displayName }));
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

  const loadBankAccounts = useCallback(async () => {
    try {
      const response = await accountingApi.getQuickbooksHubChartOfAccounts({
        type: 'Bank',
        status: 'active',
        page: 1,
        pageSize: 100,
        sort: 'name'
      });
      setBankAccounts(response.data.data.items ?? []);
    } catch {
      // leave existing list intact on failure
    }
  }, []);

  useEffect(() => {
    void loadBankAccounts();
  }, [loadBankAccounts]);

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
        name: trimmedName,
        accountNumber: createBankAccountForm.accountNumber.trim() || undefined,
        detailType: createBankAccountForm.detailType
      });
      const created = response.data.data.account;
      await loadBankAccounts();
      const newAccountId = created?.qbId ?? created?.id ?? '';
      if (newAccountId) {
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
    loadBankAccounts
  ]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadContactOptions('vendor', contactSearch.vendor); }, 250);
    return () => clearTimeout(timer);
  }, [contactSearch.vendor, loadContactOptions]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadContactOptions('customer', contactSearch.customer); }, 250);
    return () => clearTimeout(timer);
  }, [contactSearch.customer, loadContactOptions]);

  const openEditModal = (item: StatementSuggestionItem, autoSaveAndNext = false) => {
    setEditItem(item);
    setSaveAndNext(autoSaveAndNext);
    setEditModalOpen(true);
    const initialType = suggestWorkflowType({
      direction: item.direction,
      description: item.description ?? '',
      transactionFamily: item.transactionFamily,
      proposedTxnType: item.proposedTxnType,
      checkNumber: item.checkNumber
    });
    setWorkflowType(initialType);
    const suggestion = suggestCategoryPreset({
      direction: item.direction,
      description: item.description ?? ''
    });
    const defaultBankAccountId = statement?.bankAccountId ?? '';
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
    setWorkflowForm({
      vendor: item.direction === 'debit' ? item.payeeName ?? '' : '',
      customer: item.direction === 'credit' ? item.payeeName ?? '' : '',
      categoryLabel: suggestion?.label ?? '',
      customCategory: '',
      itemLabel: '',
      depositToAccount: initialType === 'Deposit' && defaultBankAccountId ? defaultBankAccountId : '',
      transferFromAccount: defaultTransferFromAccount,
      transferToAccount: defaultTransferToAccount,
      memo: item.sourceText ?? '',
      checkNumber: item.checkNumber ?? ''
    });
  };

  useEffect(() => {
    if (!editModalOpen) return;
    const defaultBankAccountId = statement?.bankAccountId ?? '';
    if (!defaultBankAccountId) return;
    if (workflowType === 'Check') {
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
    if (workflowType === 'Deposit') {
      setWorkflowForm((form) => (form.depositToAccount ? form : { ...form, depositToAccount: defaultBankAccountId }));
    }
  }, [editModalOpen, workflowType, statement?.bankAccountId, editItem]);

  const closeEditModal = () => {
    setEditModalOpen(false);
    setEditItem(null);
    setSaveAndNext(false);
  };

  const saveEditModal = async (action: 'save' | 'save_next' | 'save_rule' | 'mark_non_posting') => {
    if (!editItem) return;
    const category = workflowForm.categoryLabel === '__custom__'
      ? workflowForm.customCategory
      : workflowForm.categoryLabel;
    const item: StatementSuggestionItem = {
      ...editItem,
      payeeName: workflowType === 'SalesReceipt' || workflowType === 'Deposit'
        ? workflowForm.customer || editItem.payeeName
        : workflowForm.vendor || editItem.payeeName,
      categoryAccountId: category || editItem.categoryAccountId,
      proposedTxnType: mapWorkflowToProposedType(workflowType) ?? editItem.proposedTxnType,
      resolvedRelatedAccountId: workflowType === 'Transfer'
        ? (workflowForm.transferToAccount || editItem.resolvedRelatedAccountId)
        : editItem.resolvedRelatedAccountId,
      checkNumber: workflowType === 'Check' ? workflowForm.checkNumber || editItem.checkNumber : editItem.checkNumber
    };
    setEditItem(item);
    if (action === 'mark_non_posting') {
      await updateSuggestionReviewStatus(item, 'excluded');
    } else {
      await updateSuggestionReviewStatus(item, 'approved');
    }
    if (action === 'save_rule' && editItem.source === 'transaction') {
      await createRuleFromEntry(editItem.id, 'soft');
    }
    if (action === 'save_next' || saveAndNext) {
      const currentId = editItem.id;
      const ordered = suggestions?.items ?? [];
      const idx = ordered.findIndex((item) => item.id === currentId);
      const next = idx >= 0 ? ordered[idx + 1] : null;
      if (next) {
        setEditItem(next);
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

  const createRuleFromEntry = async (entryId: string, hardness: 'soft' | 'hard') => {
    if (!statementId || mutating) return;
    setMutating(true);
    try {
      await accountingApi.createStatementRuleFromTransaction(statementId, entryId, hardness);
      dispatch(showSnackbar({ message: `${hardness === 'hard' ? 'Hard' : 'Soft'} rule created`, severity: 'success' }));
      const rulesResponse = await accountingApi.listStatementRules(statementId);
      setRules(rulesResponse.data.data.rules);
      await refreshProcessingPanel();
    } catch (apiError) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(apiError, 'Failed to create rule'),
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

    const checksPendingCount = checks.filter((check) => check.status !== 'ready').length;
    const unresolvedTransfers = suggestions.items.filter(
      (item) =>
        item.transactionFamily === 'transfer' &&
        ['needs_internal_account_match', 'needs_chart_of_accounts_account', 'needs_review'].includes(
          String(item.transferResolutionStatus)
        )
    ).length;
    const hasDriftIssue = Boolean(statement?.issues?.some((issue) => /drift|validation/i.test(issue)));

    const groupTotals = (rows: StatementSuggestionItem[]) => ({
      count: rows.length,
      total: rows.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0)
    });

    const matchesFilters = (item: StatementSuggestionItem) => {
      const needle = searchTerm.trim().toLowerCase();
      if (needle) {
        const haystack = `${item.description} ${item.sourceText ?? ''} ${item.payeeName ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (dateFrom && (item.date ?? '') < dateFrom) return false;
      if (dateTo && (item.date ?? '') > dateTo) return false;
      if (amountMin && Math.abs(item.amount) < Number(amountMin)) return false;
      if (amountMax && Math.abs(item.amount) > Number(amountMax)) return false;
      if (sectionFilter !== 'all' && item.section !== sectionFilter) return false;
      if (familyFilter !== 'all' && item.transactionFamily !== familyFilter) return false;
      if (statusFilter !== 'all' && item.reviewStatus !== statusFilter) return false;
      if (quickFilter === 'unresolved' && !['needs_internal_account_match', 'needs_chart_of_accounts_account', 'needs_review'].includes(String(item.transferResolutionStatus))) return false;
      if (quickFilter === 'transfers' && item.transactionFamily !== 'transfer') return false;
      if (quickFilter === 'checks' && item.source !== 'check' && item.proposedTxnType !== 'Check') return false;
      if (quickFilter === 'high_amount' && Math.abs(item.amount) < 1000) return false;
      if (quickFilter === 'posting' && item.reviewStatus === 'excluded') return false;
      if (quickFilter === 'unknown' && (item.transactionFamily ?? 'other') !== 'other') return false;
      return true;
    };

    const scopedSuggestions = suggestions.items.filter((item) => {
      if (!matchesFilters(item)) return false;
      if (reviewQueue === 'review') return item.transactionFamily !== 'transfer' && item.reviewStatus !== 'excluded';
      if (reviewQueue === 'credits') return item.direction === 'credit' && item.transactionFamily !== 'transfer';
      if (reviewQueue === 'debits') return item.direction === 'debit' && item.section === 'electronic_debits';
      if (reviewQueue === 'transfers') return item.transactionFamily === 'transfer';
      if (reviewQueue === 'excluded') return item.reviewStatus === 'excluded';
      if (reviewQueue === 'checks') return item.source === 'check' || item.proposedTxnType === 'Check';
      return true;
    });

    const sortedItems = [...scopedSuggestions].sort((a, b) => {
      if (sortBy === 'amount') return Math.abs(b.amount) - Math.abs(a.amount);
      if (sortBy === 'page') return (a.sourcePage ?? 999) - (b.sourcePage ?? 999);
      if (sortBy === 'confidence') return (b.proposalConfidence ?? 0) - (a.proposalConfidence ?? 0);
      return String(a.date ?? '').localeCompare(String(b.date ?? ''));
    });

    const totalRows = sortedItems.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / reviewPageSize));
    const safePage = Math.min(reviewPage, totalPages);
    const startIndex = (safePage - 1) * reviewPageSize;
    const endIndex = safePage * reviewPageSize;
    const pageRows = sortedItems.slice(startIndex, endIndex);

    const groupedRows =
      reviewQueue === 'transfers'
        ? [
            {
              name: 'Unmatched transfers',
              rows: pageRows.filter((item) =>
                ['needs_internal_account_match', 'needs_chart_of_accounts_account', 'needs_review'].includes(
                  String(item.transferResolutionStatus)
                )
              )
            },
            {
              name: 'Matched transfers',
              rows: pageRows.filter((item) => item.transferResolutionStatus === 'matched_transfer_ready')
            }
          ]
        : reviewQueue === 'review'
          ? [
              {
                name: 'Transactions to review',
                rows: pageRows.filter((item) => item.reviewStatus === 'proposed')
              },
              {
                name: 'Ready to post',
                rows: pageRows.filter((item) => item.reviewStatus === 'approved' && item.postingStatus !== 'posted')
              }
            ]
          : reviewQueue === 'credits'
            ? [
                { name: 'Deposits', rows: pageRows.filter((item) => item.section === 'deposits') },
                { name: 'Electronic credits', rows: pageRows.filter((item) => item.section === 'electronic_credits') },
                { name: 'Other credits', rows: pageRows.filter((item) => item.section === 'other_credits') }
              ]
            : reviewQueue === 'debits'
              ? [
                  { name: 'Electronic debits', rows: pageRows.filter((item) => item.section === 'electronic_debits') },
                  { name: 'Tax payments', rows: pageRows.filter((item) => item.transactionFamily === 'tax_payment') },
                  { name: 'Other debit transactions', rows: pageRows.filter((item) => item.transactionFamily !== 'tax_payment') }
                ]
          : [];
    const visibleGroups = groupedRows.filter((group) => showEmptyGroups || group.rows.length > 0);

    const renderSuggestionLine = (item: StatementSuggestionItem) => {
      const rowExpanded = expandedRows[item.id] ?? false;
      const statusText =
        item.transferResolutionStatus && item.transferResolutionStatus !== 'matched_transfer_ready'
          ? formatStatusLabel(item.transferResolutionStatus)
          : formatStatusLabel(item.reviewStatus ?? 'proposed');

      return (
        <Accordion
          key={`${reviewQueue}:${item.id}`}
          expanded={rowExpanded}
          onChange={(_event, expanded) => setExpandedRows((current) => ({ ...current, [item.id]: expanded }))}
          disableGutters
        >
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box
              sx={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: '110px minmax(280px,1fr) 210px 130px 90px',
                gap: 1,
                alignItems: 'center'
              }}
            >
              <Typography variant="body2">{formatMaybeDate(item.date)}</Typography>
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
                {item.source === 'check' || item.rowType === 'check_cleared' || item.checkNumber ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    color="default"
                    label={`Check #${item.checkNumber ?? item.id.slice(-6)}`}
                    sx={{ flexShrink: 0, fontWeight: 600, borderRadius: 1 }}
                  />
                ) : null}
                <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.description}
                </Typography>
                {statusText && statusText.toLowerCase() !== 'proposed' ? (
                  <Chip size="small" label={statusText} variant="outlined" sx={{ flexShrink: 0 }} />
                ) : null}
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {formatStatusLabel(item.section ?? 'unknown')} · {formatStatusLabel(item.transactionFamily ?? 'other')}
              </Typography>
              <Typography variant="subtitle2" sx={{ textAlign: 'right', color: item.direction === 'credit' ? 'success.main' : 'error.main' }}>
                {item.direction === 'credit' ? '+' : '-'}{formatMoney(Math.abs(item.amount))}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: 'primary.main', fontWeight: 700, cursor: 'pointer' }}
                onClick={(event) => {
                  event.stopPropagation();
                  openEditModal(item);
                }}
              >
                Review
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0 }}>
            <Stack spacing={1.25}>
              {(() => {
                const signedAmount = `${item.direction === 'credit' ? '+' : '-'}${formatMoney(Math.abs(Number(item.amount ?? 0)))}`;
                const rawFields: Array<[string, string | null | undefined]> = [
                  ['Posted date', formatMaybeDate(item.date) || null],
                  ['Amount', signedAmount],
                  ['Direction', item.direction ? formatStatusLabel(item.direction) : null],
                  ['Section', item.section ? formatStatusLabel(item.section) : null],
                  ['Transaction family', item.transactionFamily ? formatStatusLabel(item.transactionFamily) : null],
                  ['Check #', item.checkNumber ?? null],
                  ['Payee / vendor', item.payeeName ?? null],
                  ['Proposed QB action', item.proposedTxnType ?? null],
                  ['Counterparty hint', item.counterpartyBankHint ?? null],
                  ['Transfer resolution', item.transferResolutionStatus ? formatStatusLabel(item.transferResolutionStatus) : null],
                  ['Statement account', item.statementAccountMask ?? null],
                  ['Mapped category', item.categoryAccountId ?? null],
                  ['Mapped bank account', item.bankAccountId ?? null],
                  ['Source page', item.sourcePage != null ? String(item.sourcePage) : null]
                ];
                const visibleFields = rawFields
                  .filter(([, value]) => value != null && String(value).trim() !== '' && String(value).trim() !== '—')
                  .map(([label, value]) => [label, String(value)] as [string, string]);

                if (visibleFields.length === 0) return null;

                return (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                      columnGap: 3,
                      rowGap: 0.5
                    }}
                  >
                    {visibleFields.map(([label, value]) => (
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
                );
              })()}

              {item.matchedRuleNames && item.matchedRuleNames.length > 0 ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">Matched rules</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {item.matchedRuleNames.join(' · ')}
                  </Typography>
                </Box>
              ) : null}

              <Stack direction="row" spacing={1}>
                <Button size="small" variant="outlined" onClick={() => openEditModal(item)}>Open Review Modal</Button>
                {reviewQueue === 'transfers' && item.transferResolutionStatus !== 'matched_transfer_ready' ? (
                  <Button size="small" variant="outlined" onClick={() => void resolveTransferWithExistingAccount(item)} disabled={mutating}>
                    Resolve Mapping
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </AccordionDetails>
        </Accordion>
      );
    };

    return (
      <Stack spacing={2}>
        {hasDriftIssue ? <Alert severity="warning">Reconciliation drift detected.</Alert> : null}

        <Paper variant="outlined" sx={{ p: 1.5, position: 'sticky', top: 8, zIndex: 3, bgcolor: 'background.paper' }}>
          <Stack spacing={1}>
            <Tabs value={reviewQueue} onChange={(_event, nextValue) => setReviewQueue(nextValue)} variant="scrollable" allowScrollButtonsMobile>
              <Tab value="review" label={`Review (${suggestions.summary.needsReview})`} />
              <Tab value="credits" label={`Credits (${suggestions.summary.credits})`} />
              <Tab value="debits" label={`Debits (${suggestions.summary.debits})`} />
              <Tab value="transfers" label={`Transfers (${suggestions.summary.transfers})`} />
              <Tab value="checks" label={`Checks (${checks.length})`} />
              <Tab value="excluded" label={`Excluded (${suggestions.summary.excluded})`} />
            </Tabs>
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                Click filter icon to refine section/family/status.
              </Typography>
              <Button
                size="small"
                startIcon={<FilterListIcon />}
                onClick={() => setFiltersOpen((current) => !current)}
                variant={filtersOpen ? 'contained' : 'outlined'}
              >
                Filters
              </Button>
            </Stack>
            <Collapse in={filtersOpen}>
              <Paper variant="outlined" sx={{ p: 1.5, mt: 1, bgcolor: 'background.default' }}>
                <Grid container spacing={1.5}>
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="overline" color="text.secondary">Search</Typography>
                    <TextField
                      size="small"
                      placeholder="Search description, vendor, source line…"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      fullWidth
                      sx={{ mt: 0.5 }}
                    />
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Typography variant="overline" color="text.secondary">Scope</Typography>
                    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Section</InputLabel>
                        <Select value={sectionFilter} label="Section" onChange={(event) => setSectionFilter(String(event.target.value))}>
                          <MenuItem value="all">All sections</MenuItem>
                          <MenuItem value="deposits">Deposits</MenuItem>
                          <MenuItem value="electronic_credits">Electronic Credits</MenuItem>
                          <MenuItem value="other_credits">Other Credits</MenuItem>
                          <MenuItem value="electronic_debits">Electronic Debits</MenuItem>
                          <MenuItem value="checks_cleared">Checks Cleared</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Family</InputLabel>
                        <Select value={familyFilter} label="Family" onChange={(event) => setFamilyFilter(String(event.target.value))}>
                          <MenuItem value="all">All families</MenuItem>
                          <MenuItem value="transfer">Transfer</MenuItem>
                          <MenuItem value="tax_payment">Tax payment</MenuItem>
                          <MenuItem value="vendor_payment">Vendor payment</MenuItem>
                          <MenuItem value="settlement">Settlement</MenuItem>
                          <MenuItem value="check">Check</MenuItem>
                          <MenuItem value="other">Other</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Review state</InputLabel>
                        <Select value={statusFilter} label="Review state" onChange={(event) => setStatusFilter(String(event.target.value))}>
                          <MenuItem value="all">All states</MenuItem>
                          <MenuItem value="proposed">Pending</MenuItem>
                          <MenuItem value="approved">Ready</MenuItem>
                          <MenuItem value="excluded">Excluded</MenuItem>
                        </Select>
                      </FormControl>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="overline" color="text.secondary">Date range</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <TextField size="small" label="From" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                      <TextField size="small" label="To" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="overline" color="text.secondary">Amount range</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                      <TextField size="small" label="Min $" value={amountMin} onChange={(event) => setAmountMin(event.target.value)} fullWidth />
                      <TextField size="small" label="Max $" value={amountMax} onChange={(event) => setAmountMax(event.target.value)} fullWidth />
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Typography variant="overline" color="text.secondary">Display</Typography>
                    <Stack direction="row" spacing={1} sx={{ mt: 0.5 }} useFlexGap flexWrap="wrap">
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Sort by</InputLabel>
                        <Select value={sortBy} label="Sort by" onChange={(event) => setSortBy(event.target.value as any)}>
                          <MenuItem value="date">Date</MenuItem>
                          <MenuItem value="amount">Amount</MenuItem>
                          <MenuItem value="page">Page</MenuItem>
                          <MenuItem value="confidence">Confidence</MenuItem>
                        </Select>
                      </FormControl>
                      <FormControl size="small" sx={{ width: 110 }}>
                        <InputLabel>Rows</InputLabel>
                        <Select value={String(reviewPageSize)} label="Rows" onChange={(event) => setReviewPageSize(Number(event.target.value))}>
                          <MenuItem value="10">10</MenuItem>
                          <MenuItem value="25">25</MenuItem>
                          <MenuItem value="50">50</MenuItem>
                        </Select>
                      </FormControl>
                      <Button size="small" variant="text" onClick={() => setShowEmptyGroups((current) => !current)}>
                        {showEmptyGroups ? 'Hide empty groups' : 'Show empty groups'}
                      </Button>
                    </Stack>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Typography variant="overline" color="text.secondary">Quick filters</Typography>
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 0.5 }}>
                      {[
                        ['Unresolved transfers', 'unresolved'],
                        ['Transfers', 'transfers'],
                        ['Checks', 'checks'],
                        ['High amount ($1K+)', 'high_amount'],
                        ['Posting candidates', 'posting'],
                        ['Unknown classification', 'unknown']
                      ].map(([label, key]) => (
                        <Chip
                          key={key}
                          size="small"
                          label={label}
                          color={quickFilter === key ? 'primary' : 'default'}
                          variant={quickFilter === key ? 'filled' : 'outlined'}
                          onClick={() => setQuickFilter((current) => (current === key ? null : key))}
                        />
                      ))}
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => {
                          setSearchTerm('');
                          setDateFrom('');
                          setDateTo('');
                          setAmountMin('');
                          setAmountMax('');
                          setSectionFilter('all');
                          setFamilyFilter('all');
                          setStatusFilter('all');
                          setQuickFilter(null);
                        }}
                      >
                        Reset all
                      </Button>
                    </Stack>
                  </Grid>
                </Grid>
              </Paper>
            </Collapse>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Showing {totalRows === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, totalRows)} of {totalRows}
              </Typography>
              <Pagination count={totalPages} page={safePage} onChange={(_event, page) => setReviewPage(page)} size="small" />
            </Stack>
          </Stack>
        </Paper>

        {reviewQueue === 'checks' ? (
          <Paper variant="outlined" sx={{ p: 0 }}>
            <Box sx={{ px: 1.25, py: 0.75, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2">Checks cleared</Typography>
                <Chip size="small" variant="outlined" label={checks.length} />
              </Stack>
              <Typography variant="caption" color="text.secondary">
                Subtotal {formatMoney(checks.reduce((sum, check) => sum + Math.abs(Number(check.extracted?.amount ?? check.autoFill?.amount ?? 0)), 0))}
              </Typography>
            </Box>
            <Box sx={{ px: 1.25, py: 1, display: 'grid', gridTemplateColumns: '100px 110px minmax(220px,1fr) minmax(200px,1fr) 130px 110px', gap: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Typography variant="caption">Check #</Typography>
              <Typography variant="caption">Date</Typography>
              <Typography variant="caption">Payee</Typography>
              <Typography variant="caption">Memo</Typography>
              <Typography variant="caption" textAlign="right">Amount</Typography>
              <Typography variant="caption" textAlign="right">Review</Typography>
            </Box>
            {checks.length === 0 ? (
              <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">No checks pending review.</Typography></Box>
            ) : (
              sortedChecks.slice(startIndex, endIndex).map((check) => {
                const hasCrop = Boolean(check.artifacts?.cropImagePath);
                const displayNumber = check.extracted?.checkNumber ?? check.autoFill?.checkNumber ?? null;
                const checkLabel = displayNumber ? `#${displayNumber}` : `(auto-id ${check.id.slice(-6)})`;
                const expanded = expandedRows[check.id] ?? false;
                const payee = check.extracted?.payeeName ?? check.autoFill?.payeeName ?? '';
                const memo = check.extracted?.memo ?? check.autoFill?.memo ?? '';
                const amount = Number(check.extracted?.amount ?? check.autoFill?.amount ?? 0);
                return (
                  <Accordion
                    key={check.id}
                    expanded={expanded}
                    onChange={(_event, nextExpanded) => setExpandedRows((current) => ({ ...current, [check.id]: nextExpanded }))}
                    disableGutters
                    sx={{ borderBottom: '1px solid', borderColor: 'divider', '&::before': { display: 'none' } }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.25 }}>
                      <Box sx={{ width: '100%', display: 'grid', gridTemplateColumns: '100px 110px minmax(220px,1fr) minmax(200px,1fr) 130px 110px', gap: 1, alignItems: 'center' }}>
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{checkLabel}</Typography>
                          {check.status !== 'ready' ? (
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: check.status === 'failed' ? 'error.main' : 'warning.main' }} title={formatStatusLabel(check.status)} />
                          ) : null}
                        </Stack>
                        <Typography variant="body2">{formatMaybeDate(check.extracted?.date ?? check.autoFill?.date)}</Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={payee}>
                          {payee || <Box component="span" sx={{ color: 'text.disabled' }}>—</Box>}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={memo}>
                          {memo || '—'}
                        </Typography>
                        <Typography variant="subtitle2" sx={{ textAlign: 'right', color: 'error.main' }}>
                          -{formatMoney(Math.abs(amount))}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ color: hasCrop ? 'primary.main' : 'text.disabled', fontWeight: 700, cursor: hasCrop ? 'pointer' : 'not-allowed', textAlign: 'right' }}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (!hasCrop) return;
                            setSelectedCheckId(check.id);
                            setStatementViewerTab(`check-${check.id}-crop`);
                            setWorkspaceTab('artifacts');
                          }}
                        >
                          Open crop
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ pt: 0 }}>
                      <Stack spacing={1.25}>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                            columnGap: 3,
                            rowGap: 0.5
                          }}
                        >
                          {(
                            [
                              ['Check #', displayNumber ?? '—'],
                              ['Posted date', formatMaybeDate(check.extracted?.date ?? check.autoFill?.date) || '—'],
                              ['Amount', formatMoney(Math.abs(amount))],
                              ['Payee', payee || '—'],
                              ['Memo', memo || '—'],
                              ['Extraction source', check.extracted?.source ? formatStatusLabel(check.extracted.source) : '—'],
                              ['Review status', formatStatusLabel(check.status)],
                              ['Confidence', check.confidence?.overall != null ? `${Math.round(Number(check.confidence.overall) * 100)}%` : '—'],
                              ['Matched txn', check.match?.statementTransactionId ?? '—'],
                              ['Match confidence', check.match?.matchConfidence != null ? `${Math.round(Number(check.match.matchConfidence) * 100)}%` : '—'],
                              ['Source page', check.artifacts?.pageNumber != null ? String(check.artifacts.pageNumber) : '—'],
                              ['Retries', String(check.processing?.retryCount ?? 0)],
                              ['Last processed', check.processing?.processedAt ? formatDate(check.processing.processedAt) : '—'],
                              ['Crop available', hasCrop ? 'Yes' : 'Not yet'],
                              ['Check id', check.id]
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

                        {check.processing?.lastError ? (
                          <Alert severity="warning" sx={{ py: 0.5 }}>
                            Last error: {check.processing.lastError}
                          </Alert>
                        ) : null}

                        {!hasCrop ? (
                          <Alert severity="info" sx={{ py: 0.5 }}>
                            Cropped check image is not available yet.{' '}
                            {check.status === 'queued' || check.status === 'processing'
                              ? 'It is being rendered — refresh in a moment.'
                              : check.status === 'failed'
                                ? 'Processing failed before the crop could be generated. Retry statement processing to try again.'
                                : 'The crop could not be generated for this check.'}
                          </Alert>
                        ) : null}

                        {check.match?.reasons && check.match.reasons.length > 0 ? (
                          <Box>
                            <Typography variant="caption" color="text.secondary">Match reasons</Typography>
                            <Box component="ul" sx={{ pl: 2.25, my: 0.5 }}>
                              {check.match.reasons.map((reason, idx) => (
                                <li key={idx}>
                                  <Typography variant="body2">{reason}</Typography>
                                </li>
                              ))}
                            </Box>
                          </Box>
                        ) : null}

                        {hasCrop ? (
                          <Box
                            component="img"
                            src="/test_check.png"
                            alt={`Check ${displayNumber ?? check.id.slice(-6)}`}
                            sx={{
                              width: '100%',
                              maxHeight: 250,
                              objectFit: 'contain',
                              bgcolor: 'grey.50',
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: 'divider',
                              mt: 1,
                              mb: 1
                            }}
                          />
                        ) : null}

                        <Stack direction="row" spacing={1}>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!hasCrop}
                            onClick={() => {
                              setSelectedCheckId(check.id);
                              setStatementViewerTab(`check-${check.id}-crop`);
                              setWorkspaceTab('artifacts');
                            }}
                          >
                            Open in Artifacts
                          </Button>
                          {check.match?.statementTransactionId ? (
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                const match = suggestions?.items.find((s) => s.id === check.match?.statementTransactionId);
                                if (match) openEditModal(match);
                              }}
                            >
                              Open matched transaction
                            </Button>
                          ) : null}
                        </Stack>
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                );
              })
            )}
          </Paper>
        ) : reviewQueue === 'excluded' ? (
          <Paper variant="outlined" sx={{ p: 0 }}>
            <Box sx={{ px: 1.25, py: 1, display: 'grid', gridTemplateColumns: '170px 120px minmax(280px,1fr) 70px 220px', gap: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Typography variant="caption">Type</Typography>
              <Typography variant="caption">Date</Typography>
              <Typography variant="caption">Description</Typography>
              <Typography variant="caption">Page</Typography>
              <Typography variant="caption">Reason</Typography>
            </Box>
            {entries.filter((entry) => entry.isPostingCandidate === false).length === 0 ? (
              <Box sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">No excluded rows.</Typography></Box>
            ) : (
              entries.filter((entry) => entry.isPostingCandidate === false).slice(startIndex, endIndex).map((entry) => (
                <Box key={entry.id} sx={{ px: 1.25, py: 1, display: 'grid', gridTemplateColumns: '170px 120px minmax(280px,1fr) 70px 220px', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2">{formatStatusLabel(entry.rowType ?? 'noise')}</Typography>
                  <Typography variant="body2">{formatMaybeDate(entry.postDate)}</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.description}</Typography>
                  <Typography variant="body2" color="text.secondary">Pg {entry.sourceLocator?.pageNumber ?? '-'}</Typography>
                  <Typography variant="body2" color="text.secondary">Non-posting classification</Typography>
                </Box>
              ))
            )}
          </Paper>
        ) : (
          <Paper variant="outlined" sx={{ p: 0 }}>
            <Box sx={{ px: 1.25, py: 1, display: 'grid', gridTemplateColumns: '110px minmax(280px,1fr) 210px 130px 90px', gap: 1, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
              <Typography variant="caption">Date</Typography>
              <Typography variant="caption">Description</Typography>
              <Typography variant="caption">Section · Family</Typography>
              <Typography variant="caption" textAlign="right">Amount</Typography>
              <Typography variant="caption">Review</Typography>
            </Box>
            {visibleGroups.length === 0 ? (
              <Box sx={{ p: 2 }}>
                <Typography variant="body2" color="text.secondary">No transactions match current filters.</Typography>
              </Box>
            ) : (
              visibleGroups.map((group) => {
                const subtotal = groupTotals(group.rows);
                return (
                  <Box key={group.name}>
                    <Box
                      sx={{
                        px: 1.25,
                        py: 0.75,
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        bgcolor: 'background.default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="subtitle2">{group.name}</Typography>
                        <Chip size="small" label={subtotal.count} variant="outlined" />
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Subtotal {formatMoney(subtotal.total)}
                      </Typography>
                    </Box>
                    {group.rows.map((item) => renderSuggestionLine(item))}
                  </Box>
                );
              })
            )}
          </Paper>
        )}

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
                  <Grid size={{ xs: 12 }}>
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
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                        <Typography variant="overline" color="text.secondary">QuickBooks workflow type</Typography>
                        {(() => {
                          const suggestedType = suggestWorkflowType({
                            direction: editItem.direction,
                            description: editItem.description ?? '',
                            transactionFamily: editItem.transactionFamily,
                            proposedTxnType: editItem.proposedTxnType,
                            checkNumber: editItem.checkNumber
                          });
                          if (suggestedType === workflowType) return null;
                          return (
                            <Chip
                              size="small"
                              color="primary"
                              variant="outlined"
                              label={`Suggested: ${suggestedType}`}
                              onClick={() => setWorkflowType(suggestedType)}
                            />
                          );
                        })()}
                      </Stack>
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {(editItem.direction === 'debit'
                          ? (['Expense', 'Check', 'Bill', 'BillPayment', 'Transfer', 'JournalEntry'] as WorkflowTxnType[])
                          : (['Deposit', 'SalesReceipt', 'Transfer', 'JournalEntry'] as WorkflowTxnType[])
                        ).map((type) => (
                          <Chip
                            key={type}
                            size="small"
                            label={type === 'BillPayment' ? 'Bill Payment' : type === 'SalesReceipt' ? 'Sales Receipt' : type === 'JournalEntry' ? 'Journal Entry' : type}
                            color={workflowType === type ? 'primary' : 'default'}
                            variant={workflowType === type ? 'filled' : 'outlined'}
                            onClick={() => setWorkflowType(type)}
                          />
                        ))}
                      </Stack>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                        {workflowTypeDescription(workflowType)}
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid size={{ xs: 12 }}>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Typography variant="overline" color="text.secondary">
                        {workflowType === 'SalesReceipt'
                          ? 'Sales receipt fields'
                          : workflowType === 'Deposit'
                            ? 'Deposit fields'
                            : workflowType === 'Transfer'
                              ? 'Transfer fields'
                              : workflowType === 'JournalEntry'
                                ? 'Journal entry fields'
                                : workflowType === 'Bill' || workflowType === 'BillPayment'
                                  ? 'Bill fields'
                                  : 'Expense / Check fields'}
                      </Typography>

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
                                setWorkflowForm((form) => ({ ...form, vendor: value.displayName }));
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
                            <FormControl size="small" fullWidth>
                              <InputLabel shrink>Category (expense / COGS)</InputLabel>
                              <Select
                                label="Category (expense / COGS)"
                                value={workflowForm.categoryLabel}
                                displayEmpty
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, categoryLabel: String(event.target.value ?? '') }))}
                              >
                                <MenuItem value=""><em>— Select category —</em></MenuItem>
                                {Array.from(new Set(expenseCategoryPresets.map((preset) => preset.group))).map((group) => [
                                  <MenuItem key={`h-${group}`} disabled divider sx={{ opacity: 0.6 }}>
                                    {group}
                                  </MenuItem>,
                                  ...expenseCategoryPresets
                                    .filter((preset) => preset.group === group)
                                    .map((preset) => (
                                      <MenuItem key={preset.id} value={preset.label} sx={{ pl: 3 }}>
                                        {preset.label}
                                      </MenuItem>
                                    ))
                                ])}
                                <MenuItem value="__custom__" sx={{ fontStyle: 'italic' }}>+ Custom category…</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          {workflowForm.categoryLabel === '__custom__' ? (
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                size="small"
                                label="Custom category name"
                                placeholder="e.g. Marketing:Local Ads"
                                value={workflowForm.customCategory}
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, customCategory: event.target.value }))}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                          ) : null}
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
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                size="small"
                                select={bankAccounts.length > 0}
                                label="Paid from (bank account)"
                                placeholder="e.g. Checking xxx1234"
                                value={workflowForm.transferFromAccount}
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, transferFromAccount: event.target.value }))}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                helperText={
                                  statement?.bankAccountId &&
                                  workflowForm.transferFromAccount === statement.bankAccountId
                                    ? 'Defaulted to the bank chart account selected at upload.'
                                    : undefined
                                }
                                SelectProps={bankAccounts.length > 0 ? { displayEmpty: true } : undefined}
                              >
                                {bankAccounts.length > 0
                                  ? [
                                      <MenuItem key="__none__" value="">
                                        <em>— Select bank account —</em>
                                      </MenuItem>,
                                      ...bankAccounts.map((account) => {
                                        const detail = account.detailType || account.type;
                                        return (
                                          <MenuItem key={account.id} value={account.id}>
                                            {detail ? `${account.name} · ${detail}` : account.name}
                                          </MenuItem>
                                        );
                                      })
                                    ]
                                  : null}
                              </TextField>
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

                      {workflowType === 'Deposit' ? (
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
                                setWorkflowForm((form) => ({ ...form, customer: value.displayName }));
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  label="Received from"
                                  placeholder="Search QuickBooks customers"
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
                            <FormControl size="small" fullWidth>
                              <InputLabel shrink>Income category</InputLabel>
                              <Select
                                label="Income category"
                                value={workflowForm.categoryLabel}
                                displayEmpty
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, categoryLabel: String(event.target.value ?? '') }))}
                              >
                                <MenuItem value=""><em>— Select income category —</em></MenuItem>
                                {incomeCategoryPresets.map((preset) => (
                                  <MenuItem key={preset.id} value={preset.label}>{preset.label}</MenuItem>
                                ))}
                                <MenuItem value="__custom__" sx={{ fontStyle: 'italic' }}>+ Custom category…</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          {workflowForm.categoryLabel === '__custom__' ? (
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                size="small"
                                label="Custom income category"
                                value={workflowForm.customCategory}
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, customCategory: event.target.value }))}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                          ) : null}
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              size="small"
                              select={bankAccounts.length > 0}
                              label="Deposit to account"
                              placeholder="e.g. Checking xxx1234"
                              value={workflowForm.depositToAccount}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, depositToAccount: event.target.value }))}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              SelectProps={bankAccounts.length > 0 ? { displayEmpty: true } : undefined}
                            >
                              {bankAccounts.length > 0
                                ? [
                                    <MenuItem key="__none__" value="">
                                      <em>— Select bank account —</em>
                                    </MenuItem>,
                                    ...bankAccounts.map((account) => {
                                      const detail = account.detailType || account.type;
                                      return (
                                        <MenuItem key={account.id} value={account.id}>
                                          {detail ? `${account.name} · ${detail}` : account.name}
                                        </MenuItem>
                                      );
                                    })
                                  ]
                                : null}
                            </TextField>
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
                                setWorkflowForm((form) => ({ ...form, customer: value.displayName }));
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
                            <FormControl size="small" fullWidth>
                              <InputLabel shrink>Product / service item</InputLabel>
                              <Select
                                label="Product / service item"
                                value={workflowForm.itemLabel}
                                displayEmpty
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, itemLabel: String(event.target.value ?? '') }))}
                              >
                                <MenuItem value=""><em>— Select item —</em></MenuItem>
                                {salesReceiptItemPresets.map((item) => (
                                  <MenuItem key={item.id} value={item.label}>
                                    {item.label} · posts to {item.income}
                                  </MenuItem>
                                ))}
                                <MenuItem value="__custom__" sx={{ fontStyle: 'italic' }}>+ Custom item…</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          {workflowForm.itemLabel === '__custom__' ? (
                            <Grid size={{ xs: 12, md: 6 }}>
                              <TextField
                                size="small"
                                label="Custom item name"
                                value={workflowForm.customCategory}
                                onChange={(event) => setWorkflowForm((form) => ({ ...form, customCategory: event.target.value }))}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                          ) : null}
                          <Grid size={{ xs: 12, md: 6 }}>
                            <TextField
                              size="small"
                              select={bankAccounts.length > 0}
                              label="Deposit to account"
                              placeholder="e.g. Checking xxx1234 or Undeposited Funds"
                              value={workflowForm.depositToAccount}
                              onChange={(event) => setWorkflowForm((form) => ({ ...form, depositToAccount: event.target.value }))}
                              fullWidth
                              InputLabelProps={{ shrink: true }}
                              SelectProps={bankAccounts.length > 0 ? { displayEmpty: true } : undefined}
                            >
                              {bankAccounts.length > 0
                                ? [
                                    <MenuItem key="__none__" value="">
                                      <em>— Select bank account —</em>
                                    </MenuItem>,
                                    ...bankAccounts.map((account) => {
                                      const detail = account.detailType || account.type;
                                      return (
                                        <MenuItem key={account.id} value={account.id}>
                                          {detail ? `${account.name} · ${detail}` : account.name}
                                        </MenuItem>
                                      );
                                    })
                                  ]
                                : null}
                            </TextField>
                          </Grid>
                          <Grid size={{ xs: 12 }}>
                            <Alert severity="info" sx={{ py: 0.5 }}>
                              Use <strong>Manufacturer Buydown</strong> item for credits tied to vendor buydowns; the amount posts to the &ldquo;Manufacturer Buydown Income&rdquo; account the item maps to.
                            </Alert>
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
                                statement?.bankAccountId &&
                                workflowForm.transferFromAccount === statement.bankAccountId
                                  ? 'Defaulted to the bank chart account selected at upload.'
                                  : 'Choose the bank account that money is leaving.'
                              }
                              SelectProps={{ displayEmpty: true }}
                            >
                              <MenuItem value="">
                                <em>— Select bank account —</em>
                              </MenuItem>
                              {bankAccounts.map((account) => {
                                const detail = account.detailType || account.type;
                                return (
                                  <MenuItem key={`from-${account.id}`} value={account.id}>
                                    {detail ? `${account.name} · ${detail}` : account.name}
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
                                const detail = account.detailType || account.type;
                                return (
                                  <MenuItem key={`to-${account.id}`} value={account.id}>
                                    {detail ? `${account.name} · ${detail}` : account.name}
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
                                onClick={() => setWorkflowForm((form) => ({ ...form, categoryLabel: suggestion.label }))}
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

                  <Grid size={{ xs: 12 }}>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                        <Typography variant="overline" color="text.secondary">Rules &amp; reasons</Typography>
                        {editItem.source === 'transaction' ? (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => void createRuleFromEntry(editItem.id, 'soft')}
                            disabled={mutating}
                          >
                            Create rule from this
                          </Button>
                        ) : null}
                      </Stack>
                      {editItem.matchedRuleNames && editItem.matchedRuleNames.length > 0 ? (
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
                          {editItem.matchedRuleNames.map((name) => (
                            <Chip
                              key={name}
                              size="small"
                              label={name}
                              color={editItem.ruleHardness === 'hard' ? 'primary' : 'default'}
                              variant="outlined"
                            />
                          ))}
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                          No rules matched this row.
                        </Typography>
                      )}
                      {editItem.reasons && editItem.reasons.length > 0 ? (
                        <Stack spacing={0.25}>
                          {editItem.reasons.map((reason, idx) => (
                            <Typography key={`${reason}-${idx}`} variant="caption" color="text.secondary">
                              · {reason}
                            </Typography>
                          ))}
                        </Stack>
                      ) : null}
                    </Paper>
                  </Grid>
                </Grid>
              </Stack>
            ) : null}
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 2, py: 1 }}>
            <Button onClick={closeEditModal} color="inherit">Cancel</Button>
            <Stack direction="row" spacing={1}>
              <Button
                color="error"
                onClick={() => editItem && void updateSuggestionReviewStatus(editItem, 'excluded')}
                disabled={!editItem || mutating}
              >
                Exclude
              </Button>
              <Button
                onClick={() => void saveEditModal('save_next')}
                disabled={!editItem || mutating}
              >
                Approve &amp; Next
              </Button>
              <Button
                variant="contained"
                onClick={() => void saveEditModal('save')}
                disabled={!editItem || mutating}
              >
                Approve
              </Button>
            </Stack>
          </DialogActions>
        </Dialog>
      </Stack>
    );
  };

  const renderRulesBody = () => (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="subtitle2">Rules</Typography>
          <Chip size="small" variant="outlined" label={`${rules.length} configured`} />
        </Stack>
        {rules.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No rules yet. Create soft/hard rules from Suggestions to reduce repetitive review.
          </Typography>
        ) : (
          rules.slice(0, 50).map((rule) => (
            <Paper key={rule.id} variant="outlined" sx={{ p: 1, bgcolor: 'background.default' }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} justifyContent="space-between">
                <Stack spacing={0.25}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {rule.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {rule.conditions.contains ? `Contains "${rule.conditions.contains}"` : 'No contains filter'} •{' '}
                    {rule.conditions.direction ? `Direction ${rule.conditions.direction}` : 'Any direction'}
                  </Typography>
                </Stack>
                <Stack direction="row" spacing={0.75}>
                  <Chip size="small" color={rule.hardness === 'hard' ? 'warning' : 'default'} label={rule.hardness} />
                  <Chip size="small" variant="outlined" label={rule.action.type} />
                </Stack>
              </Stack>
            </Paper>
          ))
        )}
      </Stack>
    </Paper>
  );

  const overviewStats = useMemo(() => {
    const nonPostingRowTypes = new Set([
      'section_header',
      'beginning_balance',
      'ending_balance',
      'daily_balance',
      'summary_total',
      'noise'
    ]);
    const postingEntries = entries.filter((entry) => {
      if (entry.isPostingCandidate === false) return false;
      if (entry.rowType && nonPostingRowTypes.has(String(entry.rowType))) return false;
      return true;
    });
    const entryCount = postingEntries.length;
    const checkCount = checks.length;
    const creditTotal = postingEntries
      .filter((entry) => entry.type === 'credit')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amount ?? 0)), 0);
    const debitTotal = postingEntries
      .filter((entry) => entry.type === 'debit')
      .reduce((sum, entry) => sum + Math.abs(Number(entry.amount ?? 0)), 0);
    const startingBalance = liveMetrics?.startingBalance ?? null;
    const endingBalance = liveMetrics?.endingBalance ?? null;

    return {
      entryCount,
      checkCount,
      creditTotal,
      debitTotal,
      startingBalance,
      endingBalance
    };
  }, [checks.length, entries, liveMetrics]);

  const renderOverviewBody = () => (
    <Stack spacing={2}>
      {statement?.issues?.length ? (
        <Alert severity="error">
          {statement.issues.join(' | ')}
        </Alert>
      ) : null}
      {sortedChecks.some((check) => check.status === 'failed' && check.processing.lastError) ? (
        <Alert severity="error">
          {sortedChecks
            .filter((check) => check.status === 'failed' && check.processing.lastError)
            .slice(0, 3)
            .map((check) => check.processing.lastError)
            .join(' | ')}
        </Alert>
      ) : null}
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2">Statement summary</Typography>
        <Grid container spacing={1} sx={{ mt: 0.5 }}>
          <Grid size={{ xs: 6, md: 4 }}>
            <Paper
              data-testid="overview-card-entries"
              variant="outlined"
              onClick={() => setWorkspaceTab('suggestions')}
              sx={{ p: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Typography variant="caption" color="text.secondary">
                Entries
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {overviewStats.entryCount}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <Paper
              data-testid="overview-card-checks"
              variant="outlined"
              onClick={() => setWorkspaceTab('suggestions')}
              sx={{ p: 1.25, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
            >
              <Typography variant="caption" color="text.secondary">
                Checks
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {overviewStats.checkCount}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Starting
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {formatMoney(overviewStats.startingBalance)}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Ending
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {formatMoney(overviewStats.endingBalance)}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Credits
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {formatMoney(overviewStats.creditTotal)}
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <Paper variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" color="text.secondary">
                Debits
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {formatMoney(overviewStats.debitTotal)}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2">How this works</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Processing updates automatically. Use Suggestions to approve or exclude proposals. Use File Manager to
          inspect extracted files for troubleshooting or audits.
        </Typography>
      </Paper>
    </Stack>
  );

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
              {statement?.status === 'ready_for_review' ? (
                <Button variant="contained" onClick={() => navigate('/dashboard/accounting/ledger')}>
                  Open Ledger Review
                </Button>
              ) : null}
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


      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && !statement}
        loadingLabel="Loading statement..."
        emptyMessage="Statement not found"
      >
        {statement && (
          <>
            {statement.issues.length > 0 && <Alert severity="warning">{statement.issues.join(' | ')}</Alert>}

            <Grid container spacing={2} alignItems="stretch">
              <Grid size={{ xs: 12, lg: 12 }}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Stack spacing={2}>
                    <Typography variant="subtitle1">Workspace</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Use Artifacts to inspect extracted files, or Suggestions to review proposed accounting decisions.
                    </Typography>

                    <Divider />

                    <Tabs
                      value={workspaceTab}
                      onChange={(_, next: WorkspaceTab) => setWorkspaceTab(next)}
                    >
                      <Tab value="overview" label="Overview" />
                      <Tab value="suggestions" label="Suggestions" />
                      <Tab value="rules" label="Rules" />
                      <Tab value="artifacts" label="File Manager" />
                    </Tabs>

                    {workspaceTab === 'overview' ? renderOverviewBody() : null}
                    {workspaceTab === 'rules' ? renderRulesBody() : null}
                    {workspaceTab === 'artifacts' ? (
                      <>
                        <Grid container spacing={1.5}>
                          <Grid size={{ xs: 12, lg: 4 }}>
                            <Paper variant="outlined" sx={{ p: 1.25 }}>
                              <Stack spacing={1}>
                                <Typography variant="subtitle2">File Manager</Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Browse folders and open a file preview.
                                </Typography>
                                {artifactGroups.map((group) => (
                                  <Accordion
                                    key={group.folder}
                                    disableGutters
                                    defaultExpanded={group.items.some((item) => item.key === statementViewerTab)}
                                  >
                                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                      <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                          {group.folder}
                                        </Typography>
                                        <Chip size="small" variant="outlined" label={group.items.length} />
                                      </Stack>
                                    </AccordionSummary>
                                    <AccordionDetails>
                                      <Stack spacing={0.75}>
                                        {group.items.map((artifact) => (
                                          <Button
                                            key={artifact.key}
                                            size="small"
                                            variant={statementViewerTab === artifact.key ? 'contained' : 'outlined'}
                                            onClick={() => setStatementViewerTab(artifact.key)}
                                            sx={{ justifyContent: 'flex-start' }}
                                          >
                                            {artifact.label}
                                          </Button>
                                        ))}
                                      </Stack>
                                    </AccordionDetails>
                                  </Accordion>
                                ))}
                              </Stack>
                            </Paper>
                          </Grid>
                          <Grid size={{ xs: 12, lg: 8 }}>
                            <Paper variant="outlined" sx={{ p: 1.25 }}>
                              <Stack spacing={1}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                                  <Typography variant="subtitle2">Preview</Typography>
                                  {currentArtifact ? (
                                    <Chip size="small" variant="outlined" label={`Viewing: ${currentArtifact.label}`} />
                                  ) : null}
                                </Stack>
                                {renderViewerBody()}
                              </Stack>
                            </Paper>
                          </Grid>
                        </Grid>
                      </>
                    ) : null}

                    {workspaceTab === 'suggestions' ? renderSuggestionsBody() : null}
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
