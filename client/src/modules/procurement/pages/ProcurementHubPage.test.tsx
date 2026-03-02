import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import authReducer from '../../auth/state';
import companyReducer from '../../users/state';
import rbacReducer from '../../rbac/state';
import uiReducer from '../../../app/store/uiSlice';
import { ProcurementHubPage } from './ProcurementHubPage';

const createStore = () =>
  configureStore({
    reducer: {
      auth: authReducer,
      company: companyReducer,
      rbac: rbacReducer,
      ui: uiReducer
    }
  });

describe('ProcurementHubPage', () => {
  it('renders procurement tabs and switches to suppliers view', async () => {
    const user = userEvent.setup();

    render(
      <Provider store={createStore()}>
        <MemoryRouter>
          <ProcurementHubPage />
        </MemoryRouter>
      </Provider>
    );

    expect(screen.getByText('Procurement')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invoices' })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Suppliers' }));
    expect(screen.getByRole('heading', { name: 'Suppliers' })).toBeInTheDocument();
  });
});
