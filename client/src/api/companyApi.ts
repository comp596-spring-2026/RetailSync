import { api } from './client';

export const companyApi = {
  create: (payload: {
    name: string;
    businessType: string;
    address: string;
    phone: string;
    email: string;
    timezone: string;
    currency: string;
  }) => api.post('/company/create', payload),
  join: (payload: { companyCode: string; inviteCode: string; email: string }) => api.post('/company/join', payload),
  mine: () => api.get('/company/mine')
};
