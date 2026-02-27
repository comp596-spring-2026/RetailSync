import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid2 as Grid,
  Stack,
  Typography
} from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import CreditCardIcon from '@mui/icons-material/CreditCard';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import ReceiptIcon from '@mui/icons-material/Receipt';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import TodayIcon from '@mui/icons-material/Today';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '../../api';
import {
  DateRangeControlPanel,
  LoadingEmptyStateWrapper,
  NoAccess,
  PageHeader,
  firstOfMonthISO,
  monthToRange
} from '../../components';
import { useAppSelector } from '../../app/store/hooks';
import { hasPermission } from '../../utils/permissions';

type Summary = {
  month: string;
  days: number;
  sumHighTax: number;
  sumLowTax: number;
  sumSaleTax: number;
  sumTotalSales: number;
  sumGas: number;
  sumLottery: number;
  sumCreditCard: number;
  sumCash: number;
  sumCashExpenses: number;
  expectedCardDeposit: number;
  expectedCashDeposit: number;
  eftExpected: number;
};

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type MetricCardProps = {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  color?: 'primary' | 'success' | 'info' | 'warning' | 'error' | 'secondary';
  highlight?: boolean;
};

const MetricCard = ({ title, value, icon, color = 'primary', highlight }: MetricCardProps) => (
  <Card
    variant={highlight ? 'elevation' : 'outlined'}
    elevation={highlight ? 2 : 0}
    sx={highlight ? { borderLeft: 4, borderColor: `${color}.main` } : undefined}
  >
    <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 11 }}>
            {title}
          </Typography>
          <Typography variant="h6" fontWeight={600} sx={{ mt: 0.25 }}>
            {typeof value === 'number' ? `$${fmt(value)}` : value}
          </Typography>
        </Box>
        {icon && (
          <Box sx={{ color: `${color}.main`, opacity: 0.7 }}>{icon}</Box>
        )}
      </Stack>
    </CardContent>
  </Card>
);

const initRange = () => {
  const first = firstOfMonthISO();
  const m = first.slice(0, 7);
  const r = monthToRange(m);
  return r;
};

export const ReportsPage = () => {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'reports', 'view');

  const init = initRange();
  const [fromDate, setFromDate] = useState(init.from);
  const [toDate, setToDate] = useState(init.to);
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const month = useMemo(() => fromDate.slice(0, 7), [fromDate]);

  const load = useCallback(async () => {
    if (!month) return;
    setError(null);
    setLoading(true);
    try {
      const res = await reportsApi.monthlySummary(month);
      setData(res.data.data);
    } catch {
      setError('Failed to load monthly summary.');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (canView) void load();
  }, [canView, load]);

  if (!canView) return <NoAccess />;

  const isEmpty = !loading && (data === null || data.days === 0);

  return (
    <Stack spacing={2}>
      <PageHeader
        title="Monthly Reports"
        subtitle="Financial summary, expected deposits, and key metrics"
        icon={<AssessmentIcon />}
      />

      <DateRangeControlPanel
        from={fromDate}
        to={toDate}
        onFromChange={setFromDate}
        onToChange={setToDate}
        loading={loading}
        onRefresh={() => void load()}
        stats={
          data && data.days > 0 ? (
            <Chip
              icon={<TodayIcon />}
              label={`${data.days} day${data.days !== 1 ? 's' : ''} reported`}
              size="small"
              variant="outlined"
            />
          ) : undefined
        }
      />

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={isEmpty}
        loadingLabel="Loading report..."
        emptyMessage="No POS data for this month"
        emptySecondary="Import POS data from the POS page to generate reports."
        emptyActionLabel="Go to POS"
        onEmptyAction={() => navigate('/dashboard/pos')}
      >
        {data && (
          <Stack spacing={2}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11 }}>
              Key Metrics
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Total Sales" value={data.sumTotalSales} icon={<TrendingUpIcon />} color="primary" highlight />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Credit Card" value={data.sumCreditCard} icon={<CreditCardIcon />} color="info" highlight />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Cash" value={data.sumCash} icon={<AccountBalanceWalletIcon />} color="success" highlight />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Days Reported" value={data.days} icon={<CalendarTodayIcon />} color="secondary" />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, mt: 1 }}>
              Tax Breakdown
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="High Tax" value={data.sumHighTax} icon={<AttachMoneyIcon />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Low Tax" value={data.sumLowTax} icon={<AttachMoneyIcon />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Sale Tax" value={data.sumSaleTax} icon={<ReceiptIcon />} />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, mt: 1 }}>
              Other Categories
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Gas" value={data.sumGas} icon={<LocalGasStationIcon />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Lottery" value={data.sumLottery} icon={<ConfirmationNumberIcon />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Cash Expenses" value={data.sumCashExpenses} icon={<AccountBalanceWalletIcon />} />
              </Grid>
            </Grid>

            <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 11, mt: 1 }}>
              Expected Deposits
            </Typography>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Expected Card Deposit" value={data.expectedCardDeposit} icon={<CreditCardIcon />} color="info" highlight />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="Expected Cash Deposit" value={data.expectedCashDeposit} icon={<AccountBalanceIcon />} color="success" highlight />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <MetricCard title="EFT Expected" value={data.eftExpected} icon={<AccountBalanceIcon />} color="warning" highlight />
              </Grid>
            </Grid>
          </Stack>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};
