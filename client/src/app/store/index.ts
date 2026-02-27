import { combineReducers, configureStore } from '@reduxjs/toolkit';
import storage from 'redux-persist/lib/storage';
import { persistReducer, persistStore } from 'redux-persist';
import authReducer from '../../slices/auth/authSlice';
import companyReducer from '../../slices/company/companySlice';
import rbacReducer from '../../slices/rbac/rbacSlice';
import uiReducer from '../../slices/ui/uiSlice';
import itemsReducer from '../../slices/items/itemsSlice';
import locationsReducer from '../../slices/locations/locationsSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  company: companyReducer,
  rbac: rbacReducer,
  ui: uiReducer,
  items: itemsReducer,
  locations: locationsReducer
});

const persistConfig = {
  key: 'retailsync-root',
  storage,
  whitelist: ['auth', 'company']
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    })
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
