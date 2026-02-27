import { api } from '../client';

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

export class CompanyApi {
  create(payload: CreateCompanyPayload) {
    return api.post('/company/create', payload);
  }

  join(payload: JoinCompanyPayload) {
    return api.post('/company/join', payload);
  }

  mine() {
    return api.get('/company/mine');
  }
}

export const companyApi = new CompanyApi();
