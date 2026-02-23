import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../features/auth/authSlice';
import companyReducer from '../features/company/companySlice';
import rbacReducer from '../features/rbac/rbacSlice';
import uiReducer from '../features/ui/uiSlice';

const mockImportFile = vi.fn();
const mockImportRows = vi.fn();
const mockReadSheet = vi.fn();
const mockGetGoogleConnectUrl = vi.fn();

vi.mock('../api/posApi', () => ({
  posApi: {
    importFile: (...args: unknown[]) => mockImportFile(...args),
    importRows: (...args: unknown[]) => mockImportRows(...args),
    readSheet: (...args: unknown[]) => mockReadSheet(...args),
    getGoogleConnectUrl: (...args: unknown[]) => mockGetGoogleConnectUrl(...args)
  }
}));

const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });

const renderModal = async () => {
  const module = await import('./ImportPOSDataModal');
  const Component = module.ImportPOSDataModal;
  return render(
    <Provider store={createStore()}>
      <Component open onClose={vi.fn()} />
    </Provider>
  );
};

describe('ImportPOSDataModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000/api');
    mockGetGoogleConnectUrl.mockResolvedValue({ data: { data: { url: 'http://localhost:4000/api/google/connect' } } });
  });

  afterEach(() => {
    cleanup();
  });

  it('locks google and service options when env flags are disabled', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000/api');
    vi.stubEnv('VITE_GOOGLE_OAUTH_ENABLED', 'false');
    vi.stubEnv('VITE_GOOGLE_SERVICE_ACCOUNT_ENABLED', 'false');
    vi.resetModules();

    await renderModal();

    expect(screen.getByText(/Locked: Google OAuth is disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Locked: Service account mode is disabled/i)).toBeInTheDocument();

    const connectCardTrigger = screen.getAllByText('Connect Google')[0];
    fireEvent.click(connectCardTrigger);

    expect(screen.queryByRole('button', { name: 'Connect Google' })).not.toBeInTheDocument();
  });

  it('enables google option when oauth env flag is enabled', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000/api');
    vi.stubEnv('VITE_GOOGLE_OAUTH_ENABLED', 'true');
    vi.stubEnv('VITE_GOOGLE_SERVICE_ACCOUNT_ENABLED', 'false');
    vi.resetModules();

    await renderModal();

    const connectCardButton = screen.getByRole('button', { name: /Connect Google Use OAuth/i });
    fireEvent.click(connectCardButton);

    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
  });

  it('imports selected file with upload mode', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:4000/api');
    vi.stubEnv('VITE_GOOGLE_OAUTH_ENABLED', 'false');
    vi.stubEnv('VITE_GOOGLE_SERVICE_ACCOUNT_ENABLED', 'false');
    vi.resetModules();

    mockImportFile.mockResolvedValue({ data: { status: 'ok' } });

    await renderModal();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    const file = new File(['DATE,HIGH TAX\n2026-01-01,10'], 'pos.csv', { type: 'text/csv' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Import' }));

    await waitFor(() => {
      expect(mockImportFile).toHaveBeenCalledTimes(1);
    });
  });
});
