import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
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

    const ocrTextPath = `${rootPrefix}/derived/ocr/text.txt`;
    const normalizedPath = `${rootPrefix}/derived/gemini/normalized.v1.json`;
    expect(storageObjects.has(makeStorageKey(bucketName, ocrTextPath))).toBe(true);
    expect(storageObjects.has(makeStorageKey(bucketName, normalizedPath))).toBe(true);

    const normalizedBuffer = storageObjects.get(makeStorageKey(bucketName, normalizedPath));
    expect(normalizedBuffer).toBeTruthy();

    const normalized = JSON.parse(String(normalizedBuffer));
    expect(normalized.statementId).toBe(statementId);
    expect(typeof normalized.transactionCount).toBe('number');
    expect(Array.isArray(normalized.transactions)).toBe(true);
  });
});
