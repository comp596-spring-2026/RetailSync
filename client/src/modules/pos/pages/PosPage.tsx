import UploadFileIcon from '@mui/icons-material/UploadFile';
import GoogleIcon from '@mui/icons-material/Google';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import InsightsIcon from '@mui/icons-material/Insights';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import SettingsIcon from '@mui/icons-material/Settings';
import TableRowsIcon from '@mui/icons-material/TableRows';
import {
  Alert,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PermissionGate } from '../../../app/guards';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import {
  DateRangeControlPanel,
  NoAccess,
  PageHeader
} from '../../../components';
import { usePos } from '../hooks/usePos';
import { ImportPOSDataModal } from '../components/ImportPOSDataModal';
import { fetchSettings, selectGoogleSheetsSettings, selectSettings } from '../../settings/state';
import { hasPermission } from '../../../utils/permissions';
import { PosAnalyticsViewPage } from './PosAnalyticsViewPage';
import { PosTableViewPage } from './PosTableViewPage';
import type { PosPrimaryAction } from './types';

type LastImportSource = 'file' | 'google_sheets' | null;

type PosView = 'table' | 'dashboard';

const hasCanonicalConnectorConfig = (googleSheets: unknown): boolean => {
  if (!googleSheets || typeof googleSheets !== 'object') return false;
  const gs = googleSheets as Record<string, unknown>;
  const activeIntegration = gs.activeIntegration;
  const oauth = (gs.oauth ?? {}) as Record<string, unknown>;
  const shared = (gs.shared ?? {}) as Record<string, unknown>;
  const oauthSources = Array.isArray(oauth.sources) ? oauth.sources : [];
  const sharedProfiles = Array.isArray(shared.profiles) ? shared.profiles : [];

  const isUsable = (connector: Record<string, unknown> | null) => {
    if (!connector) return false;
    const spreadsheetId = String(connector.spreadsheetId ?? '').trim();
    const mapping = connector.mapping as Record<string, unknown> | undefined;
    return spreadsheetId.length > 0 && Object.keys(mapping ?? {}).length > 0;
  };

  const findConnector = (connectors: unknown[], preferredKey: string) => {
    const list = Array.isArray(connectors) ? connectors : [];
    const byPreferred = list.find(
      (entry) => String((entry as Record<string, unknown>)?.key ?? '').trim() === preferredKey,
    );
    if (byPreferred) return byPreferred as Record<string, unknown>;
    const byDefault = list.find(
      (entry) => String((entry as Record<string, unknown>)?.key ?? '').trim() === 'pos_daily',
    );
    return (byDefault ?? null) as Record<string, unknown> | null;
  };

  const hasUsableInSources = () => {
    const key = String(oauth.activeConnectorKey ?? 'pos_daily').trim() || 'pos_daily';
    return oauthSources.some((source) => {
      const connectorsRaw = (source as Record<string, unknown>)?.connectors;
      const connectors = Array.isArray(connectorsRaw) ? connectorsRaw : [];
      return isUsable(findConnector(connectors, key));
    });
  };
  const hasUsableInProfiles = () => {
    const key = String(shared.activeConnectorKey ?? 'pos_daily').trim() || 'pos_daily';
    return sharedProfiles.some((profile) => {
      const connectorsRaw = (profile as Record<string, unknown>)?.connectors;
      const connectors = Array.isArray(connectorsRaw) ? connectorsRaw : [];
      return isUsable(findConnector(connectors, key));
    });
  };

  if (activeIntegration === 'oauth') return hasUsableInSources();
  if (activeIntegration === 'shared') return hasUsableInProfiles();
  return hasUsableInSources() || hasUsableInProfiles();
};

const resolveSyncConfigured = (
  settings: ReturnType<typeof selectSettings>,
  googleSheetsCanonical: ReturnType<typeof selectGoogleSheetsSettings>,
): boolean => {
  if (hasCanonicalConnectorConfig(googleSheetsCanonical)) return true;
  const gs = settings?.googleSheets;
  if (!gs) return false;

  const hasShared =
    gs.sharedSheets?.some((sheet) => {
      const mapped = sheet.columnsMap ?? sheet.lastMapping?.columnsMap ?? {};
      return (
        Boolean(sheet.spreadsheetId) && Boolean(sheet.enabled) && Object.keys(mapped).length > 0
      );
    }) ?? false;

  const hasLegacyShared = (() => {
    const mapped = gs.sharedConfig?.columnsMap ?? gs.sharedConfig?.lastMapping?.columnsMap ?? {};
    return (
      Boolean(gs.sharedConfig?.spreadsheetId) &&
      Boolean(gs.sharedConfig?.enabled) &&
      Object.keys(mapped).length > 0
    );
  })();

  const hasOauth =
    gs.sources?.some(
      (source) => Boolean(source.spreadsheetId) && Object.keys(source.mapping ?? {}).length > 0
    ) ?? false;

  return hasShared || hasLegacyShared || hasOauth;
};

export const PosPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const settings = useAppSelector(selectSettings);
  const googleSheetsCanonical = useAppSelector(selectGoogleSheetsSettings);
  const { state, actions } = usePos();

  const canView = hasPermission(permissions, 'pos', 'view');
  const canImport =
    hasPermission(permissions, 'pos', 'create') && hasPermission(permissions, 'pos', 'actions:import');

  const [openImportModal, setOpenImportModal] = useState(false);

  const syncConfigured = resolveSyncConfigured(settings, googleSheetsCanonical);
  const lastImportSource = (settings?.lastImportSource ?? null) as LastImportSource;
  const isValidRange =
    Boolean(state.dateRange.from) &&
    Boolean(state.dateRange.to) &&
    state.dateRange.from <= state.dateRange.to;

  const lastSyncLabel = useMemo(() => {
    if (state.lastSyncAt) return new Date(state.lastSyncAt).toLocaleString();
    if (settings?.lastImportAt) return new Date(settings.lastImportAt).toLocaleString();
    return 'Never';
  }, [state.lastSyncAt, settings?.lastImportAt]);

  useEffect(() => {
    if (!canView) return;
    void dispatch(fetchSettings());
  }, [canView, dispatch]);

  useEffect(() => {
    if (!canView || !isValidRange) return;
    void actions.fetchOverview();
  }, [canView, isValidRange, actions, state.dateRange.from, state.dateRange.to]);

  useEffect(() => {
    if (!canView || !isValidRange) return;
    void actions.fetchDaily();
  }, [canView, isValidRange, actions, state.dateRange.from, state.dateRange.to, state.page, state.limit]);

  if (!canView) return <NoAccess />;

  const totalSales = state.kpis.totalSales;
  const totalCredit = state.kpis.creditCard;
  const totalCash = state.kpis.cash;
  const totalGas = state.kpis.gas;
  const totalLottery = state.kpis.lottery;
  const avgDailySales = state.kpis.avgDailySales;
  const netIncome = state.kpis.netIncome;
  const cashDiff = state.kpis.cashDiff;
  const totalSaleTax = state.totals.saleTax;
  const effectiveTaxRate = totalSales > 0 ? (totalSaleTax / totalSales) * 100 : 0;

  const googleSettingsUrl =
    '/dashboard/settings?open=google_sheets&expand=configure&profile=POS%20DATA%20SHEET';

  const syncTooltipContent = (
    <Stack spacing={0.75} sx={{ py: 0.25 }}>
      <Typography variant="caption" sx={{ lineHeight: 1.35 }}>
        Sync latest data from connected Google Sheet.
      </Typography>
      <Typography variant="caption" sx={{ lineHeight: 1.35 }}>
        Last synced: {lastSyncLabel}
      </Typography>
      <Stack direction="row" justifyContent="flex-end">
        <Tooltip title="Open Google Sheets settings" placement="top">
          <IconButton
            size="small"
            aria-label="Open Google Sheets settings"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              navigate(googleSettingsUrl);
            }}
            sx={{ color: 'inherit' }}
          >
            <SettingsIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  const primaryAction: PosPrimaryAction & {
    tooltip: React.ReactNode;
    icon: React.ReactNode;
    loading: boolean;
  } = syncConfigured
    ? {
        label: 'Sync Now',
        tooltip: syncTooltipContent,
        icon: <GoogleIcon />,
        onClick: () => {
          void actions.syncGoogleSheet();
        },
        loading: state.loading.syncing
      }
    : lastImportSource === 'file'
      ? {
          label: 'Update New CSV',
          tooltip: 'Upload a newer CSV file',
          icon: <InsertDriveFileIcon />,
          onClick: () => setOpenImportModal(true),
          loading: false
        }
      : {
          label: 'Import Data',
          tooltip: 'Import POS data from CSV',
          icon: <UploadFileIcon />,
          onClick: () => setOpenImportModal(true),
          loading: false
        };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={state.view === 'table' ? 'POS Table View' : 'POS Analytics View'}
        subtitle={
          state.view === 'table'
            ? 'Review daily POS records, totals, and mapped source data.'
            : 'Analyze sales trends, distribution, and performance insights.'
        }
        icon={<PointOfSaleIcon />}
      />

      <DateRangeControlPanel
        from={state.dateRange.from}
        to={state.dateRange.to}
        onDateRangeChange={(range) => actions.setDateRange(range)}
        loading={state.loading.daily || state.loading.overview}
        onRefresh={() => {
          if (!isValidRange) return;
          void actions.fetchDaily();
          void actions.fetchOverview();
        }}
        refreshPlacement="inline"
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <ToggleButtonGroup
              size="small"
              exclusive
              value={state.view}
              onChange={(_event, next: PosView | null) => {
                if (!next) return;
                actions.setView(next);
              }}
              aria-label="POS table analytics switch"
            >
              <ToggleButton value="table" aria-label="Table view">
                <TableRowsIcon fontSize="small" sx={{ mr: 0.75 }} />
                Table
              </ToggleButton>
              <ToggleButton value="dashboard" aria-label="Analytics view">
                <InsightsIcon fontSize="small" sx={{ mr: 0.75 }} />
                Analytics
              </ToggleButton>
            </ToggleButtonGroup>

            <PermissionGate module="pos" action="actions:import" mode="disable">
              <Tooltip title={primaryAction.tooltip}>
                <span>
                  <Button
                    variant="contained"
                    size="small"
                    color={syncConfigured ? 'success' : 'primary'}
                    startIcon={primaryAction.loading ? <CircularProgress size={14} /> : primaryAction.icon}
                    onClick={primaryAction.onClick}
                    aria-label={primaryAction.label}
                    disabled={
                      !canImport ||
                      state.loading.daily ||
                      state.loading.overview ||
                      primaryAction.loading
                    }
                  >
                    {primaryAction.label}
                  </Button>
                </span>
              </Tooltip>
            </PermissionGate>
          </Stack>
        }
      />

      {state.error ? <Alert severity="error">{state.error}</Alert> : null}

      {state.view === 'dashboard' ? (
        <PosAnalyticsViewPage
          loading={state.loading.overview}
          chartsData={state.chartsData}
          primaryAction={primaryAction}
          totalSales={totalSales}
          avgDailySales={avgDailySales}
          effectiveTaxRate={effectiveTaxRate}
          totalCredit={totalCredit}
          totalCash={totalCash}
          totalGas={totalGas}
          totalLottery={totalLottery}
          netIncome={netIncome}
          cashDiff={cashDiff}
        />
      ) : (
        <PosTableViewPage
          loading={state.loading.daily}
          rows={state.records}
          totals={state.totals}
          totalCount={state.totalCount}
          page={state.page}
          limit={state.limit}
          onPageChange={actions.setPage}
          onLimitChange={actions.setLimit}
          primaryAction={primaryAction}
        />
      )}

      <ImportPOSDataModal
        open={openImportModal}
        onClose={() => setOpenImportModal(false)}
        navigateToSettings={() => {
          navigate(googleSettingsUrl);
        }}
        onImported={async () => {
          await dispatch(fetchSettings());
          await actions.fetchDaily();
          await actions.fetchOverview();
        }}
      />
    </Stack>
  );
};
