import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App';
import { persistor, store } from './app/store';
import { theme } from './theme';
import { AppSnackbar } from './components/AppSnackbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WonderLoader } from './components/WonderLoader';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <PersistGate loading={<WonderLoader fullscreen label="Restoring your workspace..." />} persistor={persistor}>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <ErrorBoundary>
            <BrowserRouter>
              <App />
              <AppSnackbar />
            </BrowserRouter>
          </ErrorBoundary>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  </React.StrictMode>
);
