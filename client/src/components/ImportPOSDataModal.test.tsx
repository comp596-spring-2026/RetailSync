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

vi.mock('../api', () => ({
  settingsApi: {
    listTabs: (...args: unknown[]) => mockListTabs(...args)
  },
  posApi: {
    previewSheet: (...args: unknown[]) => mockPreviewSheet(...args),
    validateMapping: (...args: unknown[]) => mockValidateMapping(...args),
    commitImport: (...args: unknown[]) => mockCommitImport(...args)
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
    mockListTabs.mockResolvedValue({
      data: { data: { tabs: [{ title: 'Sheet1', rowCount: 100, columnCount: 8 }] } }
    });
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

  it('loads tabs from settings API', async () => {
    await renderModal();

    await waitFor(() => expect(mockListTabs).toHaveBeenCalled());
    expect(screen.getByRole('combobox', { name: 'Sheet Tab' })).toBeInTheDocument();
    expect(screen.getByText('Selected tab: Sheet1')).toBeInTheDocument();
  });

  it('moves from source to preview and triggers preview call', async () => {
    await renderModal();

    await waitFor(() => expect(mockListTabs).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('button', { name: 'Load Preview' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load Preview' }));
    await waitFor(() => expect(mockPreviewSheet).toHaveBeenCalledWith({ source: 'service', tab: 'Sheet1', maxRows: 20 }));
    expect(screen.getByRole('button', { name: 'Validate Mapping' })).toBeInTheDocument();
  });
});
