import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchingWizard } from './MatchingWizard';

describe('MatchingWizard', () => {
  it('renders suggestions and allows mapping change', () => {
    const onChangeMapping = vi.fn();
    const onChangeTransforms = vi.fn();

    render(
      <MatchingWizard
        headers={['Qty']}
        sampleRows={[['2'], ['4']]}
        suggestions={[{ col: 'A', header: 'Qty', suggestion: 'qty', score: 0.9 }]}
        mapping={{ Qty: 'qty' }}
        transforms={{ qty: { trim: false } }}
        targetFields={['qty', 'price']}
        rowErrors={[]}
        onChangeMapping={onChangeMapping}
        onChangeTransforms={onChangeTransforms}
      />
    );

    expect(screen.getAllByText('Qty').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onChangeTransforms).toHaveBeenCalled();
  });
});
