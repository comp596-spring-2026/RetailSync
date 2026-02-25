import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { env } from './config/env';

const oauthGenerateAuthUrl = vi.fn();
const oauthGetToken = vi.fn();
const oauthVerifyIdToken = vi.fn();
const oauth2Constructor = vi.fn(() => ({
  generateAuthUrl: oauthGenerateAuthUrl,
  getToken: oauthGetToken,
  verifyIdToken: oauthVerifyIdToken
}));

const userFindOne = vi.fn();
const userCreate = vi.fn();
const refreshTokenCreate = vi.fn();
const signAccessTokenMock = vi.fn();
const signRefreshTokenMock = vi.fn();

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: oauth2Constructor
    }
  }
}));

vi.mock('./models/User', () => ({
  UserModel: {
    findOne: userFindOne,
    create: userCreate
  }
}));

vi.mock('./models/RefreshToken', () => ({
  RefreshTokenModel: {
    create: refreshTokenCreate
  }
}));

vi.mock('./utils/jwt', () => ({
  signAccessToken: signAccessTokenMock,
  signRefreshToken: signRefreshTokenMock
}));

type TestResponse = {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
  clearCookie: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
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

const originalEnv = {
  googleOAuthClientId: env.googleOAuthClientId,
  googleOAuthClientSecret: env.googleOAuthClientSecret,
  googleAuthRedirectUri: env.googleAuthRedirectUri,
  clientUrl: env.clientUrl,
  nodeEnv: env.nodeEnv
};

describe('google oauth auth routes', () => {
  let googleAuthStart: (req: Request, res: Response) => Promise<unknown>;
  let googleAuthCallback: (req: Request, res: Response) => Promise<unknown>;

  beforeAll(async () => {
    const module = await import('./controllers/authGoogleController');
    googleAuthStart = module.googleAuthStart;
    googleAuthCallback = module.googleAuthCallback;
  });

  beforeEach(() => {
    vi.clearAllMocks();

    env.googleOAuthClientId = originalEnv.googleOAuthClientId;
    env.googleOAuthClientSecret = originalEnv.googleOAuthClientSecret;
    env.googleAuthRedirectUri = originalEnv.googleAuthRedirectUri;
    env.clientUrl = originalEnv.clientUrl;
    env.nodeEnv = 'test';
  });

  it('returns 501 when oauth env is not configured', async () => {
    env.googleOAuthClientId = undefined;
    env.googleOAuthClientSecret = undefined;
    env.googleAuthRedirectUri = undefined;
    const { res, status, json } = createResponse();

    await googleAuthStart({} as Request, res);

    expect(status).toHaveBeenCalledWith(501);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'error'
      })
    );
    expect(oauth2Constructor).not.toHaveBeenCalled();
  });

  it('redirects to google consent url when oauth env is configured', async () => {
    env.googleOAuthClientId = 'google-client';
    env.googleOAuthClientSecret = 'google-secret';
    env.googleAuthRedirectUri = 'http://localhost:4000/api/auth/google/callback';
    oauthGenerateAuthUrl.mockReturnValue('https://accounts.google.com/mock-consent');
    const { res, cookie, redirect } = createResponse();

    await googleAuthStart({} as Request, res);

    expect(oauth2Constructor).toHaveBeenCalledWith(
      'google-client',
      'google-secret',
      'http://localhost:4000/api/auth/google/callback'
    );
    expect(cookie).toHaveBeenCalledWith(
      'googleOAuthState',
      expect.stringMatching(/^[a-f0-9]{48}$/),
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    );
    expect(redirect).toHaveBeenCalledWith('https://accounts.google.com/mock-consent');
  });

  it('rejects callback when oauth state is invalid', async () => {
    env.clientUrl = 'http://localhost:4630';
    const { res, clearCookie, redirect } = createResponse();
    const req = {
      query: { code: 'code-1', state: 'state-1' },
      cookies: {}
    } as unknown as Request;

    await googleAuthCallback(req, res);

    expect(clearCookie).toHaveBeenCalledWith(
      'googleOAuthState',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    );
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:4630/login?error=google_oauth_state_invalid'
    );
  });

  it('creates/updates user and redirects with access token on successful callback', async () => {
    env.googleOAuthClientId = 'google-client';
    env.googleOAuthClientSecret = 'google-secret';
    env.googleAuthRedirectUri = 'http://localhost:4000/api/auth/google/callback';
    env.clientUrl = 'http://localhost:4630';

    oauthGetToken.mockResolvedValue({ tokens: { id_token: 'id-token-1' } });
    oauthVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-1',
        email: 'oauth.user@example.com',
        email_verified: true,
        given_name: 'OAuth',
        family_name: 'User'
      })
    });
    userFindOne.mockResolvedValue(null);
    userCreate.mockResolvedValue({
      _id: { toString: () => 'user-1' },
      email: 'oauth.user@example.com',
      companyId: null,
      roleId: null
    });
    signAccessTokenMock.mockReturnValue('access-token-1');
    signRefreshTokenMock.mockReturnValue('refresh-token-1');
    refreshTokenCreate.mockResolvedValue(undefined);

    const { res, cookie, redirect } = createResponse();
    const req = {
      query: { code: 'oauth-code-1', state: 'state-1' },
      cookies: { googleOAuthState: 'state-1' }
    } as unknown as Request;

    await googleAuthCallback(req, res);

    expect(userFindOne).toHaveBeenCalledWith({
      $or: [{ googleId: 'google-sub-1' }, { email: 'oauth.user@example.com' }]
    });
    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'oauth.user@example.com',
        googleId: 'google-sub-1'
      })
    );
    expect(signAccessTokenMock).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'oauth.user@example.com',
      companyId: null,
      roleId: null
    });
    expect(refreshTokenCreate).toHaveBeenCalledTimes(1);
    expect(cookie).toHaveBeenCalledWith(
      'refreshToken',
      'refresh-token-1',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
    );
    expect(redirect).toHaveBeenCalledWith(
      'http://localhost:4630/auth/google/success?accessToken=access-token-1'
    );
  });
});
