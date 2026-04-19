import type {
  QuickBooksWriteDetail,
  QuickBooksWriteInvoiceCreateInput,
  QuickBooksWriteListItem,
  QuickBooksWritePaymentCreateInput
} from '@retailsync/shared';
import { api } from '../../../app/api/client';
import type {
  QuickBooksChartOfAccountsRow,
  QuickBooksHubEntityRow
} from '../types/quickbooksHub';
import { QUICKBOOKS_SERVICE_DEFAULTS } from '../constants';

type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export const quickbooksService = {
  async getCustomers(search?: string) {
    const response = await api.get<{ data: Paged<QuickBooksHubEntityRow> }>(
      '/integrations/quickbooks/hub/entities',
      {
        params: {
          entityType: 'customer',
          page: QUICKBOOKS_SERVICE_DEFAULTS.page,
          pageSize: QUICKBOOKS_SERVICE_DEFAULTS.pageSize,
          status: QUICKBOOKS_SERVICE_DEFAULTS.status,
          search: search?.trim() || undefined
        }
      }
    );

    return response.data.data.items;
  },

  async getAccounts(search?: string) {
    const response = await api.get<{ data: Paged<QuickBooksChartOfAccountsRow> }>(
      '/integrations/quickbooks/hub/chart-of-accounts',
      {
        params: {
          page: QUICKBOOKS_SERVICE_DEFAULTS.page,
          pageSize: QUICKBOOKS_SERVICE_DEFAULTS.pageSize,
          status: QUICKBOOKS_SERVICE_DEFAULTS.status,
          search: search?.trim() || undefined
        }
      }
    );

    return response.data.data.items;
  },

  async getInvoices(customerId?: string) {
    const response = await api.get<{
      data: {
        items: QuickBooksWriteListItem[];
      };
    }>('/integrations/quickbooks/write/invoice', {
      params: {
        page: QUICKBOOKS_SERVICE_DEFAULTS.page,
        pageSize: QUICKBOOKS_SERVICE_DEFAULTS.pageSize,
        sort: QUICKBOOKS_SERVICE_DEFAULTS.invoiceSort,
        customerId: customerId?.trim() || undefined
      }
    });

    return response.data.data.items;
  },

  async createInvoice(payload: QuickBooksWriteInvoiceCreateInput) {
    const response = await api.post<{ data: QuickBooksWriteDetail }>(
      '/integrations/quickbooks/write/invoice',
      payload
    );

    return response.data.data;
  },

  async recordPayment(payload: QuickBooksWritePaymentCreateInput) {
    const response = await api.post<{ data: QuickBooksWriteDetail }>(
      '/integrations/quickbooks/write/payment',
      payload
    );

    return response.data.data;
  }
};

export default quickbooksService;
