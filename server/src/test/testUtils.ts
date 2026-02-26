import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { UserModel } from '../models/User';
import { RefreshTokenModel } from '../models/RefreshToken';
import { signAccessToken, signRefreshToken } from '../utils/jwt';

let mongo: MongoMemoryServer | null = null;

export const setupTestEnv = () => {
  process.env.PORT = process.env.PORT ?? '4000';
  process.env.MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27017/retailsync-test';
  process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'test-refresh-secret';
  process.env.CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
  process.env.NODE_ENV = 'test';
};

export const connectTestDb = async () => {
  mongo = await MongoMemoryServer.create();
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
      currency: 'USD'
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
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  return {
    email,
    accessToken,
    refreshCookie: `refreshToken=${refreshToken}; Path=/; HttpOnly`
  };
};
