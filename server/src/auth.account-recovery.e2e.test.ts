import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EmailVerificationTokenModel } from './models/EmailVerificationToken';
import { clearTestEmailOutbox, testEmailOutbox } from './services/emailService';
import { UserModel } from './models/User';
import { clearTestDb, connectTestDb, disconnectTestDb, setupTestEnv } from './test/testUtils';
import { env } from './config/env';

const extractCode = (html: string) => {
  const match = html.match(/\b\d{3}-\d{3}\b/);
  return match?.[0] ?? '';
};

describe('auth account recovery e2e', () => {
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    const module = await import('./app');
    app = module.createApp();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    clearTestEmailOutbox();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('creates verification code on registration and verifies user by code', async () => {
    const registerRes = await request(app).post('/api/auth/register').send({
      firstName: 'Verify',
      lastName: 'Code',
      email: 'verify.code@example.com',
      password: 'Password123',
      confirmPassword: 'Password123'
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.data.verificationSent).toBe(true);

    const tokenCount = await EmailVerificationTokenModel.countDocuments();
    expect(tokenCount).toBe(1);
    expect(testEmailOutbox.length).toBe(1);
    expect(testEmailOutbox[0].subject).toContain('Verify');
    expect(testEmailOutbox[0].html).toContain('RetailSync');
    expect(testEmailOutbox[0].html).toContain(env.resendBrandIconUrl || `${env.clientUrl}/brand/icon.png`);

    const verificationCode = extractCode(testEmailOutbox[0].html);
    expect(verificationCode).toMatch(/^\d{3}-\d{3}$/);

    const verifyRes = await request(app).post('/api/auth/verify-email').send({ token: verificationCode });
    expect(verifyRes.status).toBe(200);

    const user = await UserModel.findOne({ email: 'verify.code@example.com' });
    expect(user?.emailVerifiedAt).toBeTruthy();
  });

  it('sends reset code and resets password using 3-3 code', async () => {
    await request(app).post('/api/auth/register').send({
      firstName: 'Reset',
      lastName: 'Code',
      email: 'reset.code@example.com',
      password: 'Password123',
      confirmPassword: 'Password123'
    });
    const signupVerificationCode = extractCode(testEmailOutbox[0]?.html ?? '');
    expect(signupVerificationCode).toMatch(/^\d{3}-\d{3}$/);
    const verifyRes = await request(app).post('/api/auth/verify-email').send({ token: signupVerificationCode });
    expect(verifyRes.status).toBe(200);
    clearTestEmailOutbox();

    const forgotRes = await request(app).post('/api/auth/forgot-password').send({
      email: 'reset.code@example.com'
    });
    expect(forgotRes.status).toBe(200);
    expect(testEmailOutbox.length).toBe(1);
    expect(testEmailOutbox[0].html).toContain('RetailSync');
    expect(testEmailOutbox[0].html).toContain(env.resendBrandIconUrl || `${env.clientUrl}/brand/icon.png`);
    const resetCode = extractCode(testEmailOutbox[0].html);
    expect(resetCode).toMatch(/^\d{3}-\d{3}$/);

    const invalidFormatRes = await request(app).post('/api/auth/reset-password').send({
      token: '123456',
      password: 'NewPassword123',
      confirmPassword: 'NewPassword123'
    });
    expect(invalidFormatRes.status).toBe(422);

    const resetRes = await request(app).post('/api/auth/reset-password').send({
      token: resetCode,
      password: 'NewPassword123',
      confirmPassword: 'NewPassword123'
    });
    expect(resetRes.status).toBe(200);

    const oldLoginRes = await request(app).post('/api/auth/login').send({
      email: 'reset.code@example.com',
      password: 'Password123'
    });
    expect(oldLoginRes.status).toBe(401);

    const newLoginRes = await request(app).post('/api/auth/login').send({
      email: 'reset.code@example.com',
      password: 'NewPassword123'
    });
    expect(newLoginRes.status).toBe(200);
  });
});
