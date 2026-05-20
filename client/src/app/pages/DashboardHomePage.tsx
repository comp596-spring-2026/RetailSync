import DashboardIcon from '@mui/icons-material/Dashboard';
import { Stack } from '@mui/material';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { NoAccess, PageHeader } from '../../components';
import { hasPermission } from '../../utils/permissions';
import { extractApiErrorMessage } from '../../utils/apiError';
import { dashboardApi } from '../api/dashboardApi';
import { fetchSettings, selectGoogleSheetsSettings, selectSettings, selectSettingsLoading } from '../../modules/settings/state';
import { DashboardPosSection } from '../dashboard/components/DashboardPosSection';
import { DashboardQuickBooksSection } from '../dashboard/components/DashboardQuickBooksSection';
import { useDashboardPosSummary } from '../dashboard/useDashboardPosSummary';
import { useDashboardQuickBooksSummary } from '../dashboard/useDashboardQuickBooksSummary';

export const DashboardHomePage = () => {
  const dispatch = useAppDispatch();
  const company = useAppSelector((state) => state.company.company);
  const permissions = useAppSelector((state) => state.auth.permissions);
  const settings = useAppSelector(selectSettings);
  const googleSheetsCanonical = useAppSelector(selectGoogleSheetsSettings);
  const settingsLoading = useAppSelector(selectSettingsLoading);

  const canViewDashboard = hasPermission(permissions, 'dashboard', 'view');
  const [dashboardAccess, setDashboardAccess] = useState<'idle' | 'loading' | 'allowed' | 'denied' | 'error'>(
    'idle'
  );
  const [dashboardAccessError, setDashboardAccessError] = useState<string | null>(null);
  const canViewPos = hasPermission(permissions, 'pos', 'view');
  const canImportPos =
    hasPermission(permissions, 'pos', 'create') && hasPermission(permissions, 'pos', 'actions:import');
  const canViewQuickbooks = hasPermission(permissions, 'quickbooks', 'view');
  const canSyncQuickbooks = hasPermission(permissions, 'quickbooks', 'actions:sync');
  useEffect(() => {
    if (!canViewDashboard) {
      setDashboardAccess('denied');
      return;
    }

    let cancelled = false;
    setDashboardAccess('loading');
    setDashboardAccessError(null);

    void dashboardApi
      .getSummary()
      .then(() => {
        if (!cancelled) {
          setDashboardAccess('allowed');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status === 403) {
          setDashboardAccess('denied');
          return;
        }
        setDashboardAccess('error');
        setDashboardAccessError(extractApiErrorMessage(error, 'Failed to load dashboard'));
      });

    return () => {
      cancelled = true;
    };
  }, [canViewDashboard]);

  useEffect(() => {
    if (dashboardAccess !== 'allowed') return;
    void dispatch(fetchSettings());
  }, [dashboardAccess, dispatch]);

  const settingsReady = !settingsLoading && settings != null;

  const posSummary = useDashboardPosSummary({
    enabled: canViewPos,
    settings,
    googleSheetsCanonical,
    settingsReady
  });

  const quickbooksSummary = useDashboardQuickBooksSummary(canViewQuickbooks);

  if (!canViewDashboard || dashboardAccess === 'denied') {
    return <NoAccess />;
  }

  if (dashboardAccess === 'loading' || dashboardAccess === 'idle') {
    return null;
  }

  if (dashboardAccess === 'error') {
    return <NoAccess message={dashboardAccessError ?? 'Failed to load dashboard'} />;
  }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Dashboard"
        subtitle={company?.name ? `${company.name} executive summary` : 'Executive summary'}
        icon={<DashboardIcon />}
      />

      <DashboardPosSection
        state={posSummary.state}
        canView={canViewPos}
        canImport={canImportPos}
        connectLabel="Connect POS Data"
        connectDisabled={false}
      />

      <DashboardQuickBooksSection
        state={quickbooksSummary.reportState}
        workspaceLoading={quickbooksSummary.workspace.loading}
        isConnected={quickbooksSummary.workspace.isConnected}
        warning={quickbooksSummary.workspace.warning}
        canView={canViewQuickbooks}
        canSync={canSyncQuickbooks}
        connectLabel="Connect QuickBooks"
        connectDisabled={false}
      />
    </Stack>
  );
};
