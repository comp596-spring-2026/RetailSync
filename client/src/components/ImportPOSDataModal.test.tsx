import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../slices/auth/authSlice';
import companyReducer from '../slices/company/companySlice';
import rbacReducer from '../slices/rbac/rbacSlice';
import uiReducer from '../slices/ui/uiSlice';

const mockListTabs = vi.fn();
const mockPreviewSheet = vi.fn();
const mockValidateMapping = vi.fn();
const mockCommitImport = vi.fn();
const mockGetSettings = vi.fn();
const mockConfigureSharedSheet = vi.fn();

vi.mock('../api', () => ({
  settingsApi: {
    get: (...args: unknown[]) => mockGetSettings(...args),
    listTabs: (...args: unknown[]) => mockListTabs(...args),
    configureSharedSheet: (...args: unknown[]) => mockConfigureSharedSheet(...args),
    getGoogleConnectUrl: vi.fn().mockResolvedValue({ data: { data: { url: 'https://google.com' } } })
  },
  posApi: {
    previewSheet: (...args: unknown[]) => mockPreviewSheet(...args),
    validateMapping: (...args: unknown[]) => mockValidateMapping(...args),
    commitImport: (...args: unknown[]) => mockCommitImport(...args),
    importFile: vi.fn().mockResolvedValue({ data: { data: {} } })
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
  const module = await import('./pos/ImportPOSDataModal');
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
    mockGetSettings.mockResolvedValue({
      data: { data: { googleSheets: { serviceAccountEmail: 'sa@test.iam.gserviceaccount.com', sharedConfig: { spreadsheetId: 'abc123' } } } }
    });
    mockListTabs.mockResolvedValue({
      data: { data: { tabs: [{ title: 'Sheet1', rowCount: 100, columnCount: 8 }] } }
    });
    mockConfigureSharedSheet.mockResolvedValue({ data: { data: {} } });
    mockPreviewSheet.mockResolvedValue({
      data: { data: { header: ['Date'], sampleRows: [['2026-01-01']], suggestions: [] } }
    });
    mockValidateMapping.mockResolvedValue({
      data: { data: { valid: true, rowErrors: [] } }
    });
    mockCommitImport.mockResolvedValue({
      data: { data: { jobId: 'job-1' } }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders three source options', async () => {
    await renderModal();
    expect(await screen.findByText('File Import')).toBeInTheDocument();
    expect(screen.getByText('Google Sheets')).toBeInTheDocument();
    expect(screen.getByText('POS / Database')).toBeInTheDocument();
  });

  it('shows coming soon chip only on POS/DB', async () => {
    await renderModal();
    const chips = screen.getAllByText('Coming Soon');
    expect(chips.length).toBe(1);
  });

  it('allows selecting Google Sheets and shows auth options', async () => {
    await renderModal();
    fireEvent.click(screen.getByText('Google Sheets'));

    expect(await screen.findByText('Sign in with Google')).toBeInTheDocument();
    expect(screen.getByText('Share with Service Account')).toBeInTheDocument();
  });

  it('allows selecting File Import and shows upload', async () => {
    await renderModal();
    fireEvent.click(screen.getByText('File Import'));

    expect(await screen.findByText('Click to choose a file')).toBeInTheDocument();
  });
});
