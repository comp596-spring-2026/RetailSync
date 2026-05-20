import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { POSSaleTaxPage } from '../pages/POSSaleTaxPage';

const dailyMock = vi.hoisted(() => vi.fn());

vi.mock('../api', () => ({
  posApi: {
    daily: (...args: unknown[]) => dailyMock(...args)
  }
}));

describe('POSSaleTaxPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads monthly reviews, defaults to the latest year, and opens the breakdown modal', async () => {
    dailyMock.mockResolvedValueOnce({
      data: {
        data: [
          {
            _id: '2025-11-01',
            date: '2025-11-01',
            day: 'Sat',
            highTax: 300,
            lowTax: 0,
            saleTax: 21,
            totalSales: 300,
            gas: 10,
            lottery: 5,
            creditCard: 200,
            lotteryPayout: 0,
            clTotal: 0,
            cash: 100,
            cashPayout: 0,
            cashExpenses: 3,
            notes: ''
          },
          {
            _id: '2026-04-01',
            date: '2026-04-01',
            day: 'Wed',
            highTax: 1000,
            lowTax: 500,
            saleTax: 85,
            totalSales: 1500,
            gas: 30,
            lottery: 20,
            creditCard: 700,
            lotteryPayout: 5,
            clTotal: 0,
            cash: 800,
            cashPayout: 0,
            cashExpenses: 10,
            notes: ''
          },
          {
            _id: '2026-04-02',
            date: '2026-04-02',
            day: 'Thu',
            highTax: 500,
            lowTax: 100,
            saleTax: 38,
            totalSales: 600,
            gas: 25,
            lottery: 15,
            creditCard: 400,
            lotteryPayout: 2,
            clTotal: 0,
            cash: 200,
            cashPayout: 0,
            cashExpenses: 8,
            notes: 'Manager note'
          }
        ]
      }
    });

    render(
      <POSSaleTaxPage
        loading={false}
        primaryAction={{ label: 'Sync Now', onClick: vi.fn() }}
      />
    );

    expect(dailyMock).toHaveBeenCalledWith('2000-01-01', '2100-12-31');

    expect(await screen.findByText('Georgia Sales Tax Review')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('April 2026')).toBeInTheDocument();
    expect(screen.getByText('View Breakdown')).toBeInTheDocument();
    expect(screen.queryByText('November 2025')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Previous sales tax year' }));

    await waitFor(() => {
      expect(screen.getByText('November 2025')).toBeInTheDocument();
    });

    await user.click(screen.getByText('November 2025'));

    expect(await screen.findByText('Monthly Sales Tax Breakdown')).toBeInTheDocument();
    expect(screen.getByText('November 2025 — Troup County, GA')).toBeInTheDocument();
    expect(screen.getByText('1. Monthly POS Data')).toBeInTheDocument();
    expect(screen.getByText('POS/imported tax collected.')).toBeInTheDocument();
    expect(screen.getByText('2. Tax Calculation')).toBeInTheDocument();
    expect(screen.getByText('State Tax')).toBeInTheDocument();
    expect(screen.getByText('County Tax')).toBeInTheDocument();
    expect(screen.getByText('5. Daily POS Records')).toBeInTheDocument();
    expect(screen.queryByText('Top Summary')).not.toBeInTheDocument();
    expect(screen.queryByText('1. Monthly Sales Values')).not.toBeInTheDocument();
    expect(screen.queryByText('4. Total Calculated Sales Tax')).not.toBeInTheDocument();
    expect(screen.queryByText('POS Sales Tax Collected')).not.toBeInTheDocument();
    expect(screen.queryByText('Manual Adjustment')).not.toBeInTheDocument();
    expect(screen.queryByText('Difference')).not.toBeInTheDocument();
  });
});
