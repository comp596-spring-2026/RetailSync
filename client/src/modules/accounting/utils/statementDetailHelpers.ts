import type {
  BankStatementDetail,
  QuickBooksHubChartAccount,
  StatementCheck,
  StatementSuggestionItem,
  StatementSuggestionsResponse
} from '@retailsync/shared';
import { formatDate } from '../../../utils/date';

export type StatementViewerTab = string;

export type ArtifactKind = 'blob' | 'text';
export type StepState = 'done' | 'active' | 'waiting' | 'failed';
export type WorkspaceTab = 'overview' | 'source_proof' | 'review_transactions';

export type ArtifactDescriptor<TTab extends string> = {
  key: TTab;
  label: string;
  path: string;
  kind: ArtifactKind;
  emptyMessage: string;
};

export const statusColor = (status: StatementCheck['status']) => {
  if (status === 'ready') return 'success';
  if (status === 'needs_review') return 'warning';
  if (status === 'failed') return 'error';
  if (status === 'processing') return 'info';
  return 'default';
};

export const formatMoney = (value?: number | null) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
};

export const formatMaybeDate = (value?: string | null) => {
  if (!value) return '-';
  return formatDate(value, 'short');
};

export const formatProgressSummary = (progress: BankStatementDetail['progress']) =>
  `${progress.completedChecks} done • ${progress.remainingChecks} left`;

export const formatStatusLabel = (value: string) =>
  value.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

export const isCheckSuggestionItem = (item: StatementSuggestionItem) =>
  item.source === 'check' ||
  item.rowType === 'check_cleared' ||
  item.section === 'checks_cleared' ||
  Boolean(item.checkNumber?.trim());

export const resolveLinkedCheck = (
  item: StatementSuggestionItem,
  checks: StatementCheck[]
): StatementCheck | undefined => {
  const linkedId = item.linkedCheckId ?? (item.source === 'check' ? item.id : undefined);
  if (!linkedId) return undefined;
  return checks.find((check) => check.id === linkedId);
};

export const resolveCheckNumberForReview = (
  item: StatementSuggestionItem,
  linkedCheck?: StatementCheck
): string => {
  const fromItem = item.checkNumber?.trim();
  if (fromItem) return fromItem;
  return (
    linkedCheck?.extracted?.checkNumber?.trim() ??
    linkedCheck?.autoFill?.checkNumber?.trim() ??
    ''
  );
};

/** QuickBooks entity ids are numeric; Mongo chart rows use 24-char hex. */
export const looksLikeQuickBooksRefId = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[0-9a-fA-F]{24}$/.test(trimmed) || /^\d+$/.test(trimmed);
};

export const resolveLineAccountRefFromPool = (
  pool: QuickBooksHubChartAccount[],
  args: {
    lineAccountRef: string;
    lineAccountInput?: string;
    categorySeed?: string;
    chartAccountRefValue: (account: QuickBooksHubChartAccount) => string;
  }
): string => {
  const seed =
    args.lineAccountRef.trim() ||
    String(args.lineAccountInput ?? '').trim() ||
    String(args.categorySeed ?? '').trim();
  if (!seed) return '';
  const normalizedSeed = seed.toLowerCase();
  const match = pool.find(
    (account) =>
      args.chartAccountRefValue(account) === seed ||
      account.id === seed ||
      account.name.trim().toLowerCase() === normalizedSeed
  );
  if (match) return args.chartAccountRefValue(match);
  if (pool.length === 0) return seed;
  if (looksLikeQuickBooksRefId(seed)) return seed;
  return '';
};

export const resolveCategoryAccountSeed = (
  item: StatementSuggestionItem,
  linkedCheck?: StatementCheck
): string =>
  item.categoryAccountId?.trim() ||
  linkedCheck?.proposal?.categoryAccountId?.trim() ||
  '';

export const resolvePayeeNameForReview = (
  item: StatementSuggestionItem,
  linkedCheck?: StatementCheck
): string =>
  item.payeeName?.trim() ||
  linkedCheck?.extracted?.payeeName?.trim() ||
  linkedCheck?.autoFill?.payeeName?.trim() ||
  linkedCheck?.proposal?.payeeName?.trim() ||
  '';

export const filterExpenseLineAccounts = (accounts: QuickBooksHubChartAccount[]) =>
  accounts.filter(
    (account) => account.type === 'expense' || String(account.type ?? '').toLowerCase().includes('expense')
  );

export const filterIncomeLineAccounts = (accounts: QuickBooksHubChartAccount[]) =>
  accounts.filter(
    (account) => account.type === 'revenue' || String(account.type ?? '').toLowerCase().includes('income')
  );

/** Accounts QuickBooks allows on a Deposit line (income, clearing, liability, equity, non-bank asset). */
export const filterDepositLineAccounts = (accounts: QuickBooksHubChartAccount[]) =>
  accounts.filter((account) => {
    const type = String(account.type ?? '').toLowerCase();
    const haystack = `${account.name ?? ''} ${account.detailType ?? ''}`.toLowerCase();
    if (haystack.includes('checking') || haystack.includes('savings') || /\bbank\b/.test(haystack)) {
      return false;
    }
    return (
      type === 'revenue' ||
      type === 'liability' ||
      type === 'equity' ||
      (type === 'asset' && !haystack.includes('receivable'))
    );
  });

export const formatDepositLineAccountLabel = (account: QuickBooksHubChartAccount) => {
  return account.name;
};

export const pickDefaultExpenseLineAccount = (
  accounts: QuickBooksHubChartAccount[]
): QuickBooksHubChartAccount | undefined => {
  const expenseAccounts = filterExpenseLineAccounts(accounts);
  if (expenseAccounts.length === 0) return undefined;
  const preferred = expenseAccounts.find((account) =>
    /(supplies|misc|general|uncategorized|operating|expense)/i.test(account.name)
  );
  return preferred ?? expenseAccounts[0];
};

export const pickDefaultIncomeLineAccount = (
  accounts: QuickBooksHubChartAccount[]
): QuickBooksHubChartAccount | undefined => {
  const incomeAccounts = filterIncomeLineAccounts(accounts);
  if (incomeAccounts.length === 0) return undefined;
  const preferred = incomeAccounts.find((account) =>
    /(sales|deposit|uncategorized|service|product|income)/i.test(account.name)
  );
  return preferred ?? incomeAccounts[0];
};

export const pickDefaultDepositLineAccount = (
  accounts: QuickBooksHubChartAccount[]
): QuickBooksHubChartAccount | undefined => {
  const depositLines = filterDepositLineAccounts(accounts);
  if (depositLines.length === 0) return undefined;
  const preferred = depositLines.find((account) =>
    /(sales|uncategorized|service|product|income|clearing|deposit)/i.test(account.name)
  );
  return preferred ?? depositLines[0];
};

export const isGenericBankDepositRow = (item: {
  direction?: string;
  description?: string;
  proposedTxnType?: string;
  transactionFamily?: string;
}) =>
  item.direction === 'credit' &&
  /\bdeposit\b/i.test(item.description ?? '') &&
  item.proposedTxnType !== 'Transfer' &&
  item.transactionFamily !== 'transfer';

export const getCheckSourceLabel = (check: StatementCheck) => {
  const source = check.extracted?.source;
  if (source) return source;
  if (check.autoFill) return 'legacy';
  return 'unknown';
};

export const getCheckArtifactFlags = (check: StatementCheck) => {
  const flags: string[] = [];
  if (check.artifacts?.pageNumber != null) flags.push(`Page ${check.artifacts.pageNumber}`);
  if (check.artifacts?.cropImagePath) flags.push('Crop ready');
  if (check.artifacts?.ocrTextPath || check.artifacts?.ocrJsonPath) flags.push('OCR ready');
  if (check.gcs.structuredPath) flags.push('Structured ready');
  if (check.processing.retryCount > 0) flags.push(`Retries ${check.processing.retryCount}`);
  return flags;
};

export const getProposalMode = (check: StatementCheck) => {
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

export const getProposalSummary = (check: StatementCheck) => {
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

export const isImagePath = (value: string) => /\.(png|jpe?g|webp)$/i.test(value);

export const formatArtifactText = (path: string, value: string) => {
  if (/\.json$/i.test(path)) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return value;
};

export const getStatementArtifactItems = (statement: BankStatementDetail) => {
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
    ['Extracted checks', artifacts.extractedChecksPath],
    ['Classification output', artifacts.classificationOutputPath],
    ['Suggestions output', artifacts.suggestionsOutputPath],
    ['Processing summary', artifacts.processingSummaryPath],
    ['Structured statement', artifacts.structuredStatementPath],
    ['Offline extraction', artifacts.offlineExtractionPath],
    ['Evidence', artifacts.evidencePath],
    ['Validation report', artifacts.validationReportPath]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
};

export const getStatementViewerArtifacts = (
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
      : null,
    artifacts?.classificationOutputPath
      ? {
          key: 'classificationOutput',
          label: 'Classification Output',
          path: artifacts.classificationOutputPath,
          kind: 'text',
          emptyMessage: 'Classification output is not ready yet.'
        }
      : null,
    artifacts?.suggestionsOutputPath
      ? {
          key: 'suggestionsOutput',
          label: 'Suggestions Output',
          path: artifacts.suggestionsOutputPath,
          kind: 'text',
          emptyMessage: 'Suggestions output is not ready yet.'
        }
      : null,
    artifacts?.processingSummaryPath
      ? {
          key: 'processingSummary',
          label: 'Processing Summary',
          path: artifacts.processingSummaryPath,
          kind: 'text',
          emptyMessage: 'Processing summary is not ready yet.'
        }
      : null,
    artifacts?.structuredStatementPath
      ? {
          key: 'structuredStatement',
          label: 'Structured Statement',
          path: artifacts.structuredStatementPath,
          kind: 'text',
          emptyMessage: 'Structured statement output is not ready yet.'
        }
      : null,
    artifacts?.offlineExtractionPath
      ? {
          key: 'offlineExtraction',
          label: 'Offline Extraction',
          path: artifacts.offlineExtractionPath,
          kind: 'text',
          emptyMessage: 'Offline extraction output is not ready yet.'
        }
      : null,
    artifacts?.evidencePath
      ? {
          key: 'evidence',
          label: 'Evidence',
          path: artifacts.evidencePath,
          kind: 'text',
          emptyMessage: 'Evidence output is not ready yet.'
        }
      : null,
    artifacts?.validationReportPath
      ? {
          key: 'validationReport',
          label: 'Validation Report',
          path: artifacts.validationReportPath,
          kind: 'text',
          emptyMessage: 'Validation report is not ready yet.'
        }
      : null
  ].filter((entry): entry is ArtifactDescriptor<StatementViewerTab> => Boolean(entry));
};

export const getProcessingActivityItems = (statement: BankStatementDetail) => {
  const timestamps = statement.artifacts?.stageTimestamps;

  return [
    ['Uploaded', timestamps?.uploadedAt],
    ['Extracting', timestamps?.extractingAt],
    ['Structuring', timestamps?.structuringAt],
    ['Checks queued', timestamps?.checksQueuedAt],
    ['Parser review', timestamps?.parserReviewAt],
    ['Ready for review', timestamps?.readyForReviewAt],
    ['Failed', timestamps?.failedAt]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
};

export const getStatementStepState = (
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
    'needs_parser_review',
    'ready_for_review'
  ];
  const currentIndex = order.indexOf(statement.status as Exclude<BankStatementDetail['status'], 'failed'>);
  const stepIndex = order.indexOf(step);

  if (currentIndex === -1 || stepIndex === -1) return 'waiting';
  if (stepIndex < currentIndex) return 'done';
  if (stepIndex === currentIndex) return 'active';
  return 'waiting';
};

export const getStatementProcessSteps = (statement: BankStatementDetail) => [
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
    key: 'needs_parser_review',
    label: 'Parser review required',
    detail: 'Validation mismatches were detected and require parser corrections.',
    state: getStatementStepState(statement, 'needs_parser_review'),
    timestamp: statement.artifacts?.stageTimestamps?.parserReviewAt
  },
  {
    key: 'ready_for_review',
    label: 'Ready for review',
    detail: 'Artifacts and check results are ready for accounting review.',
    state: getStatementStepState(statement, 'ready_for_review'),
    timestamp: statement.artifacts?.stageTimestamps?.readyForReviewAt
  }
];

export const getSelectedCheckPathItems = (check: StatementCheck | null) => {
  if (!check) return [];

  return [
    ['Front image', check.gcs.frontPath],
    ['Crop image', check.artifacts?.cropImagePath],
    ['OCR text', check.artifacts?.ocrTextPath],
    ['OCR JSON', check.artifacts?.ocrJsonPath],
    ['Structured JSON', check.gcs.structuredPath]
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
};

export const getSuggestionBucketSummary = (summary: StatementSuggestionsResponse['summary']) => [
  ['Deposits', summary.deposits],
  ['Expenses', summary.expenses],
  ['Transfers', summary.transfers],
  ['Checks', summary.checksSuggested],
  ['Needs review', summary.uncategorized]
];
