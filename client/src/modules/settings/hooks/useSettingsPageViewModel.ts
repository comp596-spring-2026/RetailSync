import { useCallback, useEffect, useState } from 'react';
import { AxiosError } from 'axios';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import {
  commitGoogleSheetsImportThunk,
  configureSharedSheetThunk,
  connectQuickbooksThunk,
  deleteGoogleSheetsSourceThunk,
  disconnectQuickbooksThunk,
  fetchGoogleSheetsSyncOverview,
  fetchOAuthStatus,
  fetchQuickbooksOAuthStatus,
  fetchSettings,
  postApprovedQuickbooksThunk,
  refreshQuickbooksReferencesThunk,
  saveGoogleSheetsSyncScheduleThunk,
  selectGoogleSheetsSyncOverview,
  selectGoogleSheetsSyncProgress,
  selectOAuthStatus,
  selectQuickbooksOAuthStatus,
  selectSettings,
  selectSettingsError,
  selectSettingsIsBusy,
  selectSettingsLoading,
  setGoogleModeThunk,
  setGoogleSheetsSyncProgress,
  verifySharedSheetThunk,
} from '../state';
import { showSnackbar } from '../../../app/store/uiSlice';
import type { GoogleSheetMode } from '../api';

const getErrorMessage = (error: unknown, fallback: string) => {
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.data?.message ?? fallback;
};

const parseRangeTab = (range?: string) => {
  if (!range) return 'Sheet1';
  const tab = range.split('!')[0]?.trim();
  return tab ? tab.replace(/^'/, '').replace(/'$/, '') : 'Sheet1';
};

export const useSettingsPageViewModel = ({
  canEdit,
  canViewQuickbooks,
  canSyncQuickbooks,
}: {
  canEdit: boolean;
  canViewQuickbooks: boolean;
  canSyncQuickbooks: boolean;
}) => {
  const dispatch = useAppDispatch();
  const settings = useAppSelector(selectSettings);
  const loading = useAppSelector(selectSettingsLoading);
  const error = useAppSelector(selectSettingsError);
  const oauthStatus = useAppSelector(selectOAuthStatus);
  const isBusyRedux = useAppSelector(selectSettingsIsBusy);
  const syncOverview = useAppSelector(selectGoogleSheetsSyncOverview);
  const syncProgress = useAppSelector(selectGoogleSheetsSyncProgress);
  const quickbooksOauthStatus = useAppSelector(selectQuickbooksOAuthStatus);
  const [isBusyLocal, setIsBusyLocal] = useState(false);
  const [sharedSpreadsheetId, setSharedSpreadsheetId] = useState('');
  const [sharedSheetName, setSharedSheetName] = useState('Sheet1');
  const [sharedHeaderRow, setSharedHeaderRow] = useState(1);
  const isBusy = isBusyRedux || isBusyLocal;

  useEffect(() => {
    void dispatch(fetchSettings());
    void dispatch(fetchGoogleSheetsSyncOverview());
  }, [dispatch]);

  useEffect(() => {
    if (!settings) return;
    if (settings.googleSheets.sharedConfig) {
      setSharedSpreadsheetId(settings.googleSheets.sharedConfig.spreadsheetId ?? '');
      setSharedSheetName(settings.googleSheets.sharedConfig.sheetName || 'Sheet1');
      setSharedHeaderRow(settings.googleSheets.sharedConfig.headerRow || 1);
    }
  }, [settings]);

  useEffect(() => {
    if (!settings?.googleSheets?.connected) return;
    void dispatch(fetchOAuthStatus());
  }, [dispatch, settings?.googleSheets?.connected]);

  useEffect(() => {
    if (!settings?.quickbooks.connected || !canViewQuickbooks) return;
    void dispatch(fetchQuickbooksOAuthStatus());
  }, [canViewQuickbooks, dispatch, settings?.quickbooks.connected, settings?.quickbooks.updatedAt]);

  const reloadQuickbooksSurface = useCallback(async () => {
    const nextSettings = await dispatch(fetchSettings()).unwrap();
    if (nextSettings.quickbooks.connected && canViewQuickbooks) {
      await dispatch(fetchQuickbooksOAuthStatus());
    }
  }, [canViewQuickbooks, dispatch]);

  const onModeChange = useCallback(async (mode: GoogleSheetMode) => {
    if (!canEdit) return;
    try {
      await dispatch(setGoogleModeThunk(mode)).unwrap();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to update mode'), severity: 'error' }));
    }
  }, [canEdit, dispatch]);

  const onSyncNow = useCallback(async () => {
    if (!canEdit || !settings) return;
    let progressTimer: ReturnType<typeof setInterval> | null = null;
    let progressValue = 12;
    try {
      setIsBusyLocal(true);
      dispatch(setGoogleSheetsSyncProgress({ percent: 12, stage: 'Starting sync...' }));
      progressTimer = setInterval(() => {
        progressValue = Math.min(90, progressValue + 8);
        dispatch(setGoogleSheetsSyncProgress({ percent: progressValue, stage: 'Importing rows...' }));
      }, 350);

      let payload: {
        mapping?: Record<string, string>;
        transforms?: Record<string, unknown>;
        options?: Record<string, unknown>;
      } & {
        connectorKey?: string;
        integrationType?: 'oauth' | 'shared';
        sourceId?: string;
        profileId?: string;
      };

      if (settings.googleSheets.mode === 'oauth') {
        const oauthSource =
          settings.googleSheets.sources.find((source) => source.name.trim().toUpperCase() === 'POS DATA SHEET') ??
          settings.googleSheets.sources.find((source) => source.active) ??
          settings.googleSheets.sources[0];
        if (!oauthSource?.spreadsheetId || Object.keys(oauthSource.mapping ?? {}).length === 0) {
          dispatch(showSnackbar({ message: 'No saved mapping found for the selected sheet. Configure mapping first.', severity: 'error' }));
          return;
        }
        payload = {
          connectorKey: 'pos_daily',
          integrationType: 'oauth',
          sourceId: oauthSource.sourceId,
          mapping: oauthSource.mapping ?? {},
          transforms: oauthSource.transformations ?? {},
          options: {
            mode: 'oauth',
            profileName: oauthSource.name,
            sourceId: oauthSource.sourceId,
            spreadsheetId: oauthSource.spreadsheetId,
            tab: parseRangeTab(oauthSource.range),
            headerRow: 1,
          },
        };
      } else {
        const sharedProfile =
          settings.googleSheets.sharedSheets?.find((sheet) => sheet.name.trim().toUpperCase() === 'POS DATA SHEET') ??
          settings.googleSheets.sharedSheets?.find((sheet) => sheet.isDefault) ??
          settings.googleSheets.sharedSheets?.[0];
        const mapping =
          sharedProfile?.columnsMap ??
          sharedProfile?.lastMapping?.columnsMap ??
          {};
        if (!sharedProfile?.spreadsheetId || Object.keys(mapping).length === 0) {
          dispatch(showSnackbar({ message: 'No saved mapping found for the selected sheet. Configure mapping first.', severity: 'error' }));
          return;
        }
        payload = {
          connectorKey: 'pos_daily',
          integrationType: 'shared',
          profileId: sharedProfile.profileId,
          mapping,
          transforms: (sharedProfile.lastMapping?.transformations as Record<string, unknown> | undefined) ?? {},
          options: {
            mode: 'service_account',
            profileId: sharedProfile.profileId,
            profileName: sharedProfile.name,
            tab: sharedProfile.sheetName || 'Sheet1',
            headerRow: Number(sharedProfile.headerRow ?? 1),
          },
        };
      }

      const summary = await dispatch(commitGoogleSheetsImportThunk(payload)).unwrap();
      dispatch(setGoogleSheetsSyncProgress({ percent: 100, stage: `Sync complete. Processed ${summary.imported} rows.` }));
      window.setTimeout(() => dispatch(setGoogleSheetsSyncProgress(null)), 1800);
    } catch (err) {
      dispatch(setGoogleSheetsSyncProgress(null));
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Sync failed'), severity: 'error' }));
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsBusyLocal(false);
    }
  }, [canEdit, dispatch, settings]);

  const onSaveSyncSchedule = useCallback(async (payload: { enabled: boolean; hour: number; minute: number; timezone: string }) => {
    if (!canEdit) return;
    try {
      await dispatch(saveGoogleSheetsSyncScheduleThunk(payload)).unwrap();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to update sync settings'), severity: 'error' }));
    }
  }, [canEdit, dispatch]);

  const onDeleteSheetSource = useCallback(async (payload: {
    mode: 'oauth' | 'service_account';
    profileName: 'POS DATA SHEET';
    deleteType: 'soft' | 'hard';
    confirmText: string;
  }) => {
    if (!canEdit) return;
    try {
      await dispatch(deleteGoogleSheetsSourceThunk(payload)).unwrap();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to delete source'), severity: 'error' }));
    }
  }, [canEdit, dispatch]);

  const onSaveSharedConfig = useCallback(async () => {
    if (!canEdit) return;
    if (!sharedSpreadsheetId.trim()) {
      dispatch(showSnackbar({ message: 'Spreadsheet ID is required', severity: 'error' }));
      return;
    }
    const defaultSharedProfile =
      settings?.googleSheets.sharedSheets?.find((sheet) => sheet.isDefault) ??
      settings?.googleSheets.sharedSheets?.[0];
    try {
      await dispatch(
        configureSharedSheetThunk({
          profileId: defaultSharedProfile?.profileId,
          profileName: defaultSharedProfile?.name ?? 'POS DATA SHEET',
          spreadsheetId: sharedSpreadsheetId.trim(),
          sheetName: sharedSheetName.trim() || 'Sheet1',
          headerRow: sharedHeaderRow,
          enabled: true,
        }),
      ).unwrap();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to save shared sheet config'), severity: 'error' }));
    }
  }, [canEdit, dispatch, settings, sharedHeaderRow, sharedSheetName, sharedSpreadsheetId]);

  const onVerifySharedConfig = useCallback(async () => {
    if (!canEdit) return;
    const defaultSharedProfile =
      settings?.googleSheets.sharedSheets?.find((sheet) => sheet.isDefault) ??
      settings?.googleSheets.sharedSheets?.[0];
    try {
      await dispatch(verifySharedSheetThunk({ profileId: defaultSharedProfile?.profileId })).unwrap();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Shared sheet verify failed'), severity: 'error' }));
    }
  }, [canEdit, dispatch, settings]);

  const onCheckOAuthStatus = useCallback(() => {
    void dispatch(fetchOAuthStatus());
  }, [dispatch]);

  const onToggleUpdateDbWithSheet = useCallback(async (enabled: boolean) => {
    if (!canEdit) return;
    if (!sharedSpreadsheetId.trim()) {
      dispatch(showSnackbar({ message: 'Save a spreadsheet first, then enable Update DB with sheet.', severity: 'warning' }));
      return;
    }
    const defaultSharedProfile =
      settings?.googleSheets.sharedSheets?.find((sheet) => sheet.isDefault) ??
      settings?.googleSheets.sharedSheets?.[0];
    try {
      await dispatch(
        configureSharedSheetThunk({
          profileId: defaultSharedProfile?.profileId,
          profileName: defaultSharedProfile?.name ?? 'POS DATA SHEET',
          spreadsheetId: sharedSpreadsheetId.trim(),
          sheetName: sharedSheetName.trim() || 'Sheet1',
          headerRow: sharedHeaderRow,
          enabled,
        }),
      ).unwrap();
      dispatch(showSnackbar({
        message: enabled
          ? 'Update DB with sheet enabled. Scheduled sync will run for this sheet.'
          : 'Update DB with sheet disabled.',
        severity: 'success',
      }));
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to update setting'), severity: 'error' }));
    }
  }, [canEdit, dispatch, settings, sharedHeaderRow, sharedSheetName, sharedSpreadsheetId]);

  const onConnectQuickbooks = useCallback(async () => {
    if (!canEdit) return;
    try {
      setIsBusyLocal(true);
      const url = await dispatch(connectQuickbooksThunk('/dashboard/settings')).unwrap();
      if (typeof window !== 'undefined') {
        window.location.href = url;
      }
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'QuickBooks connect failed'), severity: 'error' }));
    } finally {
      setIsBusyLocal(false);
    }
  }, [canEdit, dispatch]);

  const onDisconnectQuickbooks = useCallback(async () => {
    if (!canEdit) return;
    try {
      await dispatch(disconnectQuickbooksThunk()).unwrap();
      await reloadQuickbooksSurface();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to disconnect QuickBooks'), severity: 'error' }));
    }
  }, [canEdit, dispatch, reloadQuickbooksSurface]);

  const onRefreshQuickbooksReferences = useCallback(async () => {
    if (!canSyncQuickbooks) return;
    try {
      await dispatch(refreshQuickbooksReferencesThunk()).unwrap();
      await reloadQuickbooksSurface();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to refresh QuickBooks references'), severity: 'error' }));
    }
  }, [canSyncQuickbooks, dispatch, reloadQuickbooksSurface]);

  const onPostApprovedQuickbooks = useCallback(async () => {
    if (!canSyncQuickbooks) return;
    try {
      await dispatch(postApprovedQuickbooksThunk()).unwrap();
      await reloadQuickbooksSurface();
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to queue post-approved sync'), severity: 'error' }));
    }
  }, [canSyncQuickbooks, dispatch, reloadQuickbooksSurface]);

  const onRefreshQuickbooksStatus = useCallback(async () => {
    try {
      await reloadQuickbooksSurface();
      dispatch(showSnackbar({ message: 'QuickBooks status refreshed.', severity: 'success' }));
    } catch (err) {
      dispatch(showSnackbar({ message: getErrorMessage(err, 'Failed to refresh QuickBooks status'), severity: 'error' }));
    }
  }, [dispatch, reloadQuickbooksSurface]);

  return {
    settings,
    loading,
    error,
    oauthStatus,
    isBusy,
    syncOverview,
    syncProgress,
    quickbooksOauthStatus,
    sharedSpreadsheetId,
    sharedSheetName,
    sharedHeaderRow,
    setSharedSpreadsheetId,
    setSharedSheetName,
    setSharedHeaderRow,
    onModeChange,
    onSyncNow,
    onSaveSyncSchedule,
    onDeleteSheetSource,
    onSaveSharedConfig,
    onVerifySharedConfig,
    onCheckOAuthStatus,
    onToggleUpdateDbWithSheet,
    onConnectQuickbooks,
    onDisconnectQuickbooks,
    onRefreshQuickbooksReferences,
    onPostApprovedQuickbooks,
    onRefreshQuickbooksStatus,
    refreshSettings: () => dispatch(fetchSettings()),
    refreshQuickbooksSurface: reloadQuickbooksSurface,
  };
};
