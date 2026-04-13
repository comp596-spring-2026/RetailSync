import {
  AccountingJobType,
  AccountingTaskPayload,
  accountingTaskPayloadSchema
} from '@retailsync/shared';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { setRequestContext } from '../config/requestContext';
import { getStorageClient } from '../integrations/google/storage.client';
import { BankStatement } from '../models/BankStatement';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { RunModel } from '../models/Run';
import { StatementCheckModel } from '../models/StatementCheck';
import { StatementTransactionModel } from '../models/StatementTransaction';
import {
  ocrStatementPages,
  type CheckRegionCandidate,
  type StatementPageObservation
} from '../services/accountingStatementOcrService';
import {
  buildCheckCropPath,
  buildCheckOcrPath,
  buildCheckStructuredPath,
  buildStatementChecksClearedTablePath,
  buildStatementExtractedChecksPath,
  buildGeminiPath,
  buildOcrPath,
  buildPageImagePath,
  buildStatementTransactionSectionsPath,
  buildStatementTransactionsTablePath,
  buildStatementOcrTextPath
} from '../services/accountingStorageService';
import { renderAndPersistStatementPages } from '../services/accountingPdfRenderService';
import { runStatementCheckExtraction } from '../services/accountingCheckExtractionService';
import { runAccountingGeminiProposal } from '../services/accountingGeminiProposalService';
import { buildMatchingProposal } from '../services/matchingEngine';
import {
  markQuickBooksSyncFailure,
  postApprovedLedgerEntriesToQuickBooks,
  syncQuickBooksReferenceData
} from '../services/quickbooksSyncService';

export type AccountingTaskRunResult = {
  taskId: string;
  companyId: string;
  statementId?: string;
  checkId?: string;
  jobType: AccountingJobType;
  status: 'completed' | 'failed';
  nextJobType?: AccountingJobType;
};

const nextJobMap: Partial<Record<AccountingJobType, AccountingJobType>> = {
  'statement.extract': 'statement.structure',
  'statement.structure': 'checks.spawn'
};

const statementJobTypes: AccountingJobType[] = [
  'statement.extract',
  'statement.structure',
  'checks.spawn',
  'check.process',
  'matching.refresh'
];

const syncJobTypes: AccountingJobType[] = [
  'quickbooks.refresh_reference_data',
  'quickbooks.post_approved'
];

const storage = getStorageClient();
const nowIso = () => new Date().toISOString();

const statementStageTimestampKeys = {
  uploaded: 'uploadedAt',
  extracting: 'extractingAt',
  structuring: 'structuringAt',
  checks_queued: 'checksQueuedAt',
  ready_for_review: 'readyForReviewAt',
  failed: 'failedAt'
} as const;

type StatementProgressCounts = {
  totalChecks?: number;
  checksQueued?: number;
  checksProcessing?: number;
  checksReady?: number;
  checksFailed?: number;
};

const buildStatementProgress = (phase: string, counts: StatementProgressCounts = {}) => {
  const totalChecks = Number(counts.totalChecks ?? 0);
  const checksQueued = Number(counts.checksQueued ?? 0);
  const checksProcessing = Number(counts.checksProcessing ?? 0);
  const checksReady = Number(counts.checksReady ?? 0);
  const checksFailed = Number(counts.checksFailed ?? 0);
  const completedChecks = checksReady + checksFailed;

  return {
    phase,
    totalChecks,
    checksQueued,
    checksProcessing,
    checksReady,
    checksFailed,
    completedChecks,
    remainingChecks: Math.max(totalChecks - completedChecks, 0)
  };
};

const mergeStageTimestamps = (
  existing: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined
) => ({
  ...(existing ?? {}),
  ...(patch ?? {})
});

const mergeStatementArtifacts = (statement: any, patch: Record<string, unknown>) => {
  const currentArtifacts = statement.artifacts ?? {};
  const nextArtifacts = {
    ...currentArtifacts,
    ...patch,
    stageTimestamps: mergeStageTimestamps(
      currentArtifacts.stageTimestamps,
      patch.stageTimestamps as Record<string, unknown> | undefined
    )
  };
  statement.artifacts = nextArtifacts;
  return nextArtifacts;
};

const mergeCheckArtifacts = (check: any, patch: Record<string, unknown>) => {
  const currentArtifacts = check.artifacts ?? {};
  const nextArtifacts = {
    ...currentArtifacts,
    ...patch,
    stageTimestamps: mergeStageTimestamps(
      currentArtifacts.stageTimestamps,
      patch.stageTimestamps as Record<string, unknown> | undefined
    )
  };
  check.artifacts = nextArtifacts;
  return nextArtifacts;
};

const mergeCheckProcessing = (check: any, patch: Record<string, unknown>) => {
  const currentProcessing = check.processing ?? {};
  const nextProcessing = {
    ...currentProcessing,
    ...patch
  };
  check.processing = nextProcessing;
  return nextProcessing;
};

const resolveStatementPageImagePath = (
  statement: any,
  rootPrefix: string,
  pageNumber?: number | null
) => {
  const pageImagePaths = Array.isArray(statement?.artifacts?.pageImagePaths)
    ? statement.artifacts.pageImagePaths.map((value: unknown) => String(value))
    : [];

  if (typeof pageNumber === 'number' && Number.isFinite(pageNumber) && pageNumber > 0) {
    return pageImagePaths[pageNumber - 1] ?? buildPageImagePath(rootPrefix, pageNumber);
  }

  return pageImagePaths[0] ?? buildPageImagePath(rootPrefix, 1);
};

const updateStatementStage = (
  statement: any,
  stage: keyof typeof statementStageTimestampKeys,
  patch: Record<string, unknown> = {}
) => {
  const timestampKey = statementStageTimestampKeys[stage];
  mergeStatementArtifacts(statement, {
    ...patch,
    stageTimestamps: {
      [timestampKey]: nowIso()
    }
  });
  statement.status = stage as any;
  return statement;
};

const updateStatementProgress = (statement: any, phase: string, counts?: StatementProgressCounts) => {
  statement.progress = buildStatementProgress(phase, counts ?? statement.progress ?? {});
  return statement.progress;
};

const ensureGcsConfigured = () => {
  if (!env.gcsBucketName) {
    throw new Error('GCS_BUCKET_NAME is required for accounting worker pipeline');
  }
  return env.gcsBucketName;
};

const saveJson = async (bucketName: string, objectPath: string, value: unknown) => {
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(JSON.stringify(value, null, 2), {
    contentType: 'application/json'
  });
};

const saveText = async (bucketName: string, objectPath: string, text: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  await file.save(text, {
    contentType: 'text/plain'
  });
};

const downloadFileAsText = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return buffer.toString('utf-8');
};

const downloadFileBuffer = async (bucketName: string, objectPath: string) => {
  const file = storage.bucket(bucketName).file(objectPath);
  const [buffer] = await file.download();
  return buffer;
};

const normalizeDate = (value: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slash) {
    const yearRaw = slash[3] ? slash[3] : new Date().getFullYear().toString();
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  return new Date().toISOString().slice(0, 10);
};

type ParsedTransaction = {
  localId: string;
  postDate: string;
  description: string;
  merchant: string;
  amount: number;
  type: 'debit' | 'credit';
  checkNumber?: string;
  sourceLocator: {
    rowIndex: number;
    pageNumber?: number;
    bbox?: [number, number, number, number];
  };
};

type StatementPageObservationWithRegions = StatementPageObservation & {
  checkRegions?: CheckRegionCandidate[];
};

const parseMoney = (value: string) => Number(String(value).replace(/[$,]/g, '').replace(/^\((.*)\)$/, '-$1'));

const normalizeText = (value: string) => String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const buildGeminiProposalKey = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_');

const buildStatementTransactionGeminiKey = (txn: ParsedTransaction) =>
  buildGeminiProposalKey(txn.localId);

const runGeminiProposalForMatching = async (args: {
  bucketName: string;
  rootPrefix: string;
  companyId: string;
  description: string;
  merchant?: string;
  amount: number;
  type: 'debit' | 'credit';
  statementMonth?: string;
  pageContext?: string;
  check?: {
    payeeName?: string;
    amount?: number;
    extracted?: {
      checkNumber?: string;
      date?: string;
      payeeName?: string;
      amount?: number;
      memo?: string;
    };
  };
  fallbackProposal: Awaited<ReturnType<typeof buildMatchingProposal>>;
  checkKey?: string;
  persistArtifacts?: boolean;
}) =>
  runAccountingGeminiProposal({
    companyId: args.companyId,
    description: args.description,
    merchant: args.merchant,
    amount: args.amount,
    type: args.type,
    statementMonth: args.statementMonth,
    pageContext: args.pageContext,
    check: args.check,
    fallbackProposal: args.fallbackProposal,
    checkKey: args.checkKey,
    persistArtifacts: args.persistArtifacts ?? true,
    bucketName: args.bucketName,
    rootPrefix: args.rootPrefix
  });

const scoreRegionForTransaction = (
  txn: ParsedTransaction,
  region: CheckRegionCandidate
) => {
  const regionText = normalizeText(region.text);
  let score = Number(region.score ?? 0);
  if (txn.checkNumber && regionText.includes(txn.checkNumber.toLowerCase())) {
    score += 5;
  }
  if (regionText.includes(txn.amount.toFixed(2)) || regionText.includes(txn.amount.toFixed(0))) {
    score += 3;
  }
  if (regionText.includes(normalizeText(txn.merchant)) || regionText.includes(normalizeText(txn.description))) {
    score += 2;
  }
  if (regionText.includes(normalizeText(txn.postDate))) {
    score += 1;
  }
  return score;
};

const findBestRegionForTransaction = (
  txn: ParsedTransaction,
  regions: CheckRegionCandidate[] = []
) => {
  let best: CheckRegionCandidate | null = null;
  let bestScore = 0;
  for (const region of regions) {
    const score = scoreRegionForTransaction(txn, region);
    if (score > bestScore) {
      best = region;
      bestScore = score;
    }
  }
  return best;
};

const parseTransactionsFromPage = (page: StatementPageObservation) => {
  const lines = page.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 500);

  const transactions: ParsedTransaction[] = [];
  const pattern =
    /(?<date>\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?).*?(?<amount>-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\$?\d+(?:\.\d{2}))/;
  const checkPattern = /check\s*#?\s*(\d{2,8})/i;

  lines.forEach((line, index) => {
    const match = line.match(pattern);
    if (!match?.groups) return;

    const amountNumeric = parseMoney(match.groups.amount);
    if (!Number.isFinite(amountNumeric)) return;

    const checkMatch = line.match(checkPattern);
    const checkNumber = checkMatch ? String(checkMatch[1]) : undefined;
    const description = line.slice(0, 140);
    const merchant = description
      .replace(match.groups.date, '')
      .replace(match.groups.amount, '')
      .trim()
      .slice(0, 80);

    transactions.push({
      localId: `txn-${page.pageNumber}-${index + 1}`,
      postDate: normalizeDate(match.groups.date),
      description,
      merchant,
      amount: Math.abs(amountNumeric),
      type: amountNumeric < 0 ? 'debit' : 'credit',
      checkNumber,
      sourceLocator: { rowIndex: index, pageNumber: page.pageNumber }
    });
  });

  return transactions;
};

const parseTransactionsFromOcrPages = (pages: StatementPageObservationWithRegions[]) => {
  const transactions: ParsedTransaction[] = [];

  for (const page of pages) {
    const pageTransactions = parseTransactionsFromPage(page);
    for (const txn of pageTransactions) {
      const bestRegion = findBestRegionForTransaction(txn, page.checkRegions);
      if (bestRegion) {
        txn.sourceLocator.bbox = [
          bestRegion.bbox.left,
          bestRegion.bbox.top,
          bestRegion.bbox.right,
          bestRegion.bbox.bottom
        ];
      }
      transactions.push(txn);
    }
  }

  return transactions.slice(0, 500);
};

const buildTransactionSections = (transactions: ParsedTransaction[]) => {
  const byPage = new Map<number, ParsedTransaction[]>();
  for (const txn of transactions) {
    const pageNumber = Number(txn.sourceLocator.pageNumber ?? 1);
    const pageTransactions = byPage.get(pageNumber) ?? [];
    pageTransactions.push(txn);
    byPage.set(pageNumber, pageTransactions);
  }

  return Array.from(byPage.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([pageNumber, pageTransactions]) => ({
      pageNumber,
      transactionCount: pageTransactions.length,
      firstRowIndex: Math.min(...pageTransactions.map((txn) => Number(txn.sourceLocator.rowIndex ?? 0))),
      lastRowIndex: Math.max(...pageTransactions.map((txn) => Number(txn.sourceLocator.rowIndex ?? 0)))
    }));
};

const buildChecksClearedRows = (transactions: ParsedTransaction[]) =>
  transactions
    .filter((txn) => typeof txn.checkNumber === 'string' && txn.checkNumber.trim().length > 0)
    .map((txn) => ({
      localId: txn.localId,
      pageNumber: txn.sourceLocator.pageNumber ?? null,
      postDate: txn.postDate,
      checkNumber: txn.checkNumber,
      description: txn.description,
      merchant: txn.merchant,
      amount: txn.amount,
      type: txn.type,
      bbox: txn.sourceLocator.bbox ?? undefined
    }));

const saveExtractedChecksArtifact = async (args: {
  bucketName: string;
  companyId: string;
  statementId: string;
  rootPrefix: string;
}) => {
  const extractedChecksPath = buildStatementExtractedChecksPath(args.rootPrefix);
  const checks = await StatementCheckModel.find({
    companyId: args.companyId,
    statementId: args.statementId
  })
    .sort({ createdAt: 1 })
    .lean();

  await saveJson(
    args.bucketName,
    extractedChecksPath,
    checks.map((check) => ({
      id: String(check._id),
      status: check.status,
      pageNumber: check.artifacts?.pageNumber ?? undefined,
      cropBBox: Array.isArray(check.artifacts?.cropBBox) ? check.artifacts.cropBBox : undefined,
      cropImagePath: check.artifacts?.cropImagePath ?? check.gcs?.frontPath ?? undefined,
      ocrTextPath: check.artifacts?.ocrTextPath ?? undefined,
      ocrJsonPath: check.artifacts?.ocrJsonPath ?? check.gcs?.ocrPath ?? undefined,
      structuredPath: check.artifacts?.structuredPath ?? check.gcs?.structuredPath ?? undefined,
      geminiPath: check.artifacts?.geminiPath ?? undefined,
      extracted: check.extracted ?? undefined,
      autoFill: check.autoFill ?? undefined,
      confidence: check.confidence ?? undefined,
      match: check.match ?? undefined,
      processing: check.processing ?? undefined
    }))
  );

  return extractedChecksPath;
};

const detectStatementMonthEvidence = (pages: StatementPageObservation[]) => {
  const evidence: Array<{
    pageNumber: number;
    date: string;
    month: string;
    snippet: string;
  }> = [];

  for (const page of pages) {
    const lines = page.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const match = line.match(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|20\d{2}-\d{2}-\d{2})\b/);
      if (!match?.[0]) continue;
      const detected = normalizeDate(match[0]);
      if (!detected) continue;
      evidence.push({
        pageNumber: page.pageNumber,
        date: detected,
        month: detected.slice(0, 7),
        snippet: line.slice(0, 240)
      });
    }
  }

  const first = evidence[0];
  return {
    detectedStatementDate: first?.date,
    detectedStatementMonth: first?.month,
    evidence
  };
};

const readStatementOcrPages = async (bucketName: string, ocrPath: string) => {
  const raw = await downloadFileAsText(bucketName, ocrPath);
  const payload = JSON.parse(raw) as {
    pages?: StatementPageObservationWithRegions[];
    combinedText?: string;
  };

  const pages = Array.isArray(payload.pages) ? payload.pages : [];
  if (pages.length === 0) {
    return { pages: [] as StatementPageObservation[], combinedText: payload.combinedText ?? '' };
  }

  return {
    pages: pages.map((page) => ({
      ...page,
      pageNumber: Number(page.pageNumber),
      checkRegions: Array.isArray(page.checkRegions) ? page.checkRegions : []
    })),
    combinedText: payload.combinedText ?? pages.map((page) => page.text).join('\n\n')
  };
};

const updateStatementProgressFromChecks = async (companyId: string, statementId: string) => {
  const [queued, processing, ready, needsReview, failed, total] = await Promise.all([
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'queued' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'processing' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'ready' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'needs_review' }),
    StatementCheckModel.countDocuments({ companyId, statementId, status: 'failed' }),
    StatementCheckModel.countDocuments({ companyId, statementId })
  ]);

  const statement = await BankStatement.findOne({ _id: statementId, companyId });
  if (!statement) return;

  const nextStatus =
    total > 0 && queued === 0 && processing === 0
      ? 'ready_for_review'
      : total === 0 && statement.status === 'checks_queued'
        ? 'ready_for_review'
        : statement.status;

  updateStatementProgress(statement, nextStatus, {
    totalChecks: total,
    checksQueued: queued,
    checksProcessing: processing,
    checksReady: ready + needsReview,
    checksFailed: failed
  });

  if (nextStatus !== statement.status) {
    updateStatementStage(statement, nextStatus as keyof typeof statementStageTimestampKeys);
  } else if (nextStatus === 'ready_for_review') {
    mergeStatementArtifacts(statement, {
      stageTimestamps: {
        readyForReviewAt:
          statement.artifacts?.stageTimestamps?.readyForReviewAt ?? nowIso()
      }
    });
    statement.status = 'ready_for_review' as any;
  }

  await statement.save();
};

const createRun = async (payload: AccountingTaskPayload) => {
  const runType = syncJobTypes.includes(payload.jobType) ? 'sync' : 'pipeline';
  const run = await RunModel.create({
    companyId: payload.companyId,
    statementId: payload.statementId,
    runType,
    job: payload.jobType,
    status: 'running',
    traceId: String(payload.meta.traceId ?? payload.meta.taskId ?? ''),
    errors: []
  });
  return run;
};

const completeRun = async (
  runId: string,
  status: 'success' | 'failed',
  details?: {
    errors?: string[];
    artifacts?: Record<string, string>;
    metrics?: Record<string, unknown>;
  }
) => {
  await RunModel.updateOne(
    { _id: runId },
    {
      $set: {
        status,
        errors: details?.errors ?? [],
        artifacts: details?.artifacts,
        metrics: details?.metrics
      }
    }
  );
};

const runTaskLogic = async (payload: AccountingTaskPayload) => {
  const bucketName = ensureGcsConfigured();
  const statement = payload.statementId
    ? await BankStatement.findOne({
      _id: payload.statementId,
      companyId: payload.companyId
    })
    : null;

  const artifacts: Record<string, string> = {};

  switch (payload.jobType) {
    case 'statement.extract': {
      if (!statement || !payload.statementId) {
        throw new Error('statement.extract requires a valid statementId');
      }
      const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
      const pdfPath = String(statement.gcs?.pdfPath ?? '');
      if (!rootPrefix || !pdfPath) {
        throw new Error('Statement is missing gcs.rootPrefix or gcs.pdfPath');
      }
      updateStatementStage(statement, 'extracting', {
        stageTimestamps: {
          extractingAt: nowIso()
        }
      });
      updateStatementProgress(statement, 'extracting', statement.progress);
      await statement.save();

      const pdfBuffer = await downloadFileBuffer(bucketName, pdfPath);
      const rendered = await renderAndPersistStatementPages({
        bucketName,
        rootPrefix,
        pdfBuffer
      });
      const ocrPages = await ocrStatementPages(
        rendered.pages.map((page) => ({
          pageNumber: page.pageNo,
          imageBuffer: page.buffer,
          mimeType: 'image/png'
        }))
      );
      const combinedText = ocrPages.map((page) => page.text).filter(Boolean).join('\n\n');
      const detection = detectStatementMonthEvidence(ocrPages);

      const ocrJsonPath = buildOcrPath(rootPrefix, 'docai.json');
      const ocrTextPath = buildStatementOcrTextPath(rootPrefix, 'text.txt');
      await saveJson(bucketName, ocrJsonPath, {
        provider: 'vision',
        extractedAt: nowIso(),
        pages: ocrPages,
        combinedText,
        detection: {
          ...detection,
          evidence: JSON.stringify(detection.evidence)
        }
      });
      await saveText(bucketName, ocrTextPath, combinedText);

      mergeStatementArtifacts(statement, {
        pageImagePaths: rendered.pageImagePaths,
        ocrPath: ocrJsonPath,
        ocrTextPath,
        detectedStatementDate: detection.detectedStatementDate,
        detectedStatementMonth: detection.detectedStatementMonth,
        autoAppliedStatementMonth: Boolean(detection.detectedStatementMonth),
        detectionEvidence: JSON.stringify(detection.evidence),
        stageTimestamps: {
          extractingAt: statement.artifacts?.stageTimestamps?.extractingAt ?? nowIso(),
          structuringAt: nowIso()
        }
      });
      updateStatementProgress(statement, 'structuring', statement.progress);
      statement.status = 'structuring' as any;
      await statement.save();

      artifacts.statementPageImages = rendered.pageImagePaths.join(',');
      artifacts.statementOcr = ocrJsonPath;
      artifacts.statementOcrText = ocrTextPath;
      return { artifacts };
    }
    case 'statement.structure': {
      if (!statement || !payload.statementId) {
        throw new Error('statement.structure requires a valid statementId');
      }
      const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
      const pdfPath = String(statement.gcs?.pdfPath ?? '');
      if (!rootPrefix || !pdfPath) {
        throw new Error('Statement is missing gcs.rootPrefix or gcs.pdfPath');
      }
      updateStatementStage(statement, 'structuring', {
        stageTimestamps: {
          structuringAt: nowIso()
        }
      });
      updateStatementProgress(statement, 'structuring', statement.progress);
      await statement.save();

      const ocrPath = String(statement.artifacts?.ocrPath ?? buildOcrPath(rootPrefix, 'docai.json'));
      const ocrTextPath = String(
        statement.artifacts?.ocrTextPath ?? buildStatementOcrTextPath(rootPrefix, 'text.txt')
      );
      const { pages: ocrPages, combinedText } = await readStatementOcrPages(bucketName, ocrPath);
      const parsed = parseTransactionsFromOcrPages(ocrPages);
      const transactionSections = buildTransactionSections(parsed);
      const checksClearedRows = buildChecksClearedRows(parsed);
      const statementMonth = String(
        statement.statementMonth ?? statement.artifacts?.detectedStatementMonth ?? ''
      );

      const normalizedPath = buildGeminiPath(rootPrefix, 'normalized.v1.json');
      const transactionsTablePath = buildStatementTransactionsTablePath(rootPrefix);
      const checksClearedTablePath = buildStatementChecksClearedTablePath(rootPrefix);
      const transactionSectionsPath = buildStatementTransactionSectionsPath(rootPrefix);
      await saveJson(bucketName, normalizedPath, {
        schemaVersion: 'v1',
        statementId: payload.statementId,
        statementMonth: statementMonth || undefined,
        combinedText,
        detectionEvidence: statement.artifacts?.detectionEvidence ?? [],
        transactionCount: parsed.length,
        transactions: parsed
      });
      await Promise.all([
        saveJson(bucketName, transactionsTablePath, parsed),
        saveJson(bucketName, checksClearedTablePath, checksClearedRows),
        saveJson(bucketName, transactionSectionsPath, transactionSections)
      ]);

      await Promise.all([
        StatementTransactionModel.deleteMany({
          companyId: payload.companyId,
          statementId: payload.statementId
        }),
        LedgerEntryModel.deleteMany({
          companyId: payload.companyId,
          statementId: payload.statementId
        })
      ]);

      const pageImagePaths = Array.isArray(statement.artifacts?.pageImagePaths)
        ? statement.artifacts.pageImagePaths.map((value: unknown) => String(value))
        : [];

      for (const txn of parsed) {
        const fallbackProposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          check: txn.checkNumber
            ? {
                payeeName: txn.merchant ?? txn.description,
                amount: txn.amount,
                extracted: {
                  checkNumber: txn.checkNumber,
                  date: txn.postDate,
                  payeeName: txn.merchant ?? txn.description,
                  amount: txn.amount,
                  memo: txn.description
                }
              }
            : undefined
        });

        const geminiResult = await runGeminiProposalForMatching({
          bucketName,
          rootPrefix,
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          statementMonth: statementMonth || undefined,
          pageContext: [txn.merchant, txn.description, txn.checkNumber].filter(Boolean).join(' '),
          check: txn.checkNumber
            ? {
                payeeName: txn.merchant ?? txn.description,
                amount: txn.amount,
                extracted: {
                  checkNumber: txn.checkNumber,
                  date: txn.postDate,
                  payeeName: txn.merchant ?? txn.description,
                  amount: txn.amount,
                  memo: txn.description
                }
              }
            : undefined,
          fallbackProposal,
          checkKey: buildStatementTransactionGeminiKey(txn),
          persistArtifacts: true
        });

        const proposal = geminiResult.proposal;

        const pageImagePath = resolveStatementPageImagePath(
          statement,
          rootPrefix,
          txn.sourceLocator.pageNumber
        );

        const createdTxn = await StatementTransactionModel.create({
          statementId: payload.statementId,
          companyId: payload.companyId,
          postDate: txn.postDate,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          checkNumber: txn.checkNumber,
          statementCheckId: undefined,
          sourceLocator: txn.sourceLocator,
          evidence: {
            statementPdfPath: pdfPath,
            pageImagePath,
            geminiPath: geminiResult.artifacts.normalizedPath
          },
          proposal: {
            ...proposal,
            status: 'proposed'
          },
          reviewStatus: 'proposed',
          posting: {
            status: 'not_posted'
          }
        });

        await LedgerEntryModel.create({
          companyId: payload.companyId,
          sourceType: 'statement',
          statementId: payload.statementId,
          statementTransactionId: createdTxn._id.toString(),
          date: txn.postDate,
          description: txn.description,
          merchant: txn.merchant,
          amount: txn.amount,
          type: txn.type,
          attachments: {
            statementPdfPath: pdfPath,
            statementPageImagePath: pageImagePath,
            geminiPath: geminiResult.artifacts.normalizedPath
          },
          confidence: {
            overall: proposal.confidence,
            crossValidation: proposal.confidence
          },
          proposal: {
            ...proposal,
            status: 'proposed'
          },
          reviewStatus: 'proposed',
          posting: {
            status: 'not_posted'
          }
        });
      }

      mergeStatementArtifacts(statement, {
        pageImagePaths: pageImagePaths.length > 0 ? pageImagePaths : statement.artifacts?.pageImagePaths ?? [],
        ocrPath,
        ocrTextPath,
        transactionsTablePath,
        checksClearedTablePath,
        transactionSectionsPath,
        geminiPath: normalizedPath,
        stageTimestamps: {
          structuringAt: statement.artifacts?.stageTimestamps?.structuringAt ?? nowIso()
        }
      });
      updateStatementProgress(statement, 'checks_queued', {
        totalChecks: 0,
        checksQueued: 0,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      });
      statement.status = 'checks_queued' as any;
      await statement.save();

      artifacts.normalized = normalizedPath;
      artifacts.transactionsTable = transactionsTablePath;
      artifacts.checksClearedTable = checksClearedTablePath;
      artifacts.transactionSections = transactionSectionsPath;
      artifacts.statementOcrText = ocrTextPath;
      return { artifacts };
    }
    case 'checks.spawn': {
      if (!statement || !payload.statementId) {
        throw new Error('checks.spawn requires a valid statementId');
      }
      const rootPrefix = String(statement.gcs?.rootPrefix ?? '');
      if (!rootPrefix) {
        throw new Error('Statement is missing gcs.rootPrefix');
      }

      await StatementCheckModel.deleteMany({
        companyId: payload.companyId,
        statementId: payload.statementId
      });

      const transactions = await StatementTransactionModel.find({
        companyId: payload.companyId,
        statementId: payload.statementId
      })
        .sort({ postDate: 1, createdAt: 1 })
        .lean();

      const candidates = transactions.filter((txn) => {
        if (txn.checkNumber && String(txn.checkNumber).trim()) return true;
        const text = `${txn.description ?? ''} ${txn.merchant ?? ''}`.toLowerCase();
        return /\bcheck\b|pay to the order|micr|cheque|payroll/.test(text);
      });

      const checks = [] as Array<{ id: string; frontPath: string }>;
      const queuedAt = nowIso();
      for (let index = 0; index < candidates.length; index += 1) {
        const txn = candidates[index];
        const checkId = new Types.ObjectId().toString();
        const frontPath = buildCheckCropPath(rootPrefix, checkId, 'front.png');
        const cropBBox = txn.sourceLocator?.bbox
          ? [txn.sourceLocator.bbox[0], txn.sourceLocator.bbox[1], txn.sourceLocator.bbox[2], txn.sourceLocator.bbox[3]]
          : undefined;

        const created = await StatementCheckModel.create({
          _id: checkId,
          statementId: payload.statementId,
          companyId: payload.companyId,
          status: 'queued',
          artifacts: {
            pageNumber:
              txn.sourceLocator?.pageNumber != null ? Number(txn.sourceLocator.pageNumber) : undefined,
            cropBBox,
            cropImagePath: frontPath,
            stageTimestamps: {
              queuedAt
            }
          },
          extracted: {
            checkNumber: txn.checkNumber ?? undefined,
            date: txn.postDate ?? undefined,
            payeeName: txn.merchant ?? txn.description ?? undefined,
            amount: txn.amount != null ? Number(txn.amount) : undefined,
            memo: txn.description ?? undefined,
            source: 'deterministic'
          },
          processing: {
            retryCount: 0,
            queuedAt,
            processedAt: undefined
          },
          gcs: {
            frontPath
          },
          match: {
            statementTransactionId: txn._id.toString(),
            reasons: ['Seeded from statement row check candidate'],
            matchConfidence: 0.55
          }
        });

        checks.push({ id: created._id.toString(), frontPath });
      }

      mergeStatementArtifacts(statement, {
        stageTimestamps: {
          checksQueuedAt: checks.length > 0 ? queuedAt : undefined,
          readyForReviewAt: checks.length === 0 ? queuedAt : undefined
        }
      });
      updateStatementProgress(statement, checks.length > 0 ? 'checks_queued' : 'ready_for_review', {
        totalChecks: checks.length,
        checksQueued: checks.length,
        checksProcessing: 0,
        checksReady: 0,
        checksFailed: 0
      });
      statement.status = checks.length > 0 ? ('checks_queued' as any) : ('ready_for_review' as any);
      await statement.save();

      if (checks.length > 0) {
        const { enqueueAccountingJob } = await import('./accountingQueue');
        for (const check of checks) {
          await enqueueAccountingJob({
            companyId: payload.companyId,
            statementId: payload.statementId,
            checkId: check.id,
            jobType: 'check.process',
            meta: {
              parentJob: 'checks.spawn'
            }
          });
        }
      }

      const extractedChecksPath = await saveExtractedChecksArtifact({
        bucketName,
        companyId: payload.companyId,
        statementId: payload.statementId,
        rootPrefix
      });
      mergeStatementArtifacts(statement, {
        extractedChecksPath
      });
      await statement.save();

      artifacts.checks = checks.map((check) => check.frontPath).join(',');
      artifacts.extractedChecks = extractedChecksPath;
      artifacts.statementChecksQueuedAt = queuedAt;
      return {
        artifacts,
        metrics: {
          checksSpawned: checks.length
        }
      };
    }
    case 'check.process': {
      if (!payload.statementId || !payload.checkId) {
        throw new Error('check.process requires statementId and checkId');
      }
      const parentStatement = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      const rootPrefix = String(parentStatement?.gcs?.rootPrefix ?? '');
      if (!rootPrefix) {
        throw new Error('Statement missing rootPrefix for check.process');
      }

      const check = await StatementCheckModel.findOne({
        _id: payload.checkId,
        statementId: payload.statementId,
        companyId: payload.companyId
      });
      if (!check) {
        throw new Error('Check not found for check.process');
      }

      const processingAt = nowIso();
      mergeCheckArtifacts(check, {
        cropImagePath: check.artifacts?.cropImagePath ?? check.gcs?.frontPath ?? undefined,
        stageTimestamps: {
          processingAt
        }
      });
      mergeCheckProcessing(check, {
        processingAt,
        queuedAt: check.processing?.queuedAt ?? processingAt
      });
      check.status = 'processing' as any;
      await check.save();
      await updateStatementProgressFromChecks(payload.companyId, payload.statementId);

      const statementTxn = check.match?.statementTransactionId
        ? await StatementTransactionModel.findOne({
          _id: check.match.statementTransactionId,
          companyId: payload.companyId,
          statementId: payload.statementId
        })
        : null;
      const cropBox = check.artifacts?.cropBBox
        ? {
          left: Number(check.artifacts.cropBBox[0]),
          top: Number(check.artifacts.cropBBox[1]),
          right: Number(check.artifacts.cropBBox[2]),
          bottom: Number(check.artifacts.cropBBox[3])
        }
        : statementTxn?.sourceLocator?.bbox
          ? {
            left: Number(statementTxn.sourceLocator.bbox[0]),
            top: Number(statementTxn.sourceLocator.bbox[1]),
            right: Number(statementTxn.sourceLocator.bbox[2]),
            bottom: Number(statementTxn.sourceLocator.bbox[3])
          }
          : null;

      if (!cropBox) {
        throw new Error('Check crop box is missing for check.process');
      }

      const pdfBuffer = await downloadFileBuffer(bucketName, String(parentStatement?.gcs?.pdfPath ?? ''));
      const extraction = await runStatementCheckExtraction({
        pdfBuffer,
        pageNumber: Number(check.artifacts?.pageNumber ?? statementTxn?.sourceLocator?.pageNumber ?? 1),
        cropBox,
        checkKey: check._id.toString(),
        pageContext: [statementTxn?.merchant, statementTxn?.description].filter(Boolean).join(' '),
        bucketName,
        rootPrefix,
        persistArtifacts: true
      });

      const ocrPath = extraction.artifacts.ocrJsonPath ?? buildCheckOcrPath(rootPrefix, check._id.toString());
      const ocrTextPath = extraction.artifacts.ocrTextPath ?? buildCheckOcrPath(rootPrefix, check._id.toString(), 'ocr.txt');
      const structuredPath = extraction.artifacts.structuredPath ?? buildCheckStructuredPath(rootPrefix, check._id.toString());
      const frontPath = extraction.artifacts.cropImagePath ?? check.gcs?.frontPath ?? buildCheckCropPath(rootPrefix, check._id.toString(), 'front.png');

      const extracted = {
        checkNumber: extraction.extracted.checkNumber ?? statementTxn?.checkNumber ?? check.extracted?.checkNumber,
        date: extraction.extracted.date ?? statementTxn?.postDate ?? check.extracted?.date,
        payeeName: extraction.extracted.payeeName ?? statementTxn?.merchant ?? statementTxn?.description ?? check.extracted?.payeeName,
        amount: extraction.extracted.amount ?? statementTxn?.amount ?? check.extracted?.amount,
        memo: extraction.extracted.memo ?? statementTxn?.description ?? check.extracted?.memo
      };
      const autoFill = { ...extracted };
      const confidence = extraction.confidence;

      const checkGcs: any = check.gcs ?? ((check.gcs = { frontPath } as any), check.gcs);
      checkGcs.frontPath = frontPath;
      checkGcs.ocrPath = ocrPath;
      checkGcs.structuredPath = structuredPath;

      mergeCheckArtifacts(check, {
        pageNumber: Number(check.artifacts?.pageNumber ?? statementTxn?.sourceLocator?.pageNumber ?? 1),
        cropBBox: [cropBox.left, cropBox.top, cropBox.right, cropBox.bottom],
        cropImagePath: frontPath,
        ocrTextPath,
        ocrJsonPath: ocrPath,
        structuredPath,
        stageTimestamps: {
          processingAt,
          processedAt: nowIso()
        }
      });
      mergeCheckProcessing(check, {
        processedAt: nowIso(),
        lastError: undefined
      });
      check.extracted = {
        checkNumber: extracted.checkNumber ?? undefined,
        date: extracted.date ?? undefined,
        payeeName: extracted.payeeName ?? undefined,
        amount: extracted.amount ?? undefined,
        memo: extracted.memo ?? undefined,
        source: extraction.extracted.source
      } as any;
      check.autoFill = autoFill as any;
      check.confidence = confidence as any;
      check.match = {
        ...(check.match ?? {}),
        statementTransactionId: statementTxn?._id?.toString() ?? check.match?.statementTransactionId,
        matchConfidence: statementTxn ? 0.92 : 0.58,
        reasons: [
          ...extraction.reasons,
          statementTxn ? 'Matched from statement transaction candidate' : 'No strong transaction candidate found'
        ]
      } as any;
      check.status = confidence.overall >= 0.75 ? ('ready' as any) : ('needs_review' as any);
      await check.save();

      const proposalSource = statementTxn ?? {
        description: extracted.memo ?? check.extracted?.memo ?? extracted.payeeName ?? 'Bank statement check',
        merchant: extracted.payeeName ?? check.extracted?.payeeName ?? undefined,
        amount: Number(extracted.amount ?? check.extracted?.amount ?? 0),
        type: 'debit' as const
      };

      const fallbackProposal = await buildMatchingProposal({
        companyId: payload.companyId,
        description: proposalSource.description,
        merchant: proposalSource.merchant ?? undefined,
        amount: proposalSource.amount,
        type: proposalSource.type,
        check: {
          payeeName: extracted.payeeName ?? undefined,
          amount: extracted.amount ?? undefined,
          extracted: {
            checkNumber: extracted.checkNumber ?? undefined,
            date: extracted.date ?? undefined,
            payeeName: extracted.payeeName ?? undefined,
            amount: extracted.amount ?? undefined,
            memo: extracted.memo ?? undefined
          }
        }
      });

      const geminiResult = await runGeminiProposalForMatching({
        bucketName,
        rootPrefix,
        companyId: payload.companyId,
        description: proposalSource.description,
        merchant: proposalSource.merchant ?? undefined,
        amount: proposalSource.amount,
        type: proposalSource.type,
        statementMonth: parentStatement?.statementMonth ?? statementTxn?.postDate?.slice(0, 7) ?? undefined,
        pageContext: [proposalSource.merchant, proposalSource.description, extracted.checkNumber].filter(Boolean).join(' '),
        check: {
          payeeName: extracted.payeeName ?? undefined,
          amount: extracted.amount ?? undefined,
          extracted: {
            checkNumber: extracted.checkNumber ?? undefined,
            date: extracted.date ?? undefined,
            payeeName: extracted.payeeName ?? undefined,
            amount: extracted.amount ?? undefined,
            memo: extracted.memo ?? undefined
          }
        },
        fallbackProposal,
        checkKey: check._id.toString(),
        persistArtifacts: true
      });
      const proposal = geminiResult.proposal;

      mergeCheckArtifacts(check, {
        geminiPath: geminiResult.artifacts.normalizedPath ?? check.artifacts?.geminiPath ?? undefined
      });

      check.match = {
        ...(check.match ?? {}),
        statementTransactionId: statementTxn?._id?.toString() ?? check.match?.statementTransactionId,
        matchConfidence: statementTxn ? 0.92 : 0.58,
        reasons: Array.from(
          new Set([
            ...extraction.reasons,
            ...(geminiResult.reasons ?? []),
            statementTxn ? 'Matched from statement transaction candidate' : 'No strong transaction candidate found'
          ])
        )
      } as any;
      await check.save();

      if (statementTxn) {
        await Promise.all([
          StatementTransactionModel.updateOne(
            { _id: statementTxn._id, companyId: payload.companyId },
            {
              $set: {
                statementCheckId: check._id.toString(),
                evidence: {
                  statementPdfPath: statementTxn.evidence?.statementPdfPath ?? parentStatement?.gcs?.pdfPath ?? undefined,
                  pageImagePath: statementTxn.evidence?.pageImagePath ?? resolveStatementPageImagePath(parentStatement, rootPrefix, statementTxn.sourceLocator?.pageNumber),
                  checkCropPath: frontPath,
                  ocrPath,
                  geminiPath: geminiResult.artifacts.normalizedPath ?? undefined
                },
                proposal: {
                  ...proposal,
                  status: 'proposed'
                },
                reviewStatus: 'proposed'
              }
            }
          ),
          LedgerEntryModel.updateOne(
            {
              companyId: payload.companyId,
              statementId: payload.statementId,
              statementTransactionId: statementTxn._id.toString()
            },
            {
              $set: {
                statementCheckId: check._id.toString(),
                'attachments.checkFrontPath': frontPath,
                'attachments.checkBackPath': check.gcs?.backPath ?? null,
                'attachments.checkCropPath': frontPath,
                'attachments.ocrPath': ocrPath,
                'attachments.geminiPath': geminiResult.artifacts.normalizedPath ?? undefined,
                confidence,
                proposal: {
                  ...proposal,
                  status: 'proposed'
                },
                reviewStatus: 'proposed'
              }
            }
          )
        ]);
      }

      await updateStatementProgressFromChecks(payload.companyId, payload.statementId);
      const extractedChecksPath = await saveExtractedChecksArtifact({
        bucketName,
        companyId: payload.companyId,
        statementId: payload.statementId,
        rootPrefix
      });
      await BankStatement.updateOne(
        { _id: payload.statementId, companyId: payload.companyId },
        {
          $set: {
            'artifacts.extractedChecksPath': extractedChecksPath
          }
        }
      );

      artifacts.checkOcr = ocrPath;
      artifacts.checkOcrText = ocrTextPath;
      artifacts.checkStructured = structuredPath;
      artifacts.extractedChecks = extractedChecksPath;
      return { artifacts };
    }
    case 'matching.refresh': {
      if (!payload.statementId) {
        throw new Error('matching.refresh requires statementId');
      }
      const currentStatement = statement;
      if (!currentStatement) {
        throw new Error('matching.refresh requires a valid statement');
      }
      const txns = await StatementTransactionModel.find({
        companyId: payload.companyId,
        statementId: payload.statementId
      });

      for (const txn of txns) {
        const check = await StatementCheckModel.findOne({
          companyId: payload.companyId,
          statementId: payload.statementId,
          'match.statementTransactionId': txn._id.toString(),
          status: { $in: ['ready', 'needs_review'] }
        });

        const fallbackProposal = await buildMatchingProposal({
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant ?? undefined,
          amount: txn.amount,
          type: txn.type,
          check: {
            payeeName: check?.extracted?.payeeName ?? check?.autoFill?.payeeName ?? undefined,
            amount: check?.extracted?.amount ?? check?.autoFill?.amount ?? undefined,
            extracted: check?.extracted
              ? {
                checkNumber: check.extracted.checkNumber ?? undefined,
                date: check.extracted.date ?? undefined,
                payeeName: check.extracted.payeeName ?? undefined,
                amount: check.extracted.amount ?? undefined,
                memo: check.extracted.memo ?? undefined
              }
            : undefined
          }
        });

        const geminiResult = await runGeminiProposalForMatching({
          bucketName,
          rootPrefix: String(currentStatement.gcs?.rootPrefix ?? ''),
          companyId: payload.companyId,
          description: txn.description,
          merchant: txn.merchant ?? undefined,
          amount: txn.amount,
          type: txn.type,
          statementMonth: currentStatement.statementMonth ?? currentStatement.artifacts?.detectedStatementMonth ?? undefined,
          pageContext: [txn.merchant, txn.description].filter(Boolean).join(' '),
          check: {
            payeeName: check?.extracted?.payeeName ?? check?.autoFill?.payeeName ?? undefined,
            amount: check?.extracted?.amount ?? check?.autoFill?.amount ?? undefined,
            extracted: check?.extracted
              ? {
                  checkNumber: check.extracted.checkNumber ?? undefined,
                  date: check.extracted.date ?? undefined,
                  payeeName: check.extracted.payeeName ?? undefined,
                  amount: check.extracted.amount ?? undefined,
                  memo: check.extracted.memo ?? undefined
                }
              : undefined
          },
          fallbackProposal,
          persistArtifacts: false
        });
        const proposal = geminiResult.proposal;

        txn.proposal = {
          ...proposal,
          status: 'proposed'
        } as any;
        await txn.save();

        await LedgerEntryModel.updateOne(
          {
            companyId: payload.companyId,
            statementId: payload.statementId,
            statementTransactionId: txn._id.toString()
          },
          {
            $set: {
              proposal: {
                ...proposal,
                status: 'proposed'
              },
              confidence: {
                overall: proposal.confidence,
                crossValidation: proposal.confidence
              }
            }
          }
        );
      }

      return {
        metrics: {
          refreshed: txns.length
        }
      };
    }
    case 'quickbooks.refresh_reference_data': {
      const result = await syncQuickBooksReferenceData(payload.companyId);
      return {
        metrics: result as Record<string, unknown>
      };
    }
    case 'quickbooks.post_approved': {
      const result = await postApprovedLedgerEntriesToQuickBooks(payload.companyId);
      return {
        metrics: result as Record<string, unknown>
      };
    }
    default: {
      const exhaustive: never = payload.jobType;
      throw new Error(`Unhandled accounting job type: ${String(exhaustive)}`);
    }
  }
};

export const runAccountingTask = async (input: unknown): Promise<AccountingTaskRunResult> => {
  const parsed = accountingTaskPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error('Invalid accounting task payload');
  }

  const payload = parsed.data;
  setRequestContext({ tenantId: payload.companyId, userId: 'system-accounting-task' });

  const run = await createRun(payload);

  try {
    const startedAt = Date.now();
    const result = await runTaskLogic(payload);
    await completeRun(run._id.toString(), 'success', {
      artifacts: result?.artifacts,
      metrics: {
        ...(result?.metrics ?? {}),
        durationMs: Date.now() - startedAt
      }
    });

    // eslint-disable-next-line no-console
    console.info('[accounting.task.completed]', {
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType
    });

    return {
      taskId: String(payload.meta.taskId ?? `${payload.jobType}-${Date.now()}`),
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType,
      status: 'completed',
      nextJobType: nextJobMap[payload.jobType]
    };
  } catch (error) {
    const message = String((error as Error).message);

    await completeRun(run._id.toString(), 'failed', {
      errors: [message]
    });

    if (statementJobTypes.includes(payload.jobType) && payload.statementId) {
      const statement = await BankStatement.findOne({
        _id: payload.statementId,
        companyId: payload.companyId
      });
      if (statement) {
        statement.status = 'failed' as any;
        mergeStatementArtifacts(statement, {
          stageTimestamps: {
            failedAt: nowIso()
          }
        });
        updateStatementProgress(statement, 'failed', statement.progress);
        statement.issues = [...(statement.issues ?? []), message] as any;
        await statement.save();
      }

      if (payload.jobType === 'check.process' && payload.checkId) {
        const currentCheck = await StatementCheckModel.findOne({
          _id: payload.checkId,
          statementId: payload.statementId,
          companyId: payload.companyId
        });
        const failedAt = nowIso();
        await StatementCheckModel.updateOne(
          { _id: payload.checkId, statementId: payload.statementId, companyId: payload.companyId },
          {
            $set: {
              status: 'failed',
              errors: [message],
              processing: {
                retryCount: Number(currentCheck?.processing?.retryCount ?? 0),
                lastError: message,
                queuedAt: currentCheck?.processing?.queuedAt ?? failedAt,
                processingAt: currentCheck?.processing?.processingAt ?? failedAt,
                processedAt: failedAt
              },
              artifacts: {
                stageTimestamps: {
                  failedAt
                }
              }
            }
          }
        );
        await updateStatementProgressFromChecks(payload.companyId, payload.statementId);
      }
    } else if (syncJobTypes.includes(payload.jobType)) {
      await markQuickBooksSyncFailure(
        payload.companyId,
        payload.jobType as 'quickbooks.refresh_reference_data' | 'quickbooks.post_approved',
        message
      );
    }

    // eslint-disable-next-line no-console
    console.error('[accounting.task.failed]', {
      companyId: payload.companyId,
      statementId: payload.statementId,
      checkId: payload.checkId,
      jobType: payload.jobType,
      error: message
    });
    throw error;
  }
};
