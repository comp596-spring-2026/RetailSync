import { BankStatement } from '../models/BankStatement';

const nowIso = () => new Date().toISOString();

export type StatementProgressCounts = {
  totalChecks?: number;
  checksQueued?: number;
  checksProcessing?: number;
  checksReady?: number;
  checksFailed?: number;
};

export const buildStatementProgress = (phase: string, counts: StatementProgressCounts = {}) => {
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

const flattenArtifactSet = (artifacts: Record<string, unknown> | undefined) => {
  const $set: Record<string, unknown> = {};
  if (!artifacts) return $set;

  for (const [key, value] of Object.entries(artifacts)) {
    if (key === 'stageTimestamps' && value && typeof value === 'object') {
      for (const [timestampKey, timestampValue] of Object.entries(value as Record<string, unknown>)) {
        if (timestampValue === undefined) continue;
        $set[`artifacts.stageTimestamps.${timestampKey}`] = timestampValue;
      }
      continue;
    }
    if (value === undefined) continue;
    $set[`artifacts.${key}`] = value;
  }

  return $set;
};

const mergeArtifactPatch = (
  existing: Record<string, unknown> | undefined,
  patch: Record<string, unknown> | undefined
) => {
  if (!patch) return existing;
  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'stageTimestamps' && value && typeof value === 'object') {
      merged.stageTimestamps = {
        ...((merged.stageTimestamps as Record<string, unknown> | undefined) ?? {}),
        ...(value as Record<string, unknown>)
      };
      continue;
    }
    if (value === undefined) continue;
    merged[key] = value;
  }
  return merged;
};

export const persistStatementPatch = async (
  companyId: string,
  statementId: string,
  patch: {
    status?: string;
    progress?: ReturnType<typeof buildStatementProgress>;
    issues?: string[];
    artifacts?: Record<string, unknown>;
  }
) => {
  let artifactsToPersist = patch.artifacts;
  if (patch.artifacts) {
    const existing = await BankStatement.findOne({ _id: statementId, companyId }).lean();
    const existingArtifacts = existing?.artifacts;
    artifactsToPersist = mergeArtifactPatch(existingArtifacts, patch.artifacts);
  }

  const $set: Record<string, unknown> = {
    updatedAt: new Date(),
    ...flattenArtifactSet(artifactsToPersist)
  };

  if (patch.status) $set.status = patch.status;
  if (patch.progress) $set.progress = patch.progress;
  if (patch.issues) $set.issues = patch.issues;

  await BankStatement.updateOne({ _id: statementId, companyId }, { $set });
};

export const persistStatementFailure = async (args: {
  companyId: string;
  statementId: string;
  message: string;
  extraIssues?: string[];
}) => {
  try {
    const existing = await BankStatement.findOne({
      _id: args.statementId,
      companyId: args.companyId
    }).lean();

    if (!existing) return;

    const existingProgress =
      existing && typeof existing === 'object' && 'progress' in existing
        ? (existing as { progress?: StatementProgressCounts }).progress
        : undefined;
    const existingIssues =
      existing && typeof existing === 'object' && 'issues' in existing
        ? (existing as { issues?: unknown[] }).issues
        : [];

    const issues = [
      ...new Set([
        ...(Array.isArray(existingIssues) ? existingIssues.map((issue: unknown) => String(issue)) : []),
        ...(args.extraIssues ?? []).map(String),
        args.message
      ])
    ];

    await persistStatementPatch(args.companyId, args.statementId, {
      status: 'failed',
      progress: buildStatementProgress('failed', existingProgress ?? {}),
      issues,
      artifacts: {
        stageTimestamps: {
          failedAt: nowIso()
        }
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[bankStatement.persistStatementFailure] failed', {
      companyId: args.companyId,
      statementId: args.statementId,
      message: args.message,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
};
