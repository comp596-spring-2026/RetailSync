import { combineReducers } from '@reduxjs/toolkit';
import { authReducer } from '../../modules/auth/state';
import { companyReducer } from '../../modules/users/state';
import { itemsReducer, locationsReducer } from '../../modules/inventory/state';
import { posReducer } from '../../modules/pos/state';
import { rbacReducer } from '../../modules/rbac/state';
import { settingsReducer } from '../../modules/settings/state';
import { uiReducer } from './uiSlice';

export const rootReducer = combineReducers({
  auth: authReducer,
  company: companyReducer,
  rbac: rbacReducer,
  ui: uiReducer,
  items: itemsReducer,
  locations: locationsReducer,
  settings: settingsReducer,
  pos: posReducer
});
