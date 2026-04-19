import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { POSAssistantPage } from '../pages/POSAssistantPage';
import type { PosAiChatResponse, PosDailyRecord } from '../api';
import type { PosState } from '../state';

const aiQueryMock = vi.hoisted(() => vi.fn());

vi.mock('../api', () => ({
  posApi: {
    aiQuery: (...args: unknown[]) => aiQueryMock(...args)
  }
}));

vi.mock('react-apexcharts', () => ({
  default: ({ type, series }: { type: string; series: Array<unknown> }) => (
    <div data-testid="apex-chart" data-type={type} data-series-count={series.length} />
  )
}));

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn()
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

const buildProps = () => {
  const records: PosDailyRecord[] = [
    {
      _id: 'pos-1',
      date: '2026-03-07',
      day: 'Sat',
      highTax: 18,
      lowTax: 12,
      saleTax: 1.5,
      totalSales: 1800,
      gas: 320,
      lottery: 150,
      creditCard: 1120,
      lotteryPayout: 25,
      clTotal: 0,
      cash: 680,
      cashPayout: 0,
      cashExpenses: 42,
      notes: 'Strong Saturday',
      source: 'manual'
    }
  ];

  return {
    loading: false,
    records,
    totals: {
      totalSales: 1800,
      creditCard: 1120,
      cash: 680,
      gas: 320,
      lottery: 150,
      lotteryPayout: 25,
      cashExpenses: 42,
      cashPayout: 0,
      highTax: 18,
      lowTax: 12,
      saleTax: 1.5
    },
    kpis: {
      totalSales: 1800,
      creditCard: 1120,
      cash: 680,
      gas: 320,
      lottery: 150,
      lotteryPayout: 25,
      cashExpenses: 42,
      cashPayout: 0,
      cashDiff: 14,
      netIncome: 1718,
      avgDailySales: 1800
    },
    chartsData: {
      totalSales: [],
      streams: [],
      weeklyStreams: [],
      weekdayAverages: [],
      monthlyAverages: []
    },
    alerts: [
      {
        id: 'alert-1',
        type: 'cash_diff',
        severity: 'medium',
        message: 'Cash difference is slightly elevated.',
        data: {}
      }
    ] as PosState['alerts'],
    dateRange: {
      from: '2026-03-01',
      to: '2026-03-07'
    },
    primaryAction: {
      label: 'Sync Now',
      onClick: vi.fn()
    }
  };
};

const buildFinalResponse = (): PosAiChatResponse =>
  ({
    query: {
      prompt: 'Compare cash performance to card sales.',
      start: '2026-03-01',
      end: '2026-03-07',
      scope: 'comparison',
      widgetLimit: 4,
      insightLimit: 4,
      filters: {}
    },
    snapshot: {
      range: {
        start: '2026-03-01',
        end: '2026-03-07'
      },
      generatedAt: '2026-03-08T00:00:00.000Z',
      totalDays: 7,
      summary: {
        totalSales: 1800,
        creditCard: 1120,
        cash: 680,
        gas: 320,
        lottery: 150,
        lotteryPayout: 25,
        cashExpenses: 42,
        cashPayout: 0,
        saleTax: 1.5,
        cashDiff: 14,
        netIncome: 1718,
        avgDailySales: 1800
      },
      bestDay: null,
      worstDay: null,
      topDays: [],
      dailySeries: [],
      weekdaySeries: [],
      weekSplit: {
        weekday: null,
        weekend: null,
        deltaSales: 0,
        deltaPercent: 0
      },
      movingAverage7: [],
      keySignals: []
    },
    aiStatus: {
      provider: 'gemini',
      providerStatus: 'healthy',
      degraded: false,
      source: 'gemini',
      confidence: 0.89,
      reasons: [],
      artifacts: {}
    },
    assistantMessage: 'Card sales outperformed cash across the selected range.',
    title: 'Cash vs card',
    summary: 'Card was the larger payment mix overall.',
    answer: 'Card sales led the range.',
    directAnswer: 'Card sales led the range.',
    needsClarification: false,
    clarificationOptions: [],
    conversationMode: 'answer',
    intent: 'comparison',
    scope: 'comparison',
    insights: [
      {
        title: 'Payment mix',
        text: 'Card exceeded cash by $440 across the period.',
        severity: 'medium',
        source: 'gemini'
      }
    ],
    widgets: [
      {
        type: 'metric_card',
        key: 'kpi_total_sales',
        title: 'Total sales',
        value: '$1,800.00',
        subtitle: 'Best overall range',
        tone: 'positive'
      },
      {
        type: 'text_insight',
        key: 'kpi_best_day',
        title: 'Insight',
        text: 'Saturday was the strongest day.',
        severity: 'high'
      },
      {
        type: 'comparison_table',
        key: 'table_weekday_vs_weekend',
        title: 'Payment mix comparison',
        columns: [
          { key: 'period', label: 'Period', format: 'text' },
          { key: 'cash', label: 'Cash', format: 'currency' },
          { key: 'card', label: 'Card', format: 'currency' }
        ],
        rows: [
          { period: 'Weekdays', cash: 480, card: 800 },
          { period: 'Weekend', cash: 200, card: 320 }
        ],
        note: 'Structure-only example'
      },
      {
        type: 'bar_chart',
        key: 'bar_sales_by_weekday',
        title: 'Sales by day',
        xKey: 'day',
        yKey: 'sales',
        data: [
          { day: 'Mon', sales: 200 },
          { day: 'Sat', sales: 610 }
        ],
        note: 'Example chart'
      }
    ],
    followUps: ['Show a chart for this result.', 'Compare full year vs recent range.'],
    generatedAt: '2026-03-08T00:00:00.000Z'
  }) as PosAiChatResponse;

describe('POSAssistantPage', () => {
  it('renders a conversational reply with structured widgets and follow-up chips', async () => {
    aiQueryMock.mockResolvedValueOnce({
      data: {
        data: buildFinalResponse()
      }
    });

    render(<POSAssistantPage {...buildProps()} />);

    const user = userEvent.setup();
    const composer = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    await user.type(composer, 'Compare cash performance to card sales.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(aiQueryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Compare cash performance to card sales.',
          scope: 'comparison',
          start: '2026-03-01',
          end: '2026-03-07'
        })
      );
    });

    expect(await screen.findByText('Card sales outperformed cash across the selected range.')).toBeInTheDocument();
    expect(screen.getByText('Total sales')).toBeInTheDocument();
    expect(screen.getByText('Payment mix comparison')).toBeInTheDocument();
    expect(screen.getByText('Sales by day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show a chart for this result.' })).toBeInTheDocument();
  });

  it('renders clarification chips and continues after a selection', async () => {
    aiQueryMock
      .mockResolvedValueOnce({
        data: {
          data: {
            ...buildFinalResponse(),
            assistantMessage: 'Would you like a summary only or add a chart?',
            title: 'Clarify scope',
            summary: 'The assistant needs more detail.',
            answer: 'Need more detail.',
            directAnswer: 'Need more detail.',
            needsClarification: true,
            clarificationQuestion: 'Would you like a summary only or add a chart?',
            clarificationOptions: [
              {
                label: 'Summary only',
                value: 'summary',
                kind: 'display',
                nextPrompt: 'Summary only'
              },
              {
                label: 'Add a chart',
                value: 'chart',
                kind: 'display',
                nextPrompt: 'Add a chart'
              }
            ],
            widgets: [],
            followUps: []
          } as PosAiChatResponse
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: buildFinalResponse()
        }
      });

    render(<POSAssistantPage {...buildProps()} />);

    const user = userEvent.setup();
    const composer = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    await user.type(composer, 'What changed most in this period?');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await screen.findAllByText('Would you like a summary only or add a chart?');
    await user.click(screen.getByRole('button', { name: 'Add a chart' }));

    await waitFor(() => {
      expect(aiQueryMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Card sales outperformed cash across the selected range.')).toBeInTheDocument();
    expect(screen.getByText('Sales by day')).toBeInTheDocument();
  });

  it('renders yes/no clarification chips for binary follow-ups', async () => {
    aiQueryMock
      .mockResolvedValueOnce({
        data: {
          data: {
            ...buildFinalResponse(),
            assistantMessage: 'Should I use the full year or keep the recent range?',
            title: 'Range check',
            summary: 'I need a quick range decision.',
            answer: 'Need a range decision.',
            directAnswer: 'Need a range decision.',
            needsClarification: true,
            clarificationQuestion: 'Use the full year?',
            clarificationOptions: [
              {
                label: 'Yes',
                value: 'yes',
                kind: 'yes_no',
                nextPrompt: 'Yes'
              },
              {
                label: 'No',
                value: 'no',
                kind: 'yes_no',
                nextPrompt: 'No'
              }
            ],
            widgets: [],
            followUps: []
          } as PosAiChatResponse
        }
      })
      .mockResolvedValueOnce({
        data: {
          data: buildFinalResponse()
        }
      });

    render(<POSAssistantPage {...buildProps()} />);

    const user = userEvent.setup();
    const composer = screen.getAllByRole('textbox')[0] as HTMLTextAreaElement;
    await user.type(composer, 'Show me the trend.');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => {
      expect(aiQueryMock).toHaveBeenCalledTimes(2);
    });

    expect(await screen.findByText('Card sales outperformed cash across the selected range.')).toBeInTheDocument();
  });
});
