import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ProcurementHubPage } from './ProcurementHubPage';

describe('ProcurementHubPage', () => {
  it('renders procurement tabs and switches to suppliers view', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ProcurementHubPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Procurement' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Invoices' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create invoice' })).toBeInTheDocument();
    expect(screen.getByText('Invoice ID')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Suppliers' }));
    expect(screen.getByRole('button', { name: 'Add supplier' })).toBeInTheDocument();
    expect(screen.getByText('Supplier directory')).toBeInTheDocument();
    expect(screen.getByText('Supplier')).toBeInTheDocument();
  });
});
