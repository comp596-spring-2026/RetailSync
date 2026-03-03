import mongoose, { Types } from 'mongoose';
import { connectDb } from '../db/connect';
import { IntegrationSettingsModel } from '../models/IntegrationSettings';
import { cleanupGoogleSheetsConfig } from '../utils/googleSheetsDbCleanup';

type ScriptOptions = {
  apply: boolean;
  verbose: boolean;
  limit: number | null;
  companyId: string | null;
};

const parseArgs = (): ScriptOptions => {
  const args = process.argv.slice(2);
  const getValue = (key: string) => {
    const prefixed = args.find((arg) => arg.startsWith(`${key}=`));
    if (prefixed) return prefixed.slice(key.length + 1);
    const index = args.findIndex((arg) => arg === key);
    return index >= 0 ? args[index + 1] : undefined;
  };

  const apply = args.includes('--apply');
  const verbose = args.includes('--verbose');
  const limitValue = getValue('--limit');
  const companyIdValue = getValue('--companyId');
  const parsedLimit = limitValue ? Number(limitValue) : null;

  return {
    apply,
    verbose,
    limit: Number.isFinite(parsedLimit) && Number(parsedLimit) > 0 ? Number(parsedLimit) : null,
    companyId: companyIdValue ? String(companyIdValue).trim() : null,
  };
};

const main = async () => {
  const options = parseArgs();
  const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const allowProduction = process.env.ALLOW_DB_CLEANUP_IN_PROD === 'true';

  if (isProduction && options.apply && !allowProduction) {
    throw new Error(
      'Refusing to apply DB cleanup in production. Set ALLOW_DB_CLEANUP_IN_PROD=true to override.',
    );
  }

  await connectDb();

  const query: Record<string, unknown> = {};
  if (options.companyId) {
    if (!Types.ObjectId.isValid(options.companyId)) {
      throw new Error(`Invalid companyId: ${options.companyId}`);
    }
    query.companyId = new Types.ObjectId(options.companyId);
  }

  const cursor = IntegrationSettingsModel.collection.find(query, {
    projection: { _id: 1, companyId: 1, googleSheets: 1 },
    ...(options.limit ? { limit: options.limit } : {}),
  });
  const docs = await cursor.toArray();

  let changed = 0;
  let updated = 0;
  const issueCountByType = new Map<string, number>();

  for (const doc of docs) {
    const result = cleanupGoogleSheetsConfig(doc.googleSheets);
    if (!result.changed) continue;
    changed += 1;

    for (const issue of result.issues) {
      const key = issue.split(':')[0] ?? issue;
      issueCountByType.set(key, (issueCountByType.get(key) ?? 0) + 1);
    }

    if (options.verbose) {
      console.log(
        `[cleanup] company=${String(doc.companyId)} integrationSettings=${String(doc._id)} issues=${
          result.issues.length
        }`,
      );
      for (const issue of result.issues) {
        console.log(`  - ${issue}`);
      }
    }

    if (options.apply) {
      await IntegrationSettingsModel.collection.updateOne(
        { _id: doc._id },
        { $set: { googleSheets: result.normalized, updatedAt: new Date() } },
      );
      updated += 1;
    }
  }

  const summary = {
    apply: options.apply,
    scanned: docs.length,
    changed,
    updated,
    issues: Array.from(issueCountByType.entries())
      .sort((left, right) => right[1] - left[1])
      .map(([type, count]) => ({ type, count })),
  };

  console.log(JSON.stringify(summary, null, 2));
  await mongoose.disconnect();
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  try {
    await mongoose.disconnect();
  } catch {
    // no-op
  }
  process.exit(1);
});
