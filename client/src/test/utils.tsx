import type { PropsWithChildren, ReactElement } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { authReducer } from '../modules/auth/state';
import { posReducer } from '../modules/pos/state';
import { rbacReducer } from '../modules/rbac/state';
import { settingsReducer } from '../modules/settings/state';
import { companyReducer, usersReducer } from '../modules/users/state';
import { uiReducer } from '../app/store/uiSlice';

type AppTestState = {
  auth: ReturnType<typeof authReducer>;
  company: ReturnType<typeof companyReducer>;
  users: ReturnType<typeof usersReducer>;
  rbac: ReturnType<typeof rbacReducer>;
  ui: ReturnType<typeof uiReducer>;
  settings: ReturnType<typeof settingsReducer>;
  pos: ReturnType<typeof posReducer>;
};

export const appTestRouterFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
} as const;

export const createAppTestStore = (preloadedState?: Partial<AppTestState>) =>
  configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      users: usersReducer,
      rbac: rbacReducer,
      ui: uiReducer,
      settings: settingsReducer,
      pos: posReducer
    },
    preloadedState: preloadedState as AppTestState | undefined
  });

type AppTestStore = ReturnType<typeof createAppTestStore>;

type RenderWithAppProvidersOptions = {
  initialEntries?: string[];
  preloadedState?: Partial<AppTestState>;
  store?: AppTestStore;
};

const AppTestProviders = ({
  children,
  initialEntries,
  store
}: PropsWithChildren<{
  initialEntries?: string[];
  store: AppTestStore;
}>) => (
  <Provider store={store}>
    <MemoryRouter
      future={appTestRouterFuture}
      initialEntries={initialEntries && initialEntries.length ? initialEntries : ['/']}
    >
      {children}
    </MemoryRouter>
  </Provider>
);

export const renderWithAppProviders = (
  ui: ReactElement,
  { initialEntries, preloadedState, store = createAppTestStore(preloadedState) }: RenderWithAppProvidersOptions = {}
) => ({
  store,
  ...render(ui, {
    wrapper: ({ children }) => (
      <AppTestProviders initialEntries={initialEntries} store={store}>
        {children}
      </AppTestProviders>
    )
  })
});
