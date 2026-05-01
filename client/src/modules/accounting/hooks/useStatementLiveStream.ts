import type { BankStatementStatus, StatementCheck } from '@retailsync/shared';
import { useEffect, useRef } from 'react';
import { store } from '../../../app/store';
import { accountingApi } from '../api';

type StatementProgressEvent = {
  statementId: string;
  status: BankStatementStatus;
  progress: {
    phase: BankStatementStatus;
    totalChecks: number;
    checksQueued: number;
    checksProcessing: number;
    checksReady: number;
    checksFailed: number;
    completedChecks: number;
    remainingChecks: number;
  };
  liveMetrics?: {
    entryCount: number;
    debitCount: number;
    creditCount: number;
    startingBalance: number | null;
    endingBalance: number | null;
  };
  artifacts?: Record<string, unknown>;
  updatedAt: string;
  issues: string[];
};

type UseStatementLiveStreamArgs = {
  statementId: string | null | undefined;
  enabled: boolean;
  onProgressEvent?: (event: StatementProgressEvent) => void;
  onCheckEvent?: (check: StatementCheck) => void;
  onLiveEvent?: () => void;
  onConnectionChange?: (connected: boolean) => void;
};

const parseEventData = <T>(value: MessageEvent<string>): T | null => {
  try {
    return JSON.parse(value.data) as T;
  } catch {
    return null;
  }
};

const shouldLogSse = import.meta.env.DEV;

export const useStatementLiveStream = ({
  statementId,
  enabled,
  onProgressEvent,
  onCheckEvent,
  onLiveEvent,
  onConnectionChange
}: UseStatementLiveStreamArgs) => {
  const onProgressEventRef = useRef(onProgressEvent);
  const onCheckEventRef = useRef(onCheckEvent);
  const onLiveEventRef = useRef(onLiveEvent);
  const onConnectionChangeRef = useRef(onConnectionChange);

  useEffect(() => {
    onProgressEventRef.current = onProgressEvent;
    onCheckEventRef.current = onCheckEvent;
    onLiveEventRef.current = onLiveEvent;
    onConnectionChangeRef.current = onConnectionChange;
  }, [onCheckEvent, onConnectionChange, onLiveEvent, onProgressEvent]);

  useEffect(() => {
    if (!enabled || !statementId || typeof window === 'undefined' || typeof window.EventSource === 'undefined') {
      return;
    }

    const accessToken = store.getState().auth.accessToken;
    const stream = new EventSource(accountingApi.getStatementStreamUrl(statementId, accessToken), {
      withCredentials: true
    });

    const handleProgress = (event: MessageEvent<string>) => {
      const parsed = parseEventData<StatementProgressEvent>(event);
      if (!parsed) return;
      if (shouldLogSse) {
        // eslint-disable-next-line no-console
        console.info('[accounting.sse] progressUpdated', {
          statementId: parsed.statementId,
          status: parsed.status,
          checks: parsed.progress
        });
      }
      onProgressEventRef.current?.(parsed);
      onLiveEventRef.current?.();
    };

    const handleCheck = (event: MessageEvent<string>) => {
      const parsed = parseEventData<StatementCheck>(event);
      if (!parsed) return;
      if (shouldLogSse) {
        // eslint-disable-next-line no-console
        console.info('[accounting.sse] checkUpdated', {
          id: parsed.id,
          status: parsed.status,
          checkNumber: parsed.extracted?.checkNumber ?? parsed.autoFill?.checkNumber ?? null
        });
      }
      onCheckEventRef.current?.(parsed);
      onLiveEventRef.current?.();
    };

    const handleGenericLiveEvent = () => {
      if (shouldLogSse) {
        // eslint-disable-next-line no-console
        console.info('[accounting.sse] run/ledger event');
      }
      onLiveEventRef.current?.();
    };

    stream.onopen = () => {
      onConnectionChangeRef.current?.(true);
      if (shouldLogSse) {
        // eslint-disable-next-line no-console
        console.info('[accounting.sse] connected', { statementId });
      }
    };
    stream.onerror = () => {
      onConnectionChangeRef.current?.(false);
      if (shouldLogSse) {
        // eslint-disable-next-line no-console
        console.warn('[accounting.sse] error/reconnect', { statementId });
      }
    };

    stream.addEventListener('progressUpdated', handleProgress as EventListener);
    stream.addEventListener('checkUpdated', handleCheck as EventListener);
    stream.addEventListener('runUpdated', handleGenericLiveEvent as EventListener);
    stream.addEventListener('ledgerEntryUpdated', handleGenericLiveEvent as EventListener);

    return () => {
      stream.removeEventListener('progressUpdated', handleProgress as EventListener);
      stream.removeEventListener('checkUpdated', handleCheck as EventListener);
      stream.removeEventListener('runUpdated', handleGenericLiveEvent as EventListener);
      stream.removeEventListener('ledgerEntryUpdated', handleGenericLiveEvent as EventListener);
      stream.close();
      onConnectionChangeRef.current?.(false);
    };
  }, [enabled, statementId]);
};
