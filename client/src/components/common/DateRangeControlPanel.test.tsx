import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateRangeControlPanel } from './DateRangeControlPanel';

vi.mock('react-date-range', () => ({
  DateRangePicker: ({ onChange }: { onChange: (payload: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange({
          selection: {
            startDate: new Date(2026, 1, 1),
            endDate: new Date(2026, 1, 27)
          }
        })
      }
    >
      Apply mocked range
    </button>
  ),
  createStaticRanges: (ranges: unknown) => ranges
}));

describe('DateRangeControlPanel', () => {
  it('applies start/end together via onDateRangeChange', async () => {
    const user = userEvent.setup();
    const onDateRangeChange = vi.fn();

    render(
      <DateRangeControlPanel
        from="2026-02-10"
        to="2026-02-10"
        onDateRangeChange={onDateRangeChange}
        onRefresh={() => {}}
      />
    );

    await user.click(screen.getByRole('button', { name: /feb 10, 2026/i }));
    await user.click(screen.getByRole('button', { name: 'Apply mocked range' }));

    expect(onDateRangeChange).toHaveBeenCalledTimes(1);
    expect(onDateRangeChange).toHaveBeenCalledWith({
      from: '2026-02-01',
      to: '2026-02-27'
    });
  });

  it('shows invalid range warning when from is after to', () => {
    render(
      <DateRangeControlPanel
        from="2026-03-10"
        to="2026-03-01"
        onDateRangeChange={() => {}}
        onRefresh={() => {}}
      />
    );

    expect(screen.getByText('"From" must be before "To".')).toBeInTheDocument();
  });
});
