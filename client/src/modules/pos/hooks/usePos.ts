import { useMemo } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import {
  acknowledgeAlert,
  exportCsv,
  fetchDaily,
  fetchOverview,
  importCsv,
  selectPosState,
  setDateRange,
  setIconOnly,
  setLimit,
  setPage,
  setView,
  syncGoogleSheet,
  type PosDateRange
} from '../state';

export const usePos = () => {
  const dispatch = useAppDispatch();
  const state = useAppSelector(selectPosState);

  const actions = useMemo(
    () => ({
      fetchDaily: (args?: { start?: string; end?: string; page?: number; limit?: number }) => dispatch(fetchDaily(args)),
      fetchOverview: (args?: { start?: string; end?: string }) => dispatch(fetchOverview(args)),
      exportCsv: (args?: { start?: string; end?: string }) => dispatch(exportCsv(args)),
      importCsv: (file: File) => dispatch(importCsv(file)),
      syncGoogleSheet: () => dispatch(syncGoogleSheet()),
      acknowledgeAlert: (alertId: string) => dispatch(acknowledgeAlert(alertId)),
      setView: (view: 'table' | 'dashboard') => dispatch(setView(view)),
      setIconOnly: (iconOnly: boolean) => dispatch(setIconOnly(iconOnly)),
      setDateRange: (dateRange: PosDateRange) => dispatch(setDateRange(dateRange)),
      setPage: (page: number) => dispatch(setPage(page)),
      setLimit: (limit: number) => dispatch(setLimit(limit))
    }),
    [dispatch]
  );

  return { state, actions };
};
