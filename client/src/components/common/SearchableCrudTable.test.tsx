import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SearchableCrudTable } from './SearchableCrudTable';

type Row = {
  id: string;
  name: string;
  reference: string;
};

const rows: Row[] = [
  { id: '1', name: 'Alpha Supplier', reference: 'SUP-100' },
  { id: '2', name: 'Beta Supplier', reference: 'SUP-200' }
];

describe('SearchableCrudTable', () => {
  it('filters rows and triggers row actions', () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <SearchableCrudTable
        rows={rows}
        columns={[
          { id: 'name', label: 'Name', render: (row) => row.name },
          { id: 'reference', label: 'Reference', render: (row) => row.reference }
        ]}
        getRowId={(row) => row.id}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('Alpha Supplier')).toBeInTheDocument();
    expect(screen.getByText('Beta Supplier')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search records'), { target: { value: 'beta' } });
    expect(screen.queryByText('Alpha Supplier')).not.toBeInTheDocument();
    expect(screen.getByText('Beta Supplier')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(onEdit).toHaveBeenCalledWith(rows[1]);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith(rows[1]);
  });
});
