/**
 * API barrel. Domain folders align with backend routes and with slices where they exist.
 * Import: `import { authApi, posApi } from '../api';` or `import { authApi } from '../api/auth';`
 */
export { api } from './client';
export { authApi } from './auth';
export { companyApi } from './company';
export { inventoryApi } from './inventory';
export { itemsApi } from './items';
export { locationsApi } from './locations';
export { posApi } from './pos';
export { rbacApi } from './rbac';
export { reportsApi } from './reports';
export { settingsApi } from './settings';
export type { GoogleSheetMode, GoogleSheetSource, QuickbooksEnvironment } from './settings';
export { userApi } from './users';
