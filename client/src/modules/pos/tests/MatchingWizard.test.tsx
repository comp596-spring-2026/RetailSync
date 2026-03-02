import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchingWizard } from '../components/MatchingWizard';

describe('POS MatchingWizard mapping behavior', () => {
  it('keeps low-confidence suggestions unmapped', () => {
    render(
      <MatchingWizard
        headers={['Maybe Date']}
        sampleRows={[['2026-03-01']]}
        suggestions={[{ col: 'A', header: 'Maybe Date', suggestion: 'date', score: 0.5 }]}
        mapping={{}}
        transforms={{}}
        targetFields={[]}
        rowErrors={[]}
        onChangeMapping={vi.fn()}
        onChangeTransforms={vi.fn()}
      />,
    );

    expect(screen.getByText('Unmapped')).toBeInTheDocument();
  });

  it('enforces one-to-one auto mapping for confident suggestions', () => {
    render(
      <MatchingWizard
        headers={['Date 1', 'Date 2']}
        sampleRows={[['2026-03-01', '2026-03-02']]}
        suggestions={[
          { col: 'A', header: 'Date 1', suggestion: 'date', score: 0.95 },
          { col: 'B', header: 'Date 2', suggestion: 'date', score: 0.95 },
        ]}
        mapping={{}}
        transforms={{}}
        targetFields={[]}
        rowErrors={[]}
        onChangeMapping={vi.fn()}
        onChangeTransforms={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Mapped')).toHaveLength(1);
    expect(screen.getAllByText('Unmapped').length).toBeGreaterThanOrEqual(1);
  });
});
