import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../../app/store';

export const selectPosState = (state: RootState) => state.pos;

export const selectPosView = createSelector(selectPosState, (pos) => pos.view);
export const selectPosDateRange = createSelector(selectPosState, (pos) => pos.dateRange);
export const selectPosRecords = createSelector(selectPosState, (pos) => pos.records);
export const selectPosKpis = createSelector(selectPosState, (pos) => pos.kpis);
export const selectPosChartsData = createSelector(selectPosState, (pos) => pos.chartsData);
export const selectPosLoading = createSelector(selectPosState, (pos) => pos.loading);
export const selectPosError = createSelector(selectPosState, (pos) => pos.error);
export const selectPosLastSyncStatus = createSelector(selectPosState, (pos) => pos.lastSyncAt);

