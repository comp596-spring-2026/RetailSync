import type {
  QuickBooksHubChartAccount,
  QuickBooksHubChartOfAccountsQuery,
  QuickBooksHubChartOfAccountsResponse,
  QuickBooksHubEntitiesQuery,
  QuickBooksHubEntitiesResponse,
  QuickBooksHubEntity,
  QuickBooksHubOperation,
  QuickBooksHubOperationsQuery,
  QuickBooksHubOperationsResponse
} from '@retailsync/shared';
import type { GridSortModel } from '@mui/x-data-grid';

export type QuickBooksHubSortModel = GridSortModel;

export type QuickBooksChartOfAccountsRow = QuickBooksHubChartAccount;
export type QuickBooksHubEntityRow = QuickBooksHubEntity;
export type QuickBooksHubOperationRow = QuickBooksHubOperation;

export type QuickBooksHubChartOfAccountsParams = QuickBooksHubChartOfAccountsQuery;
export type QuickBooksHubEntitiesParams = QuickBooksHubEntitiesQuery;
export type QuickBooksHubOperationsParams = QuickBooksHubOperationsQuery;
export type QuickBooksHubChartOfAccountsPayload = QuickBooksHubChartOfAccountsResponse;
export type QuickBooksHubEntitiesPayload = QuickBooksHubEntitiesResponse;
export type QuickBooksHubOperationsPayload = QuickBooksHubOperationsResponse;
export type QuickBooksHubEntityType = 'customer' | 'vendor';

export const quickBooksHubSortToParam = (sortModel: GridSortModel) => {
  const firstSort = sortModel[0];
  if (!firstSort?.field || !firstSort.sort) {
    return undefined;
  }
  return `${firstSort.sort === 'desc' ? '-' : ''}${firstSort.field}`;
};
