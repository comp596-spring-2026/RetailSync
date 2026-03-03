import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MatchingWizard } from '../MatchingWizard';

describe('MatchingWizard', () => {
  it('renders mapping workspace without chip-based sections', () => {
    render(
      <MatchingWizard
        headers={['DATE', 'HIGH TAX', 'LOW TAX', 'SALE TAX']}
        sampleRows={[
          ['2026-01-01', '100', '50', '8'],
          ['2026-01-02', '90', '40', '7'],
        ]}
        suggestions={[]}
        mapping={{
          DATE: 'date',
          'HIGH TAX': 'highTax',
          'LOW TAX': 'lowTax',
          'SALE TAX': 'saleTax',
        }}
        transforms={{ __derivedFields: ['day', 'totalSales'] }}
        targetFields={[]}
        rowErrors={[]}
        onChangeMapping={vi.fn()}
        onChangeTransforms={vi.fn()}
      />,
    );

    expect(screen.getByText(/Column Mapping/i)).toBeInTheDocument();
    expect(screen.getByText(/4\/10 mapped/i)).toBeInTheDocument();
    expect(screen.getByText(/Required \(must map all\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Calculated Fields/i)).toBeInTheDocument();
    expect(screen.getByText(/Compatibility/i)).toBeInTheDocument();
    expect(screen.getByText(/Data Preview/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^Sheet Columns$/i })).not.toBeInTheDocument();
    expect(document.querySelectorAll('.MuiChip-root').length).toBe(0);
  });

  it('renders weekday for MM/DD/YYYY dates in preview instead of Invalid Date', () => {
    render(
      <MatchingWizard
        headers={['DATE', 'HIGH TAX', 'LOW TAX', 'SALE TAX', 'GAS', 'LOTTERY', 'CREDIT CARD', 'LOTTERY PAYOUT', 'Cash Payout']}
        sampleRows={[
          ['10/25/2025', '100', '50', '8', '400', '20', '90', '10', '0'],
        ]}
        suggestions={[]}
        mapping={{
          DATE: 'date',
          'HIGH TAX': 'highTax',
          'LOW TAX': 'lowTax',
          'SALE TAX': 'saleTax',
          GAS: 'gas',
          LOTTERY: 'lottery',
          'CREDIT CARD': 'creditCard',
          'LOTTERY PAYOUT': 'lotteryPayout',
          'Cash Payout': 'cashExpenses',
        }}
        transforms={{ __derivedFields: ['day', 'totalSales', 'cashDiff'] }}
        targetFields={[]}
        rowErrors={[]}
        onChangeMapping={vi.fn()}
        onChangeTransforms={vi.fn()}
      />,
    );

    expect(screen.queryByText('Invalid Date')).not.toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });
});
