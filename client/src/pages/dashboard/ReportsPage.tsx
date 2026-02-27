import { Alert, Card, CardContent, Grid2 as Grid, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import AssessmentIcon from '@mui/icons-material/Assessment';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsApi } from '../../api';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../components';
import { useAppSelector } from '../../app/store/hooks';
import { hasPermission } from '../../lib/utils/permissions';

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

const MetricCard = ({ title, value }: { title: string; value: number | string }) => (
  <Card>
    <CardContent>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="h6">{typeof value === 'number' ? value.toFixed(2) : value}</Typography>
    </CardContent>
  </Card>
);

export const ReportsPage = () => {
  const navigate = useNavigate();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'reports', 'view');

  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await reportsApi.monthlySummary(month);
      setData(res.data.data);
    } catch (err) {
      setError('Failed to load monthly summary');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (canView) {
      void load();
    }
  }, [canView, load]);

  if (!canView) {
    return <NoAccess />;
  }

  const isEmpty = !loading && (data === null || data.days === 0);

  return (
    <Stack spacing={2}>
      <PageHeader title="Reports" subtitle="Monthly financial summary and expected deposits" icon={<AssessmentIcon />} />
      <Paper sx={{ p: 3 }}>
        <TextField
          label="Month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          InputLabelProps={{ shrink: true }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <CalendarMonthIcon fontSize="small" />
              </InputAdornment>
            )
          }}
        />
      </Paper>
      {error && <Alert severity="error">{error}</Alert>}
      <LoadingEmptyStateWrapper
        loading={loading}
        empty={isEmpty}
        loadingLabel="Loading report..."
        emptyMessage="No POS data for this month"
        emptySecondary="Import POS data from the POS page to see totals."
        emptyActionLabel="Go to POS"
        onEmptyAction={() => navigate('/dashboard/pos')}
      >
        {data && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Days" value={data.days} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Total Sales" value={data.sumTotalSales} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Credit Card" value={data.sumCreditCard} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Cash" value={data.sumCash} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="High Tax" value={data.sumHighTax} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Low Tax" value={data.sumLowTax} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Sale Tax" value={data.sumSaleTax} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Gas" value={data.sumGas} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Lottery" value={data.sumLottery} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Cash Expenses" value={data.sumCashExpenses} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Expected Card Deposit" value={data.expectedCardDeposit} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="Expected Cash Deposit" value={data.expectedCashDeposit} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <MetricCard title="EFT Expected" value={data.eftExpected} />
          </Grid>
        </Grid>
        )}
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};
