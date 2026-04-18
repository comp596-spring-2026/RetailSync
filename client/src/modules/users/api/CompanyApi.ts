import { api } from '../../../app/api/client';

export type CreateCompanyPayload = {
  name: string;
  businessType: string;
  address: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
};

export type JoinCompanyPayload = {
  companyCode: string;
  inviteCode: string;
  email: string;
};

export type QuickBooksOnboardingStatus = {
  quickbooks: {
    connected: boolean;
    environment: 'sandbox' | 'production';
    realmId: string;
    companyName: string | null;
  } | null;
};

export class CompanyApi {
  create(payload: CreateCompanyPayload) {
    return api.post('/company/create', payload);
  }

  getQuickBooksOnboardingStatus() {
    return api.get<{ data: QuickBooksOnboardingStatus }>('/company/quickbooks/onboarding');
  }

  startQuickBooksOnboarding(returnTo = '/onboarding/create-company') {
    return api.post<{ data: { url: string; environment: 'sandbox' | 'production' } }>(
      '/company/quickbooks/connect',
      { returnTo }
    );
  }

  join(payload: JoinCompanyPayload) {
    return api.post('/company/join', payload);
  }

  mine() {
    return api.get('/company/mine');
  }
}

export const companyApi = new CompanyApi();
