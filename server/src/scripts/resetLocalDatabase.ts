import mongoose from 'mongoose';
import { connectDb } from '../db/connect';
import { env } from '../config/env';

const parseArgs = () => ({
  apply: process.argv.includes('--apply'),
  yes: process.argv.includes('--yes')
});

const main = async () => {
  const { apply, yes } = parseArgs();
  const nodeEnv = (process.env.NODE_ENV ?? 'development').toLowerCase();
  const isProduction = nodeEnv === 'production';
  const allowProduction = process.env.ALLOW_DB_RESET === 'true';

  if (isProduction && !allowProduction) {
    throw new Error(
      'Refusing to reset the database while NODE_ENV=production. Set ALLOW_DB_RESET=true only if you are certain.'
    );
  }

  console.info('[db.reset] Development-only MongoDB reset for simplified RBAC testing.');
  console.info('[db.reset] After reset: register a new account and create a company to seed Admin/Member/Viewer roles.');

  if (!apply) {
    console.info('[db.reset] Dry run only. Re-run with --apply --yes to drop the database.');
    console.info(`[db.reset] Target: ${env.mongoUri}`);
    console.info('[db.reset] This removes users, companies, roles, statements, POS rows, integration settings, and all other Mongo data.');
    return;
  }

  if (!yes) {
    console.info('[db.reset] Pass --yes with --apply to confirm destructive reset.');
    process.exitCode = 1;
    return;
  }

  await connectDb();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Mongo connection is not ready.');
  }

  const dbName = db.databaseName;
  console.info(`[db.reset] Dropping database "${dbName}" at ${env.mongoUri}`);
  await db.dropDatabase();
  console.info('[db.reset] Done. MongoDB is empty for this database.');
  console.info('[db.reset] Next steps:');
  console.info('  1. Clear browser site data (localStorage key: retailsync-root)');
  console.info('  2. Register / sign in and create a company');
  console.info('  3. Confirm system roles: Admin (full), Member (operational), Viewer (read-only)');
  console.info('[db.reset] Command: pnpm db:reset -- --apply --yes');
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error('[db.reset] Failed', error);
  process.exitCode = 1;
});
