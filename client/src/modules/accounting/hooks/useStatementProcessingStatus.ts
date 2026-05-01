import type { BankStatementStatus } from "@retailsync/shared";
import { useEffect } from "react";
import {
  isStatementInFlight,
  STATEMENT_DETAIL_POLL_MS,
} from "../utils/statementStatus";

type UseStatementProcessingStatusArgs = {
  status: BankStatementStatus | null | undefined;
  enabled: boolean;
  suspended?: boolean;
  pollMs?: number;
  onPoll: () => Promise<void> | void;
};

export const useStatementProcessingStatus = ({
  status,
  enabled,
  suspended = false,
  pollMs = STATEMENT_DETAIL_POLL_MS,
  onPoll,
}: UseStatementProcessingStatusArgs) => {
  useEffect(() => {
    if (!enabled || suspended || !status || !isStatementInFlight(status)) return;
    const interval = window.setInterval(() => {
      void onPoll();
    }, pollMs);
    return () => window.clearInterval(interval);
  }, [enabled, onPoll, pollMs, status, suspended]);
};
