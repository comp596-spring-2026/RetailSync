import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearTestDb, connectTestDb, disconnectTestDb, setupTestEnv } from './test/testUtils';
import { InviteModel } from './models/Invite';

const mailMocks = vi.hoisted(() => ({
  sendVerificationEmailMock: vi.fn(),
  sendPasswordResetEmailMock: vi.fn(),
  sendInviteEmailMock: vi.fn()
}));

vi.mock('./services/mailer', () => ({
  sendVerificationEmail: mailMocks.sendVerificationEmailMock,
  sendPasswordResetEmail: mailMocks.sendPasswordResetEmailMock,
  sendInviteEmail: mailMocks.sendInviteEmailMock
}));

describe('email/password auth flows', () => {
  const TEST_TIMEOUT_MS = 20_000;
  let app: ReturnType<(typeof import('./app'))['createApp']>;

  beforeAll(async () => {
    setupTestEnv();
    const module = await import('./app');
    app = module.createApp();
    await connectTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  it('registers, verifies, refreshes into company context, and sends invite emails', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'Stronger123!'
      })
      .expect(201);

    expect(registerRes.body.data.verificationRequired).toBe(true);
    expect(mailMocks.sendVerificationEmailMock).toHaveBeenCalledTimes(1);

    await request(app)
      .post('/api/auth/verify-email/request')
      .send({ email: 'ada@example.com' })
      .expect(200);

    expect(mailMocks.sendVerificationEmailMock).toHaveBeenCalledTimes(2);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'Stronger123!' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data.accessToken).toBeNull();
        expect(body.data.requiresVerification).toBe(true);
        expect(body.data.email).toBe('ada@example.com');
      });

    const verificationToken = mailMocks.sendVerificationEmailMock.mock.calls.at(-1)?.[0]
      ?.verificationToken as string;

    const confirmRes = await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: verificationToken })
      .expect(200);

    const refreshCookie = confirmRes.headers['set-cookie']?.[0];
    const accessToken = confirmRes.body.data.accessToken as string;
    expect(refreshCookie).toBeDefined();
    expect(accessToken).toBeTruthy();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ada@example.com', password: 'Stronger123!' })
      .expect(200);

    expect(loginRes.body.data.accessToken).toBeTruthy();

    const companyRes = await request(app)
      .post('/api/company/create')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Ada Retail',
        businessType: 'Retail',
        address: '1 Logic Lane',
        phone: '555-0101',
        email: 'ada@example.com',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      })
      .expect(201);

    const memberRoleId = companyRes.body.data.roles.find((role: { name: string }) => role.name === 'Member')?._id;
    expect(memberRoleId).toBeTruthy();

    const refreshed = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .expect(200);
    const refreshedAccessToken = refreshed.body.data.accessToken as string;

    const inviteRes = await request(app)
      .post('/api/invites')
      .set('Authorization', `Bearer ${refreshedAccessToken}`)
      .send({
        email: 'new.member@example.com',
        roleId: memberRoleId,
        expiresInDays: 7
      })
      .expect(201);

    expect(inviteRes.body.data.inviteCode).toBeTruthy();
    expect(mailMocks.sendInviteEmailMock).toHaveBeenCalledTimes(1);
    expect(mailMocks.sendInviteEmailMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        email: 'new.member@example.com',
        companyName: 'Ada Retail',
        roleName: 'Member'
      })
    );

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshedAccessToken}`)
      .expect(200);

    expect(meRes.body.data.user.email).toBe('ada@example.com');
    expect(meRes.body.data.company.name).toBe('Ada Retail');
    expect(meRes.body.data.role.name).toBe('Admin');
  }, TEST_TIMEOUT_MS);

  it('sends password reset email and accepts the reset token', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Grace',
        lastName: 'Hopper',
        email: 'grace@example.com',
        password: 'Original123!'
      })
      .expect(201);

    const verificationToken = mailMocks.sendVerificationEmailMock.mock.calls.at(-1)?.[0]
      ?.verificationToken as string;
    await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: verificationToken })
      .expect(200);

    await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'grace@example.com' })
      .expect(200);

    expect(mailMocks.sendPasswordResetEmailMock).toHaveBeenCalledTimes(1);
    const resetToken = mailMocks.sendPasswordResetEmailMock.mock.calls.at(-1)?.[0]
      ?.resetToken as string;

    await request(app)
      .post('/api/auth/reset-password')
      .send({
        token: resetToken,
        password: 'Updated123!'
      })
      .expect(200);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'grace@example.com', password: 'Original123!' })
      .expect(401);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'grace@example.com', password: 'Updated123!' })
      .expect(200);

    expect(loginRes.body.data.accessToken).toBeTruthy();
  }, TEST_TIMEOUT_MS);

  it('accepts company invite through the dedicated invite route and lands the user in the invited role', async () => {
    const ownerRegisterRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Owner',
        lastName: 'Admin',
        email: 'owner@example.com',
        password: 'Owner123!'
      })
      .expect(201);

    const ownerVerificationToken = ownerRegisterRes.body.data
      ? mailMocks.sendVerificationEmailMock.mock.calls.at(-1)?.[0]?.verificationToken
      : null;
    const ownerConfirmRes = await request(app)
      .post('/api/auth/verify-email/confirm')
      .send({ token: ownerVerificationToken })
      .expect(200);

    const ownerAccessToken = ownerConfirmRes.body.data.accessToken as string;
    const companyRes = await request(app)
      .post('/api/company/create')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        name: 'Invite Retail',
        businessType: 'Retail',
        address: '11 Access Way',
        phone: '555-1212',
        email: 'owner@example.com',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      })
      .expect(201);

    const viewerRoleId = companyRes.body.data.roles.find((entry: { name: string }) => entry.name === 'Viewer')?._id;
    expect(viewerRoleId).toBeTruthy();

    const inviteRes = await request(app)
      .post('/api/invites')
      .set('Authorization', `Bearer ${ownerAccessToken}`)
      .send({
        email: 'invitee@example.com',
        roleId: viewerRoleId,
        expiresInDays: 7
      })
      .expect(201);

    const inviteCode = inviteRes.body.data.inviteCode as string;
    const inviteLookupRes = await request(app)
      .get('/api/auth/invite')
      .query({
        email: 'invitee@example.com',
        inviteCode
      })
      .expect(200);

    expect(inviteLookupRes.body.data.company).toEqual(
      expect.objectContaining({
        name: 'Invite Retail'
      })
    );
    expect(inviteLookupRes.body.data.role).toEqual(
      expect.objectContaining({
        name: 'Viewer'
      })
    );

    const acceptRes = await request(app)
      .post('/api/auth/invite/accept')
      .send({
        firstName: 'Invited',
        lastName: 'Member',
        email: 'invitee@example.com',
        password: 'Invitee123!',
        inviteCode
      })
      .expect(201);

    expect(acceptRes.body.data.company).toEqual(
      expect.objectContaining({
        name: 'Invite Retail'
      })
    );
    expect(acceptRes.body.data.role).toEqual(
      expect.objectContaining({
        name: 'Viewer'
      })
    );
    expect(acceptRes.body.data.accessToken).toBeTruthy();

    const inviteRecord = await InviteModel.findOne({ code: inviteCode }).lean();
    expect(inviteRecord?.acceptedAt).toBeTruthy();
  }, TEST_TIMEOUT_MS);
});
