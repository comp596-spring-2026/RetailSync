import { z } from 'zod';

export const posDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

export const posAiScopeSchema = z.enum(['overview', 'comparison', 'trend', 'weekday', 'top_days']);

export const posAiWidgetKeySchema = z.enum([
  'kpi_total_sales',
  'kpi_average_daily_sales',
  'kpi_best_day',
  'kpi_weekday_vs_weekend',
  'bar_sales_by_weekday',
  'line_sales_trend',
  'table_weekday_vs_weekend',
  'table_top_days'
]);

export const posAiInsightSchema = z.object({
  title: z.string().trim().min(1),
  text: z.string().trim().min(1),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  source: z.enum(['gemini', 'fallback']).optional()
});

export const posAiClarificationKindSchema = z.enum([
  'yes_no',
  'preset_range',
  'comparison',
  'display',
  'custom'
]);

export const posAiClarificationOptionSchema = z.object({
  label: z.string().trim().min(1),
  value: z.string().trim().min(1),
  kind: posAiClarificationKindSchema,
  promptPatch: z.string().trim().optional(),
  nextPrompt: z.string().trim().optional()
});

export const posAiMetricCardWidgetSchema = z.object({
  type: z.literal('metric_card'),
  key: posAiWidgetKeySchema,
  title: z.string().trim().min(1),
  value: z.string().trim().min(1),
  subtitle: z.string().trim().optional(),
  tone: z.enum(['neutral', 'positive', 'warning', 'critical']).default('neutral')
});

export const posAiComparisonColumnSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  format: z.enum(['currency', 'number', 'percent', 'text']).default('text')
});

export const posAiDashboardComparisonTableWidgetSchema = z.object({
  type: z.literal('comparison_table'),
  key: posAiWidgetKeySchema,
  title: z.string().trim().min(1),
  columns: z.array(posAiComparisonColumnSchema).min(1),
  rows: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  note: z.string().trim().optional()
});

export const posAiBarChartWidgetSchema = z.object({
  type: z.literal('bar_chart'),
  key: posAiWidgetKeySchema,
  title: z.string().trim().min(1),
  xKey: z.string().trim().min(1),
  yKey: z.string().trim().min(1),
  data: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  note: z.string().trim().optional()
});

export const posAiLineChartWidgetSchema = z.object({
  type: z.literal('line_chart'),
  key: posAiWidgetKeySchema,
  title: z.string().trim().min(1),
  xKey: z.string().trim().min(1),
  yKey: z.string().trim().min(1),
  data: z.array(z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  note: z.string().trim().optional()
});

export const posAiTextInsightWidgetSchema = z.object({
  type: z.literal('text_insight'),
  key: posAiWidgetKeySchema,
  title: z.string().trim().min(1),
  text: z.string().trim().min(1),
  severity: z.enum(['low', 'medium', 'high']).optional()
});

export const posAiDashboardWidgetSchema = z.union([
  posAiMetricCardWidgetSchema,
  posAiDashboardComparisonTableWidgetSchema,
  posAiBarChartWidgetSchema,
  posAiLineChartWidgetSchema,
  posAiTextInsightWidgetSchema
]);

export const posAiDashboardQuerySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  start: posDateSchema.optional(),
  end: posDateSchema.optional(),
  scope: posAiScopeSchema.default('overview'),
  widgetLimit: z.coerce.number().int().min(1).max(8).default(4),
  insightLimit: z.coerce.number().int().min(1).max(8).default(4),
  filters: z.record(z.unknown()).default({})
});

export const posAiConversationModeSchema = z.enum(['answer', 'clarify', 'mixed']);
export const posAiIntentSchema = z.enum([
  'overview',
  'comparison',
  'trend',
  'weekday',
  'top_days',
  'unknown'
]);

export const posAiSnapshotDailyRowSchema = z.object({
  date: posDateSchema,
  day: z.string().trim().min(1),
  totalSales: z.number(),
  creditCard: z.number(),
  cash: z.number(),
  gas: z.number(),
  lottery: z.number(),
  lotteryPayout: z.number(),
  cashExpenses: z.number(),
  cashPayout: z.number(),
  saleTax: z.number(),
  cashDiff: z.number(),
  netIncome: z.number()
});

export const posAiSnapshotSummarySchema = z.object({
  totalSales: z.number(),
  creditCard: z.number(),
  cash: z.number(),
  gas: z.number(),
  lottery: z.number(),
  lotteryPayout: z.number(),
  cashExpenses: z.number(),
  cashPayout: z.number(),
  saleTax: z.number(),
  cashDiff: z.number(),
  netIncome: z.number(),
  avgDailySales: z.number()
});

export const posAiSnapshotGroupSchema = z.object({
  label: z.string().trim().min(1),
  days: z.number().int().nonnegative(),
  totalSales: z.number(),
  avgDailySales: z.number(),
  creditCard: z.number(),
  cash: z.number(),
  cashDiff: z.number()
});

export const posAiSnapshotSchema = z.object({
  range: z.object({
    start: posDateSchema,
    end: posDateSchema
  }),
  generatedAt: z.string().trim(),
  totalDays: z.number().int().nonnegative(),
  summary: posAiSnapshotSummarySchema,
  bestDay: posAiSnapshotDailyRowSchema.nullable(),
  worstDay: posAiSnapshotDailyRowSchema.nullable(),
  topDays: z.array(posAiSnapshotDailyRowSchema),
  dailySeries: z.array(posAiSnapshotDailyRowSchema),
  weekdaySeries: z.array(posAiSnapshotGroupSchema),
  weekSplit: z.object({
    weekday: posAiSnapshotGroupSchema.nullable(),
    weekend: posAiSnapshotGroupSchema.nullable(),
    deltaSales: z.number(),
    deltaPercent: z.number()
  }),
  movingAverage7: z.array(
    z.object({
      date: posDateSchema,
      value: z.number()
    })
  ),
  keySignals: z.array(z.string().trim().min(1))
});

export const posAiAiStatusSchema = z.object({
  provider: z.literal('gemini'),
  providerStatus: z.enum(['healthy', 'degraded', 'unavailable']),
  degraded: z.boolean().default(false),
  degradedReason: z.string().trim().optional(),
  source: z.enum(['gemini', 'fallback', 'hybrid']),
  confidence: z.number().min(0).max(1).default(0),
  reasons: z.array(z.string().trim()).default([]),
  artifacts: z
    .object({
      promptPath: z.string().trim().optional(),
      rawPath: z.string().trim().optional(),
      normalizedPath: z.string().trim().optional()
    })
    .default({})
});

export const posAiAssistantResponseSchema = z.object({
  query: posAiDashboardQuerySchema,
  snapshot: posAiSnapshotSchema,
  aiStatus: posAiAiStatusSchema,
  assistantMessage: z.string().trim().min(1),
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  answer: z.string().trim().optional(),
  directAnswer: z.string().trim().optional(),
  needsClarification: z.boolean().default(false),
  clarificationQuestion: z.string().trim().optional(),
  clarificationOptions: z.array(posAiClarificationOptionSchema).default([]),
  conversationMode: posAiConversationModeSchema.default('answer'),
  intent: posAiIntentSchema.default('unknown'),
  scope: posAiScopeSchema.optional(),
  insights: z.array(posAiInsightSchema),
  widgets: z.array(posAiDashboardWidgetSchema).default([]),
  followUps: z.array(z.string().trim().min(1)),
  generatedAt: z.string().trim()
});

export const posAiDashboardQueryResponseSchema = posAiAssistantResponseSchema;

export type PosAiQuery = z.infer<typeof posAiDashboardQuerySchema>;
export type PosAiSnapshot = z.infer<typeof posAiSnapshotSchema>;
export type PosAiDashboardWidget = z.infer<typeof posAiDashboardWidgetSchema>;
export type PosAiClarificationOption = z.infer<typeof posAiClarificationOptionSchema>;
export type PosAiAssistantResponse = z.infer<typeof posAiAssistantResponseSchema>;
export type PosAiQueryResponse = z.infer<typeof posAiDashboardQueryResponseSchema>;
