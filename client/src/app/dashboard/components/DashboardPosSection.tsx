import GoogleIcon from '@mui/icons-material/Google';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { TotalSalesLine } from '../../../modules/pos/charts/TotalSalesLine';
import { RetailSurfaceCard, RetailSurfaceCardBody } from '../../../components';
import type { DashboardPosSummaryState } from '../useDashboardPosSummary';
import { DashboardKpiGrid } from './DashboardKpiGrid';
import { DashboardLockedCard } from './DashboardLockedCard';

type DashboardPosSectionProps = {
  state: DashboardPosSummaryState;
  canView: boolean;
  canImport: boolean;
  connectLabel: string;
  connectDisabled: boolean;
};

export const DashboardPosSection = ({
  state,
  canView,
  canImport,
  connectLabel,
  connectDisabled
}: DashboardPosSectionProps) => {
  if (!canView) {
    return (
      <DashboardLockedCard
        title="POS / Google Sheets"
        message="You do not have access to POS data. Ask an admin to grant POS view permission."
        actionLabel="Ask admin"
        actionDisabled
      />
    );
  }

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <RetailSurfaceCard>
        <RetailSurfaceCardBody>
          <Stack direction="row" spacing={1} alignItems="center">
            <PointOfSaleIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              POS / Google Sheets
            </Typography>
            <CircularProgress size={18} sx={{ ml: 1 }} />
          </Stack>
        </RetailSurfaceCardBody>
      </RetailSurfaceCard>
    );
  }

  if (state.status === 'not_configured') {
    return (
      <DashboardLockedCard
        title="POS / Google Sheets"
        message="Connect Google Sheets in Settings to import POS sales data for the last 30 days."
        actionLabel={connectLabel}
        actionDisabled={connectDisabled}
      />
    );
  }

  if (state.status === 'configured_no_data') {
    return (
      <RetailSurfaceCard>
        <RetailSurfaceCardBody>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <GoogleIcon color="primary" />
              <Typography variant="h6" fontWeight={700}>
                POS / Google Sheets
              </Typography>
              <Chip size="small" label="Configured" color="warning" variant="outlined" />
            </Stack>
            <Alert severity="info">
              Google Sheets is configured, but no POS rows were imported for the last 30 days yet.
            </Alert>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button variant="contained" component={RouterLink} to="/dashboard/settings">
                {connectLabel}
              </Button>
              {canImport ? (
                <Button variant="outlined" component={RouterLink} to="/dashboard/pos">
                  Import POS data
                </Button>
              ) : null}
            </Stack>
          </Stack>
        </RetailSurfaceCardBody>
      </RetailSurfaceCard>
    );
  }

  if (state.status === 'error') {
    return (
      <RetailSurfaceCard>
        <RetailSurfaceCardBody>
          <Alert severity="error">{state.message}</Alert>
        </RetailSurfaceCardBody>
      </RetailSurfaceCard>
    );
  }

  if (state.status !== 'ready') return null;

  const { data } = state;
  const { overview, totals, chartSeries } = data;
  const taxCollected = totals.highTax + totals.lowTax + totals.saleTax;

  return (
    <RetailSurfaceCard>
      <RetailSurfaceCardBody>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <PointOfSaleIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              POS / Google Sheets
            </Typography>
            <Chip size="small" label="Last 30 days" variant="outlined" />
            {data.lastUpdatedLabel ? (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                Last import: {data.lastUpdatedLabel}
              </Typography>
            ) : null}
          </Stack>

          <DashboardKpiGrid
            items={[
              { label: 'Total sales', value: overview.kpis.totalSales },
              { label: 'High tax sales', value: totals.highTax },
              { label: 'Low tax sales', value: totals.lowTax },
              { label: 'Gasoline', value: overview.kpis.gas },
              { label: 'Lottery', value: overview.kpis.lottery },
              { label: 'Tax collected', value: taxCollected }
            ]}
          />

          <Box
            sx={{
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              p: 1.5,
              bgcolor: '#fff'
            }}
          >
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
              Sales trend
            </Typography>
            {chartSeries.length > 0 ? (
              <TotalSalesLine seriesData={chartSeries} height={240} />
            ) : (
              <Typography variant="body2" color="text.secondary">
                Connect and import POS data to populate the chart.
              </Typography>
            )}
          </Box>
        </Stack>
      </RetailSurfaceCardBody>
    </RetailSurfaceCard>
  );
};
