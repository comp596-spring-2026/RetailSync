import type { BankStatementStatus } from "@retailsync/shared";

/** Interval for live processing updates on the statement detail workspace while status is in-flight. */
export const STATEMENT_DETAIL_POLL_MS = 3000;

export const formatStatementStatusLabel = (status: string) =>
  status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export const getStatementStatusColor = (
  status: BankStatementStatus,
): "default" | "info" | "warning" | "success" | "error" => {
  if (
    status === "extracting" ||
    status === "structuring" ||
    status === "checks_queued"
  )
    return "info";
  if (status === "ready_for_review") return "warning";
  if (status === "needs_parser_review") return "error";
  if (status === "failed") return "error";
  return "default";
};

export const isStatementInFlight = (status: BankStatementStatus) =>
  status === "uploaded" ||
  status === "extracting" ||
  status === "structuring" ||
  status === "checks_queued";

export const isStatementTerminal = (status: BankStatementStatus) =>
  status === "ready_for_review" || status === "needs_parser_review" || status === "failed";

export type StatementStageState = "done" | "current" | "pending" | "error";

export type StatementStageStep = {
  key: BankStatementStatus | "checks_processing";
  label: string;
  description: string;
  state: StatementStageState;
};

export type StatementStageProgress = {
  stepNumber: number;
  totalSteps: number;
  currentLabel: string;
  steps: StatementStageStep[];
  percent: number;
};

const BASE_STAGES: Array<{
  key: BankStatementStatus | "checks_processing";
  label: string;
  description: string;
}> = [
  { key: "uploaded", label: "Uploaded", description: "PDF saved to secure storage." },
  { key: "extracting", label: "Extracting", description: "Reading PDF text and page images." },
  { key: "structuring", label: "Structuring", description: "Parsing sections, transactions, and validation." },
  { key: "checks_queued", label: "Checks queued", description: "Check candidates queued for extraction." },
  { key: "checks_processing", label: "Checks processing", description: "Cropping check images and reading details." },
  { key: "ready_for_review", label: "Ready for review", description: "All artifacts ready. Open workspace to review." }
];

export const getStatementStageProgress = (
  status: BankStatementStatus,
  progress?: {
    totalChecks?: number;
    checksProcessing?: number;
    checksReady?: number;
    checksFailed?: number;
    completedChecks?: number;
    remainingChecks?: number;
  }
): StatementStageProgress => {
  const totalChecks = Number(progress?.totalChecks ?? 0);
  const completedChecks = Number(progress?.completedChecks ?? 0);
  const remainingChecks = Number(progress?.remainingChecks ?? Math.max(totalChecks - completedChecks, 0));
  const checksFailed = Number(progress?.checksFailed ?? 0);

  const stages = BASE_STAGES.map((stage) => ({ ...stage }));
  const totalSteps = stages.length;

  const indexOf = (key: StatementStageStep["key"]) => stages.findIndex((stage) => stage.key === key);

  if (status === "failed") {
    return {
      stepNumber: 0,
      totalSteps,
      currentLabel: "Failed",
      percent: 0,
      steps: stages.map((stage) => ({ ...stage, state: "error" as const }))
    };
  }

  if (status === "needs_parser_review") {
    const anchor = indexOf("structuring");
    return {
      stepNumber: anchor + 1,
      totalSteps,
      currentLabel: "Parser review needed",
      percent: Math.round(((anchor + 1) / totalSteps) * 100),
      steps: stages.map((stage, index) => ({
        ...stage,
        state: index < anchor ? "done" : index === anchor ? "error" : "pending"
      }))
    };
  }

  let activeIndex = indexOf("uploaded");
  if (status === "extracting") activeIndex = indexOf("extracting");
  else if (status === "structuring") activeIndex = indexOf("structuring");
  else if (status === "checks_queued") {
    if (totalChecks > 0 && completedChecks > 0 && remainingChecks > 0) {
      activeIndex = indexOf("checks_processing");
    } else if (totalChecks > 0 && remainingChecks === 0) {
      activeIndex = indexOf("checks_processing");
    } else {
      activeIndex = indexOf("checks_queued");
    }
  } else if (status === "ready_for_review") activeIndex = indexOf("ready_for_review");
  else if (status === "uploaded") activeIndex = indexOf("uploaded");

  const steps = stages.map((stage, index) => ({
    ...stage,
    state: (index < activeIndex
      ? "done"
      : index === activeIndex
        ? status === "ready_for_review"
          ? "done"
          : "current"
        : "pending") as StatementStageState
  }));

  const currentStage = stages[activeIndex];
  let currentLabel = currentStage.label;
  if (status === "checks_queued" && totalChecks > 0) {
    currentLabel = `${currentStage.label} (${completedChecks}/${totalChecks}${checksFailed > 0 ? `, ${checksFailed} failed` : ""})`;
  }

  const stepNumber = activeIndex + 1;
  const percent = status === "ready_for_review" ? 100 : Math.round(((activeIndex + 0.5) / totalSteps) * 100);

  return {
    stepNumber,
    totalSteps,
    currentLabel,
    percent,
    steps
  };
};
