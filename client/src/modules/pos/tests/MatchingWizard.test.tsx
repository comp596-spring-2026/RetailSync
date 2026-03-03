import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchingWizard } from '../components/MatchingWizard';

describe('POS MatchingWizard mapping behavior', () => {
  it('shows required field validation when mapping is empty', () => {
    render(
      <MatchingWizard
        headers={['Maybe Date']}
        sampleRows={[['2026-03-01']]}
        suggestions={[]}
        mapping={{}}
        transforms={{}}
        targetFields={[]}
        rowErrors={[]}
        onChangeMapping={vi.fn()}
        onChangeTransforms={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/Required field is missing/i).length).toBeGreaterThan(0);
  });

  it('normalizes duplicate target assignments to a single mapped target', () => {
    render(
      <MatchingWizard
        headers={['Date 1', 'Date 2']}
        sampleRows={[['2026-03-01', '2026-03-02']]}
        suggestions={[]}
        mapping={{ 'Date 1': 'date', 'Date 2': 'date' }}
        transforms={{}}
        targetFields={[]}
        rowErrors={[]}
        onChangeMapping={vi.fn()}
        onChangeTransforms={vi.fn()}
      />,
    );

    expect(screen.getByText('1/10 mapped')).toBeInTheDocument();
    expect(screen.queryByText(/Duplicate column usage/i)).not.toBeInTheDocument();
  });
});
