import { api } from '../client';

export class ReportsApi {
  monthlySummary(month: string) {
    return api.get('/reports/monthly-summary', { params: { month } });
  }
}

export const reportsApi = new ReportsApi();
