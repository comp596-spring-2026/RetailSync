import type { BankStatementStatus, DetectStatementMonthResponse } from '@retailsync/shared';
import { useMemo } from 'react';
import type { StatementTimelineStep } from '../components/StatementStageTimeline';

type Args = {
  fileSelected: boolean;
  detectingStatementMonth: boolean;
  statementMonth: string;
  uploading: boolean;
  finalizing: boolean;
  preparedUpload: boolean;
  activeStatementId: boolean;
  processingStatement: boolean;
  processingTimedOut: boolean;
  processingStatus: BankStatementStatus | null;
  submitError: string | null;
  detection: DetectStatementMonthResponse | null;
};

const uploadWorkflowSteps = [
  {
    key: 'pick',
    title: '1. Select PDF',
    detail: 'Choose the statement you want to process.'
  },
  {
    key: 'month',
    title: '2. Confirm statement month',
    detail: 'RetailSync detects the month and you can correct it before saving.'
  },
  {
    key: 'storage',
    title: '3. Upload to secure storage',
    detail: 'The PDF is stored in the accounting bucket before the workflow continues.'
  },
  {
    key: 'record',
    title: '4. Save statement record',
    detail: 'A MongoDB record is created so the statement can be resumed or retried safely.'
  },
  {
    key: 'jobs',
    title: '5. Run background jobs',
    detail: 'Extraction, structuring, and check-related work continue after upload.'
  },
  {
    key: 'review',
    title: '6. Review outputs',
    detail: 'Open the statement workspace to inspect the PDF, OCR, transactions, and checks.'
  }
] as const;

export const useStatementUploadFlow = ({
  fileSelected,
  detectingStatementMonth,
  statementMonth,
  uploading,
  finalizing,
  preparedUpload,
  activeStatementId,
  processingStatement,
  processingTimedOut,
  processingStatus,
  submitError,
  detection
}: Args) =>
  useMemo<StatementTimelineStep[]>(() => {
    const states: Record<(typeof uploadWorkflowSteps)[number]['key'], StatementTimelineStep['state']> = {
      pick: fileSelected ? 'done' : 'active',
      month: fileSelected
        ? detectingStatementMonth
          ? 'active'
          : statementMonth
            ? 'done'
            : 'waiting'
        : 'waiting',
      storage: uploading ? 'active' : preparedUpload ? 'done' : fileSelected ? 'waiting' : 'waiting',
      record: finalizing ? 'active' : activeStatementId ? 'done' : preparedUpload ? 'waiting' : 'waiting',
      jobs:
        processingStatement || processingTimedOut
          ? 'active'
          : processingStatus === 'failed'
            ? 'failed'
            : processingStatus && processingStatus !== 'uploaded'
              ? 'done'
              : activeStatementId
                ? 'waiting'
                : 'waiting',
      review: processingStatus === 'ready_for_review' ? 'done' : processingStatus === 'failed' ? 'failed' : 'waiting'
    };

    if (submitError && !processingTimedOut && !processingStatement && activeStatementId) {
      states.record = 'failed';
      states.jobs = 'waiting';
    }

    if (detection && !detection.statementMonth) {
      states.month = 'active';
    }

    return uploadWorkflowSteps.map((step) => ({ ...step, state: states[step.key] }));
  }, [
    activeStatementId,
    detection,
    detectingStatementMonth,
    fileSelected,
    finalizing,
    preparedUpload,
    processingStatement,
    processingStatus,
    processingTimedOut,
    statementMonth,
    submitError,
    uploading
  ]);
