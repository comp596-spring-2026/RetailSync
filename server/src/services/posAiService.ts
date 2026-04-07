import { z } from 'zod';
import { env } from '../config/env';
import { POSDailySummaryModel } from '../models/POSDailySummary';
import { generateGeminiContent } from '../integrations/google/gemini.client';
import {
  posAiClarificationOptionSchema,
  posAiInsightSchema,
  posAiDashboardQueryResponseSchema,
  posAiDashboardQuerySchema,
  posAiConversationModeSchema,
  posAiIntentSchema,
  posAiScopeSchema,
  posAiSnapshotSchema,
  posAiWidgetKeySchema,
  posDateSchema
} from '@retailsync/shared';

type PosRow = {
  date: Date;
  day: string;
  totalSales: number;
  creditCard: number;
  cash: number;
  gas: number;
  lottery: number;
  lotteryPayout: number;
  cashExpenses: number;
  cashPayout: number;
  saleTax: number;
};

type PosAiServiceInput = z.infer<typeof posAiDashboardQuerySchema> & {
  companyId: string;
};

type PosAiWidgetKey = z.infer<typeof posAiWidgetKeySchema>;
type PosAiIntent = z.infer<typeof posAiIntentSchema>;
type PosAiConversationMode = z.infer<typeof posAiConversationModeSchema>;
type PosAiClarificationOption = z.infer<typeof posAiClarificationOptionSchema>;

const POS_AI_WIDGET_ORDER_BY_SCOPE: Record<z.infer<typeof posAiScopeSchema>, PosAiWidgetKey[]> = {
  overview: ['kpi_total_sales', 'kpi_best_day', 'kpi_average_daily_sales', 'kpi_weekday_vs_weekend'],
  comparison: ['kpi_weekday_vs_weekend', 'table_weekday_vs_weekend', 'bar_sales_by_weekday', 'table_top_days'],
  trend: ['line_sales_trend', 'table_top_days', 'kpi_total_sales', 'kpi_average_daily_sales'],
  weekday: ['bar_sales_by_weekday', 'table_weekday_vs_weekend', 'kpi_weekday_vs_weekend', 'kpi_best_day'],
  top_days: ['table_top_days', 'kpi_best_day', 'line_sales_trend', 'kpi_total_sales']
};

const posAiGeminiResponseSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  assistantMessage: z.string().trim().min(1),
  directAnswer: z.string().trim().optional(),
  answer: z.string().trim().optional(),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().trim().optional(),
  clarificationOptions: z.array(posAiClarificationOptionSchema).default([]),
  conversationMode: posAiConversationModeSchema.default('answer'),
  intent: posAiIntentSchema.default('unknown'),
  scope: posAiScopeSchema.optional(),
  insights: z.array(posAiInsightSchema).default([]),
  widgetKeys: z.array(posAiWidgetKeySchema).default([]),
  followUps: z.array(z.string().trim().min(1)).default([]),
  confidence: z.number().min(0).max(1).default(0),
  version: z.literal('v2').default('v2')
}).strict();

const posAiGeminiResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    assistantMessage: { type: 'string' },
    directAnswer: { type: 'string' },
    answer: { type: 'string' },
    needsClarification: { type: 'boolean' },
    clarificationQuestion: { type: 'string' },
    clarificationOptions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          kind: { type: 'string', enum: ['yes_no', 'preset_range', 'comparison', 'display', 'custom'] },
          promptPatch: { type: 'string' },
          nextPrompt: { type: 'string' }
        },
        required: ['label', 'value', 'kind']
      }
    },
    conversationMode: { type: 'string', enum: ['answer', 'clarify', 'mixed'] },
    intent: { type: 'string', enum: ['overview', 'comparison', 'trend', 'weekday', 'top_days', 'unknown'] },
    scope: { type: 'string', enum: ['overview', 'comparison', 'trend', 'weekday', 'top_days'] },
    insights: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          source: { type: 'string', enum: ['gemini', 'fallback'] }
        },
        required: ['title', 'text']
      }
    },
    widgetKeys: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'kpi_total_sales',
          'kpi_average_daily_sales',
          'kpi_best_day',
          'kpi_weekday_vs_weekend',
          'bar_sales_by_weekday',
          'line_sales_trend',
          'table_weekday_vs_weekend',
          'table_top_days'
        ]
      }
    },
    followUps: {
      type: 'array',
      items: { type: 'string' }
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    version: { type: 'string', enum: ['v2'] }
  },
  required: ['title', 'summary', 'assistantMessage', 'insights', 'widgetKeys', 'followUps', 'confidence', 'version']
};

const normalizeDate = (value: Date) => value.toISOString().slice(0, 10);

const startOfUtcDay = (date: Date) => {
  const value = new Date(date);
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
};

const parseIsoDate = (value: string) => {
  if (!posDateSchema.safeParse(value).success) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const resolveRange = (input: { start?: string; end?: string }) => {
  const now = new Date();
  const end = input.end ? parseIsoDate(input.end) : startOfUtcDay(now);
  if (!end) return null;
  const start = input.start
    ? parseIsoDate(input.start)
    : new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 29));
  if (!start) return null;
  if (start > end) return null;
  return {
    start: normalizeDate(start),
    end: normalizeDate(end),
    startDate: start,
    endDate: end
  };
};

const dayOfWeekIndex = (date: Date) => {
  const value = startOfUtcDay(date);
  return value.getUTCDay();
};

const calcCashDiff = (row: PosRow) =>
  row.cash - (row.totalSales - row.creditCard - row.lotteryPayout - row.cashExpenses - row.cashPayout);

const calcNetIncome = (row: PosRow) => row.totalSales - row.saleTax - row.cashExpenses - row.cashPayout;

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(value);

const formatCurrency2 = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(value);

const formatPercent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const buildSnapshotRow = (row: PosRow) => ({
  date: normalizeDate(row.date),
  day: row.day,
  totalSales: row.totalSales,
  creditCard: row.creditCard,
  cash: row.cash,
  gas: row.gas,
  lottery: row.lottery,
  lotteryPayout: row.lotteryPayout,
  cashExpenses: row.cashExpenses,
  cashPayout: row.cashPayout,
  saleTax: row.saleTax,
  cashDiff: calcCashDiff(row),
  netIncome: calcNetIncome(row)
});

const buildTopDays = (rows: PosRow[]) =>
  [...rows]
    .sort((a, b) => b.totalSales - a.totalSales)
    .slice(0, 5)
    .map(buildSnapshotRow);

const buildDailySeries = (rows: PosRow[]) => rows.map(buildSnapshotRow);

const buildWeekdaySeries = (rows: PosRow[]) => {
  const groups = new Map<number, {
    label: string;
    days: number;
    totalSales: number;
    creditCard: number;
    cash: number;
    cashDiff: number;
  }>();

  for (const row of rows) {
    const index = dayOfWeekIndex(row.date);
    const existing = groups.get(index) ?? {
      label: dayNames[index] ?? 'Day',
      days: 0,
      totalSales: 0,
      creditCard: 0,
      cash: 0,
      cashDiff: 0
    };
    existing.days += 1;
    existing.totalSales += row.totalSales;
    existing.creditCard += row.creditCard;
    existing.cash += row.cash;
    existing.cashDiff += calcCashDiff(row);
    groups.set(index, existing);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, value]) => ({
      label: value.label,
      days: value.days,
      totalSales: Number(value.totalSales.toFixed(2)),
      avgDailySales: Number((value.totalSales / Math.max(1, value.days)).toFixed(2)),
      creditCard: Number(value.creditCard.toFixed(2)),
      cash: Number(value.cash.toFixed(2)),
      cashDiff: Number(value.cashDiff.toFixed(2))
    }));
};

const buildWeekSplit = (rows: PosRow[]) => {
  const weekdayRows = rows.filter((row) => {
    const day = dayOfWeekIndex(row.date);
    return day >= 1 && day <= 5;
  });
  const weekendRows = rows.filter((row) => {
    const day = dayOfWeekIndex(row.date);
    return day === 0 || day === 6;
  });

  const toGroup = (subset: PosRow[]) => {
    if (subset.length === 0) return null;
    const totalSales = subset.reduce((sum, row) => sum + row.totalSales, 0);
    const creditCard = subset.reduce((sum, row) => sum + row.creditCard, 0);
    const cash = subset.reduce((sum, row) => sum + row.cash, 0);
    const cashDiff = subset.reduce((sum, row) => sum + calcCashDiff(row), 0);
    return {
      label: subset === weekdayRows ? 'Weekday' : 'Weekend',
      days: subset.length,
      totalSales: Number(totalSales.toFixed(2)),
      avgDailySales: Number((totalSales / subset.length).toFixed(2)),
      creditCard: Number(creditCard.toFixed(2)),
      cash: Number(cash.toFixed(2)),
      cashDiff: Number(cashDiff.toFixed(2))
    };
  };

  const weekday = toGroup(weekdayRows);
  const weekend = toGroup(weekendRows);
  const deltaSales = Number(((weekend?.totalSales ?? 0) - (weekday?.totalSales ?? 0)).toFixed(2));
  const deltaPercent =
    weekday && weekday.totalSales > 0
      ? Number((((weekend?.totalSales ?? 0) - weekday.totalSales) / weekday.totalSales * 100).toFixed(1))
      : 0;

  return { weekday, weekend, deltaSales, deltaPercent };
};

const buildMovingAverage7 = (rows: PosRow[]) => {
  const result: Array<{ date: string; value: number }> = [];
  const queue: number[] = [];
  let running = 0;

  for (const row of rows) {
    queue.push(row.totalSales);
    running += row.totalSales;
    if (queue.length > 7) {
      running -= queue.shift() ?? 0;
    }
    result.push({
      date: normalizeDate(row.date),
      value: Number((running / queue.length).toFixed(2))
    });
  }

  return result;
};

const buildKeySignals = (snapshot: Awaited<ReturnType<typeof buildPosAiSnapshot>>) => {
  const signals: string[] = [];
  if (snapshot.bestDay) {
    signals.push(`Highest sales day: ${snapshot.bestDay.day} (${snapshot.bestDay.date}) at ${formatCurrency(snapshot.bestDay.totalSales)}`);
  }
  if (snapshot.weekSplit.weekday && snapshot.weekSplit.weekend) {
    signals.push(
      `Weekend vs weekday delta: ${formatCurrency(snapshot.weekSplit.deltaSales)} (${formatPercent(snapshot.weekSplit.deltaPercent)})`
    );
  }
  if (snapshot.summary.avgDailySales > 0) {
    signals.push(`Average daily sales: ${formatCurrency2(snapshot.summary.avgDailySales)}`);
  }
  if (snapshot.topDays.length > 0) {
    signals.push(`Top day list available for ${snapshot.topDays.length} day(s)`);
  }
  return signals;
};

const normalizePrompt = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

const inferIntent = (prompt: string): PosAiIntent => {
  const normalized = normalizePrompt(prompt);
  if (/(weekday|weekdays|weekend)/i.test(normalized)) return 'weekday';
  if (/(compare|comparison|vs\.?|versus|against)/i.test(normalized)) return 'comparison';
  if (/(trend|over time|throughout|month|weekly|daily trend|sales trend)/i.test(normalized)) return 'trend';
  if (/(top|highest|best|most|rank|ranking)/i.test(normalized)) return 'top_days';
  if (/(overview|summary|how are sales|sales performance|insight|what's happening|what is happening)/i.test(normalized)) {
    return 'overview';
  }
  return 'unknown';
};

const needsClarification = (input: PosAiServiceInput, intent: PosAiIntent) => {
  const normalized = normalizePrompt(input.prompt);
  const promptWords = normalized.split(/\s+/).filter(Boolean).length;
  if (input.start || input.end) return false;
  if (intent !== 'unknown') return false;
  if (/(sales|revenue|pos|store|cash|transactions)/i.test(normalized) && promptWords <= 4) return true;
  return promptWords <= 3;
};

const buildClarificationOptions = (input: PosAiServiceInput): PosAiClarificationOption[] => {
  const normalized = normalizePrompt(input.prompt);
  const isComparisonPrompt = /(compare|comparison|vs\.?|versus|weekday|weekend)/i.test(normalized);
  const isTrendPrompt = /(trend|over time|history|month|weekly|daily)/i.test(normalized);

  if (isComparisonPrompt) {
    return [
      {
        label: 'Last 7 days',
        value: 'last_7_days',
        kind: 'preset_range',
        promptPatch: 'Use the last 7 days',
        nextPrompt: `${input.prompt} for the last 7 days`
      },
      {
        label: 'Last 30 days',
        value: 'last_30_days',
        kind: 'preset_range',
        promptPatch: 'Use the last 30 days',
        nextPrompt: `${input.prompt} for the last 30 days`
      },
      {
        label: 'This month',
        value: 'this_month',
        kind: 'preset_range',
        promptPatch: 'Use this month',
        nextPrompt: `${input.prompt} for this month`
      }
    ];
  }

  if (isTrendPrompt) {
    return [
      {
        label: 'Last 7 days',
        value: 'last_7_days',
        kind: 'preset_range',
        promptPatch: 'Use the last 7 days',
        nextPrompt: `${input.prompt} for the last 7 days`
      },
      {
        label: 'Last 30 days',
        value: 'last_30_days',
        kind: 'preset_range',
        promptPatch: 'Use the last 30 days',
        nextPrompt: `${input.prompt} for the last 30 days`
      },
      {
        label: 'This month',
        value: 'this_month',
        kind: 'preset_range',
        promptPatch: 'Use this month',
        nextPrompt: `${input.prompt} for this month`
      }
    ];
  }

  return [
    {
      label: 'Highest selling day',
      value: 'highest_selling_day',
      kind: 'display',
      promptPatch: 'Find the highest-selling day',
      nextPrompt: 'Which day is the highest selling?'
    },
    {
      label: 'Weekday vs weekend',
      value: 'weekday_vs_weekend',
      kind: 'comparison',
      promptPatch: 'Compare weekday vs weekend sales',
      nextPrompt: 'Compare weekday vs weekend sales for the last 30 days'
    },
    {
      label: 'Sales trend',
      value: 'sales_trend',
      kind: 'display',
      promptPatch: 'Show a sales trend',
      nextPrompt: 'Show a sales trend for the last 30 days'
    },
    {
      label: 'Top 5 days',
      value: 'top_5_days',
      kind: 'display',
      promptPatch: 'Show top sales days',
      nextPrompt: 'Show the top 5 sales days for the last 30 days'
    }
  ];
};

const buildClarificationResponse = (input: PosAiServiceInput, snapshot: Awaited<ReturnType<typeof buildPosAiSnapshot>>) => {
  const intent = inferIntent(input.prompt);
  const clarificationOptions = buildClarificationOptions(input);
  const question =
    intent === 'unknown'
      ? 'What would you like me to focus on?'
      : 'Which time range should I use for this analysis?';

  const assistantMessage =
    intent === 'unknown'
      ? 'I can help with sales, trends, comparisons, or top-day insights. Tell me which angle you want and I’ll render the right view.'
      : 'I can answer that, but I need the time range first so I do not over-assume the context.';

  return {
    query: posAiDashboardQuerySchema.parse(input),
    snapshot,
    aiStatus: {
      provider: 'gemini' as const,
      providerStatus: 'unavailable' as const,
      degraded: true,
      degradedReason: 'Clarification requested before running analysis',
      source: 'fallback' as const,
      confidence: 0.15,
      reasons: [...snapshot.keySignals, 'Clarification requested before analysis'],
      artifacts: {}
    },
    assistantMessage,
    title: assistantMessage,
    summary: assistantMessage,
    answer: undefined,
    directAnswer: undefined,
    needsClarification: true,
    clarificationQuestion: question,
    clarificationOptions,
    conversationMode: 'clarify' as const,
    intent,
    scope: intent === 'unknown' ? 'overview' : intent,
    insights: [],
    widgets: [],
    followUps: clarificationOptions.slice(0, 3).map((option) => option.nextPrompt ?? option.label),
    generatedAt: new Date().toISOString()
  };
};

const buildWidgetCatalog = (snapshot: Awaited<ReturnType<typeof buildPosAiSnapshot>>) => {
  const totalSalesWidget = {
    type: 'metric_card' as const,
    key: 'kpi_total_sales' as const,
    title: 'Total Sales',
    value: formatCurrency(snapshot.summary.totalSales),
    subtitle: `${snapshot.totalDays} day(s) in range`,
    tone: 'positive' as const
  };
  const averageWidget = {
    type: 'metric_card' as const,
    key: 'kpi_average_daily_sales' as const,
    title: 'Average Daily Sales',
    value: formatCurrency2(snapshot.summary.avgDailySales),
    subtitle: 'Average per open day',
    tone: 'neutral' as const
  };
  const bestDayWidget = {
    type: 'metric_card' as const,
    key: 'kpi_best_day' as const,
    title: 'Best Day',
    value: snapshot.bestDay ? formatCurrency(snapshot.bestDay.totalSales) : 'N/A',
    subtitle: snapshot.bestDay ? `${snapshot.bestDay.day} · ${snapshot.bestDay.date}` : 'No rows available',
    tone: snapshot.bestDay ? 'positive' : 'neutral'
  };
  const weekdayWidget = {
    type: 'metric_card' as const,
    key: 'kpi_weekday_vs_weekend' as const,
    title: 'Weekend Lift',
    value:
      snapshot.weekSplit.weekday && snapshot.weekSplit.weekend
        ? `${formatPercent(snapshot.weekSplit.deltaPercent)}`
        : 'N/A',
    subtitle:
      snapshot.weekSplit.weekday && snapshot.weekSplit.weekend
        ? `${formatCurrency(snapshot.weekSplit.weekend.totalSales)} weekend vs ${formatCurrency(snapshot.weekSplit.weekday.totalSales)} weekday`
        : 'Not enough data',
    tone: snapshot.weekSplit.deltaSales >= 0 ? 'positive' : 'warning'
  };
  const weekdayTable = {
    type: 'comparison_table' as const,
    key: 'table_weekday_vs_weekend' as const,
    title: 'Weekday vs Weekend',
    columns: [
      { key: 'label', label: 'Group', format: 'text' as const },
      { key: 'days', label: 'Days', format: 'number' as const },
      { key: 'totalSales', label: 'Sales', format: 'currency' as const },
      { key: 'avgDailySales', label: 'Avg / Day', format: 'currency' as const },
      { key: 'cashDiff', label: 'Cash Diff', format: 'currency' as const }
    ],
    rows: [snapshot.weekSplit.weekday, snapshot.weekSplit.weekend].filter(Boolean).map((row) => ({
      label: row!.label,
      days: row!.days,
      totalSales: row!.totalSales,
      avgDailySales: row!.avgDailySales,
      cashDiff: row!.cashDiff
    })),
    note: 'Comparison is calculated from POS daily summary rows.'
  };
  const weekdayBar = {
    type: 'bar_chart' as const,
    key: 'bar_sales_by_weekday' as const,
    title: 'Sales by Day of Week',
    xKey: 'label',
    yKey: 'totalSales',
    data: snapshot.weekdaySeries.map((row) => ({
      label: row.label,
      totalSales: row.totalSales,
      days: row.days
    })),
    note: 'Higher bars represent stronger average daily sales across the selected range.'
  };
  const trendLine = {
    type: 'line_chart' as const,
    key: 'line_sales_trend' as const,
    title: 'Daily Sales Trend',
    xKey: 'date',
    yKey: 'totalSales',
    data: snapshot.dailySeries.map((row) => ({
      date: row.date,
      totalSales: row.totalSales,
      avg7: snapshot.movingAverage7.find((point) => point.date === row.date)?.value ?? row.totalSales
    })),
    note: 'The line reflects raw daily sales with a 7-day moving average available in the data.'
  };
  const topDaysTable = {
    type: 'comparison_table' as const,
    key: 'table_top_days' as const,
    title: 'Top Sales Days',
    columns: [
      { key: 'date', label: 'Date', format: 'text' as const },
      { key: 'day', label: 'Day', format: 'text' as const },
      { key: 'totalSales', label: 'Sales', format: 'currency' as const },
      { key: 'cashDiff', label: 'Cash Diff', format: 'currency' as const },
      { key: 'netIncome', label: 'Net Income', format: 'currency' as const }
    ],
    rows: snapshot.topDays.map((row) => ({
      date: row.date,
      day: row.day,
      totalSales: row.totalSales,
      cashDiff: row.cashDiff,
      netIncome: row.netIncome
    })),
    note: 'Sorted from highest to lowest sales.'
  };

  const widgetEntries: Array<[PosAiWidgetKey, unknown]> = [
    [totalSalesWidget.key, totalSalesWidget],
    [averageWidget.key, averageWidget],
    [bestDayWidget.key, bestDayWidget],
    [weekdayWidget.key, weekdayWidget],
    [weekdayTable.key, weekdayTable],
    [weekdayBar.key, weekdayBar],
    [trendLine.key, trendLine],
    [topDaysTable.key, topDaysTable]
  ];

  return new Map<PosAiWidgetKey, unknown>(widgetEntries);
};

const buildFallbackWidgets = (
  snapshot: Awaited<ReturnType<typeof buildPosAiSnapshot>>,
  scope: z.infer<typeof posAiScopeSchema>,
  widgetLimit: number
) => {

  const widgetMap = buildWidgetCatalog(snapshot);
  const selectedKeys = POS_AI_WIDGET_ORDER_BY_SCOPE[scope].slice(0, widgetLimit);
  return selectedKeys.map((key) => widgetMap.get(key)).filter(Boolean);
};

export const buildPosAiSnapshot = async (input: PosAiServiceInput) => {
  const range = resolveRange({ start: input.start, end: input.end });
  if (!range) {
    throw new Error('Invalid POS AI date range');
  }

  const rows = (await POSDailySummaryModel.find({
    companyId: input.companyId,
    date: { $gte: range.startDate, $lte: range.endDate }
  })
    .select('date day totalSales creditCard cash gas lottery lotteryPayout cashExpenses cashPayout saleTax')
    .sort({ date: 1 })
    .lean()) as PosRow[];

  const dailySeries = buildDailySeries(rows);
  const summary = rows.reduce(
    (acc, row) => {
      acc.totalSales += row.totalSales;
      acc.creditCard += row.creditCard;
      acc.cash += row.cash;
      acc.gas += row.gas;
      acc.lottery += row.lottery;
      acc.lotteryPayout += row.lotteryPayout;
      acc.cashExpenses += row.cashExpenses;
      acc.cashPayout += row.cashPayout;
      acc.saleTax += row.saleTax;
      return acc;
    },
    {
      totalSales: 0,
      creditCard: 0,
      cash: 0,
      gas: 0,
      lottery: 0,
      lotteryPayout: 0,
      cashExpenses: 0,
      cashPayout: 0,
      saleTax: 0
    }
  );

  const enrichedSummary = {
    ...summary,
    cashDiff: Number(
      (
        summary.cash -
        (summary.totalSales - summary.creditCard - summary.lotteryPayout - summary.cashExpenses - summary.cashPayout)
      ).toFixed(2)
    ),
    netIncome: Number((summary.totalSales - summary.saleTax - summary.cashExpenses - summary.cashPayout).toFixed(2)),
    avgDailySales: Number((rows.length > 0 ? summary.totalSales / rows.length : 0).toFixed(2))
  };

  const bestDay = rows.length > 0 ? buildSnapshotRow([...rows].sort((a, b) => b.totalSales - a.totalSales)[0]) : null;
  const worstDay = rows.length > 0 ? buildSnapshotRow([...rows].sort((a, b) => a.totalSales - b.totalSales)[0]) : null;
  const topDays = buildTopDays(rows);
  const weekdaySeries = buildWeekdaySeries(rows);
  const weekSplit = buildWeekSplit(rows);
  const movingAverage7 = buildMovingAverage7(rows);
  const snapshot = {
    range: {
      start: range.start,
      end: range.end
    },
    generatedAt: new Date().toISOString(),
    totalDays: rows.length,
    summary: enrichedSummary,
    bestDay,
    worstDay,
    topDays,
    dailySeries,
    weekdaySeries,
    weekSplit,
    movingAverage7,
    keySignals: [] as string[]
  };

  snapshot.keySignals = buildKeySignals(snapshot);
  return posAiSnapshotSchema.parse(snapshot);
};

const buildGeminiPrompt = (input: PosAiServiceInput, snapshot: Awaited<ReturnType<typeof buildPosAiSnapshot>>) =>
  [
    'You are a POS analytics assistant for a retail dashboard.',
    'Return JSON only and do not include markdown fences or prose.',
    'Use only the provided snapshot. Do not invent new numbers.',
    'If the prompt is underspecified, ask a concise clarification question instead of forcing widgets.',
    'Choose the most useful widget keys from the allowed list.',
    'If the user asks for the highest-selling day or comparisons, emphasize those first.',
    'If data is limited, say so clearly.',
    'Allowed widget keys:',
    JSON.stringify(
      [
        'kpi_total_sales',
        'kpi_average_daily_sales',
        'kpi_best_day',
        'kpi_weekday_vs_weekend',
        'bar_sales_by_weekday',
        'line_sales_trend',
        'table_weekday_vs_weekend',
        'table_top_days'
      ],
      null,
      2
    ),
    'Response schema:',
    JSON.stringify(posAiGeminiResponseJsonSchema, null, 2),
    'Request context:',
    JSON.stringify(
      {
        prompt: input.prompt,
        intent: inferIntent(input.prompt),
        scope: input.scope,
        filters: input.filters,
        widgetLimit: input.widgetLimit,
        insightLimit: input.insightLimit,
        snapshot
      },
      null,
      2
    )
  ].join('\n');

const buildFallbackAnalysis = (
  input: PosAiServiceInput,
  snapshot: Awaited<ReturnType<typeof buildPosAiSnapshot>>,
  intent: PosAiIntent
) => {
  const widgets = buildFallbackWidgets(snapshot, input.scope, input.widgetLimit);
  const insights = [] as z.infer<typeof posAiInsightSchema>[];
  const bestDay = snapshot.bestDay;
  if (bestDay) {
    insights.push({
      title: 'Highest sales day',
      text: `${bestDay.day} (${bestDay.date}) generated ${formatCurrency(bestDay.totalSales)} in sales.`,
      severity: 'high',
      source: 'fallback'
    });
  }
  if (snapshot.weekSplit.weekday && snapshot.weekSplit.weekend) {
    const comparisonText =
      snapshot.weekSplit.deltaSales >= 0
        ? `Weekend sales were ${formatCurrency(snapshot.weekSplit.deltaSales)} higher than weekdays (${formatPercent(snapshot.weekSplit.deltaPercent)}).`
        : `Weekend sales were ${formatCurrency(Math.abs(snapshot.weekSplit.deltaSales))} lower than weekdays (${formatPercent(snapshot.weekSplit.deltaPercent)}).`;
    insights.push({
      title: 'Weekday vs weekend',
      text: comparisonText,
      severity: Math.abs(snapshot.weekSplit.deltaPercent) >= 10 ? 'medium' : 'low',
      source: 'fallback'
    });
  }
  if (snapshot.movingAverage7.length > 1) {
    const first = snapshot.movingAverage7[0]?.value ?? 0;
    const last = snapshot.movingAverage7[snapshot.movingAverage7.length - 1]?.value ?? 0;
    const direction = last > first ? 'up' : last < first ? 'down' : 'flat';
    insights.push({
      title: 'Trend direction',
      text:
        direction === 'up'
          ? 'The 7-day moving average is trending upward across the selected range.'
          : direction === 'down'
            ? 'The 7-day moving average is trending downward across the selected range.'
            : 'The 7-day moving average is relatively flat across the selected range.',
      severity: direction === 'flat' ? 'low' : 'medium',
      source: 'fallback'
    });
  }

  const assistantMessage = snapshot.bestDay
    ? `${snapshot.bestDay.day} was the strongest sales day at ${formatCurrency(snapshot.bestDay.totalSales)}. I can also compare weekdays vs weekends, show a trend, or break down the top days if you want.`
    : 'I did not find any POS rows for the selected range. You can ask me to compare periods, show a trend, or focus on the top sales days once data is available.';

  const directAnswer = snapshot.bestDay
    ? `Highest-selling day: ${snapshot.bestDay.day} (${snapshot.bestDay.date}) with ${formatCurrency(snapshot.bestDay.totalSales)}.`
    : 'No data available for the selected range.';

  return {
    title: snapshot.bestDay ? `Sales peaked on ${snapshot.bestDay.day}` : 'POS sales summary',
    summary: snapshot.bestDay
      ? `${snapshot.bestDay.day} was the strongest sales day at ${formatCurrency(snapshot.bestDay.totalSales)}.`
      : 'No POS rows were found for the selected range.',
    assistantMessage,
    directAnswer,
    answer: directAnswer,
    needsClarification: false,
    clarificationQuestion: undefined,
    clarificationOptions: [],
    conversationMode: 'answer' as const,
    intent,
    scope: input.scope,
    insights,
    widgets,
    followUps: [
      'Show weekday vs weekend sales',
      'Show the daily sales trend',
      'Show the top sales days'
    ].slice(0, input.insightLimit)
  };
};

export const runPosAiQuery = async (input: PosAiServiceInput) => {
  const snapshot = await buildPosAiSnapshot(input);
  const intent = inferIntent(input.prompt);
  if (needsClarification(input, intent)) {
    return posAiDashboardQueryResponseSchema.parse(buildClarificationResponse(input, snapshot));
  }

  const fallback = buildFallbackAnalysis(input, snapshot, intent);
  const minConfidence = Number.isFinite(env.statementGeminiMinConfidence)
    ? env.statementGeminiMinConfidence
    : 0.65;

  const aiStatusBase = {
    provider: 'gemini' as const,
    providerStatus: 'unavailable' as const,
    degraded: true,
    degradedReason: 'Gemini API key is not configured',
    source: 'fallback' as const,
    confidence: 0.35,
    reasons: [...snapshot.keySignals, 'Gemini unavailable; deterministic POS fallback used'],
    artifacts: {}
  };

  if (!env.statementGeminiApiKey) {
    return posAiDashboardQueryResponseSchema.parse({
      query: posAiDashboardQuerySchema.parse(input),
      snapshot,
      aiStatus: aiStatusBase,
      assistantMessage: fallback.assistantMessage,
      title: fallback.title,
      summary: fallback.summary,
      answer: fallback.answer,
      directAnswer: fallback.directAnswer,
      needsClarification: fallback.needsClarification,
      clarificationQuestion: fallback.clarificationQuestion,
      clarificationOptions: fallback.clarificationOptions,
      conversationMode: fallback.conversationMode,
      intent: fallback.intent,
      scope: fallback.scope,
      insights: fallback.insights,
      widgets: fallback.widgets,
      followUps: fallback.followUps,
      generatedAt: new Date().toISOString()
    });
  }

  try {
    const prompt = buildGeminiPrompt(input, snapshot);
    const response = await generateGeminiContent({
      prompt,
      systemInstruction: [
        'You are a retail POS analytics assistant.',
        'Return valid JSON only.',
        'Do not include markdown fences, prose, or code.'
      ].join(' '),
      model: env.statementGeminiModel,
      endpoint: env.statementGeminiEndpoint,
      apiKey: env.statementGeminiApiKey,
      timeoutMs: env.statementGeminiTimeoutMs,
      temperature: env.statementGeminiTemperature,
      maxOutputTokens: env.statementGeminiMaxOutputTokens,
      responseMimeType: 'application/json',
      responseJsonSchema: posAiGeminiResponseJsonSchema
    });

    const parsed = posAiGeminiResponseSchema.parse(JSON.parse(response.text));
    if (parsed.needsClarification) {
      return posAiDashboardQueryResponseSchema.parse({
        query: posAiDashboardQuerySchema.parse(input),
        snapshot,
        aiStatus: {
          provider: 'gemini',
          providerStatus: 'healthy',
          degraded: false,
          source: 'gemini',
          confidence: parsed.confidence,
          reasons: [...snapshot.keySignals, 'Gemini requested clarification'],
          artifacts: {}
        },
        assistantMessage: parsed.assistantMessage,
        title: parsed.title,
        summary: parsed.summary,
        answer: parsed.answer ?? parsed.directAnswer,
        directAnswer: parsed.directAnswer ?? parsed.answer,
        needsClarification: true,
        clarificationQuestion: parsed.clarificationQuestion ?? parsed.summary,
        clarificationOptions: parsed.clarificationOptions.slice(0, 4),
        conversationMode: parsed.conversationMode,
        intent: parsed.intent,
        scope: parsed.scope ?? input.scope,
        insights: parsed.insights.slice(0, input.insightLimit),
        widgets: [],
        followUps: parsed.followUps.slice(0, input.insightLimit),
        generatedAt: new Date().toISOString()
      });
    }

    if (parsed.confidence < minConfidence) {
      return posAiDashboardQueryResponseSchema.parse({
        query: posAiDashboardQuerySchema.parse(input),
        snapshot,
        aiStatus: {
          provider: 'gemini',
          providerStatus: 'degraded',
          degraded: true,
          degradedReason: `Gemini confidence below threshold (${parsed.confidence.toFixed(2)} < ${minConfidence.toFixed(2)})`,
          source: 'fallback',
          confidence: parsed.confidence,
          reasons: [...snapshot.keySignals, 'Gemini confidence below threshold; deterministic fallback used'],
          artifacts: {}
        },
        assistantMessage: fallback.assistantMessage,
        title: fallback.title,
        summary: fallback.summary,
        answer: fallback.answer,
        directAnswer: fallback.directAnswer,
        needsClarification: fallback.needsClarification,
        clarificationQuestion: fallback.clarificationQuestion,
        clarificationOptions: fallback.clarificationOptions,
        conversationMode: fallback.conversationMode,
        intent: fallback.intent,
        scope: fallback.scope,
        insights: fallback.insights,
        widgets: fallback.widgets,
        followUps: fallback.followUps,
        generatedAt: new Date().toISOString()
      });
    }

    const widgetOrder = parsed.widgetKeys.length > 0
      ? parsed.widgetKeys
      : POS_AI_WIDGET_ORDER_BY_SCOPE[input.scope].slice(0, input.widgetLimit);
    const widgetMap = buildWidgetCatalog(snapshot);
    const widgets = widgetOrder
      .map((key) => widgetMap.get(key))
      .filter((widget): widget is unknown => Boolean(widget))
      .slice(0, input.widgetLimit);

    return posAiDashboardQueryResponseSchema.parse({
      query: posAiDashboardQuerySchema.parse(input),
      snapshot,
      aiStatus: {
        provider: 'gemini',
        providerStatus: 'healthy',
        degraded: false,
        source: 'hybrid',
        confidence: parsed.confidence,
        reasons: [...snapshot.keySignals, 'Gemini structured POS analysis accepted'],
        artifacts: {}
      },
      assistantMessage: parsed.assistantMessage,
      title: parsed.title,
      summary: parsed.summary,
      answer: parsed.answer ?? parsed.summary,
      directAnswer: parsed.directAnswer ?? parsed.answer,
      needsClarification: parsed.needsClarification,
      clarificationQuestion: parsed.clarificationQuestion,
      clarificationOptions: parsed.clarificationOptions.slice(0, 4),
      conversationMode: parsed.conversationMode,
      intent: parsed.intent,
      scope: parsed.scope ?? input.scope,
      insights: parsed.insights.slice(0, input.insightLimit),
      widgets,
      followUps: parsed.followUps.slice(0, input.insightLimit),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini request failed';

    const degradedStatus = {
      provider: 'gemini' as const,
      providerStatus: 'degraded' as const,
      degraded: true,
      degradedReason: message,
      source: 'fallback' as const,
      confidence: 0.35,
      reasons: [...snapshot.keySignals, `Gemini unavailable: ${message}`],
      artifacts: {}
    };

    return posAiDashboardQueryResponseSchema.parse({
      query: posAiDashboardQuerySchema.parse(input),
      snapshot,
      aiStatus: degradedStatus,
      assistantMessage: fallback.assistantMessage,
      title: fallback.title,
      summary: fallback.summary,
      answer: fallback.answer,
      directAnswer: fallback.directAnswer,
      needsClarification: fallback.needsClarification,
      clarificationQuestion: fallback.clarificationQuestion,
      clarificationOptions: fallback.clarificationOptions,
      conversationMode: fallback.conversationMode,
      intent: fallback.intent,
      scope: fallback.scope,
      insights: fallback.insights,
      widgets: fallback.widgets,
      followUps: fallback.followUps,
      generatedAt: new Date().toISOString()
    });
  }
};
