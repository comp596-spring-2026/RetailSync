import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Stack,
  Typography
} from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { RetailSurfaceCard, RetailSurfaceCardBody } from '../../../components';
import { formatCurrencyPrecise } from '../formatters';
import type { DashboardQuickBooksSummaryState } from '../useDashboardQuickBooksSummary';
import { DashboardKpiGrid } from './DashboardKpiGrid';
import { DashboardLockedCard } from './DashboardLockedCard';

type DashboardQuickBooksSectionProps = {
  state: DashboardQuickBooksSummaryState;
  workspaceLoading: boolean;
  isConnected: boolean;
  warning: string | null;
  canView: boolean;
  canSync: boolean;
  connectLabel: string;
  connectDisabled: boolean;
};

export const DashboardQuickBooksSection = ({
  state,
  workspaceLoading,
  isConnected,
  warning,
  canView,
  canSync,
  connectLabel,
  connectDisabled
}: DashboardQuickBooksSectionProps) => {
  if (!canView) {
    return (
      <DashboardLockedCard
        title="QuickBooks accounting"
        message="You do not have access to QuickBooks data. Ask an admin to grant QuickBooks view permission."
        actionLabel="Ask admin"
        actionDisabled
      />
    );
  }

  if (workspaceLoading || state.status === 'loading' || state.status === 'idle') {
    return (
      <RetailSurfaceCard>
        <RetailSurfaceCardBody>
          <Stack direction="row" spacing={1} alignItems="center">
            <CalculateOutlinedIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              QuickBooks accounting
            </Typography>
            <CircularProgress size={18} sx={{ ml: 1 }} />
          </Stack>
        </RetailSurfaceCardBody>
      </RetailSurfaceCard>
    );
  }

  if (!isConnected || state.status === 'not_connected') {
    return (
      <DashboardLockedCard
        title="QuickBooks accounting"
        message="Connect QuickBooks to view this year's profit & loss, balance sheet shortcuts, and sync status."
        actionLabel={connectLabel}
        actionDisabled={connectDisabled}
      />
    );
  }

  if (state.status === 'error') {
    return (
      <RetailSurfaceCard>
        <RetailSurfaceCardBody>
          <Alert severity="error">{state.message}</Alert>
          <Button sx={{ mt: 1 }} variant="outlined" component={RouterLink} to="/dashboard/settings">
            Open Settings
          </Button>
        </RetailSurfaceCardBody>
      </RetailSurfaceCard>
    );
  }

  if (state.status !== 'ready') return null;

  const { data } = state;
  const cards = data.overview.cards;

  return (
    <RetailSurfaceCard>
      <RetailSurfaceCardBody>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <CalculateOutlinedIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              QuickBooks accounting
            </Typography>
            <Chip size="small" label={`YTD ${data.range.start} → ${data.range.end}`} variant="outlined" />
            <Chip
              size="small"
              label={data.connectionLabel}
              color={data.connectionLabel === 'Connected' ? 'success' : 'warning'}
              variant="outlined"
            />
            {data.companyName ? (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                {data.companyName}
              </Typography>
            ) : null}
          </Stack>

          {warning ? <Alert severity="warning">{warning}</Alert> : null}

          <DashboardKpiGrid
            items={[
              { label: 'Net income (YTD)', value: cards.netIncome },
              { label: 'Total assets', value: cards.totalAssets },
              { label: 'Total liabilities', value: cards.totalLiabilities },
              { label: 'Total equity', value: cards.totalEquity },
              { label: 'AR open', value: cards.arOpen },
              { label: 'AP open', value: cards.apOpen }
            ]}
          />

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.5}
            sx={{
              '& > *': {
                flex: 1,
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                p: 1.5,
                bgcolor: '#fff'
              }
            }}
          >
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" fontWeight={700}>
                Profit & Loss
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Net income: {formatCurrencyPrecise(cards.netIncome)}
              </Typography>
              <Button size="small" component={RouterLink} to="/dashboard/quickbooks/reports">
                View Profit & Loss
              </Button>
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" fontWeight={700}>
                Balance sheet
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Assets {formatCurrencyPrecise(cards.totalAssets)} · Liabilities{' '}
                {formatCurrencyPrecise(cards.totalLiabilities)}
              </Typography>
              <Button size="small" component={RouterLink} to="/dashboard/quickbooks/reports">
                View Balance Sheet
              </Button>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button variant="contained" startIcon={<AssessmentOutlinedIcon />} component={RouterLink} to="/dashboard/quickbooks/reports">
              View reports
            </Button>
            <Button variant="outlined" component={RouterLink} to="/dashboard/quickbooks">
              QuickBooks hub
            </Button>
            {canSync ? (
              <Button variant="outlined" startIcon={<SyncIcon />} component={RouterLink} to="/dashboard/quickbooks">
                Sync QuickBooks
              </Button>
            ) : null}
            <Button variant="text" startIcon={<AccountBalanceWalletOutlinedIcon />} component={RouterLink} to="/dashboard/settings">
              Settings
            </Button>
          </Stack>
        </Stack>
      </RetailSurfaceCardBody>
    </RetailSurfaceCard>
  );
};
