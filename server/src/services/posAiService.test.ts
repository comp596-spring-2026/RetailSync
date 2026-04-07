import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMock = vi.fn();
const geminiMock = vi.fn();
const mockEnv = vi.hoisted(() => ({
  env: {
    statementGeminiEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    statementGeminiModel: 'gemini-2.5-flash',
    statementGeminiApiKey: undefined as string | undefined,
    statementGeminiTimeoutMs: 120000,
    statementGeminiTemperature: 0.2,
    statementGeminiMaxOutputTokens: 1024,
    statementGeminiMinConfidence: 0.65
  }
}));

vi.mock('../models/POSDailySummary', () => ({
  POSDailySummaryModel: {
    find: (...args: unknown[]) => findMock(...args)
  }
}));

vi.mock('../integrations/google/gemini.client', () => ({
  generateGeminiContent: (...args: unknown[]) => geminiMock(...args),
  GeminiClientError: class GeminiClientError extends Error {
    code: string;
    retryable: boolean;
    constructor(code: string, message: string, options: { retryable?: boolean } = {}) {
      super(message);
      this.name = 'GeminiClientError';
      this.code = code;
      this.retryable = Boolean(options.retryable ?? false);
    }
  }
}));

vi.mock('../config/env', () => mockEnv);

const makeRows = () => [
  {
    date: new Date('2026-03-02T00:00:00.000Z'),
    day: 'Mon',
    totalSales: 100,
    creditCard: 40,
    cash: 60,
    gas: 12,
    lottery: 5,
    lotteryPayout: 1,
    cashExpenses: 2,
    cashPayout: 1,
    saleTax: 8
  },
  {
    date: new Date('2026-03-03T00:00:00.000Z'),
    day: 'Tue',
    totalSales: 120,
    creditCard: 50,
    cash: 70,
    gas: 10,
    lottery: 6,
    lotteryPayout: 2,
    cashExpenses: 3,
    cashPayout: 1,
    saleTax: 9
  },
  {
    date: new Date('2026-03-07T00:00:00.000Z'),
    day: 'Sat',
    totalSales: 200,
    creditCard: 90,
    cash: 110,
    gas: 14,
    lottery: 8,
    lotteryPayout: 1,
    cashExpenses: 4,
    cashPayout: 2,
    saleTax: 16
  }
];

const TEST_TIMEOUT_MS = 15_000;

describe('posAiService', () => {
  beforeEach(() => {
    findMock.mockReset();
    geminiMock.mockReset();
    mockEnv.env.statementGeminiApiKey = undefined;
  });

  it('returns a deterministic fallback analysis when Gemini is unavailable', async () => {
    findMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve(makeRows())
        })
      })
    });

    const { runPosAiQuery } = await import('./posAiService');
    const result = await runPosAiQuery({
      companyId: 'company-1',
      prompt: 'Which day is the highest selling?',
      start: '2026-03-01',
      end: '2026-03-07',
      scope: 'overview',
      widgetLimit: 4,
      insightLimit: 4,
      filters: {}
    });

    expect(geminiMock).not.toHaveBeenCalled();
    expect(result.aiStatus.providerStatus).toBe('unavailable');
    expect(result.aiStatus.source).toBe('fallback');
    expect(result.snapshot.bestDay?.day).toBe('Sat');
    expect(result.assistantMessage).toContain('strongest sales day');
    expect(result.directAnswer).toContain('Highest-selling day');
    expect(result.title).toContain('Sales peaked');
    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'kpi_total_sales',
      'kpi_best_day',
      'kpi_average_daily_sales',
      'kpi_weekday_vs_weekend'
    ]);
  }, TEST_TIMEOUT_MS);

  it('accepts a structured Gemini response and preserves widget ordering', async () => {
    mockEnv.env.statementGeminiApiKey = 'test-api-key';
    findMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve(makeRows())
        })
      })
    });
    geminiMock.mockResolvedValue({
      text: JSON.stringify({
        title: 'Weekend outperformed weekdays',
        summary: 'Weekend sales were stronger across the selected range.',
        assistantMessage: 'Weekend sales outperformed weekdays overall.',
        answer: 'Weekend sales outperformed weekdays.',
        directAnswer: 'Weekend sales outperformed weekdays.',
        needsClarification: false,
        clarificationQuestion: undefined,
        clarificationOptions: [],
        conversationMode: 'answer',
        intent: 'comparison',
        scope: 'comparison',
        insights: [
          {
            title: 'Weekend lift',
            text: 'Saturday closed the week with the highest total sales.',
            severity: 'high',
            source: 'gemini'
          }
        ],
        widgetKeys: ['kpi_weekday_vs_weekend', 'table_weekday_vs_weekend', 'line_sales_trend'],
        followUps: ['Show top selling days'],
        confidence: 0.92,
        version: 'v2'
      }),
      raw: { candidates: [{ finishReason: 'STOP' }] }
    });

    const { runPosAiQuery } = await import('./posAiService');
    const result = await runPosAiQuery({
      companyId: 'company-1',
      prompt: 'Compare weekday vs weekend sales',
      start: '2026-03-01',
      end: '2026-03-07',
      scope: 'comparison',
      widgetLimit: 4,
      insightLimit: 2,
      filters: { locationId: 'all' }
    });

    expect(geminiMock.mock.calls.length).toBeGreaterThan(0);
    expect(geminiMock.mock.calls[0]?.[0]).toMatchObject({
      responseMimeType: 'application/json'
    });
    expect(geminiMock.mock.calls[0]?.[0].responseJsonSchema).toBeDefined();
    expect(result.aiStatus.providerStatus).toBe('healthy');
    expect(result.aiStatus.source).toBe('hybrid');
    expect(result.title).toBe('Weekend outperformed weekdays');
    expect(result.assistantMessage).toContain('Weekend sales');
    expect(result.directAnswer).toContain('Weekend sales');
    expect(result.widgets.map((widget) => widget.key)).toEqual([
      'kpi_weekday_vs_weekend',
      'table_weekday_vs_weekend',
      'line_sales_trend'
    ]);
    expect(result.insights[0]?.source).toBe('gemini');
  }, TEST_TIMEOUT_MS);

  it('falls back when Gemini confidence is too low', async () => {
    mockEnv.env.statementGeminiApiKey = 'test-api-key';
    findMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve(makeRows())
        })
      })
    });
    geminiMock.mockResolvedValue({
      text: JSON.stringify({
        title: 'Maybe weekday trend',
        summary: 'Not confident enough.',
        assistantMessage: 'Not enough confidence yet.',
        insights: [],
        widgetKeys: ['kpi_total_sales'],
        followUps: [],
        confidence: 0.1,
        version: 'v2'
      }),
      raw: { candidates: [{ finishReason: 'STOP' }] }
    });

    const { runPosAiQuery } = await import('./posAiService');
    const result = await runPosAiQuery({
      companyId: 'company-1',
      prompt: 'What is the highest selling day?',
      start: '2026-03-01',
      end: '2026-03-07',
      scope: 'overview',
      widgetLimit: 4,
      insightLimit: 4,
      filters: {}
    });

    expect(result.aiStatus.providerStatus).toBe('degraded');
    expect(result.aiStatus.source).toBe('fallback');
    expect(result.title).toContain('Sales peaked');
    expect(result.widgets[0]?.key).toBe('kpi_total_sales');
  }, TEST_TIMEOUT_MS);

  it('asks for clarification when the prompt is underspecified', async () => {
    findMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve(makeRows())
        })
      })
    });

    const { runPosAiQuery } = await import('./posAiService');
    const result = await runPosAiQuery({
      companyId: 'company-1',
      prompt: 'show sales',
      scope: 'overview',
      widgetLimit: 4,
      insightLimit: 4,
      filters: {}
    });

    expect(result.needsClarification).toBe(true);
    expect(result.conversationMode).toBe('clarify');
    expect(result.clarificationQuestion).toContain('What would you like me to focus on?');
    expect(result.widgets).toHaveLength(0);
    expect(result.clarificationOptions.length).toBeGreaterThan(0);
  });

  it('returns clarification when Gemini requests more context', async () => {
    mockEnv.env.statementGeminiApiKey = 'test-api-key';
    findMock.mockReturnValue({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve(makeRows())
        })
      })
    });
    geminiMock.mockResolvedValue({
      text: JSON.stringify({
        title: 'Need a date range',
        summary: 'Which range should I use?',
        assistantMessage: 'I can answer that once I know the date range.',
        directAnswer: undefined,
        needsClarification: true,
        clarificationQuestion: 'Which date range should I use?',
        clarificationOptions: [
          {
            label: 'Last 7 days',
            value: 'last_7_days',
            kind: 'preset_range',
            nextPrompt: 'Use the last 7 days'
          }
        ],
        conversationMode: 'clarify',
        intent: 'unknown',
        scope: 'overview',
        insights: [],
        widgetKeys: [],
        followUps: ['Use the last 7 days'],
        confidence: 0.88,
        version: 'v2'
      }),
      raw: { candidates: [{ finishReason: 'STOP' }] }
    });

    const { runPosAiQuery } = await import('./posAiService');
    const result = await runPosAiQuery({
      companyId: 'company-1',
      prompt: 'Compare weekday vs weekend sales',
      scope: 'overview',
      widgetLimit: 4,
      insightLimit: 4,
      filters: {}
    });

    expect(result.needsClarification).toBe(true);
    expect(result.conversationMode).toBe('clarify');
    expect(result.widgets).toHaveLength(0);
    expect(result.clarificationQuestion).toContain('Which date range should I use?');
  }, TEST_TIMEOUT_MS);
});
