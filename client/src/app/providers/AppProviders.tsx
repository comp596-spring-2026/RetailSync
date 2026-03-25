import { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { ErrorBoundary, WonderLoader } from '../../components';
import { bootstrapPersistedAuthSession, persistor, store } from '../store';
import { RouterProvider } from './RouterProvider';
import { ThemeProvider } from './ThemeProvider';

type Props = {
  children: ReactNode;
};

export const AppProviders = ({ children }: Props) => {
  return (
    <Provider store={store}>
      <PersistGate
        loading={<WonderLoader fullscreen label="Restoring your workspace..." />}
        persistor={persistor}
        onBeforeLift={bootstrapPersistedAuthSession}
      >
        <ThemeProvider>
          <ErrorBoundary>
            <RouterProvider>{children}</RouterProvider>
          </ErrorBoundary>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
};
