import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authReducer from '../features/auth/authSlice';
import companyReducer from '../features/company/companySlice';
import rbacReducer from '../features/rbac/rbacSlice';
import uiReducer from '../features/ui/uiSlice';

const mockListTabs = vi.fn();
const mockPreviewSheet = vi.fn();

vi.mock('../api/settingsApi', () => ({
  settingsApi: {
    listTabs: (...args: unknown[]) => mockListTabs(...args)
  }
}));

vi.mock('../api/posApi', () => ({
  posApi: {
    previewSheet: (...args: unknown[]) => mockPreviewSheet(...args),
    validateMapping: vi.fn(),
    commitImport: vi.fn()
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
  });

  afterEach(() => {
    cleanup();
  });

  it('loads tabs from settings API', async () => {
    await renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Select Tab' }));
    await waitFor(() => expect(mockListTabs).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Sheet1 rows:/i }));
    expect(screen.getByText('Select Sheet Tab')).toBeInTheDocument();
  });
});
