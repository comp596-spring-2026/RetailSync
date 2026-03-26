import { Request, Response } from 'express';
import { Types } from 'mongoose';
import {
  accountingObservabilityDebugSchema,
  accountingObservabilitySummarySchema,
  quickBooksSettingsSchema
} from '@retailsync/shared';
import { z } from 'zod';
import { env } from '../config/env';
import { getStorageClient } from '../integrations/google/storage.client';
import { BankStatement } from '../models/BankStatement';
import { ChartOfAccountModel } from '../models/ChartOfAccount';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { LedgerEntryModel } from '../models/LedgerEntry';
import { RunModel } from '../models/Run';
import { StatementCheckModel } from '../models/StatementCheck';
import { fail, ok } from '../utils/apiResponse';

const debugQuerySchema = z.object({
  statementId: z.string().trim().optional()
});

const storage = getStorageClient();

const buildLogsUrl = (projectId: string, query: string) => {
  const encoded = encodeURIComponent(query);
  return `https://console.cloud.google.com/logs/query;query=${encoded}?project=${projectId}`;
};

const getApiServiceName = () => env.apiServiceName ?? 'retailsync-api-dev';

const buildGcpLinks = () => {
  if (!env.gcpProjectId) {
    return {
      apiLogsUrl: null,
      taskLogsUrl: null,
      failedTaskLogsUrl: null,
      quickbooksSyncUrl: null
    };
  }

  const apiName = getApiServiceName();
  const region = env.gcpRegion ?? 'us-west1';
  const commonFilters = `resource.type="cloud_run_revision" AND resource.labels.location="${region}"`;

  return {
    apiLogsUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${apiName}"`
    ),
    taskLogsUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${apiName}" AND (textPayload:"[accounting.task." OR textPayload:"[accounting.queue.")`
    ),
    failedTaskLogsUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${apiName}" AND textPayload:"[accounting.task.failed]"`
    ),
    quickbooksSyncUrl: buildLogsUrl(
      env.gcpProjectId,
      `${commonFilters} AND resource.labels.service_name="${apiName}" AND (textPayload:"quickbooks.refresh_reference_data" OR textPayload:"quickbooks.post_approved")`
    )
  };
};

const normalizeQuickBooks = (quickbooks: any) =>
  quickBooksSettingsSchema.parse({
    connected: Boolean(quickbooks?.connected),
    environment: quickbooks?.environment === 'production' ? 'production' : 'sandbox',
    realmId: quickbooks?.realmId ? String(quickbooks.realmId) : null,
    companyName: quickbooks?.companyName ? String(quickbooks.companyName) : null,
    lastPullStatus: ['idle', 'running', 'success', 'error'].includes(String(quickbooks?.lastPullStatus))
      ? String(quickbooks.lastPullStatus)
      : 'idle',
    lastPullAt:
      quickbooks?.lastPullAt instanceof Date
        ? quickbooks.lastPullAt.toISOString()
        : null,
    lastPullCount: Number(quickbooks?.lastPullCount ?? 0),
    lastPullError: quickbooks?.lastPullError ? String(quickbooks.lastPullError) : null,
    lastPushStatus: ['idle', 'running', 'success', 'error'].includes(String(quickbooks?.lastPushStatus))
      ? String(quickbooks.lastPushStatus)
      : 'idle',
    lastPushAt:
      quickbooks?.lastPushAt instanceof Date
        ? quickbooks.lastPushAt.toISOString()
        : null,
    lastPushCount: Number(quickbooks?.lastPushCount ?? 0),
    lastPushError: quickbooks?.lastPushError ? String(quickbooks.lastPushError) : null,
    updatedAt:
      quickbooks?.updatedAt instanceof Date
        ? quickbooks.updatedAt.toISOString()
        : null
  });

const readTextObject = async (objectPath?: string | null) => {
  if (!env.gcsBucketName || !objectPath) return null;
  try {
    const [buffer] = await storage.bucket(env.gcsBucketName).file(objectPath).download();
    return buffer.toString('utf-8');
  } catch {
    return null;
  }
};

const readGeminiProviderStatus = async (geminiPath?: string | null) => {
  const raw = await readTextObject(geminiPath);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      providerStatus: ['healthy', 'degraded', 'unavailable'].includes(String(parsed.providerStatus))
        ? String(parsed.providerStatus)
        : 'unavailable',
      source: ['gemini', 'fallback', 'hybrid'].includes(String(parsed.source))
        ? String(parsed.source)
        : 'fallback',
      degradedReason: typeof parsed.degradedReason === 'string' ? parsed.degradedReason : null
    };
  } catch {
    return null;
  }
};

const buildStatementProgress = (statement: any) => {
  const totalChecks = Number(statement.progress?.totalChecks ?? 0);
  const checksQueued = Number(statement.progress?.checksQueued ?? 0);
  const checksProcessing = Number(statement.progress?.checksProcessing ?? 0);
  const checksReady = Number(statement.progress?.checksReady ?? 0);
  const checksFailed = Number(statement.progress?.checksFailed ?? 0);
  const completedChecks = checksReady + checksFailed;
  const remainingChecks = Math.max(totalChecks - completedChecks, 0);

  return {
    phase: statement.progress?.phase ?? statement.status,
    totalChecks,
    checksQueued,
    checksProcessing,
    checksReady,
    checksFailed,
    completedChecks,
    remainingChecks
  };
};

export const getAccountingObservabilitySummary = async (req: Request, res: Response) => {
  if (!req.companyId) {
    return fail(res, 'Company onboarding required', 403);
  }

  const [recentStatements, counts, failedRuns, settings] = await Promise.all([
    BankStatement.find({ companyId: req.companyId })
      .sort({ updatedAt: -1 })
      .limit(30),
    Promise.all([
      BankStatement.countDocuments({ companyId: req.companyId }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'extracting' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'structuring' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'checks_queued' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'ready_for_review' }),
      BankStatement.countDocuments({ companyId: req.companyId, status: 'failed' })
    ]),
    RunModel.find({ companyId: req.companyId, status: 'failed' }).sort({ updatedAt: -1 }).limit(30),
    IntegrationSettingsModel.findOne({ companyId: req.companyId }).select('quickbooks')
  ]);

  const [
    totalStatements,
    extractingStatements,
    structuringStatements,
    checksQueuedStatements,
    readyForReviewStatements,
    failedStatements
  ] = counts;

  const payload = accountingObservabilitySummarySchema.parse({
    generatedAt: new Date().toISOString(),
    counts: {
      totalStatements,
      extractingStatements,
      structuringStatements,
      checksQueuedStatements,
      readyForReviewStatements,
      failedStatements
    },
    recentStatements: recentStatements.map((statement) => ({
      id: statement._id.toString(),
      statementMonth: statement.statementMonth,
      fileName: statement.fileName,
      source: statement.source,
      status: statement.status,
      progress: {
        ...buildStatementProgress(statement)
      },
      confidence: undefined,
      issuesCount: Array.isArray(statement.issues) ? statement.issues.length : 0,
      updatedAt: statement.updatedAt instanceof Date ? statement.updatedAt.toISOString() : String(statement.updatedAt),
      createdAt: statement.createdAt instanceof Date ? statement.createdAt.toISOString() : String(statement.createdAt)
    })),
    failedRuns: failedRuns.map((run) => ({
      id: run._id.toString(),
      companyId: String(run.companyId),
      statementId: run.statementId ? String(run.statementId) : undefined,
      integrationId: run.integrationId ? String(run.integrationId) : undefined,
      runType: run.runType,
      job: run.job,
      status: run.status,
      metrics: run.metrics ?? undefined,
      artifacts: run.artifacts ? Object.fromEntries(run.artifacts.entries()) : undefined,
      errors: Array.isArray(run.errors) ? run.errors.map((error) => String(error)) : [],
      traceId: run.traceId ? String(run.traceId) : undefined,
      createdAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : String(run.createdAt),
      updatedAt: run.updatedAt instanceof Date ? run.updatedAt.toISOString() : String(run.updatedAt)
    })),
    quickbooks: settings?.quickbooks ? normalizeQuickBooks(settings.quickbooks) : null,
    gcpLinks: buildGcpLinks()
  });

  return ok(res, payload);
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

  const [statement, mappedAccountsCount, readyToPostCount, failedPostingCount, quickbooksSettings] = await Promise.all([
    statementId && hasValidStatementId
      ? BankStatement.findOne({ _id: statementId, companyId: req.companyId })
      : Promise.resolve(null),
    ChartOfAccountModel.countDocuments({
      companyId: req.companyId,
      qbAccountId: { $type: 'string', $ne: '' }
    }),
    LedgerEntryModel.countDocuments({
      companyId: req.companyId,
      reviewStatus: 'approved',
      'posting.status': { $in: ['not_posted', 'failed'] }
    }),
    LedgerEntryModel.countDocuments({
      companyId: req.companyId,
      'posting.status': 'failed'
    }),
    IntegrationSettingsModel.findOne({ companyId: req.companyId }).select('quickbooks')
  ]);

  const envReadiness = {
    tasksMode: env.tasksMode,
    hasGcsBucketName: Boolean(env.gcsBucketName),
    hasServiceSecret: Boolean(env.serviceSecret),
    hasInternalTasksEndpoint: Boolean(env.internalTasksEndpoint),
    hasGcpProjectId: Boolean(env.gcpProjectId),
    hasPipelineQueue: Boolean(env.tasksQueuePipeline),
    hasSyncQueue: Boolean(env.tasksQueueSync),
    hasQuickBooksOAuthConfig: Boolean(
      env.quickbooksClientId &&
        env.quickbooksClientSecret &&
        env.quickbooksIntegrationRedirectUri
    ),
    apiServiceName: env.apiServiceName ?? null
  };

  const actions: string[] = [];
  if (!quickbooksSettings?.quickbooks?.connected) {
    actions.push('Connect QuickBooks from Accounting > QuickBooks Sync.');
  }
  if (quickbooksSettings?.quickbooks?.connected && mappedAccountsCount === 0) {
    actions.push('Run Refresh Reference Data in QuickBooks tab.');
  }
  if (readyToPostCount > 0) {
    actions.push('Run Post Approved to sync approved ledger rows.');
  }
  if (failedPostingCount > 0) {
    actions.push('Open Ledger failures and correct proposal/account mapping issues.');
  }
  if (statementId && !hasValidStatementId) {
    actions.push('Provided statementId is invalid ObjectId format.');
  }
  if (statementId && hasValidStatementId && !statement) {
    actions.push('Statement not found for provided statementId.');
  }
  if (statement?.status === 'failed') {
    actions.push('Reprocess failed statement from Statements tab.');
  }
  if (statementId && hasValidStatementId && statement) {
    const checks = await StatementCheckModel.find({
      companyId: req.companyId,
      statementId
    })
      .select('artifacts')
      .limit(500)
      .lean();
    const aiStatuses = await Promise.all(
      checks.map((check) => readGeminiProviderStatus(check.artifacts?.geminiPath ?? null))
    );
    const degraded = aiStatuses.filter(
      (ai) => ai && (ai.providerStatus === 'degraded' || ai.providerStatus === 'unavailable')
    ).length;
    const healthy = aiStatuses.filter((ai) => ai && ai.providerStatus === 'healthy').length;
    if (healthy > 0 || degraded > 0) {
      actions.push(
        `Gemini proposal state: ${healthy} healthy, ${degraded} degraded/unavailable checks on this statement.`
      );
    }
  }

  const payload = accountingObservabilityDebugSchema.parse({
    generatedAt: new Date().toISOString(),
    envReadiness,
    actions
  });

  return ok(res, payload);
};
