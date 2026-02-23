import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { clearTestEmailOutbox, testEmailOutbox } from '../services/emailService';

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
  clearTestEmailOutbox();
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
  const { email, accessToken, registerRes, loginRes } = await registerVerifyAndLogin(app, userSeed);

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

  return { email, accessToken, registerRes, loginRes };
};

export const registerVerifyAndLogin = async (app: any, userSeed: string) => {
  const email = `user.${userSeed}@example.com`;
  const normalizedEmail = email.toLowerCase();
  const registerRes = await request(app).post('/api/auth/register').send({
    firstName: 'Test',
    lastName: userSeed,
    email,
    password: 'Password123',
    confirmPassword: 'Password123'
  });

  const extractCodeFromHtml = (html: string) => {
    const match = html.match(/\b\d{3}-\d{3}\b/);
    return match?.[0];
  };

  const verifyCodeFromResponse = registerRes.body?.data?.verifyCode as string | undefined;
  const latestVerificationEmail = [...testEmailOutbox]
    .reverse()
    .find((entry) => entry.to.toLowerCase() === normalizedEmail && entry.subject.includes('Verify'));
  const verifyCode =
    verifyCodeFromResponse || (latestVerificationEmail ? extractCodeFromHtml(latestVerificationEmail.html) : undefined);
  if (!verifyCode) {
    throw new Error(`Verification code not available for ${email}`);
  }

  await request(app).post('/api/auth/verify-email').send({ token: verifyCode }).expect(200);

  const loginRes = await request(app).post('/api/auth/login').send({
    email,
    password: 'Password123'
  });
  const accessToken = loginRes.body.data.accessToken as string;
  if (!accessToken) {
    throw new Error(`Login access token missing for ${email}`);
  }

  return { email, accessToken, registerRes, loginRes };
};
