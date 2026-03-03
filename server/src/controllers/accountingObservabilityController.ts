import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  AccountingObservabilityDebug,
  AccountingObservabilitySummary,
  QuickBooksSyncStatus,
  accountingObservabilityDebugSchema,
  accountingObservabilitySummarySchema
} from '@retailsync/shared';
import { z } from 'zod';
import { env } from '../config/env';
import { BankStatement } from '../models/BankStatement';
import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { fail, ok } from '../utils/apiResponse';

const debugQuerySchema = z.object({
  statementId: z.string().trim().optional()
});

const stalledThresholdMs = 20 * 60 * 1000;

const normalizeSyncStatus = (value: unknown): QuickBooksSyncStatus => {
  if (
    value === 'idle' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error'
  ) {
    return value;
  }
  return 'idle';
};

const buildLogsUrl = (projectId: string, query: string) => {
  const encoded = encodeURIComponent(query);
  return `https://console.cloud.google.com/logs/query;query=${encoded}?project=${projectId}`;
};

const getServiceNames = () => {
  const apiName = env.apiServiceName ?? 'retailsync-api-dev';
  const workerName = env.workerServiceName ?? 'retailsync-worker-dev';
  return { apiName, workerName };
};

const buildGcpLinks = () => {
  if (!env.gcpProjectId) {
    return {
      apiLogsUrl: null,
      workerLogsUrl: null,
      failedAccountingTasksUrl: null,
      quickbooksSyncUrl: null
    };
  }

  const { apiName, workerName } = getServiceNames();
  const region = env.gcpRegion ?? 'us-west1';
  const commonFilters = `resource.type="cloud_run_revision" AND resource.labels.location="${region}"`;

  return {
    apiLogsUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${apiName}"`
    ),
    workerLogsUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${workerName}"`
    ),
    failedAccountingTasksUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${workerName}" AND textPayload:"[accounting.task.failed]"`
    ),
    quickbooksSyncUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${workerName}" AND (textPayload:"qb_pull_accounts" OR textPayload:"qb_push_entries")`
    )
  };
};

export const getAccountingObservabilitySummary = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const [recentStatements, statementCounts, quickbooksSettings] = await Promise.all([
    BankStatement.find({ companyId: req.companyId })
      .sort({ updatedAt: -1 })
      .limit(30)
      .select(
        '_id statementMonth fileName status processingStage extraction.issues updatedAt createdAt jobRuns'
      ),
    Promise.all([
      BankStatement.countDocuments({ companyId: req.companyId }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'processing' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'needs_review' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'failed' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'confirmed' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'locked' })
    ]),
    IntegrationSettingsModel.findOne({ companyId: req.companyId }).select('quickbooks')
  ]);

  const failedJobs = recentStatements
    .flatMap((statement) => {
      const runs = Array.isArray(statement.jobRuns) ? statement.jobRuns : [];
      return runs
        .filter((run) => run.status === 'failed')
        .map((run) => ({
          statementId: String(statement._id),
          fileName: statement.fileName,
          statementMonth: statement.statementMonth,
          jobType: String(run.jobType ?? ''),
          taskId: String(run.taskId ?? ''),
          attempt: Number(run.attempt ?? 1),
          error: run.error ? String(run.error) : 'Unknown error',
          endedAt: run.endedAt instanceof Date ? run.endedAt.toISOString() : null
        }));
    })
    .sort((a, b) => {
      const aTime = a.endedAt ? Date.parse(a.endedAt) : 0;
      const bTime = b.endedAt ? Date.parse(b.endedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, 20);

  const now = Date.now();
  const statements = recentStatements.map((statement) => {
    const runs = Array.isArray(statement.jobRuns) ? statement.jobRuns : [];
    const lastJob = runs.length > 0 ? runs[runs.length - 1] : null;
    const updatedAtIso =
      statement.updatedAt instanceof Date
        ? statement.updatedAt.toISOString()
        : String(statement.updatedAt);
    const isStaleProcessing =
      statement.status === 'processing' &&
      Date.parse(updatedAtIso) < now - stalledThresholdMs;
    return {
      id: String(statement._id),
      statementMonth: statement.statementMonth,
      fileName: statement.fileName,
      status: statement.status,
      processingStage: statement.processingStage,
      issuesCount: Array.isArray(statement.extraction?.issues)
        ? statement.extraction.issues.length
        : 0,
      updatedAt: updatedAtIso,
      isStaleProcessing,
      lastJob: lastJob
        ? {
          jobType: String(lastJob.jobType ?? ''),
          status: String(lastJob.status ?? ''),
          endedAt:
            lastJob.endedAt instanceof Date ? lastJob.endedAt.toISOString() : null,
          error: lastJob.error ? String(lastJob.error) : null
        }
        : null
    };
  });

  const [
    totalStatements,
    processingStatements,
    needsReviewStatements,
    failedStatements,
    confirmedStatements,
    lockedStatements
  ] = statementCounts;

  const quickbooks = quickbooksSettings?.quickbooks
    ? {
      connected: Boolean(quickbooksSettings.quickbooks.connected),
      environment:
        quickbooksSettings.quickbooks.environment === 'production'
          ? 'production'
          : 'sandbox',
      realmId: quickbooksSettings.quickbooks.realmId
        ? String(quickbooksSettings.quickbooks.realmId)
        : null,
      companyName: quickbooksSettings.quickbooks.companyName
        ? String(quickbooksSettings.quickbooks.companyName)
        : null,
      lastPullStatus: normalizeSyncStatus(quickbooksSettings.quickbooks.lastPullStatus),
      lastPullAt:
        quickbooksSettings.quickbooks.lastPullAt instanceof Date
          ? quickbooksSettings.quickbooks.lastPullAt.toISOString()
          : null,
      lastPullCount: Number(quickbooksSettings.quickbooks.lastPullCount ?? 0),
      lastPullError: quickbooksSettings.quickbooks.lastPullError
        ? String(quickbooksSettings.quickbooks.lastPullError)
        : null,
      lastPushStatus: normalizeSyncStatus(quickbooksSettings.quickbooks.lastPushStatus),
      lastPushAt:
        quickbooksSettings.quickbooks.lastPushAt instanceof Date
          ? quickbooksSettings.quickbooks.lastPushAt.toISOString()
          : null,
      lastPushCount: Number(quickbooksSettings.quickbooks.lastPushCount ?? 0),
      lastPushError: quickbooksSettings.quickbooks.lastPushError
        ? String(quickbooksSettings.quickbooks.lastPushError)
        : null
    }
    : null;

  const responsePayload: AccountingObservabilitySummary =
    accountingObservabilitySummarySchema.parse({
    generatedAt: new Date().toISOString(),
    counts: {
      totalStatements,
      processingStatements,
      needsReviewStatements,
      failedStatements,
      confirmedStatements,
      lockedStatements
    },
    recentStatements: statements,
    failedJobs,
    quickbooks,
    gcpLinks: buildGcpLinks()
  });
  return ok(res, responsePayload);
};

export const runAccountingObservabilityDebug = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const parsed = debugQuerySchema.safeParse({
    statementId:
      typeof req.query.statementId === 'string' ? req.query.statementId : undefined
  });
  if (!parsed.success) {
    return fail(res, 'Validation failed', 422, parsed.error.flatten());
  }

  const statementId = parsed.data.statementId?.trim() || null;
  const hasValidStatementId =
    statementId != null ? Types.ObjectId.isValid(statementId) : false;

  const [
    quickbooksSettings,
    mappedAccountsCount,
    postedUnsyncedCount,
    postedSyncErrorCount,
    topSyncErrors,
    statement
  ] = await Promise.all([
    IntegrationSettingsModel.findOne({ companyId: req.companyId }).select('quickbooks'),
    ChartOfAccountModel.countDocuments({
      companyId: req.companyId,
      qbAccountId: { $type: 'string', $ne: '' }
    }),
    LedgerEntryModel.countDocuments({
      companyId: req.companyId,
      status: 'posted',
      $or: [{ qbTxnId: null }, { qbTxnId: { $exists: false } }]
    }),
    LedgerEntryModel.countDocuments({
      companyId: req.companyId,
      status: 'posted',
      qbSyncError: { $type: 'string', $ne: '' }
    }),
    LedgerEntryModel.find({
      companyId: req.companyId,
      status: 'posted',
      qbSyncError: { $type: 'string', $ne: '' }
    })
      .sort({ updatedAt: -1 })
      .limit(8)
      .select('_id date memo qbSyncError updatedAt'),
    statementId && hasValidStatementId
      ? BankStatement.findOne({ _id: statementId, companyId: req.companyId })
      : Promise.resolve(null)
  ]);

  const envReadiness = {
    tasksMode: env.tasksMode,
    hasGcsBucketName: Boolean(env.gcsBucketName),
    hasInternalTasksSecret: Boolean(env.internalTasksSecret),
    hasInternalTasksEndpoint: Boolean(env.internalTasksEndpoint),
    hasGcpProjectId: Boolean(env.gcpProjectId),
    hasPipelineQueue: Boolean(env.tasksQueuePipeline),
    hasSyncQueue: Boolean(env.tasksQueueSync),
    hasQuickBooksOAuthConfig: Boolean(
      env.quickbooksClientId &&
        env.quickbooksClientSecret &&
        env.quickbooksIntegrationRedirectUri
    ),
    apiServiceName: env.apiServiceName ?? null,
    workerServiceName: env.workerServiceName ?? null
  };

  const now = Date.now();
  const statementDebug = statement
    ? {
      found: true,
      id: String(statement._id),
      fileName: statement.fileName,
      statementMonth: statement.statementMonth,
      status: statement.status,
      processingStage: String(statement.processingStage ?? 'queued'),
      updatedAt:
        statement.updatedAt instanceof Date
          ? statement.updatedAt.toISOString()
          : String(statement.updatedAt),
      isStaleProcessing:
        statement.status === 'processing' &&
        Date.parse(
          statement.updatedAt instanceof Date
            ? statement.updatedAt.toISOString()
            : String(statement.updatedAt)
        ) < now - stalledThresholdMs,
      issues: Array.isArray(statement.extraction?.issues)
        ? statement.extraction.issues.map((issue) => String(issue))
        : [],
      pageCount: Array.isArray(statement.files?.pages)
        ? statement.files.pages.length
        : 0,
      checkCount: Array.isArray(statement.files?.checks)
        ? statement.files.checks.length
        : 0,
      recentJobRuns: Array.isArray(statement.jobRuns)
        ? statement.jobRuns.slice(-10).map((run) => ({
          taskId: String(run.taskId ?? ''),
          jobType: String(run.jobType ?? ''),
          status: String(run.status ?? ''),
          attempt: Number(run.attempt ?? 1),
          startedAt:
            run.startedAt instanceof Date ? run.startedAt.toISOString() : null,
          endedAt: run.endedAt instanceof Date ? run.endedAt.toISOString() : null,
          error: run.error ? String(run.error) : null
        }))
        : []
    }
    : statementId
      ? { found: false, id: statementId, invalidId: !hasValidStatementId }
      : null;

  const quickbooksDebug = quickbooksSettings?.quickbooks
    ? {
      connected: Boolean(quickbooksSettings.quickbooks.connected),
      environment:
        quickbooksSettings.quickbooks.environment === 'production'
          ? 'production'
          : 'sandbox',
      realmId: quickbooksSettings.quickbooks.realmId
        ? String(quickbooksSettings.quickbooks.realmId)
        : null,
      companyName: quickbooksSettings.quickbooks.companyName
        ? String(quickbooksSettings.quickbooks.companyName)
        : null,
      lastPullStatus: normalizeSyncStatus(quickbooksSettings.quickbooks.lastPullStatus),
      lastPullError: quickbooksSettings.quickbooks.lastPullError
        ? String(quickbooksSettings.quickbooks.lastPullError)
        : null,
      lastPushStatus: normalizeSyncStatus(quickbooksSettings.quickbooks.lastPushStatus),
      lastPushError: quickbooksSettings.quickbooks.lastPushError
        ? String(quickbooksSettings.quickbooks.lastPushError)
        : null,
      mappedAccountsCount,
      postedUnsyncedCount,
      postedSyncErrorCount,
      topSyncErrors: topSyncErrors.map((row) => ({
        entryId: String(row._id),
        date: row.date,
        memo: row.memo,
        error: row.qbSyncError ? String(row.qbSyncError) : null,
        updatedAt:
          row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null
      }))
    }
    : {
      connected: false,
      mappedAccountsCount,
      postedUnsyncedCount,
      postedSyncErrorCount,
      topSyncErrors: topSyncErrors.map((row) => ({
        entryId: String(row._id),
        date: row.date,
        memo: row.memo,
        error: row.qbSyncError ? String(row.qbSyncError) : null,
        updatedAt:
          row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null
      }))
    };

  const actions: string[] = [];
  if (!quickbooksDebug.connected) actions.push('Connect QuickBooks from Accounting > QuickBooks Sync.');
  if (quickbooksDebug.connected && quickbooksDebug.mappedAccountsCount === 0) actions.push('Run Pull CoA from QB before pushing entries.');
  if (quickbooksDebug.connected && quickbooksDebug.postedUnsyncedCount > 0) actions.push('Run Sync Posted Entries to push pending ledger entries.');
  if (statementDebug && 'found' in statementDebug && statementDebug.found && statementDebug.isStaleProcessing) {
    actions.push('Reprocess this statement from Statements > Review.');
  }
  if (quickbooksDebug.postedSyncErrorCount > 0) {
    actions.push('Review qbSyncError entries in ledger and verify account mappings.');
  }

  const responsePayload: AccountingObservabilityDebug =
    accountingObservabilityDebugSchema.parse({
    generatedAt: new Date().toISOString(),
    envReadiness,
    statementDebug,
    quickbooksDebug,
    actions
  });
  return ok(res, responsePayload);
};
