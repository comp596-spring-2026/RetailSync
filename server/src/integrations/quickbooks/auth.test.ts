import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadEncryptedProviderSecretMock, saveEncryptedProviderSecretMock } = vi.hoisted(() => ({
  loadEncryptedProviderSecretMock: vi.fn(),
  saveEncryptedProviderSecretMock: vi.fn()
}));

vi.mock('../common/encryptedSecretStore', () => ({
  loadEncryptedProviderSecret: loadEncryptedProviderSecretMock,
  saveEncryptedProviderSecret: saveEncryptedProviderSecretMock
}));

describe('quickbooks auth helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.QUICKBOOKS_CLIENT_ID = 'qb-client-id';
    process.env.QUICKBOOKS_CLIENT_SECRET = 'qb-client-secret';
    process.env.QUICKBOOKS_INTEGRATION_REDIRECT_URI =
      'http://localhost:4000/api/integrations/quickbooks/callback';
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes a stable health shape for a legacy secret payload', async () => {
    const { buildQuickBooksSecretHealth } = await import('./auth');
    const updatedAt = 1_700_000_000_000;
    const health = buildQuickBooksSecretHealth({
      payload: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: null,
        idToken: null,
        realmId: 'realm-1',
        environment: 'sandbox',
        companyName: 'RetailSync Demo',
        expiresAt: updatedAt + 30_000,
        refreshExpiresAt: updatedAt + 10 * 24 * 60 * 60 * 1000,
        updatedAt
      },
      checkedAt: updatedAt
    });

    expect(health).toEqual({
      status: 'degraded',
      checkedAt: updatedAt,
      refreshedAt: updatedAt,
      accessTokenExpiresAt: updatedAt + 30_000,
      accessTokenExpiresInSec: 30,
      refreshTokenExpiresAt: updatedAt + 10 * 24 * 60 * 60 * 1000,
      refreshTokenExpiresInSec: 10 * 24 * 60 * 60,
      lastRefreshError: null,
      lastRefreshErrorAt: null
    });
  });

  it('persists degraded health metadata when a token refresh is rejected', async () => {
    loadEncryptedProviderSecretMock.mockResolvedValue({
      accessToken: 'stale-access-token',
      refreshToken: 'refresh-token',
      tokenType: 'Bearer',
      scope: null,
      idToken: null,
      realmId: 'realm-1',
      environment: 'sandbox',
      companyName: 'RetailSync Demo',
      expiresAt: 1_700_000_000_000,
      refreshExpiresAt: 1_700_864_000_000,
      updatedAt: 1_700_000_000_000
    });

    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Token expired'
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json'
          }
        }
      )
    );

    const { refreshQuickBooksSecretForCompany } = await import('./auth');

    await expect(refreshQuickBooksSecretForCompany('company-1')).rejects.toThrow(
      'quickbooks_token_refresh_failed:quickbooks_token_exchange_failed:invalid_grant:Token expired'
    );

    expect(saveEncryptedProviderSecretMock).toHaveBeenCalledWith(
      'company-1',
      'quickbooks_oauth',
      expect.objectContaining({
        accessToken: 'stale-access-token',
        refreshToken: 'refresh-token',
        health: expect.objectContaining({
          status: 'degraded',
          lastRefreshError:
            'quickbooks_token_exchange_failed:invalid_grant:Token expired',
          lastRefreshErrorAt: expect.any(Number),
          refreshedAt: 1_700_000_000_000,
          accessTokenExpiresAt: 1_700_000_000_000
        })
      })
    );
  });
});
