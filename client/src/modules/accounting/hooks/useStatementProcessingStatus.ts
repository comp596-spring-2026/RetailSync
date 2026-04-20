import type { BankStatementStatus } from '@retailsync/shared';
import { useEffect } from 'react';
import { isStatementInFlight } from '../utils/statementStatus';

type UseStatementProcessingStatusArgs = {
  status: BankStatementStatus | null | undefined;
  enabled: boolean;
  pollMs?: number;
  onPoll: () => Promise<void> | void;
};

export const useStatementProcessingStatus = ({
  status,
  enabled,
  pollMs = 3000,
  onPoll
}: UseStatementProcessingStatusArgs) => {
  useEffect(() => {
    if (!enabled || !status || !isStatementInFlight(status)) return;
    const interval = window.setInterval(() => {
      void onPoll();
    }, pollMs);
    return () => window.clearInterval(interval);
  }, [enabled, onPoll, pollMs, status]);
};
