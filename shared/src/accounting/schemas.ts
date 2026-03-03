import { z } from 'zod';

export const statementMonthSchema = z.string().trim().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const bankStatementSourceSchema = z.enum(['upload', 'manual', 'email']);

export const bankStatementStatusSchema = z.enum([
  'uploaded',
  'processing',
  'needs_review',
  'confirmed',
  'locked',
  'failed'
]);

export const bankStatementProcessingStageSchema = z.enum([
  'queued',
  'pages_ready',
  'ocr_ready',
  'checks_ready',
  'structured_ready',
  'confirmed',
  'locked',
  'failed'
]);

export const transactionLineItemSchema = z.object({
  id: z.string().trim().min(1),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1),
  amount: z.number(),
  type: z.enum(['debit', 'credit']),
  suggestedCategory: z.string().trim().optional(),
  confidence: z.number().min(0).max(1).optional(),
  linkedCheckId: z.string().trim().optional()
});

export const checkImageReferenceSchema = z.object({
  checkId: z.string().trim().min(1),
  pageNo: z.number().int().nonnegative(),
  bbox: z.array(z.number()).length(4),
  gcsPath: z.string().trim().min(1),
  linkedTransactionId: z.string().trim().optional()
});

export const statementExtractionSchemaV1 = z.object({
  schemaVersion: z.literal('v1'),
  bankName: z.string().trim().optional(),
  accountNumberLast4: z.string().trim().optional(),
  statementPeriod: z
    .object({
      from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/)
    })
    .optional(),
  summary: z
    .object({
      openingBalance: z.number().optional(),
      closingBalance: z.number().optional(),
      totalCredits: z.number().optional(),
      totalDebits: z.number().optional()
    })
    .optional(),
  transactions: z.array(transactionLineItemSchema)
});

export const accountingJobTypeSchema = z.enum([
  'render_pages',
  'ocr_statement',
  'detect_checks',
  'gemini_structure',
  'qb_pull_accounts',
  'qb_push_entries'
]);

export const accountingTaskPayloadSchema = z.object({
  companyId: z.string().trim().min(1),
  jobType: accountingJobTypeSchema,
  statementId: z.string().trim().min(1),
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
  expiresAt: z.string().trim()
});

export const createBankStatementSchema = z.object({
  statementId: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  statementMonth: statementMonthSchema,
  gcsPath: z.string().trim().min(1),
  source: bankStatementSourceSchema.optional().default('upload')
});

export const listBankStatementsQuerySchema = z.object({
  month: statementMonthSchema.optional(),
  status: bankStatementStatusSchema.optional(),
  search: z.string().trim().optional()
});

export const reprocessBankStatementSchema = z.object({
  fromJobType: accountingJobTypeSchema.optional().default('render_pages')
});

export const updateStatementTransactionsSchema = z.object({
  transactions: z.array(
    z.object({
      id: z.string().trim().min(1),
      suggestedCategory: z.string().trim().min(1)
    })
  )
});

export const bankStatementListItemSchema = z.object({
  id: z.string().trim().min(1),
  statementMonth: statementMonthSchema,
  fileName: z.string().trim().min(1),
  source: bankStatementSourceSchema,
  status: bankStatementStatusSchema,
  processingStage: bankStatementProcessingStageSchema.optional(),
  pageCount: z.number().int().nonnegative(),
  checkCount: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  issuesCount: z.number().int().nonnegative(),
  updatedAt: z.string().trim(),
  createdAt: z.string().trim()
});

export const bankStatementDetailSchema = bankStatementListItemSchema.extend({
  pdfPath: z.string().trim().min(1),
  pages: z.array(
    z.object({
      pageNo: z.number().int().nonnegative(),
      gcsPath: z.string().trim().min(1),
      width: z.number().nonnegative().optional(),
      height: z.number().nonnegative().optional()
    })
  ),
  checks: z.array(checkImageReferenceSchema),
  extraction: z
    .object({
      rawOcrText: z.string().optional(),
      structuredJson: statementExtractionSchemaV1.optional(),
      issues: z.array(z.string()),
      confidence: z.number().min(0).max(1).optional()
    })
    .optional()
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

export const accountingObservabilitySummarySchema = z.object({
  generatedAt: z.string().trim(),
  counts: z.object({
    totalStatements: z.number().int().nonnegative(),
    processingStatements: z.number().int().nonnegative(),
    needsReviewStatements: z.number().int().nonnegative(),
    failedStatements: z.number().int().nonnegative(),
    confirmedStatements: z.number().int().nonnegative(),
    lockedStatements: z.number().int().nonnegative()
  }),
  recentStatements: z.array(
    z.object({
      id: z.string().trim().min(1),
      statementMonth: statementMonthSchema,
      fileName: z.string().trim().min(1),
      status: bankStatementStatusSchema,
      processingStage: bankStatementProcessingStageSchema.optional(),
      issuesCount: z.number().int().nonnegative(),
      updatedAt: z.string().trim(),
      isStaleProcessing: z.boolean(),
      lastJob: z
        .object({
          jobType: z.string().trim(),
          status: z.string().trim(),
          endedAt: z.string().nullable(),
          error: z.string().nullable()
        })
        .nullable()
    })
  ),
  failedJobs: z.array(
    z.object({
      statementId: z.string().trim().min(1),
      fileName: z.string().trim().min(1),
      statementMonth: statementMonthSchema,
      jobType: z.string().trim(),
      taskId: z.string().trim(),
      attempt: z.number().int().min(1),
      error: z.string().trim().min(1),
      endedAt: z.string().nullable()
    })
  ),
  quickbooks: quickBooksSettingsSchema
    .omit({ updatedAt: true })
    .nullable(),
  gcpLinks: z.object({
    apiLogsUrl: z.string().nullable(),
    workerLogsUrl: z.string().nullable(),
    failedAccountingTasksUrl: z.string().nullable(),
    quickbooksSyncUrl: z.string().nullable()
  })
});

const accountingObservabilityStatementDebugFoundSchema = z.object({
  found: z.literal(true),
  id: z.string().trim().min(1),
  fileName: z.string().trim().min(1),
  statementMonth: statementMonthSchema,
  status: bankStatementStatusSchema,
  processingStage: z.string().trim(),
  updatedAt: z.string().trim(),
  isStaleProcessing: z.boolean(),
  issues: z.array(z.string()),
  pageCount: z.number().int().nonnegative(),
  checkCount: z.number().int().nonnegative(),
  recentJobRuns: z.array(
    z.object({
      taskId: z.string().trim(),
      jobType: z.string().trim(),
      status: z.string().trim(),
      attempt: z.number().int().min(1),
      startedAt: z.string().nullable(),
      endedAt: z.string().nullable(),
      error: z.string().nullable()
    })
  )
});

const accountingObservabilityStatementDebugMissingSchema = z.object({
  found: z.literal(false),
  id: z.string().trim().min(1),
  invalidId: z.boolean().optional()
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
  statementDebug: z
    .union([
      accountingObservabilityStatementDebugFoundSchema,
      accountingObservabilityStatementDebugMissingSchema
    ])
    .nullable(),
  quickbooksDebug: z.object({
    connected: z.boolean(),
    environment: z.enum(['sandbox', 'production']).optional(),
    realmId: z.string().nullable().optional(),
    companyName: z.string().nullable().optional(),
    lastPullStatus: quickbooksSyncStatusSchema.optional(),
    lastPullError: z.string().nullable().optional(),
    lastPushStatus: quickbooksSyncStatusSchema.optional(),
    lastPushError: z.string().nullable().optional(),
    mappedAccountsCount: z.number().int().nonnegative(),
    postedUnsyncedCount: z.number().int().nonnegative(),
    postedSyncErrorCount: z.number().int().nonnegative(),
    topSyncErrors: z.array(
      z.object({
        entryId: z.string().trim().min(1),
        date: z.string().trim(),
        memo: z.string().trim(),
        error: z.string().nullable(),
        updatedAt: z.string().nullable()
      })
    )
  }),
  actions: z.array(z.string())
});

export type BankStatementStatus = z.infer<typeof bankStatementStatusSchema>;
export type BankStatementProcessingStage = z.infer<typeof bankStatementProcessingStageSchema>;
export type AccountingJobType = z.infer<typeof accountingJobTypeSchema>;
export type AccountingTaskPayload = z.infer<typeof accountingTaskPayloadSchema>;
export type RequestStatementUploadUrlInput = z.infer<typeof requestStatementUploadUrlSchema>;
export type RequestStatementUploadUrlOutput = z.infer<typeof requestStatementUploadUrlResponseSchema>;
export type CreateBankStatementInput = z.infer<typeof createBankStatementSchema>;
export type ListBankStatementsQuery = z.infer<typeof listBankStatementsQuerySchema>;
export type ReprocessBankStatementInput = z.infer<typeof reprocessBankStatementSchema>;
export type UpdateStatementTransactionsInput = z.infer<typeof updateStatementTransactionsSchema>;
export type BankStatementListItem = z.infer<typeof bankStatementListItemSchema>;
export type BankStatementDetail = z.infer<typeof bankStatementDetailSchema>;
export type QuickBooksSyncStatus = z.infer<typeof quickbooksSyncStatusSchema>;
export type QuickBooksSettings = z.infer<typeof quickBooksSettingsSchema>;
export type AccountingObservabilitySummary = z.infer<
  typeof accountingObservabilitySummarySchema
>;
export type AccountingObservabilityDebug = z.infer<
  typeof accountingObservabilityDebugSchema
>;
