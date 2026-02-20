import { api } from './client';

export const reportsApi = {
  monthlySummary: (month: string) => api.get('/reports/monthly-summary', { params: { month } })
};
