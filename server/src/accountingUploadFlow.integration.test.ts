import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { BankStatement } from './models/BankStatement';
import { LedgerEntryModel } from './models/LedgerEntry';
import { RunModel } from './models/Run';
import { StatementCheckModel } from './models/StatementCheck';
import { StatementTransactionModel } from './models/StatementTransaction';
import { clearTestDb, registerAndCreateCompany, setupTestEnv } from './test/testUtils';
import { detectStatementMonthFromPdf } from './services/accountingPdfAnalysisService';

const TEST_MONGO_URI = process.env.TEST_MONGO_URI?.trim() ?? '';
const maybeDescribe = TEST_MONGO_URI ? describe : describe.skip;
const bucketName = 'retailsync-accounting-test';

vi.hoisted(() => {
  const testBucketName = 'retailsync-accounting-test';
  process.env.PORT = process.env.PORT ?? '4000';
  process.env.MONGO_URI =
    process.env.TEST_MONGO_URI?.trim() ||
    process.env.MONGO_URI ||
    'mongodb://127.0.0.1:27017/retailsync-test';
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ??
    Buffer.from('12345678901234567890123456789012').toString('base64');
  process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
  process.env.NODE_ENV = 'test';
  process.env.TASKS_MODE = 'inline';
  process.env.GCS_BUCKET_NAME = testBucketName;
  process.env.GCP_PROJECT_ID = process.env.GCP_PROJECT_ID ?? 'retailsync-test-project';
  process.env.GCP_REGION = process.env.GCP_REGION ?? 'us-west1';
  process.env.INTERNAL_TASKS_ENDPOINT =
    process.env.INTERNAL_TASKS_ENDPOINT ?? 'http://localhost:4000/api/tasks';
});

const { storageObjects } = vi.hoisted(() => ({
  storageObjects: new Map<string, Buffer>()
}));

const makeStorageKey = (bucketName: string, objectPath: string) =>
  `${bucketName}::${objectPath}`;

vi.mock('@google-cloud/storage', () => {
  class Storage {
    bucket(bucketName: string) {
      return {
        file: (objectPath: string) => {
          const key = makeStorageKey(bucketName, objectPath);
          return {
            getSignedUrl: async () => [
              `https://storage.mock/${encodeURIComponent(bucketName)}/${encodeURIComponent(objectPath)}`
            ],
            download: async () => {
              const value = storageObjects.get(key);
              if (!value) {
                const error = Object.assign(
                  new Error(`Object not found: ${bucketName}/${objectPath}`),
                  { code: 404 }
                );
                throw error;
              }
              return [value];
            },
            save: async (value: string | Buffer) => {
              storageObjects.set(
                key,
                Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
              );
            },
            exists: async () => [storageObjects.has(key)]
          };
        }
      };
    }
  }

  return { Storage };
});

maybeDescribe('accounting upload flow with bundled PDF', () => {
  let app: any;

  beforeAll(async () => {
    setupTestEnv();

    const module = await import('./app');
    app = module.createApp();
    await mongoose.connect(TEST_MONGO_URI);
  });

  beforeEach(async () => {
    storageObjects.clear();
    await clearTestDb();
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('runs detect-month, upload-url, create-statement, and inline processing with the fixture PDF', async () => {
    const pdfPath = path.resolve(process.cwd(), '../shared/src/accounting/testStatmentPDF.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const expectedDetection = detectStatementMonthFromPdf({
      pdfBuffer,
      fileName: 'testStatmentPDF.pdf'
    });

    const { accessToken } = await registerAndCreateCompany(app, 'AcctFixturePdf');

    const detectResponse = await request(app)
      .post('/api/accounting/statements/detect-month')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('file', pdfPath)
      .expect(200);

    expect(detectResponse.body.data.statementMonth).toBe(expectedDetection.statementMonth);
    expect(detectResponse.body.data.autoApply).toBe(expectedDetection.autoApply);

    const statementMonth =
      detectResponse.body.data.statementMonth ?? expectedDetection.statementMonth ?? '2025-12';

    const uploadResponse = await request(app)
      .post('/api/accounting/statements/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileName: 'testStatmentPDF.pdf',
        statementMonth,
        contentType: 'application/pdf'
      })
      .expect(200);

    const { statementId, gcsPath, rootPrefix } = uploadResponse.body.data as {
      statementId: string;
      gcsPath: string;
      rootPrefix: string;
    };

    storageObjects.set(makeStorageKey(bucketName, gcsPath), pdfBuffer);

    const createResponse = await request(app)
      .post('/api/accounting/statements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        statementId,
        fileName: 'testStatmentPDF.pdf',
        statementMonth,
        gcsPath
      })
      .expect(201);

    expect(createResponse.body.data.queue.mode).toBe('inline');

    const statusResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(['checks_queued', 'ready_for_review']).toContain(
      statusResponse.body.data.status
    );
    expect(statusResponse.body.data.progress.phase).toBe(statusResponse.body.data.status);
    expect(typeof statusResponse.body.data.progress.completedChecks).toBe('number');
    expect(typeof statusResponse.body.data.progress.remainingChecks).toBe('number');
    expect(statusResponse.body.data.issues).toEqual([]);

    const detailResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailResponse.body.data.fileName).toBe('testStatmentPDF.pdf');
    expect(detailResponse.body.data.gcs.pdfPath).toBe(gcsPath);
    expect(detailResponse.body.data.progress.phase).toBe(detailResponse.body.data.status);
    expect(typeof detailResponse.body.data.progress.completedChecks).toBe('number');
    expect(typeof detailResponse.body.data.progress.remainingChecks).toBe('number');
    expect(detailResponse.body.data.artifacts.transactionsTablePath).toBe(
      `${rootPrefix}/derived/ocr/json/tables/transactions.json`
    );
    expect(detailResponse.body.data.artifacts.checksClearedTablePath).toBe(
      `${rootPrefix}/derived/ocr/json/tables/checks-cleared.json`
    );
    expect(detailResponse.body.data.artifacts.transactionSectionsPath).toBe(
      `${rootPrefix}/derived/ocr/json/tables/transaction-sections.json`
    );
    expect(detailResponse.body.data.artifacts.extractedChecksPath).toBe(
      `${rootPrefix}/derived/ocr/json/tables/extracted-checks.json`
    );

    const ocrTextPath = `${rootPrefix}/derived/ocr/text.txt`;
    const normalizedPath = `${rootPrefix}/derived/gemini/normalized.v1.json`;
    const transactionsTablePath = `${rootPrefix}/derived/ocr/json/tables/transactions.json`;
    const checksClearedTablePath = `${rootPrefix}/derived/ocr/json/tables/checks-cleared.json`;
    const transactionSectionsPath = `${rootPrefix}/derived/ocr/json/tables/transaction-sections.json`;
    const extractedChecksPath = `${rootPrefix}/derived/ocr/json/tables/extracted-checks.json`;
    expect(storageObjects.has(makeStorageKey(bucketName, ocrTextPath))).toBe(true);
    expect(storageObjects.has(makeStorageKey(bucketName, normalizedPath))).toBe(true);
    expect(storageObjects.has(makeStorageKey(bucketName, transactionsTablePath))).toBe(true);
    expect(storageObjects.has(makeStorageKey(bucketName, checksClearedTablePath))).toBe(true);
    expect(storageObjects.has(makeStorageKey(bucketName, transactionSectionsPath))).toBe(true);
    expect(storageObjects.has(makeStorageKey(bucketName, extractedChecksPath))).toBe(true);

    const normalizedBuffer = storageObjects.get(makeStorageKey(bucketName, normalizedPath));
    expect(normalizedBuffer).toBeTruthy();

    const normalized = JSON.parse(String(normalizedBuffer));
    expect(normalized.statementId).toBe(statementId);
    expect(typeof normalized.transactionCount).toBe('number');
    expect(Array.isArray(normalized.transactions)).toBe(true);

    const pdfArtifactResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}/artifact`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ path: gcsPath })
      .expect(200);

    expect(pdfArtifactResponse.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(pdfArtifactResponse.body).length).toBeGreaterThan(0);

    const textArtifactResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}/artifact`)
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ path: ocrTextPath })
      .expect(200);

    expect(textArtifactResponse.headers['content-type']).toContain('text/plain');
    expect(textArtifactResponse.text.length).toBeGreaterThan(0);

    const entriesResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}/entries`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(entriesResponse.body.data.entries)).toBe(true);

    const suggestionsResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}/suggestions`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(suggestionsResponse.body.data).toBeTruthy();
    expect(Array.isArray(suggestionsResponse.body.data.items)).toBe(true);
    expect(suggestionsResponse.body.data.summary).toBeTruthy();
  });

  it('persists a failed statement row when the uploaded PDF cannot be read back from storage', async () => {
    const pdfPath = path.resolve(process.cwd(), '../shared/src/accounting/testStatmentPDF.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const { accessToken } = await registerAndCreateCompany(app, 'AcctFixtureMissingObject');
    const statementMonth = '2025-12';

    const uploadResponse = await request(app)
      .post('/api/accounting/statements/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileName: 'missing.pdf',
        statementMonth,
        contentType: 'application/pdf'
      })
      .expect(200);

    const { statementId, gcsPath, rootPrefix } = uploadResponse.body.data as {
      statementId: string;
      gcsPath: string;
      rootPrefix: string;
    };

    const createResponse = await request(app)
      .post('/api/accounting/statements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        statementId,
        fileName: 'missing.pdf',
        statementMonth,
        gcsPath
      })
      .expect(409);

    expect(createResponse.body.message).toBe('statement_pdf_missing');
    expect(createResponse.body.details.reason).toBe('statement_pdf_missing');

    const statusResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(statusResponse.body.data.status).toBe('failed');
    expect(statusResponse.body.data.issues).toContain(
      'Uploaded statement PDF was not found in secure storage. Please upload the file again.'
    );

    const detailResponse = await request(app)
      .get(`/api/accounting/statements/${statementId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailResponse.body.data.gcs.rootPrefix).toBe(rootPrefix);
    expect(detailResponse.body.data.gcs.pdfPath).toBe(gcsPath);
    expect(detailResponse.body.data.status).toBe('failed');

    storageObjects.set(makeStorageKey(bucketName, gcsPath), pdfBuffer);

    const retryResponse = await request(app)
      .post('/api/accounting/statements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        statementId,
        fileName: 'missing.pdf',
        statementMonth,
        gcsPath
      })
      .expect(200);

    expect(['checks_queued', 'ready_for_review']).toContain(
      retryResponse.body.data.statement.status
    );
  });

  it('keeps only one statement per company month and removes superseded mongo records', async () => {
    const pdfPath = path.resolve(process.cwd(), '../shared/src/accounting/testStatmentPDF.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const { accessToken } = await registerAndCreateCompany(app, 'AcctFixtureSingleMonth');
    const statementMonth = '2025-12';

    const firstUpload = await request(app)
      .post('/api/accounting/statements/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileName: 'first.pdf',
        statementMonth,
        contentType: 'application/pdf'
      })
      .expect(200);

    const {
      statementId: firstStatementId,
      gcsPath: firstGcsPath
    } = firstUpload.body.data as {
      statementId: string;
      gcsPath: string;
      rootPrefix: string;
    };

    storageObjects.set(makeStorageKey(bucketName, firstGcsPath), pdfBuffer);

    await request(app)
      .post('/api/accounting/statements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        statementId: firstStatementId,
        fileName: 'first.pdf',
        statementMonth,
        gcsPath: firstGcsPath
      })
      .expect(201);

    const firstStatement = await BankStatement.findById(firstStatementId).lean();
    const companyId = String(firstStatement?.companyId ?? '');
    expect(companyId).not.toBe('');

    await Promise.all([
      RunModel.create({
        companyId,
        statementId: firstStatementId,
        runType: 'pipeline',
        job: 'statement.extract',
        status: 'failed',
        errors: ['seeded run']
      }),
      StatementTransactionModel.create({
        companyId,
        statementId: firstStatementId,
        postDate: '2025-12-31',
        description: 'Seeded txn',
        amount: 10,
        type: 'debit',
        proposal: { status: 'proposed' },
        posting: { status: 'not_posted' }
      }),
      StatementCheckModel.create({
        statementId: firstStatementId,
        companyId,
        status: 'failed',
        gcs: { frontPath: 'seed/front.png' }
      })
    ]);

    const seededTxn = await StatementTransactionModel.findOne({
      companyId,
      statementId: firstStatementId
    }).lean();

    expect(seededTxn?._id).toBeTruthy();

    await LedgerEntryModel.create({
      companyId,
      statementId: firstStatementId,
      statementTransactionId: String(seededTxn?._id),
      date: '2025-12-31',
      description: 'Seeded ledger',
      amount: 10,
      type: 'debit',
      proposal: { status: 'proposed' },
      posting: { status: 'not_posted' }
    });

    const secondUpload = await request(app)
      .post('/api/accounting/statements/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileName: 'second.pdf',
        statementMonth,
        contentType: 'application/pdf'
      })
      .expect(200);

    const {
      statementId: secondStatementId,
      gcsPath: secondGcsPath
    } = secondUpload.body.data as {
      statementId: string;
      gcsPath: string;
      rootPrefix: string;
    };

    storageObjects.set(makeStorageKey(bucketName, secondGcsPath), pdfBuffer);

    await request(app)
      .post('/api/accounting/statements')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        statementId: secondStatementId,
        fileName: 'second.pdf',
        statementMonth,
        gcsPath: secondGcsPath
      })
      .expect(201);

    expect(
      await BankStatement.countDocuments({
        companyId,
        statementMonth
      })
    ).toBe(1);
    expect(await BankStatement.exists({ _id: firstStatementId, companyId })).toBeNull();
    expect(await StatementTransactionModel.exists({ statementId: firstStatementId, companyId })).toBeNull();
    expect(await StatementCheckModel.exists({ statementId: firstStatementId, companyId })).toBeNull();
    expect(await LedgerEntryModel.exists({ statementId: firstStatementId, companyId })).toBeNull();
    expect(await RunModel.exists({ statementId: firstStatementId, companyId })).toBeNull();
    expect(await BankStatement.exists({ _id: secondStatementId, companyId })).not.toBeNull();
  });
});
