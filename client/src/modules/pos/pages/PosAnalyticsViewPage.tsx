import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import TimelineIcon from '@mui/icons-material/Timeline';
import { Box, Card, CardContent, Divider, Grid2 as Grid, Stack, Typography } from '@mui/material';
import { PosKpiStack } from '../components';
import type { PosState } from '../state';
import { LoadingEmptyStateWrapper } from '../../../components';
import { DailyTrendChart } from '../charts/DailyTrendChart';
import { MonthlyBar } from '../charts/MonthlyBar';
import { RevenueDonut } from '../charts/RevenueDonut';
import { WeekdayBar } from '../charts/WeekdayBar';
import type { PosPrimaryAction } from './types';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type PosAnalyticsViewPageProps = {
  loading: boolean;
  chartsData: PosState['chartsData'];
  primaryAction: PosPrimaryAction;
  totalSales: number;
  avgDailySales: number;
  effectiveTaxRate: number;
  totalCredit: number;
  totalCash: number;
  totalGas: number;
  totalLottery: number;
  netIncome: number;
  cashDiff: number;
};

export const PosAnalyticsViewPage = ({
  loading,
  chartsData,
  primaryAction,
  totalSales,
  avgDailySales,
  effectiveTaxRate,
  totalCredit,
  totalCash,
  totalGas,
  totalLottery,
  netIncome,
  cashDiff
}: PosAnalyticsViewPageProps) => {
  const distribution = [
    { label: 'Credit Card', value: totalCredit },
    { label: 'Cash', value: totalCash },
    { label: 'Gas', value: totalGas },
    { label: 'Lottery', value: totalLottery }
  ];
  const distributionColorByLabel: Record<string, string> = {
    'Credit Card': '#1976d2',
    Gas: '#ef6c00',
    Cash: '#2e7d32',
    Lottery: '#8e24aa'
  };
  const distributionColors = distribution.map(
    (entry) => distributionColorByLabel[entry.label] ?? '#6b7280'
  );
  const sortedDistribution = [...distribution].sort((a, b) => b.value - a.value);
  const distributionTotal = distribution.reduce((sum, entry) => sum + Number(entry.value ?? 0), 0);

  return (
    <LoadingEmptyStateWrapper
      loading={loading}
      empty={!loading && chartsData.totalSales.length === 0}
      loadingLabel="Loading POS analytics..."
      emptyMessage="No POS data for this date range"
      emptySecondary="Sync or import data, or select a different date range."
      emptyActionLabel={primaryAction.label}
      onEmptyAction={primaryAction.onClick}
    >
      <Stack spacing={2}>
        <Grid container spacing={1.5} columns={{ xs: 12, lg: 2 }} alignItems="stretch">
          <Grid size={{ xs: 12, lg: 1 }} sx={{ display: 'flex' }}>
            <section aria-label="KPI overview matrix" style={{ width: '100%' }}>
              <PosKpiStack
                title="KPI Overview"
              items={[
                { label: 'Total Sales', value: `$${fmt(totalSales)}` },
                { label: 'Average Daily Sales', value: `$${fmt(avgDailySales)}` },
                { label: 'Gas Sales', value: `$${fmt(totalGas)}` },
                { label: 'Lottery Sales', value: `$${fmt(totalLottery)}` },
                { label: 'Credit Collected', value: `$${fmt(totalCredit)}` },
                { label: 'Cash Collected', value: `$${fmt(totalCash)}` },
                { label: 'Cash Diff', value: `$${fmt(cashDiff)}` },
                { label: 'Effective Tax Rate', value: `${effectiveTaxRate.toFixed(1)}%` },
                { label: 'Net Income', value: `$${fmt(netIncome)}` }
              ]}
            />
          </section>
          </Grid>
          <Grid size={{ xs: 12, lg: 1 }} sx={{ display: 'flex' }}>
            <Card variant="outlined" sx={{ width: '100%', height: '100%' }}>
              <CardContent sx={{ p: 1.5, height: '100%' }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                  Revenue Distribution
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }}>
                  <Stack sx={{ flex: 1, minWidth: 0 }}>
                    <RevenueDonut
                      data={distribution}
                      height={300}
                      showLegend={false}
                      colors={distributionColors}
                    />
                  </Stack>
                  <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                    {sortedDistribution.map((entry) => {
                      const pct = distributionTotal > 0 ? (entry.value / distributionTotal) * 100 : 0;
                      return (
                        <Stack key={entry.label} direction="row" justifyContent="space-between" spacing={1}>
                          <Stack direction="row" spacing={0.75} alignItems="center">
                            <Box
                              sx={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                bgcolor: distributionColorByLabel[entry.label] ?? '#6b7280'
                              }}
                            />
                            <Typography variant="body2" color="text.secondary">
                              {entry.label}
                            </Typography>
                          </Stack>
                          <Typography variant="body2" fontWeight={600}>
                            ${fmt(entry.value)} ({pct.toFixed(1)}%)
                          </Typography>
                        </Stack>
                      );
                    })}
                    <Divider sx={{ my: 0.5 }} />
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="subtitle2" fontWeight={700}>
                        Total
                      </Typography>
                      <Typography variant="subtitle2" fontWeight={700}>
                        ${fmt(distributionTotal)}
                      </Typography>
                    </Stack>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <TimelineIcon fontSize="small" />
                Daily Trend
              </Typography>
              <DailyTrendChart dailyData={chartsData.streams} weeklyData={chartsData.weeklyStreams} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <CalendarViewWeekIcon fontSize="small" />
                Weekday Insights
              </Typography>
              <WeekdayBar data={chartsData.weekdayAverages} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <CalendarMonthIcon fontSize="small" />
                Monthly Insights
              </Typography>
              <MonthlyBar data={chartsData.monthlyAverages} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      </Stack>
    </LoadingEmptyStateWrapper>
  );
};
