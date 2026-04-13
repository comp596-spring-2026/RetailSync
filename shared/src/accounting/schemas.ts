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

export const accountingAiStatusSchema = z.object({
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

export const statementProgressSchema = z.object({
  phase: bankStatementStatusSchema.default('uploaded'),
  totalChecks: z.number().int().nonnegative().default(0),
  checksQueued: z.number().int().nonnegative().default(0),
  checksProcessing: z.number().int().nonnegative().default(0),
  checksReady: z.number().int().nonnegative().default(0),
  checksFailed: z.number().int().nonnegative().default(0),
  completedChecks: z.number().int().nonnegative().default(0),
  remainingChecks: z.number().int().nonnegative().default(0)
});

export const statementGcsSchema = z.object({
  rootPrefix: z.string().trim().min(1),
  pdfPath: z.string().trim().min(1)
});

export const statementStageTimestampsSchema = z.object({
  uploadedAt: z.string().trim().optional(),
  extractingAt: z.string().trim().optional(),
  structuringAt: z.string().trim().optional(),
  checksQueuedAt: z.string().trim().optional(),
  readyForReviewAt: z.string().trim().optional(),
  failedAt: z.string().trim().optional()
});

export const statementArtifactsSchema = z.object({
  pageImagePaths: z.array(z.string().trim()).default([]),
  ocrPath: z.string().trim().optional(),
  ocrTextPath: z.string().trim().optional(),
  transactionsTablePath: z.string().trim().optional(),
  checksClearedTablePath: z.string().trim().optional(),
  transactionSectionsPath: z.string().trim().optional(),
  extractedChecksPath: z.string().trim().optional(),
  geminiPath: z.string().trim().optional(),
  detectionEvidence: z.string().trim().optional(),
  detectedStatementMonth: statementMonthSchema.optional(),
  detectedStatementDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  autoAppliedStatementMonth: z.boolean().default(false),
  stageTimestamps: statementStageTimestampsSchema.default({})
});

export const statementCheckStageTimestampsSchema = z.object({
  queuedAt: z.string().trim().optional(),
  processingAt: z.string().trim().optional(),
  processedAt: z.string().trim().optional(),
  failedAt: z.string().trim().optional()
});

export const statementCheckArtifactsSchema = z.object({
  pageNumber: z.number().int().positive().optional(),
  cropBBox: z.array(z.number()).length(4).optional(),
  cropImagePath: z.string().trim().optional(),
  ocrTextPath: z.string().trim().optional(),
  ocrJsonPath: z.string().trim().optional(),
  structuredPath: z.string().trim().optional(),
  geminiPath: z.string().trim().optional(),
  stageTimestamps: statementCheckStageTimestampsSchema.default({})
});

export const statementCheckExtractedSchema = z.object({
  checkNumber: z.string().trim().optional(),
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payeeName: z.string().trim().optional(),
  amount: z.number().optional(),
  memo: z.string().trim().optional(),
  source: z.enum(['ocr', 'gemini', 'deterministic', 'legacy']).optional()
});

export const statementCheckProcessingSchema = z.object({
  retryCount: z.number().int().nonnegative().default(0),
  lastError: z.string().trim().optional(),
  queuedAt: z.string().trim().optional(),
  processingAt: z.string().trim().optional(),
  processedAt: z.string().trim().optional()
});

export const statementTransactionSchema = z.object({
  id: z.string().trim().min(1),
  statementId: z.string().trim().min(1),
  companyId: z.string().trim().min(1),
  statementCheckId: z.string().trim().optional(),
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
      pageImagePath: z.string().trim().optional(),
      checkCropPath: z.string().trim().optional(),
      ocrPath: z.string().trim().optional(),
      geminiPath: z.string().trim().optional()
    })
    .optional(),
  ai: accountingAiStatusSchema.optional(),
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
  artifacts: statementCheckArtifactsSchema.optional(),
  extracted: statementCheckExtractedSchema.optional(),
  processing: statementCheckProcessingSchema.default({
    retryCount: 0
  }),
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
  ai: accountingAiStatusSchema.optional(),
  proposal: proposalSchema.optional(),
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

export const detectStatementMonthResponseSchema = z.object({
  statementMonth: statementMonthSchema.nullable(),
  confidence: z.enum(['high', 'medium', 'low', 'none']),
  source: z.enum(['pdf_text', 'filename', 'unknown']),
  summary: z.string().trim().min(1),
  evidence: z.string().trim().nullable(),
  autoApply: z.boolean().default(false)
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
  artifacts: statementArtifactsSchema.optional(),
  checks: z.array(statementCheckSchema),
  issues: z.array(z.string().trim()).default([])
});

export const bankStatementStatusResponseSchema = z.object({
  statementId: z.string().trim().min(1),
  status: bankStatementStatusSchema,
  progress: statementProgressSchema,
  updatedAt: z.string().trim(),
  artifacts: statementArtifactsSchema.optional(),
  issues: z.array(z.string().trim()).default([])
});

export const statementSuggestionItemSchema = z.object({
  id: z.string().trim().min(1),
  source: z.enum(['transaction', 'check']),
  date: z.string().trim().optional(),
  description: z.string().trim().min(1),
  amount: z.number(),
  direction: z.enum(['debit', 'credit']),
  checkNumber: z.string().trim().optional(),
  payeeName: z.string().trim().optional(),
  proposedTxnType: quickbooksTxnTypeSchema.optional(),
  proposalConfidence: z.number().min(0).max(1).optional(),
  reviewStatus: statementReviewStatusSchema.optional(),
  postingStatus: statementPostingStatusSchema.optional(),
  status: z.string().trim().optional(),
  reasons: z.array(z.string().trim()).default([]),
  linkedCheckId: z.string().trim().optional()
});

export const statementSuggestionsResponseSchema = z.object({
  statementId: z.string().trim().min(1),
  summary: z.object({
    totalItems: z.number().int().nonnegative(),
    checks: z.number().int().nonnegative(),
    deposits: z.number().int().nonnegative(),
    debits: z.number().int().nonnegative(),
    credits: z.number().int().nonnegative(),
    expenses: z.number().int().nonnegative(),
    transfers: z.number().int().nonnegative(),
    checksSuggested: z.number().int().nonnegative(),
    uncategorized: z.number().int().nonnegative()
  }),
  items: z.array(statementSuggestionItemSchema)
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
      checkBackPath: z.string().trim().optional(),
      checkCropPath: z.string().trim().optional(),
      ocrPath: z.string().trim().optional(),
      geminiPath: z.string().trim().optional()
    })
    .default({}),
  confidence: confidenceBreakdownSchema.optional(),
  ai: accountingAiStatusSchema.optional(),
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

export const quickBooksHubPageSchema = coercePositiveInt(1, 10_000).optional().default(1);

export const quickBooksHubPageSizeSchema = coercePositiveInt(1, 200).optional().default(25);

export const quickBooksHubEntityTypeSchema = z.enum(['customer', 'vendor']);

export const quickBooksHubAccountSortSchema = z.enum([
  'name',
  '-name',
  'type',
  '-type',
  'status',
  '-status',
  'updatedAt',
  '-updatedAt'
]);

export const quickBooksHubEntitySortSchema = z.enum([
  'displayName',
  '-displayName',
  'status',
  '-status',
  'balance',
  '-balance',
  'updatedAt',
  '-updatedAt'
]);

export const quickBooksHubOperationSortSchema = z.enum([
  'date',
  '-date',
  'amount',
  '-amount',
  'status',
  '-status',
  'updatedAt',
  '-updatedAt'
]);

export const quickBooksHubAccountStatusSchema = z.enum(['active', 'system']);
export const quickBooksHubEntityStatusSchema = z.enum(['active', 'inactive']);
export const quickBooksHubOperationStatusSchema = statementPostingStatusSchema;

const quickBooksHubListResponseMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative()
});

export const quickBooksHubChartAccountSchema = z.object({
  id: z.string().trim().min(1),
  qbId: z.string().trim().nullable(),
  name: z.string().trim().min(1),
  type: z.string().trim().nullable(),
  detailType: z.string().trim().nullable(),
  status: quickBooksHubAccountStatusSchema,
  balance: z.number().nullable()
});

export const quickBooksHubChartOfAccountsQuerySchema = z.object({
  page: quickBooksHubPageSchema,
  pageSize: quickBooksHubPageSizeSchema,
  search: z.string().trim().optional(),
  sort: quickBooksHubAccountSortSchema.optional().default('name'),
  type: z.string().trim().optional(),
  status: quickBooksHubAccountStatusSchema.optional()
});

export const quickBooksHubChartOfAccountsResponseSchema =
  quickBooksHubListResponseMetaSchema.extend({
    items: z.array(quickBooksHubChartAccountSchema)
  });

export const quickBooksHubEntitySchema = z.object({
  id: z.string().trim().min(1),
  qbId: z.string().trim().min(1),
  entityType: quickBooksHubEntityTypeSchema,
  displayName: z.string().trim().min(1),
  email: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  status: quickBooksHubEntityStatusSchema,
  balance: z.number().nullable()
});

export const quickBooksHubEntitiesQuerySchema = z.object({
  entityType: quickBooksHubEntityTypeSchema,
  page: quickBooksHubPageSchema,
  pageSize: quickBooksHubPageSizeSchema,
  search: z.string().trim().optional(),
  sort: quickBooksHubEntitySortSchema.optional().default('displayName'),
  status: quickBooksHubEntityStatusSchema.optional()
});

export const quickBooksHubEntitiesResponseSchema = quickBooksHubListResponseMetaSchema.extend({
  items: z.array(quickBooksHubEntitySchema)
});

export const quickBooksHubOperationTypeSchema = z.enum([
  'Expense',
  'Deposit',
  'Transfer',
  'Check',
  'debit',
  'credit'
]);

export const quickBooksHubOperationSchema = z.object({
  id: z.string().trim().min(1),
  date: quickBooksTaxDateSchema,
  type: quickBooksHubOperationTypeSchema.nullable(),
  description: z.string().trim().min(1),
  payee: z.string().trim().nullable(),
  amount: z.number(),
  status: quickBooksHubOperationStatusSchema,
  qbId: z.string().trim().nullable(),
  error: z.string().trim().nullable()
});

export const quickBooksHubOperationsQuerySchema = z.object({
  page: quickBooksHubPageSchema,
  pageSize: quickBooksHubPageSizeSchema,
  search: z.string().trim().optional(),
  sort: quickBooksHubOperationSortSchema.optional().default('-date'),
  status: quickBooksHubOperationStatusSchema.optional(),
  type: quickBooksHubOperationTypeSchema.optional(),
  startDate: quickBooksTaxDateSchema.optional(),
  endDate: quickBooksTaxDateSchema.optional()
});

export const quickBooksHubOperationsResponseSchema = quickBooksHubListResponseMetaSchema.extend({
  items: z.array(quickBooksHubOperationSchema)
});

export const quickBooksLiveTransactionTypeSchema = z.enum([
  'deposit',
  'check',
  'expense',
  'transfer'
]);

export const quickBooksLiveSortSchema = z.enum([
  'date',
  '-date',
  'amount',
  '-amount'
]);

export const quickBooksAccountRegisterRowSchema = z.object({
  id: z.string().trim().min(1),
  accountId: z.string().trim().min(1),
  date: quickBooksTaxDateSchema.nullable(),
  txnType: z.string().trim().nullable(),
  qbTxnId: z.string().trim().nullable(),
  docNum: z.string().trim().nullable(),
  name: z.string().trim().nullable(),
  memo: z.string().trim().nullable(),
  splitAccount: z.string().trim().nullable(),
  amount: z.number().nullable(),
  debit: z.number().nullable(),
  credit: z.number().nullable(),
  balance: z.number().nullable()
});

export const quickBooksAccountRegisterQuerySchema = quickBooksTaxWindowQuerySchema.extend({
  page: quickBooksHubPageSchema,
  pageSize: quickBooksHubPageSizeSchema,
  search: z.string().trim().optional(),
  sort: quickBooksLiveSortSchema.optional().default('-date')
});

export const quickBooksAccountRegisterResponseSchema =
  quickBooksHubListResponseMetaSchema.extend({
    accountId: z.string().trim().min(1),
    from: quickBooksTaxDateSchema,
    to: quickBooksTaxDateSchema,
    basis: quickBooksTaxBasisSchema,
    items: z.array(quickBooksAccountRegisterRowSchema)
  });

export const quickBooksLiveTransactionListItemSchema = z.object({
  id: z.string().trim().min(1),
  qbTxnId: z.string().trim().min(1),
  type: quickBooksLiveTransactionTypeSchema,
  txnDate: quickBooksTaxDateSchema,
  docNum: z.string().trim().nullable(),
  payeeName: z.string().trim().nullable(),
  accountName: z.string().trim().nullable(),
  amount: z.number().nullable(),
  memo: z.string().trim().nullable(),
  status: z.enum(['posted', 'unknown']).default('posted')
});

export const quickBooksLiveTransactionsQuerySchema = z.object({
  page: quickBooksHubPageSchema,
  pageSize: quickBooksHubPageSizeSchema,
  search: z.string().trim().optional(),
  sort: quickBooksLiveSortSchema.optional().default('-date'),
  startDate: quickBooksTaxDateSchema.optional(),
  endDate: quickBooksTaxDateSchema.optional()
});

export const quickBooksLiveTransactionsResponseSchema =
  quickBooksHubListResponseMetaSchema.extend({
    type: quickBooksLiveTransactionTypeSchema,
    items: z.array(quickBooksLiveTransactionListItemSchema)
  });

export const quickBooksTransactionDetailQuerySchema = z.object({
  type: quickBooksLiveTransactionTypeSchema
});

export const quickBooksTransactionDetailSchema = z.object({
  id: z.string().trim().min(1),
  qbTxnId: z.string().trim().min(1),
  type: quickBooksLiveTransactionTypeSchema,
  txnDate: quickBooksTaxDateSchema.nullable(),
  docNum: z.string().trim().nullable(),
  payeeName: z.string().trim().nullable(),
  memo: z.string().trim().nullable(),
  amount: z.number().nullable(),
  accountId: z.string().trim().nullable(),
  accountName: z.string().trim().nullable(),
  categoryAccountId: z.string().trim().nullable(),
  categoryAccountName: z.string().trim().nullable(),
  fromAccountId: z.string().trim().nullable(),
  fromAccountName: z.string().trim().nullable(),
  toAccountId: z.string().trim().nullable(),
  toAccountName: z.string().trim().nullable(),
  raw: z.record(z.unknown())
});

export const quickBooksWriteTxnTypeSchema = z.enum(['sales-receipt', 'invoice', 'payment']);

export const quickBooksWriteStatusSchema = z.enum([
  'open',
  'closed',
  'paid',
  'applied',
  'unapplied',
  'unknown'
]);

export const quickBooksWriteSortSchema = z.enum([
  'date',
  '-date',
  'totalAmount',
  '-totalAmount',
  'docNumber',
  '-docNumber'
]);

export const quickBooksWriteLineSchema = z.object({
  id: z.string().trim().nullable(),
  detailType: z.string().trim().nullable(),
  description: z.string().trim().nullable(),
  amount: z.number(),
  itemId: z.string().trim().nullable(),
  itemName: z.string().trim().nullable(),
  quantity: z.number().nullable(),
  unitPrice: z.number().nullable(),
  taxCodeId: z.string().trim().nullable(),
  taxCodeName: z.string().trim().nullable(),
  serviceDate: quickBooksTaxDateSchema.nullable()
});

export const quickBooksWriteLinkedTransactionSchema = z.object({
  txnId: z.string().trim().min(1),
  txnType: z.string().trim().min(1),
  amount: z.number().nullable()
});

export const quickBooksWriteListQuerySchema = z.object({
  page: quickBooksHubPageSchema,
  pageSize: quickBooksHubPageSizeSchema,
  search: z.string().trim().optional(),
  sort: quickBooksWriteSortSchema.optional().default('-date'),
  startDate: quickBooksTaxDateSchema.optional(),
  endDate: quickBooksTaxDateSchema.optional(),
  customerId: z.string().trim().optional()
});

export const quickBooksWriteListItemSchema = z.object({
  id: z.string().trim().min(1),
  qbTxnId: z.string().trim().min(1),
  txnType: quickBooksWriteTxnTypeSchema,
  txnDate: quickBooksTaxDateSchema.nullable(),
  docNumber: z.string().trim().nullable(),
  customerId: z.string().trim().nullable(),
  customerName: z.string().trim().nullable(),
  totalAmount: z.number().nullable(),
  balanceAmount: z.number().nullable(),
  currencyCode: z.string().trim().nullable(),
  status: quickBooksWriteStatusSchema,
  emailStatus: z.string().trim().nullable(),
  memo: z.string().trim().nullable()
});

export const quickBooksWriteListResponseSchema = quickBooksHubListResponseMetaSchema.extend({
  txnType: quickBooksWriteTxnTypeSchema,
  items: z.array(quickBooksWriteListItemSchema)
});

export const quickBooksWriteDetailSchema = quickBooksWriteListItemSchema.extend({
  syncToken: z.string().trim().nullable(),
  dueDate: quickBooksTaxDateSchema.nullable(),
  customerMemo: z.string().trim().nullable(),
  customerEmail: z.string().trim().nullable(),
  depositAccountId: z.string().trim().nullable(),
  depositAccountName: z.string().trim().nullable(),
  arAccountId: z.string().trim().nullable(),
  arAccountName: z.string().trim().nullable(),
  paymentMethodId: z.string().trim().nullable(),
  paymentMethodName: z.string().trim().nullable(),
  lines: z.array(quickBooksWriteLineSchema),
  linkedTransactions: z.array(quickBooksWriteLinkedTransactionSchema),
  raw: z.record(z.unknown())
});

export const quickBooksWriteSalesLineInputSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  amount: z.number().positive(),
  itemId: z.string().trim().min(1),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  taxCodeId: z.string().trim().min(1).optional(),
  serviceDate: quickBooksTaxDateSchema.optional()
});

const quickBooksWriteCreateBaseSchema = z.object({
  customerId: z.string().trim().min(1),
  txnDate: quickBooksTaxDateSchema,
  docNumber: z.string().trim().max(100).optional(),
  memo: z.string().trim().max(1000).optional(),
  customerMemo: z.string().trim().max(1000).optional(),
  customerEmail: z.string().trim().email().optional()
});

export const quickBooksWriteSalesReceiptCreateInputSchema = quickBooksWriteCreateBaseSchema.extend(
  {
    txnType: z.literal('sales-receipt'),
    depositAccountId: z.string().trim().min(1).optional(),
    paymentMethodId: z.string().trim().min(1).optional(),
    lines: z.array(quickBooksWriteSalesLineInputSchema).min(1)
  }
);

export const quickBooksWriteInvoiceCreateInputSchema = quickBooksWriteCreateBaseSchema.extend({
  txnType: z.literal('invoice'),
  dueDate: quickBooksTaxDateSchema.optional(),
  arAccountId: z.string().trim().min(1).optional(),
  lines: z.array(quickBooksWriteSalesLineInputSchema).min(1)
});

export const quickBooksWritePaymentLinkInputSchema = z.object({
  txnId: z.string().trim().min(1),
  txnType: z.enum(['Invoice', 'CreditMemo']),
  amount: z.number().positive()
});

export const quickBooksWritePaymentCreateInputSchema = quickBooksWriteCreateBaseSchema.extend({
  txnType: z.literal('payment'),
  totalAmount: z.number().positive(),
  depositAccountId: z.string().trim().min(1).optional(),
  paymentMethodId: z.string().trim().min(1).optional(),
  linkedTransactions: z.array(quickBooksWritePaymentLinkInputSchema).default([])
});

export const quickBooksWriteCreateInputSchema = z.discriminatedUnion('txnType', [
  quickBooksWriteSalesReceiptCreateInputSchema,
  quickBooksWriteInvoiceCreateInputSchema,
  quickBooksWritePaymentCreateInputSchema
]);

const quickBooksWriteUpdateBaseSchema = z.object({
  syncToken: z.string().trim().min(1),
  txnDate: quickBooksTaxDateSchema.optional(),
  docNumber: z.string().trim().max(100).optional(),
  memo: z.string().trim().max(1000).optional(),
  customerMemo: z.string().trim().max(1000).optional(),
  customerEmail: z.string().trim().email().optional()
});

export const quickBooksWriteSalesReceiptUpdateInputSchema = quickBooksWriteUpdateBaseSchema.extend(
  {
    txnType: z.literal('sales-receipt'),
    customerId: z.string().trim().min(1).optional(),
    depositAccountId: z.string().trim().min(1).optional(),
    paymentMethodId: z.string().trim().min(1).optional(),
    lines: z.array(quickBooksWriteSalesLineInputSchema).min(1).optional()
  }
);

export const quickBooksWriteInvoiceUpdateInputSchema = quickBooksWriteUpdateBaseSchema.extend({
  txnType: z.literal('invoice'),
  customerId: z.string().trim().min(1).optional(),
  dueDate: quickBooksTaxDateSchema.optional(),
  arAccountId: z.string().trim().min(1).optional(),
  lines: z.array(quickBooksWriteSalesLineInputSchema).min(1).optional()
});

export const quickBooksWritePaymentUpdateInputSchema = quickBooksWriteUpdateBaseSchema.extend({
  txnType: z.literal('payment'),
  customerId: z.string().trim().min(1).optional(),
  totalAmount: z.number().positive().optional(),
  depositAccountId: z.string().trim().min(1).optional(),
  paymentMethodId: z.string().trim().min(1).optional(),
  linkedTransactions: z.array(quickBooksWritePaymentLinkInputSchema).optional()
});

export const quickBooksWriteUpdateInputSchema = z.discriminatedUnion('txnType', [
  quickBooksWriteSalesReceiptUpdateInputSchema,
  quickBooksWriteInvoiceUpdateInputSchema,
  quickBooksWritePaymentUpdateInputSchema
]);

export const quickBooksWriteDeleteInputSchema = z.object({
  txnType: quickBooksWriteTxnTypeSchema,
  syncToken: z.string().trim().min(1)
});

export const quickBooksWriteDeleteResultSchema = z.object({
  txnType: quickBooksWriteTxnTypeSchema,
  qbTxnId: z.string().trim().min(1),
  deleted: z.literal(true)
});

export type QuickBooksHubChartAccount = z.infer<typeof quickBooksHubChartAccountSchema>;
export type QuickBooksHubChartOfAccountsQuery = z.infer<
  typeof quickBooksHubChartOfAccountsQuerySchema
>;
export type QuickBooksHubChartOfAccountsResponse = z.infer<
  typeof quickBooksHubChartOfAccountsResponseSchema
>;
export type QuickBooksHubEntity = z.infer<typeof quickBooksHubEntitySchema>;
export type QuickBooksHubEntitiesQuery = z.infer<typeof quickBooksHubEntitiesQuerySchema>;
export type QuickBooksHubEntitiesResponse = z.infer<typeof quickBooksHubEntitiesResponseSchema>;
export type QuickBooksHubOperation = z.infer<typeof quickBooksHubOperationSchema>;
export type QuickBooksHubOperationsQuery = z.infer<
  typeof quickBooksHubOperationsQuerySchema
>;
export type QuickBooksHubOperationsResponse = z.infer<
  typeof quickBooksHubOperationsResponseSchema
>;

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
    taskLogsUrl: z.string().nullable(),
    failedTaskLogsUrl: z.string().nullable(),
    quickbooksSyncUrl: z.string().nullable()
  })
});

export const accountingObservabilityDebugSchema = z.object({
  generatedAt: z.string().trim(),
  envReadiness: z.object({
    tasksMode: z.enum(['inline', 'cloud']),
    hasGcsBucketName: z.boolean(),
    hasServiceSecret: z.boolean(),
    hasInternalTasksEndpoint: z.boolean(),
    hasGcpProjectId: z.boolean(),
    hasPipelineQueue: z.boolean(),
    hasSyncQueue: z.boolean(),
    hasQuickBooksOAuthConfig: z.boolean(),
    apiServiceName: z.string().nullable()
  }),
  actions: z.array(z.string())
});

export type BankStatementStatus = z.infer<typeof bankStatementStatusSchema>;
export type StatementReviewStatus = z.infer<typeof statementReviewStatusSchema>;
export type StatementPostingStatus = z.infer<typeof statementPostingStatusSchema>;
export type StatementCheckStatus = z.infer<typeof statementCheckStatusSchema>;
export type StatementArtifacts = z.infer<typeof statementArtifactsSchema>;
export type StatementCheckArtifacts = z.infer<typeof statementCheckArtifactsSchema>;
export type StatementCheckExtracted = z.infer<typeof statementCheckExtractedSchema>;
export type StatementCheckProcessing = z.infer<typeof statementCheckProcessingSchema>;
export type AccountingJobType = z.infer<typeof accountingJobTypeSchema>;
export type AccountingTaskPayload = z.infer<typeof accountingTaskPayloadSchema>;
export type RequestStatementUploadUrlInput = z.infer<typeof requestStatementUploadUrlSchema>;
export type RequestStatementUploadUrlOutput = z.infer<typeof requestStatementUploadUrlResponseSchema>;
export type DetectStatementMonthResponse = z.infer<typeof detectStatementMonthResponseSchema>;
export type CreateBankStatementInput = z.infer<typeof createBankStatementSchema>;
export type ListBankStatementsQuery = z.infer<typeof listBankStatementsQuerySchema>;
export type ReprocessBankStatementInput = z.infer<typeof reprocessBankStatementSchema>;
export type BankStatementListItem = z.infer<typeof bankStatementListItemSchema>;
export type BankStatementDetail = z.infer<typeof bankStatementDetailSchema>;
export type StatementSuggestionItem = z.infer<typeof statementSuggestionItemSchema>;
export type StatementSuggestionsResponse = z.infer<typeof statementSuggestionsResponseSchema>;
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
export type QuickBooksLiveTransactionType = z.infer<typeof quickBooksLiveTransactionTypeSchema>;
export type QuickBooksAccountRegisterRow = z.infer<typeof quickBooksAccountRegisterRowSchema>;
export type QuickBooksAccountRegisterQuery = z.infer<typeof quickBooksAccountRegisterQuerySchema>;
export type QuickBooksAccountRegisterResponse = z.infer<
  typeof quickBooksAccountRegisterResponseSchema
>;
export type QuickBooksLiveTransactionListItem = z.infer<
  typeof quickBooksLiveTransactionListItemSchema
>;
export type QuickBooksLiveTransactionsQuery = z.infer<
  typeof quickBooksLiveTransactionsQuerySchema
>;
export type QuickBooksLiveTransactionsResponse = z.infer<
  typeof quickBooksLiveTransactionsResponseSchema
>;
export type QuickBooksTransactionDetailQuery = z.infer<
  typeof quickBooksTransactionDetailQuerySchema
>;
export type QuickBooksTransactionDetail = z.infer<typeof quickBooksTransactionDetailSchema>;
export type QuickBooksWriteTxnType = z.infer<typeof quickBooksWriteTxnTypeSchema>;
export type QuickBooksWriteStatus = z.infer<typeof quickBooksWriteStatusSchema>;
export type QuickBooksWriteSort = z.infer<typeof quickBooksWriteSortSchema>;
export type QuickBooksWriteLine = z.infer<typeof quickBooksWriteLineSchema>;
export type QuickBooksWriteLinkedTransaction = z.infer<
  typeof quickBooksWriteLinkedTransactionSchema
>;
export type QuickBooksWriteListQuery = z.infer<typeof quickBooksWriteListQuerySchema>;
export type QuickBooksWriteListItem = z.infer<typeof quickBooksWriteListItemSchema>;
export type QuickBooksWriteListResponse = z.infer<typeof quickBooksWriteListResponseSchema>;
export type QuickBooksWriteDetail = z.infer<typeof quickBooksWriteDetailSchema>;
export type QuickBooksWriteSalesLineInput = z.infer<typeof quickBooksWriteSalesLineInputSchema>;
export type QuickBooksWriteSalesReceiptCreateInput = z.infer<
  typeof quickBooksWriteSalesReceiptCreateInputSchema
>;
export type QuickBooksWriteInvoiceCreateInput = z.infer<
  typeof quickBooksWriteInvoiceCreateInputSchema
>;
export type QuickBooksWritePaymentLinkInput = z.infer<
  typeof quickBooksWritePaymentLinkInputSchema
>;
export type QuickBooksWritePaymentCreateInput = z.infer<
  typeof quickBooksWritePaymentCreateInputSchema
>;
export type QuickBooksWriteCreateInput = z.infer<typeof quickBooksWriteCreateInputSchema>;
export type QuickBooksWriteSalesReceiptUpdateInput = z.infer<
  typeof quickBooksWriteSalesReceiptUpdateInputSchema
>;
export type QuickBooksWriteInvoiceUpdateInput = z.infer<
  typeof quickBooksWriteInvoiceUpdateInputSchema
>;
export type QuickBooksWritePaymentUpdateInput = z.infer<
  typeof quickBooksWritePaymentUpdateInputSchema
>;
export type QuickBooksWriteUpdateInput = z.infer<typeof quickBooksWriteUpdateInputSchema>;
export type QuickBooksWriteDeleteInput = z.infer<typeof quickBooksWriteDeleteInputSchema>;
export type QuickBooksWriteDeleteResult = z.infer<typeof quickBooksWriteDeleteResultSchema>;
export type AccountingObservabilitySummary = z.infer<
  typeof accountingObservabilitySummarySchema
>;
export type AccountingObservabilityDebug = z.infer<
  typeof accountingObservabilityDebugSchema
>;
export type RunRecord = z.infer<typeof runSchema>;
export type SseEnvelope = z.infer<typeof sseEnvelopeSchema>;
