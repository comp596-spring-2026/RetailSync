import { beforeEach, describe, expect, it, vi } from 'vitest';

const runPosAiQueryMock = vi.fn();

vi.mock('../services/posAiService', () => ({
  runPosAiQuery: (...args: unknown[]) => runPosAiQueryMock(...args)
}));

const createRes = () => {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { status, json };
};

const TEST_TIMEOUT_MS = 15_000;

describe('posController AI endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a validated AI response payload', async () => {
    const { queryPosAi } = await import('./posController');
    runPosAiQueryMock.mockResolvedValue({
      query: {
        prompt: 'Which day is the highest selling?',
        scope: 'overview',
        widgetLimit: 4,
        insightLimit: 4,
        filters: {},
        start: '2026-03-01',
        end: '2026-03-07'
      },
      snapshot: {
        range: { start: '2026-03-01', end: '2026-03-07' },
        generatedAt: '2026-03-07T00:00:00.000Z',
        totalDays: 2,
        summary: {
          totalSales: 300,
          creditCard: 130,
          cash: 170,
          gas: 26,
          lottery: 13,
          lotteryPayout: 2,
          cashExpenses: 6,
          cashPayout: 3,
          saleTax: 24,
          cashDiff: 0,
          netIncome: 267,
          avgDailySales: 150
        },
        bestDay: null,
        worstDay: null,
        topDays: [],
        dailySeries: [],
        weekdaySeries: [],
        weekSplit: { weekday: null, weekend: null, deltaSales: 0, deltaPercent: 0 },
        movingAverage7: [],
        keySignals: []
      },
      aiStatus: {
        provider: 'gemini',
        providerStatus: 'unavailable',
        degraded: true,
        source: 'fallback',
        confidence: 0.35,
        reasons: ['Gemini unavailable'],
        artifacts: {}
      },
      assistantMessage: 'Sat was the strongest sales day.',
      title: 'Sales peaked on Sat',
      summary: 'Sat was the strongest sales day at $200.',
      answer: 'Highest-selling day: Sat',
      directAnswer: 'Highest-selling day: Sat',
      needsClarification: false,
      clarificationQuestion: undefined,
      clarificationOptions: [],
      conversationMode: 'answer',
      intent: 'overview',
      scope: 'overview',
      insights: [],
      widgets: [
        {
          type: 'metric_card',
          key: 'kpi_total_sales',
          title: 'Total Sales',
          value: '$300',
          tone: 'positive'
        }
      ],
      followUps: ['Show weekday vs weekend sales'],
      generatedAt: '2026-03-07T00:00:00.000Z'
    });

    const req = {
      companyId: 'company-1',
      body: {
        prompt: 'Which day is the highest selling?',
        start: '2026-03-01',
        end: '2026-03-07',
        scope: 'overview',
        widgetLimit: 4,
        insightLimit: 4,
        filters: {}
      }
    } as any;
    const res = createRes() as any;

    await queryPosAi(req, res);

    expect(runPosAiQueryMock).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.status.mock.results[0]?.value?.json.mock.calls[0]?.[0];
    expect(payload.status).toBe('ok');
    expect(payload.data.title).toContain('Sales peaked');
    expect(payload.data.assistantMessage).toContain('strongest sales day');
  }, TEST_TIMEOUT_MS);

  it('rejects invalid payloads with validation errors', async () => {
    const { queryPosAi } = await import('./posController');
    const req = {
      companyId: 'company-1',
      body: { prompt: '' }
    } as any;
    const res = createRes() as any;

    await queryPosAi(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    const payload = res.status.mock.results[0]?.value?.json.mock.calls[0]?.[0];
    expect(payload.status).toBe('error');
  }, TEST_TIMEOUT_MS);
});
