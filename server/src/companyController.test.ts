import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  companyExistsMock,
  companyCreateMock,
  inviteExistsMock,
  inviteCreateMock,
  roleCreateMock,
  userFindByIdMock,
  createCompanyForUserMock,
  claimPendingQuickBooksOnboardingMock,
  getPendingQuickBooksOnboardingMock,
  buildQuickBooksOnboardingConnectUrlMock
} = vi.hoisted(() => ({
  companyExistsMock: vi.fn(),
  companyCreateMock: vi.fn(),
  inviteExistsMock: vi.fn(),
  inviteCreateMock: vi.fn(),
  roleCreateMock: vi.fn(),
  userFindByIdMock: vi.fn(),
  createCompanyForUserMock: vi.fn(),
  claimPendingQuickBooksOnboardingMock: vi.fn(),
  getPendingQuickBooksOnboardingMock: vi.fn(),
  buildQuickBooksOnboardingConnectUrlMock: vi.fn()
}));

vi.mock('./models/Company', () => ({
  CompanyModel: {
    exists: (...args: unknown[]) => companyExistsMock(...args),
    create: (...args: unknown[]) => companyCreateMock(...args)
  }
}));

vi.mock('./models/Invite', () => ({
  InviteModel: {
    exists: (...args: unknown[]) => inviteExistsMock(...args),
    create: (...args: unknown[]) => inviteCreateMock(...args)
  }
}));

vi.mock('./models/Role', () => ({
  RoleModel: {
    create: (...args: unknown[]) => roleCreateMock(...args)
  }
}));

vi.mock('./models/User', () => ({
  UserModel: {
    findById: (...args: unknown[]) => userFindByIdMock(...args)
  }
}));

vi.mock('./services/companyOnboardingService', () => ({
  createCompanyForUser: (...args: unknown[]) => createCompanyForUserMock(...args)
}));

vi.mock('./services/quickbooks/applicationService', () => ({
  buildQuickBooksOnboardingConnectUrl: (...args: unknown[]) =>
    buildQuickBooksOnboardingConnectUrlMock(...args),
  claimPendingQuickBooksOnboarding: (...args: unknown[]) =>
    claimPendingQuickBooksOnboardingMock(...args),
  getPendingQuickBooksOnboarding: (...args: unknown[]) =>
    getPendingQuickBooksOnboardingMock(...args),
  quickBooksOAuthCookieOptions: () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 30 * 60 * 1000
  }),
  quickbooksOauthStateCookie: 'quickbooksOAuthState'
}));

type TestResponse = {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  cookie: ReturnType<typeof vi.fn>;
};

const createResponse = (): TestResponse => {
  const status = vi.fn();
  const json = vi.fn();
  const cookie = vi.fn();

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
    }
  } as unknown as Response;

  return { res, status, json, cookie };
};

describe('companyController QuickBooks onboarding flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyExistsMock.mockResolvedValue(null);
    inviteExistsMock.mockResolvedValue(null);
  });

  it('creates the company, assigns defaults, and claims pending QuickBooks onboarding', async () => {
    const { createCompany } = await import('./controllers/companyController');
    const user = {
      _id: 'user-1',
      email: 'owner@retailsync.com',
      companyId: null,
      roleId: null
    };
    const company = { _id: 'company-1', name: 'RetailSync' };
    const roles = [
      { _id: 'role-admin', name: 'Admin' },
      { _id: 'role-member', name: 'Member' },
      { _id: 'role-viewer', name: 'Viewer' }
    ];

    userFindByIdMock.mockResolvedValue(user);
    createCompanyForUserMock.mockResolvedValue({
      user,
      company,
      roles
    });
    claimPendingQuickBooksOnboardingMock.mockResolvedValue({
      connected: true,
      environment: 'sandbox',
      realmId: 'realm-1',
      companyName: 'RetailSync QB'
    });

    const { res, status, json } = createResponse();
    const req = {
      user: {
        id: 'user-1'
      },
      body: {
        name: 'RetailSync',
        businessType: 'Retail',
        address: '1 Main Street',
        phone: '5551234567',
        email: 'owner@retailsync.com',
        timezone: 'America/Los_Angeles',
        currency: 'USD'
      }
    } as unknown as Request;

    await createCompany(req, res);

    expect(createCompanyForUserMock).toHaveBeenCalledWith({
      userId: 'user-1',
      payload: expect.objectContaining({
        name: 'RetailSync'
      })
    });
    expect(claimPendingQuickBooksOnboardingMock).toHaveBeenCalledWith({
      userId: 'user-1',
      companyId: 'company-1'
    });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: expect.objectContaining({
          company,
          quickbooks: expect.objectContaining({
            connected: true,
            realmId: 'realm-1'
          })
        })
      })
    );
  });

  it('returns pending onboarding status for the authenticated user', async () => {
    const { getQuickBooksOnboardingStatus } = await import('./controllers/companyController');
    getPendingQuickBooksOnboardingMock.mockResolvedValue({
      connected: true,
      environment: 'sandbox',
      realmId: 'realm-1',
      companyName: 'RetailSync QB'
    });

    const { res, status, json } = createResponse();
    const req = {
      user: {
        id: 'user-1'
      }
    } as unknown as Request;

    await getQuickBooksOnboardingStatus(req, res);

    expect(getPendingQuickBooksOnboardingMock).toHaveBeenCalledWith('user-1');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: {
          quickbooks: expect.objectContaining({
            connected: true,
            companyName: 'RetailSync QB'
          })
        }
      })
    );
  });

  it('starts QuickBooks onboarding and stores the oauth nonce cookie', async () => {
    const { startQuickBooksOnboarding } = await import('./controllers/companyController');
    buildQuickBooksOnboardingConnectUrlMock.mockResolvedValue({
      url: 'https://appcenter.intuit.com/connect/oauth2?state=abc',
      nonce: 'nonce-1',
      environment: 'sandbox'
    });

    const { res, status, json, cookie } = createResponse();
    const req = {
      user: {
        id: 'user-1',
        companyId: null
      },
      body: {
        returnTo: '/onboarding/create-company'
      }
    } as unknown as Request;

    await startQuickBooksOnboarding(req, res);

    expect(buildQuickBooksOnboardingConnectUrlMock).toHaveBeenCalledWith({
      userId: 'user-1',
      returnToPath: '/onboarding/create-company'
    });
    expect(cookie).toHaveBeenCalledWith(
      'quickbooksOAuthState',
      'nonce-1',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        secure: false
      })
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'ok',
        data: {
          url: 'https://appcenter.intuit.com/connect/oauth2?state=abc',
          environment: 'sandbox'
        }
      })
    );
  });
});
