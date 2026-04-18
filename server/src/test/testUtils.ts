import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { DEFAULT_CURRENCY_CODE, DEV_VITE_CLIENT_ORIGIN } from '@retailsync/shared';
import { AUTH_SESSION_DEFAULTS, SERVER_RUNTIME_DEFAULTS, TEST_ENV_DEFAULTS } from '../constants/config';
import { UserModel } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { signAccessToken, signRefreshToken } from '../utils/jwt';

let mongo: MongoMemoryServer | null = null;

export const setupTestEnv = () => {
  process.env.PORT = process.env.PORT ?? String(SERVER_RUNTIME_DEFAULTS.port);
  process.env.MONGO_URI = process.env.MONGO_URI ?? SERVER_RUNTIME_DEFAULTS.testMongoUri;
  process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ??
    Buffer.from('12345678901234567890123456789012').toString('base64');
  process.env.CLIENT_URL = process.env.CLIENT_URL ?? DEV_VITE_CLIENT_ORIGIN;
  process.env.SMTP_HOST = process.env.SMTP_HOST ?? TEST_ENV_DEFAULTS.smtpHost;
  process.env.SMTP_PORT = process.env.SMTP_PORT ?? TEST_ENV_DEFAULTS.smtpPort;
  process.env.SMTP_FROM = process.env.SMTP_FROM ?? TEST_ENV_DEFAULTS.smtpFrom;
  process.env.SMTP_FROM_NAME = process.env.SMTP_FROM_NAME ?? SERVER_RUNTIME_DEFAULTS.smtpFromName;
  process.env.SMTP_SECURE = process.env.SMTP_SECURE ?? TEST_ENV_DEFAULTS.smtpSecure;
  process.env.NODE_ENV = 'test';
};

export const connectTestDb = async () => {
  const port = 27000 + (process.pid % 10000);
  mongo = await MongoMemoryServer.create({
    instance: {
      ip: '127.0.0.1',
      port
    }
  });
  const uri = mongo.getUri();
  process.env.MONGO_URI = uri;
  await mongoose.connect(uri);
};

export const clearTestDb = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(
    Object.values(collections).map(async (collection) => {
      await collection.deleteMany({});
    })
  );
};

export const disconnectTestDb = async () => {
  await mongoose.disconnect();
  if (mongo) {
    await mongo.stop();
    mongo = null;
  }
};

export const registerAndCreateCompany = async (app: any, userSeed: string) => {
  const { email, accessToken } = await createGoogleAuthSession(userSeed);

  await request(app)
    .post('/api/company/create')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({
      name: `Company ${userSeed}`,
      businessType: 'Retail',
      address: '123 Main St',
      phone: '1234567890',
      email: `company.${userSeed}@example.com`,
      timezone: 'America/New_York',
      currency: DEFAULT_CURRENCY_CODE
    })
    .expect(201);

  return { email, accessToken };
};

export const createGoogleAuthSession = async (userSeed: string) => {
  const email = `user.${userSeed}@example.com`;
  const user = await UserModel.create({
    firstName: 'Test',
    lastName: userSeed,
    email,
    googleId: `google-${userSeed.toLowerCase()}-${Date.now()}`,
    passwordHash: randomUUID(),
    emailVerifiedAt: new Date(),
    companyId: null,
    roleId: null
  });

  const accessToken = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    companyId: null,
    roleId: null
  });
  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: user._id.toString(), email: user.email, jti });
  const jtiHash = createHash('sha256').update(jti).digest('hex');
  await RefreshTokenModel.create({
    userId: user._id,
    jtiHash,
    expiresAt: new Date(Date.now() + AUTH_SESSION_DEFAULTS.refreshTokenTtlMs)
  });

  return {
    email,
    accessToken,
    refreshCookie: `refreshToken=${refreshToken}; Path=/; HttpOnly`
  };
};
