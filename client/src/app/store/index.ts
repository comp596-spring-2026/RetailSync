import { configureStore } from '@reduxjs/toolkit';
import storage from 'redux-persist/lib/storage';
import { persistReducer, persistStore } from 'redux-persist';
import { rootReducer } from './rootReducer';
import { markAuthRehydrated, syncAuthContextThunk } from '../../modules/auth/state';

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

export const bootstrapPersistedAuthSession = async () => {
  store.dispatch(markAuthRehydrated());
  if (!store.getState().auth.accessToken) {
    return;
  }

  try {
    await store.dispatch(syncAuthContextThunk({ reason: 'persist_restore' })).unwrap();
  } catch {
    // Best effort only. We keep the session bootstrapped and let route guards/app flow continue.
  }
};

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
