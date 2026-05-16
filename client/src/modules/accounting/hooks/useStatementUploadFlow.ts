import type { BankStatementStatus, DetectStatementMonthResponse } from '@retailsync/shared';
import { useMemo } from 'react';
import type { StatementTimelineStep } from '../components/StatementStageTimeline';

const stripStepTitle = (title: string) => title.replace(/^\d+\s*[·.]\s*/, '').trim();

export type UploadFlowCurrentStep = { index: number; total: number; label: string };

/** Single “current” step: active, else failed, else first waiting, else last done. */
export const resolveUploadFlowCurrentStep = (steps: StatementTimelineStep[]): UploadFlowCurrentStep => {
  const total = steps.length;
  const activeIdx = steps.findIndex((s) => s.state === 'active');
  if (activeIdx >= 0) {
    return { index: activeIdx + 1, total, label: stripStepTitle(steps[activeIdx].title) };
  }
  const failedIdx = steps.findIndex((s) => s.state === 'failed');
  if (failedIdx >= 0) {
    return { index: failedIdx + 1, total, label: stripStepTitle(steps[failedIdx].title) };
  }
  const waitingIdx = steps.findIndex((s) => s.state === 'waiting');
  if (waitingIdx >= 0) {
    return { index: waitingIdx + 1, total, label: stripStepTitle(steps[waitingIdx].title) };
  }
  return { index: total, total, label: stripStepTitle(steps[total - 1].title) };
};

type Args = {
  fileSelected: boolean;
  detectingStatementMonth: boolean;
  statementMonth: string;
  uploading: boolean;
  finalizing: boolean;
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
    title: '1 · PDF',
    detail: 'Drop a file or browse.'
  },
  {
    key: 'month',
    title: '2 · Month',
    detail: 'We read the period from the PDF; change the field if it is wrong.'
  },
  {
    key: 'uploadSave',
    title: '3 · Upload',
    detail: 'The file is stored securely and your statement record is created.'
  },
  {
    key: 'background',
    title: '4 · Processing',
    detail: 'Extraction and checks keep running after you close this dialog.'
  }
] as const;

export const useStatementUploadFlow = ({
  fileSelected,
  detectingStatementMonth,
  statementMonth,
  uploading,
  finalizing,
  activeStatementId,
  processingStatement,
  processingTimedOut,
  processingStatus,
  submitError,
  detection
}: Args) => {
  const steps = useMemo<StatementTimelineStep[]>(() => {
    const states: Record<(typeof uploadWorkflowSteps)[number]['key'], StatementTimelineStep['state']> = {
      pick: fileSelected ? 'done' : 'active',
      month: fileSelected
        ? detectingStatementMonth
          ? 'active'
          : statementMonth
            ? 'done'
            : 'waiting'
        : 'waiting',
      uploadSave:
        uploading || finalizing ? 'active' : activeStatementId ? 'done' : 'waiting',
      background: !activeStatementId
        ? 'waiting'
        : processingStatement || processingTimedOut
          ? 'active'
          : processingStatus === 'failed'
            ? 'failed'
            : processingStatus === 'ready_for_review'
              ? 'done'
              : processingStatus &&
                  ['uploaded', 'extracting', 'structuring', 'checks_queued'].includes(processingStatus)
                ? 'active'
                : 'waiting'
    };

    if (submitError && !activeStatementId) {
      states.uploadSave = 'failed';
    }
    if (submitError && activeStatementId && !processingTimedOut && !processingStatement) {
      states.background = 'failed';
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
    processingStatement,
    processingStatus,
    processingTimedOut,
    statementMonth,
    submitError,
    uploading
  ]);

  const currentStep = useMemo(() => resolveUploadFlowCurrentStep(steps), [steps]);

  return { steps, currentStep };
};
