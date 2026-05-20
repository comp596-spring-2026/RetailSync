import { api } from './client';

export type DashboardSummary = {
  companyId: string;
  companyName: string | null;
};

export const dashboardApi = {
  getSummary() {
    return api.get<{ data: DashboardSummary }>('/dashboard');
  }
};
