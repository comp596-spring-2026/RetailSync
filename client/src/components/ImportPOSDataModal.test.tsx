import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../modules/auth/state';
import companyReducer from '../modules/users/state';
import rbacReducer from '../modules/rbac/state';
import uiReducer from '../app/store/uiSlice';
import { ImportPOSDataModal } from '../modules/pos/components/ImportPOSDataModal';

const mockListTabs = vi.fn();
const mockPreviewSheet = vi.fn();
const mockValidateMapping = vi.fn();
const mockCommitImport = vi.fn();
const mockGetSettings = vi.fn();
const mockConfigureSharedSheet = vi.fn();
const mockListTabsWithSpreadsheetId = vi.fn();
const mockListOAuthSpreadsheets = vi.fn();
const mockListSharedSpreadsheets = vi.fn();
const mockSetGoogleMode = vi.fn();
const mockSaveGoogleSheetsMapping = vi.fn();

vi.mock('../modules/settings/api', () => ({
  settingsApi: {
    get: (...args: unknown[]) => mockGetSettings(...args),
    listTabs: (...args: unknown[]) => mockListTabs(...args),
    listTabsWithSpreadsheetId: (...args: unknown[]) => mockListTabsWithSpreadsheetId(...args),
    listOAuthSpreadsheets: (...args: unknown[]) => mockListOAuthSpreadsheets(...args),
    listSharedSpreadsheets: (...args: unknown[]) => mockListSharedSpreadsheets(...args),
    configureSharedSheet: (...args: unknown[]) => mockConfigureSharedSheet(...args),
    setGoogleMode: (...args: unknown[]) => mockSetGoogleMode(...args),
    saveGoogleSheetsMapping: (...args: unknown[]) => mockSaveGoogleSheetsMapping(...args),
    getGoogleConnectUrl: vi.fn().mockResolvedValue({ data: { data: { url: 'https://google.com' } } })
  }
}));

vi.mock('../modules/pos/api', () => ({
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

const renderModal = () => {
  return render(
    <Provider store={createStore()}>
      <ImportPOSDataModal open onClose={vi.fn()} />
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
    mockListTabsWithSpreadsheetId.mockResolvedValue({
      data: { data: { tabs: [{ title: 'Sheet1', rowCount: 100, columnCount: 8 }] } }
    });
    mockListOAuthSpreadsheets.mockResolvedValue({ data: { data: { files: [] } } });
    mockListSharedSpreadsheets.mockResolvedValue({ data: { data: { files: [] } } });
    mockConfigureSharedSheet.mockResolvedValue({ data: { data: {} } });
    mockSetGoogleMode.mockResolvedValue({ data: { data: {} } });
    mockSaveGoogleSheetsMapping.mockResolvedValue({ data: { data: {} } });
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
    renderModal();
    expect(screen.getByText('Import POS Data')).toBeInTheDocument();
    expect(screen.queryAllByText('Import Excel').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Google Sheets').length).toBeGreaterThan(0);
  });

  it('shows source selection guidance', async () => {
    renderModal();
    expect(screen.getByText('Select a data source to begin importing POS data.')).toBeInTheDocument();
  });

  it('allows selecting Google Sheets and shows setup guidance', async () => {
    renderModal();
    fireEvent.click(screen.getAllByText('Google Sheets')[0]);

    expect(await screen.findByText('Source')).toBeInTheDocument();
    expect(screen.queryByText('Select a data source to begin importing POS data.')).not.toBeInTheDocument();
    expect(screen.getAllByText('Google Sheets').length).toBeGreaterThan(0);
  });

  it('allows selecting Import Excel and shows upload', async () => {
    renderModal();
    fireEvent.click(screen.getAllByText('Import Excel')[0]);

    expect(await screen.findByText('Click to choose a file')).toBeInTheDocument();
  });
});
