/**
 * Shared app API entrypoint.
 * Import then call: import { authApi } from './app/api'; authApi.me();
 */
export { api } from "./client";
export { authApi } from "../../modules/auth/api";
export { companyApi, userApi } from "../../modules/users/api";
export { itemsApi, locationsApi } from "../../modules/inventory/api";
export { posApi } from "../../modules/pos/api";
export { rbacApi } from "../../modules/rbac/api";
export { settingsApi } from "../../modules/settings/api";
export type {
  GoogleSheetMode,
  GoogleSheetSource,
  QuickbooksEnvironment,
} from "../../modules/settings/api";
