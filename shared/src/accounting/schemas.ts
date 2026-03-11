import { z } from 'zod';

export const statementMonthSchema = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const bankStatementSourceSchema = z.enum(['upload', 'manual', 'email']);

export const bankStatementStatusSchema = z.enum([
  'uploaded',
  'extracting',
  'structuring',
  'checks_queued',
  'ready_for_review',
  'failed'
]);

export const statementReviewStatusSchema = z.enum(['proposed', 'edited', 'approved', 'excluded']);

export const statementPostingStatusSchema = z.enum([
  'not_posted',
  'posting',
  'posted',
  'failed'
]);

export const statementCheckStatusSchema = z.enum([
  'queued',
  'processing',
  'ready',
  'needs_review',
  'failed'
]);

export const quickbooksTxnTypeSchema = z.enum(['Expense', 'Deposit', 'Transfer', 'Check']);

export const confidenceBreakdownSchema = z.object({
  imageQuality: z.number().min(0).max(1).optional(),
  ocrConfidence: z.number().min(0).max(1).optional(),
  fieldConfidence: z.number().min(0).max(1).optional(),
  crossValidation: z.number().min(0).max(1).optional(),
  overall: z.number().min(0).max(1)
});

export const proposalSchema = z.object({
  qbTxnType: quickbooksTxnTypeSchema.optional(),
  bankAccountId: z.string().trim().optional(),
  categoryAccountId: z.string().trim().optional(),
  payeeType: z.enum(['vendor', 'customer', 'employee', 'other']).optional(),
  payeeId: z.string().trim().optional(),
  payeeName: z.string().trim().optional(),
  transferTargetAccountId: z.string().trim().optional(),
  memo: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).default(0),
  reasons: z.array(z.string().trim()).default([]),
  status: statementReviewStatusSchema.default('proposed'),
  version: z.string().trim().default('v1')
});

export const statementProgressSchema = z.object({
  totalChecks: z.number().int().nonnegative().default(0),
  checksQueued: z.number().int().nonnegative().default(0),
  checksProcessing: z.number().int().nonnegative().default(0),
  checksReady: z.number().int().nonnegative().default(0),
  checksFailed: z.number().int().nonnegative().default(0)
});

export const statementGcsSchema = z.object({
  rootPrefix: z.string().trim().min(1),
  pdfPath: z.string().trim().min(1)
});

export const statementTransactionSchema = z.object({
  id: z.string().trim().min(1),
  statementId: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  postDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1),
  merchant: z.string().trim().optional(),
  amount: z.number(),
  type: z.enum(['debit', 'credit']),
  balanceAfter: z.number().optional(),
  checkNumber: z.string().trim().optional(),
  sourceLocator: z
    .object({
      pageNumber: z.number().int().positive().optional(),
      rowIndex: z.number().int().nonnegative().optional(),
      bbox: z.array(z.number()).length(4).optional()
    })
    .optional(),
  evidence: z
    .object({
      statementPdfPath: z.string().trim().optional(),
      pageImagePath: z.string().trim().optional()
    })
    .optional(),
  proposal: proposalSchema.optional(),
  reviewStatus: statementReviewStatusSchema.default('proposed'),
  posting: z
    .object({
      status: statementPostingStatusSchema.default('not_posted'),
      qbTxnId: z.string().trim().optional(),
      error: z.string().trim().optional()
    })
    .default({ status: 'not_posted' })
});

export const statementCheckSchema = z.object({
  id: z.string().trim().min(1),
  statementId: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  status: statementCheckStatusSchema,
  confidence: confidenceBreakdownSchema.optional(),
  autoFill: z
    .object({
      checkNumber: z.string().trim().optional(),
      date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      payeeName: z.string().trim().optional(),
      amount: z.number().optional(),
      memo: z.string().trim().optional()
    })
    .optional(),
  gcs: z.object({
    frontPath: z.string().trim().min(1),
    backPath: z.string().trim().optional(),
    ocrPath: z.string().trim().optional(),
    structuredPath: z.string().trim().optional()
  }),
  match: z
    .object({
      statementTransactionId: z.string().trim().optional(),
      matchConfidence: z.number().min(0).max(1).optional(),
      reasons: z.array(z.string().trim()).default([])
    })
    .optional()
});

export const accountingJobTypeSchema = z.enum([
  'statement.extract',
  'statement.structure',
  'checks.spawn',
  'check.process',
  'matching.refresh',
  'quickbooks.refresh_reference_data',
  'quickbooks.post_approved'
]);

export const accountingTaskPayloadSchema = z.object({
  companyId: z.string().trim().min(1),
  jobType: accountingJobTypeSchema,
  statementId: z.string().trim().optional(),
  checkId: z.string().trim().optional(),
  attempt: z.number().int().min(1).default(1),
  meta: z.record(z.unknown()).default({})
});

export const requestStatementUploadUrlSchema = z.object({
  fileName: z.string().trim().min(1),
  statementMonth: statementMonthSchema.optional(),
  contentType: z.literal('application/pdf').optional().default('application/pdf')
});

export const requestStatementUploadUrlResponseSchema = z.object({
  uploadUrl: z.string().trim().url(),
  gcsPath: z.string().trim().min(1),
  statementId: z.string().trim().min(1),
  rootPrefix: z.string().trim().min(1),
  expiresAt: z.string().trim()
});

export const createBankStatementSchema = z.object({
  statementId: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  statementMonth: statementMonthSchema,
  gcsPath: z.string().trim().min(1),
  periodStart: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  periodEnd: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: bankStatementSourceSchema.optional().default('upload')
});

export const listBankStatementsQuerySchema = z.object({
  month: statementMonthSchema.optional(),
  status: bankStatementStatusSchema.optional(),
  search: z.string().trim().optional()
});

export const reprocessBankStatementSchema = z.object({
  fromJobType: accountingJobTypeSchema.optional().default('statement.extract')
});

export const bankStatementListItemSchema = z.object({
  id: z.string().trim().min(1),
  statementMonth: statementMonthSchema,
  fileName: z.string().trim().min(1),
  source: bankStatementSourceSchema,
  status: bankStatementStatusSchema,
  progress: statementProgressSchema,
  confidence: z.number().min(0).max(1).optional(),
  issuesCount: z.number().int().nonnegative(),
  updatedAt: z.string().trim(),
  createdAt: z.string().trim()
});

export const bankStatementDetailSchema = bankStatementListItemSchema.extend({
  periodStart: z.string().trim().optional(),
  periodEnd: z.string().trim().optional(),
  bankName: z.string().trim().optional(),
  accountLast4: z.string().trim().optional(),
  gcs: statementGcsSchema,
  checks: z.array(statementCheckSchema),
  issues: z.array(z.string().trim()).default([])
});

export const bankStatementStatusResponseSchema = z.object({
  statementId: z.string().trim().min(1),
  status: bankStatementStatusSchema,
  progress: statementProgressSchema,
  updatedAt: z.string().trim(),
  issues: z.array(z.string().trim()).default([])
});

export const listChecksQuerySchema = z.object({
  status: statementCheckStatusSchema.optional()
});

export const ledgerEntrySchema = z.object({
  id: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  sourceType: z.literal('statement'),
  statementId: z.string().trim().min(1),
  statementTransactionId: z.string().trim().min(1),
  statementCheckId: z.string().trim().optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1),
  merchant: z.string().trim().optional(),
  amount: z.number(),
  type: z.enum(['debit', 'credit']),
  balanceAfter: z.number().optional(),
  attachments: z
    .object({
      statementPdfPath: z.string().trim().optional(),
      statementPageImagePath: z.string().trim().optional(),
      checkFrontPath: z.string().trim().optional(),
      checkBackPath: z.string().trim().optional()
    })
    .default({}),
  confidence: confidenceBreakdownSchema.optional(),
  proposal: proposalSchema.default({
    confidence: 0,
    reasons: [],
    status: 'proposed',
    version: 'v1'
  }),
  reviewStatus: statementReviewStatusSchema.default('proposed'),
  posting: z
    .object({
      status: statementPostingStatusSchema.default('not_posted'),
      qbTxnId: z.string().trim().optional(),
      error: z.string().trim().optional(),
      postedAt: z.string().trim().optional()
    })
    .default({ status: 'not_posted' })
});

export const ledgerEntriesListQuerySchema = z.object({
  reviewStatus: statementReviewStatusSchema.optional(),
  postingStatus: statementPostingStatusSchema.optional(),
  hasCheck: z
    .union([z.boolean(), z.string().trim().regex(/^(true|false)$/).transform((value) => value === 'true')])
    .optional(),
  type: z.enum(['debit', 'credit']).optional(),
  minConfidence: z
    .union([z.number().min(0).max(1), z.string().trim().transform((value) => Number(value))])
    .optional(),
  startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  limit: z
    .union([z.number().int().min(1).max(500), z.string().trim().transform((value) => Number(value))])
    .optional()
});

export const updateLedgerEntrySchema = z.object({
  proposal: proposalSchema.partial().optional(),
  reviewStatus: statementReviewStatusSchema.optional()
});

export const bulkApproveLedgerSchema = z.object({
  entryIds: z.array(z.string().trim().min(1)).min(1)
});

export const quickbooksSyncStatusSchema = z.enum(['idle', 'running', 'success', 'error']);

export const quickBooksSettingsSchema = z.object({
  connected: z.boolean(),
  environment: z.enum(['sandbox', 'production']),
  realmId: z.string().nullable(),
  companyName: z.string().nullable(),
  lastPullStatus: quickbooksSyncStatusSchema,
  lastPullAt: z.string().nullable(),
  lastPullCount: z.number().int().nonnegative(),
  lastPullError: z.string().nullable(),
  lastPushStatus: quickbooksSyncStatusSchema,
  lastPushAt: z.string().nullable(),
  lastPushCount: z.number().int().nonnegative(),
  lastPushError: z.string().nullable(),
  updatedAt: z.string().nullable().optional()
});

export const quickBooksTaxBasisSchema = z.enum(['cash', 'accrual']);

export const quickBooksTaxReportKeySchema = z.enum([
  'profit-loss',
  'balance-sheet',
  'trial-balance',
  'general-ledger',
  'ar-aging',
  'ap-aging'
]);

export const quickBooksTaxDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);

const coercePositiveInt = (min: number, max: number) =>
  z
    .union([z.number(), z.string().trim().min(1)])
    .transform((value) => Number(value))
    .refine((value) => Number.isInteger(value), 'Expected an integer')
    .refine((value) => value >= min, `Must be >= ${min}`)
    .refine((value) => value <= max, `Must be <= ${max}`);

export const quickBooksTaxReportRowSchema = z.object({
  label: z.string().trim().min(1),
  amount: z.number().nullable(),
  path: z.array(z.string().trim()).default([])
});

export const quickBooksTaxReportSchema = z.object({
  reportKey: quickBooksTaxReportKeySchema,
  from: quickBooksTaxDateSchema,
  to: quickBooksTaxDateSchema,
  basis: quickBooksTaxBasisSchema,
  generatedAt: z.string().trim(),
  rows: z.array(quickBooksTaxReportRowSchema),
  raw: z.record(z.unknown())
});

export const quickBooksTaxOverviewSchema = z.object({
  from: quickBooksTaxDateSchema,
  to: quickBooksTaxDateSchema,
  basis: quickBooksTaxBasisSchema,
  cards: z.object({
    netIncome: z.number().nullable(),
    totalAssets: z.number().nullable(),
    totalLiabilities: z.number().nullable(),
    totalEquity: z.number().nullable(),
    arOpen: z.number().nullable(),
    apOpen: z.number().nullable()
  })
});

export const quickBooksTaxWindowQuerySchema = z.object({
  from: quickBooksTaxDateSchema.optional(),
  to: quickBooksTaxDateSchema.optional(),
  basis: quickBooksTaxBasisSchema.optional()
});

export const quickBooksTaxChartAccountSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  code: z.string().nullable(),
  accountType: z.string().nullable(),
  active: z.boolean()
});

export const quickBooksTaxLedgerEntrySchema = z.object({
  id: z.string().trim().min(1),
  txnDate: quickBooksTaxDateSchema.optional(),
  description: z.string().trim().min(1),
  accountId: z.string().nullable(),
  accountName: z.string().nullable(),
  amount: z.number().nullable(),
  raw: z.record(z.unknown()).optional()
});

export const quickBooksTaxLedgerResponseSchema = z.object({
  from: quickBooksTaxDateSchema,
  to: quickBooksTaxDateSchema,
  basis: quickBooksTaxBasisSchema,
  accountId: z.string().nullable(),
  total: z.number().int().nonnegative(),
  nextCursor: z.string().nullable(),
  entries: z.array(quickBooksTaxLedgerEntrySchema)
});

export const quickBooksTaxLedgerQuerySchema = quickBooksTaxWindowQuerySchema.extend({
  accountId: z.string().trim().optional(),
  limit: coercePositiveInt(1, 500).optional(),
  cursor: z.string().trim().optional()
});

export const quickBooksTaxPaymentTypeSchema = z.enum(['customer', 'vendor']);

export const quickBooksTaxPaymentSchema = z.object({
  id: z.string().trim().min(1),
  paymentType: quickBooksTaxPaymentTypeSchema,
  sourceTxnType: z.string().trim().min(1),
  txnDate: quickBooksTaxDateSchema,
  amount: z.number(),
  entityId: z.string().nullable(),
  entityName: z.string().nullable(),
  memo: z.string().nullable(),
  raw: z.record(z.unknown()).optional()
});

export const quickBooksTaxPaymentsResponseSchema = z.object({
  from: quickBooksTaxDateSchema,
  to: quickBooksTaxDateSchema,
  type: z.union([quickBooksTaxPaymentTypeSchema, z.literal('all')]),
  nextCursor: z.string().nullable(),
  payments: z.array(quickBooksTaxPaymentSchema)
});

export const quickBooksTaxPaymentsQuerySchema = z.object({
  from: quickBooksTaxDateSchema.optional(),
  to: quickBooksTaxDateSchema.optional(),
  type: z.union([quickBooksTaxPaymentTypeSchema, z.literal('all')]).optional(),
  limit: coercePositiveInt(1, 200).optional(),
  cursor: z.string().trim().optional()
});

export const quickBooksRecoverPaymentInputSchema = z
  .object({
    clientRequestId: z.string().trim().min(6).max(120),
    paymentType: quickBooksTaxPaymentTypeSchema,
    txnDate: quickBooksTaxDateSchema,
    amount: z.number().positive(),
    bankAccountId: z.string().trim().min(1),
    customerId: z.string().trim().optional(),
    vendorId: z.string().trim().optional(),
    categoryAccountId: z.string().trim().optional(),
    memo: z.string().trim().max(1000).optional()
  })
  .superRefine((value, ctx) => {
    if (value.paymentType === 'customer' && !value.customerId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'customerId is required for customer payment recovery',
        path: ['customerId']
      });
    }
    if (value.paymentType === 'vendor') {
      if (!value.vendorId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'vendorId is required for vendor payment recovery',
          path: ['vendorId']
        });
      }
      if (!value.categoryAccountId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'categoryAccountId is required for vendor payment recovery',
          path: ['categoryAccountId']
        });
      }
    }
  });

export const quickBooksRecoverPaymentResultSchema = z.object({
  created: z.boolean(),
  clientRequestId: z.string().trim().min(1),
  paymentId: z.string().trim().min(1),
  txnType: z.enum(['Payment', 'Purchase']),
  txnDate: quickBooksTaxDateSchema,
  amount: z.number()
});

export const quickBooksJournalAdjustmentLineSchema = z.object({
  accountId: z.string().trim().min(1),
  debit: z.number().nonnegative().optional(),
  credit: z.number().nonnegative().optional(),
  description: z.string().trim().max(1000).optional()
});

export const quickBooksJournalAdjustmentInputSchema = z
  .object({
    clientRequestId: z.string().trim().min(6).max(120),
    txnDate: quickBooksTaxDateSchema,
    memo: z.string().trim().max(1000).optional(),
    lines: z.array(quickBooksJournalAdjustmentLineSchema).min(2)
  })
  .superRefine((value, ctx) => {
    let debitTotal = 0;
    let creditTotal = 0;
    value.lines.forEach((line, index) => {
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      if ((debit > 0 && credit > 0) || (debit <= 0 && credit <= 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each line must have exactly one side: debit or credit',
          path: ['lines', index]
        });
      }
      debitTotal += debit;
      creditTotal += credit;
    });
    if (Math.abs(debitTotal - creditTotal) > 0.009) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Journal adjustment must be balanced (debit total equals credit total)',
        path: ['lines']
      });
    }
  });

export const quickBooksJournalAdjustmentResultSchema = z.object({
  created: z.boolean(),
  clientRequestId: z.string().trim().min(1),
  journalEntryId: z.string().trim().min(1),
  txnDate: quickBooksTaxDateSchema
});

export const runSchema = z.object({
  id: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  statementId: z.string().trim().optional(),
  integrationId: z.string().trim().optional(),
  runType: z.enum(['pipeline', 'sync']),
  job: accountingJobTypeSchema,
  status: z.enum(['queued', 'running', 'success', 'failed']),
  metrics: z
    .object({
      durationsMs: z.number().int().nonnegative().optional(),
      counts: z.record(z.number()).optional()
    })
    .optional(),
  artifacts: z.record(z.string()).optional(),
  errors: z.array(z.string()).default([]),
  traceId: z.string().trim().optional(),
  createdAt: z.string().trim(),
  updatedAt: z.string().trim()
});

export const sseEventTypeSchema = z.enum([
  'progressUpdated',
  'checkUpdated',
  'ledgerEntryUpdated',
  'runUpdated'
]);

export const sseEnvelopeSchema = z.object({
  event: sseEventTypeSchema,
  data: z.record(z.unknown())
});

export const accountingObservabilitySummarySchema = z.object({
  generatedAt: z.string().trim(),
  counts: z.object({
    totalStatements: z.number().int().nonnegative(),
    extractingStatements: z.number().int().nonnegative(),
    structuringStatements: z.number().int().nonnegative(),
    checksQueuedStatements: z.number().int().nonnegative(),
    readyForReviewStatements: z.number().int().nonnegative(),
    failedStatements: z.number().int().nonnegative()
  }),
  recentStatements: z.array(bankStatementListItemSchema),
  failedRuns: z.array(runSchema),
  quickbooks: quickBooksSettingsSchema.nullable(),
  gcpLinks: z.object({
    apiLogsUrl: z.string().nullable(),
    workerLogsUrl: z.string().nullable(),
    failedAccountingTasksUrl: z.string().nullable(),
    quickbooksSyncUrl: z.string().nullable()
  })
});

export const accountingObservabilityDebugSchema = z.object({
  generatedAt: z.string().trim(),
  envReadiness: z.object({
    tasksMode: z.enum(['inline', 'cloud']),
    hasGcsBucketName: z.boolean(),
    hasInternalTasksSecret: z.boolean(),
    hasInternalTasksEndpoint: z.boolean(),
    hasGcpProjectId: z.boolean(),
    hasPipelineQueue: z.boolean(),
    hasSyncQueue: z.boolean(),
    hasQuickBooksOAuthConfig: z.boolean(),
    apiServiceName: z.string().nullable(),
    workerServiceName: z.string().nullable()
  }),
  actions: z.array(z.string())
});

export type BankStatementStatus = z.infer<typeof bankStatementStatusSchema>;
export type StatementReviewStatus = z.infer<typeof statementReviewStatusSchema>;
export type StatementPostingStatus = z.infer<typeof statementPostingStatusSchema>;
export type StatementCheckStatus = z.infer<typeof statementCheckStatusSchema>;
export type AccountingJobType = z.infer<typeof accountingJobTypeSchema>;
export type AccountingTaskPayload = z.infer<typeof accountingTaskPayloadSchema>;
export type RequestStatementUploadUrlInput = z.infer<typeof requestStatementUploadUrlSchema>;
export type RequestStatementUploadUrlOutput = z.infer<typeof requestStatementUploadUrlResponseSchema>;
export type CreateBankStatementInput = z.infer<typeof createBankStatementSchema>;
export type ListBankStatementsQuery = z.infer<typeof listBankStatementsQuerySchema>;
export type ReprocessBankStatementInput = z.infer<typeof reprocessBankStatementSchema>;
export type BankStatementListItem = z.infer<typeof bankStatementListItemSchema>;
export type BankStatementDetail = z.infer<typeof bankStatementDetailSchema>;
export type StatementTransaction = z.infer<typeof statementTransactionSchema>;
export type StatementCheck = z.infer<typeof statementCheckSchema>;
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;
export type QuickBooksSyncStatus = z.infer<typeof quickbooksSyncStatusSchema>;
export type QuickBooksSettings = z.infer<typeof quickBooksSettingsSchema>;
export type QuickBooksTaxBasis = z.infer<typeof quickBooksTaxBasisSchema>;
export type QuickBooksTaxReportKey = z.infer<typeof quickBooksTaxReportKeySchema>;
export type QuickBooksTaxReportRow = z.infer<typeof quickBooksTaxReportRowSchema>;
export type QuickBooksTaxReport = z.infer<typeof quickBooksTaxReportSchema>;
export type QuickBooksTaxOverview = z.infer<typeof quickBooksTaxOverviewSchema>;
export type QuickBooksTaxWindowQuery = z.infer<typeof quickBooksTaxWindowQuerySchema>;
export type QuickBooksTaxChartAccount = z.infer<typeof quickBooksTaxChartAccountSchema>;
export type QuickBooksTaxLedgerEntry = z.infer<typeof quickBooksTaxLedgerEntrySchema>;
export type QuickBooksTaxLedgerResponse = z.infer<typeof quickBooksTaxLedgerResponseSchema>;
export type QuickBooksTaxLedgerQuery = z.infer<typeof quickBooksTaxLedgerQuerySchema>;
export type QuickBooksTaxPaymentType = z.infer<typeof quickBooksTaxPaymentTypeSchema>;
export type QuickBooksTaxPayment = z.infer<typeof quickBooksTaxPaymentSchema>;
export type QuickBooksTaxPaymentsResponse = z.infer<typeof quickBooksTaxPaymentsResponseSchema>;
export type QuickBooksTaxPaymentsQuery = z.infer<typeof quickBooksTaxPaymentsQuerySchema>;
export type QuickBooksRecoverPaymentInput = z.infer<typeof quickBooksRecoverPaymentInputSchema>;
export type QuickBooksRecoverPaymentResult = z.infer<typeof quickBooksRecoverPaymentResultSchema>;
export type QuickBooksJournalAdjustmentInput = z.infer<typeof quickBooksJournalAdjustmentInputSchema>;
export type QuickBooksJournalAdjustmentResult = z.infer<
  typeof quickBooksJournalAdjustmentResultSchema
>;
export type AccountingObservabilitySummary = z.infer<
  typeof accountingObservabilitySummarySchema
>;
export type AccountingObservabilityDebug = z.infer<
  typeof accountingObservabilityDebugSchema
>;
export type RunRecord = z.infer<typeof runSchema>;
export type SseEnvelope = z.infer<typeof sseEnvelopeSchema>;
