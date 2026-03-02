import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TotalSalesLine } from '../charts/TotalSalesLine';

vi.mock('react-apexcharts', () => ({
  default: ({ type, series }: { type: string; series: Array<unknown> }) => (
    <div data-testid="apex-chart" data-type={type} data-series-count={series.length} />
  )
}));

describe('TotalSalesLine', () => {
  it('renders line chart container and series', () => {
    const { container, getByTestId } = render(
      <TotalSalesLine
        seriesData={[
          { x: '2026-02-24T00:00:00.000Z', y: 1200 },
          { x: '2026-02-25T00:00:00.000Z', y: 1450 },
          { x: '2026-02-26T00:00:00.000Z', y: 1380 }
        ]}
      />
    );

    expect(container.firstChild).toHaveAttribute('role', 'img');
    expect(getByTestId('apex-chart')).toHaveAttribute('data-type', 'line');
    expect(getByTestId('apex-chart')).toHaveAttribute('data-series-count', '1');
  });
});
