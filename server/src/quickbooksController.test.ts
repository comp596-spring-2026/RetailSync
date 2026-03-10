import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupTestEnv } from './test/testUtils';

const {
  getOrCreateSettingsMock,
  buildQuickBooksAuthorizationUrlMock,
  ensureFreshQuickBooksSecretMock,
  exchangeQuickBooksAuthorizationCodeMock,
  fetchQuickBooksCompanyNameMock,
  loadQuickBooksSecretMock,
  saveQuickBooksSecretMock,
  toQuickBooksSecretPayloadMock
} = vi.hoisted(() => ({
  getOrCreateSettingsMock: vi.fn(),
  buildQuickBooksAuthorizationUrlMock: vi.fn(),
  ensureFreshQuickBooksSecretMock: vi.fn(),
  exchangeQuickBooksAuthorizationCodeMock: vi.fn(),
  fetchQuickBooksCompanyNameMock: vi.fn(),
  loadQuickBooksSecretMock: vi.fn(),
  saveQuickBooksSecretMock: vi.fn(),
  toQuickBooksSecretPayloadMock: vi.fn()
}));

vi.mock('./utils/googleSheetsSettings', () => ({
  getOrCreateSettings: (...args: unknown[]) => getOrCreateSettingsMock(...args)
}));

vi.mock('./services/quickbooksService', () => ({
  buildQuickBooksAuthorizationUrl: (...args: unknown[]) =>
    buildQuickBooksAuthorizationUrlMock(...args),
  ensureFreshQuickBooksSecret: (...args: unknown[]) =>
    ensureFreshQuickBooksSecretMock(...args),
  exchangeQuickBooksAuthorizationCode: (...args: unknown[]) =>
    exchangeQuickBooksAuthorizationCodeMock(...args),
  fetchQuickBooksCompanyName: (...args: unknown[]) =>
    fetchQuickBooksCompanyNameMock(...args),
  loadQuickBooksSecret: (...args: unknown[]) => loadQuickBooksSecretMock(...args),
  saveQuickBooksSecret: (...args: unknown[]) => saveQuickBooksSecretMock(...args),
  toQuickBooksSecretPayload: (...args: unknown[]) =>
    toQuickBooksSecretPayloadMock(...args)
}));

type TestResponse = {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
};

type SettingsDoc = {
  quickbooks: {
    connected?: boolean;
    environment?: 'sandbox' | 'production';
    realmId?: string | null;
    companyName?: string | null;
    lastPullStatus?: 'idle' | 'running' | 'success' | 'error';
    lastPushStatus?: 'idle' | 'running' | 'success' | 'error';
    lastPullAt?: Date | null;
    lastPushAt?: Date | null;
    lastPullCount?: number;
    lastPushCount?: number;
    lastPullError?: string | null;
    lastPushError?: string | null;
    updatedAt?: Date;
  };
  save: ReturnType<typeof vi.fn>;
};

const createResponse = (): TestResponse => {
  const status = vi.fn();
  const json = vi.fn();
  const cookie = vi.fn();
  const clearCookie = vi.fn();
  const redirect = vi.fn();

  const res = {
    status: (code: number) => {
      status(code);
      return res;
    },
    json: (payload: unknown) => {
      json(payload);
      return res;
    },
    cookie: (...args: unknown[]) => {
      cookie(...args);
      return res;
    },
    clearCookie: (...args: unknown[]) => {
      clearCookie(...args);
      return res;
    },
    redirect: (location: string) => {
      redirect(location);
      return res;
    }
  } as unknown as Response;

  return { res, status, json, cookie, clearCookie, redirect };
};

const createSettingsDoc = (): SettingsDoc => ({
  quickbooks: {
    connected: false,
    environment: 'sandbox',
    realmId: null,
    companyName: null,
    lastPullStatus: 'idle',
    lastPushStatus: 'idle',
    lastPullAt: null,
    lastPushAt: null,
    lastPullCount: 0,
    lastPushCount: 0,
    lastPullError: null,
    lastPushError: null,
    updatedAt: new Date()
  },
  save: vi.fn().mockResolvedValue(undefined)
});

describe('quickbooksController oauth flow', () => {
  let env: (typeof import('./config/env'))['env'];
  let createQuickBooksConnectUrlResponse: (
    req: Request,
    res: Response,
    returnToPath?: string
  ) => Promise<unknown>;
  let quickBooksCallback: (req: Request, res: Response) => Promise<unknown>;
  let originalNodeEnv: string;
  let originalClientUrl: string;

  const signState = (overrides?: Partial<Record<string, unknown>>) =>
    jwt.sign(
      {
        nonce: 'nonce-1',
        userId: 'user-1',
        companyId: 'company-1',
        environment: 'sandbox',
        returnTo: '/dashboard/accounting/quickbooks',
        purpose: 'quickbooks_connect',
        ...(overrides ?? {})
      },
      env.accessSecret,
      {
        algorithm: 'HS256',
        expiresIn: '10m'
      }
    );

  beforeAll(async () => {
    setupTestEnv();
    process.env.ENCRYPTION_KEY =
      process.env.ENCRYPTION_KEY ?? Buffer.from('12345678901234567890123456789012').toString('base64');
    process.env.QUICKBOOKS_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID ?? 'qb-client-id';
    process.env.QUICKBOOKS_CLIENT_SECRET =
      process.env.QUICKBOOKS_CLIENT_SECRET ?? 'qb-client-secret';
    process.env.QUICKBOOKS_INTEGRATION_REDIRECT_URI =
      process.env.QUICKBOOKS_INTEGRATION_REDIRECT_URI ??
      'http://localhost:4000/api/integrations/quickbooks/callback';

    const envModule = await import('./config/env');
    env = envModule.env;
    originalNodeEnv = env.nodeEnv;
    originalClientUrl = env.clientUrl;

    const controller = await import('./controllers/quickbooksController');
    createQuickBooksConnectUrlResponse = controller.createQuickBooksConnectUrlResponse;
    quickBooksCallback = controller.quickBooksCallback;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    env.nodeEnv = originalNodeEnv;
    env.clientUrl = originalClientUrl;
  });

  it('uses secure none cookie policy in production when generating connect URL', async () => {
    env.nodeEnv = 'production';
    env.clientUrl = 'https://app.retailsync.com';
    const settings = createSettingsDoc();
    getOrCreateSettingsMock.mockResolvedValue(settings);
    buildQuickBooksAuthorizationUrlMock.mockReturnValue(
      'https://appcenter.intuit.com/connect/oauth2?mock=1'
    );

    const { res, status, json, cookie } = createResponse();
    const req = {
      user: {
        id: 'user-1',
        companyId: 'company-1'
      }
    } as unknown as Request;

    await createQuickBooksConnectUrlResponse(req, res, '/dashboard/accounting/quickbooks');

    expect(cookie).toHaveBeenCalledWith(
      'quickbooksOAuthState',
      expect.stringMatching(/^[a-f0-9]{24}$/),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'none',
        secure: true,
        maxAge: 10 * 60 * 1000
      })
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          url: 'https://appcenter.intuit.com/connect/oauth2?mock=1',
          environment: 'sandbox'
        })
      })
    );
  });

  it('returns oauth_state_mismatch when cookie is present and nonce differs', async () => {
    env.nodeEnv = 'test';
    env.clientUrl = 'http://localhost:5173';
    const { res, redirect, clearCookie } = createResponse();
    const req = {
      query: {
        code: 'auth-code-1',
        state: signState({ nonce: 'nonce-expected' }),
        realmId: 'realm-1'
      },
      cookies: {
        quickbooksOAuthState: 'nonce-actual'
      }
    } as unknown as Request;

    await quickBooksCallback(req, res);

    expect(clearCookie).toHaveBeenCalledWith(
      'quickbooksOAuthState',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false
      })
    );
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:5173/dashboard/accounting/quickbooks?quickbooks=error&reason=oauth_state_mismatch'
    );
    expect(exchangeQuickBooksAuthorizationCodeMock).not.toHaveBeenCalled();
  });

  it('continues callback when cookie is missing but signed state is valid', async () => {
    env.nodeEnv = 'test';
    env.clientUrl = 'http://localhost:5173';

    const settings = createSettingsDoc();
    const tokenResponse = {
      access_token: 'access-token-1',
      refresh_token: 'refresh-token-1',
      token_type: 'Bearer',
      scope: 'com.intuit.quickbooks.accounting',
      id_token: null,
      expires_in: 3600,
      x_refresh_token_expires_in: 86400
    };
    const secretPayload = {
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
      tokenType: 'Bearer',
      scope: 'com.intuit.quickbooks.accounting',
      idToken: null,
      realmId: 'realm-1',
      environment: 'sandbox' as const,
      companyName: null,
      expiresAt: Date.now() + 1000,
      refreshExpiresAt: Date.now() + 2000,
      updatedAt: Date.now()
    };

    getOrCreateSettingsMock.mockResolvedValue(settings);
    exchangeQuickBooksAuthorizationCodeMock.mockResolvedValue(tokenResponse);
    loadQuickBooksSecretMock.mockResolvedValue(null);
    toQuickBooksSecretPayloadMock.mockReturnValue(secretPayload);
    fetchQuickBooksCompanyNameMock.mockResolvedValue('RetailSync QB');
    saveQuickBooksSecretMock.mockResolvedValue(undefined);

    const { res, redirect } = createResponse();
    const req = {
      query: {
        code: 'auth-code-1',
        state: signState({ nonce: 'nonce-from-state' }),
        realmId: 'realm-1'
      },
      cookies: {}
    } as unknown as Request;

    await quickBooksCallback(req, res);

    expect(exchangeQuickBooksAuthorizationCodeMock).toHaveBeenCalledWith('auth-code-1');
    expect(saveQuickBooksSecretMock).toHaveBeenCalledWith(
      'company-1',
      expect.objectContaining({
        companyName: 'RetailSync QB',
        realmId: 'realm-1'
      })
    );
    expect(settings.quickbooks.connected).toBe(true);
    expect(settings.quickbooks.realmId).toBe('realm-1');
    expect(settings.quickbooks.companyName).toBe('RetailSync QB');
    expect(settings.save).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:5173/dashboard/accounting/quickbooks?quickbooks=connected'
    );
  });
});
