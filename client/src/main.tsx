import React from 'react';
import ReactDOM from 'react-dom/client';
import { AppSnackbar } from './components/AppSnackbar';
import { AppProviders } from './app/providers/AppProviders';
import { AppRoutes } from './app/routes';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <AppRoutes />
      <AppSnackbar />
    </AppProviders>
  </React.StrictMode>
);
