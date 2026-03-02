import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CalendarViewWeekIcon from '@mui/icons-material/CalendarViewWeek';
import DonutLargeIcon from '@mui/icons-material/DonutLarge';
import EqualizerIcon from '@mui/icons-material/Equalizer';
import TimelineIcon from '@mui/icons-material/Timeline';
import { Card, CardContent, Grid2 as Grid, Stack, Typography } from '@mui/material';
import type { PosState } from '../state';
import { LoadingEmptyStateWrapper } from '../../../components';
import { MonthlyBar } from '../charts/MonthlyBar';
import { MultiStreams } from '../charts/MultiStreams';
import { RevenueDonut } from '../charts/RevenueDonut';
import { StackedComposition } from '../charts/StackedComposition';
import { TotalSalesLine } from '../charts/TotalSalesLine';
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
  creditPercent: number;
  cashPercent: number;
  totalCredit: number;
  totalCash: number;
  totalGas: number;
  totalLottery: number;
};

export const PosAnalyticsViewPage = ({
  loading,
  chartsData,
  primaryAction,
  totalSales,
  avgDailySales,
  creditPercent,
  cashPercent,
  totalCredit,
  totalCash,
  totalGas,
  totalLottery
}: PosAnalyticsViewPageProps) => (
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
      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Total Sales
              </Typography>
              <Typography variant="h6">${fmt(totalSales)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Average Daily Sales
              </Typography>
              <Typography variant="h6">${fmt(avgDailySales)}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Credit Share
              </Typography>
              <Typography variant="h6">{creditPercent.toFixed(1)}%</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="caption" color="text.secondary">
                Cash Share
              </Typography>
              <Typography variant="h6">{cashPercent.toFixed(1)}%</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <TimelineIcon fontSize="small" />
                Total Sales Trend
              </Typography>
              <TotalSalesLine seriesData={chartsData.totalSales} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography
                variant="subtitle1"
                fontWeight={700}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
              >
                <DonutLargeIcon fontSize="small" />
                Revenue Distribution
              </Typography>
              <RevenueDonut
                data={[
                  { label: 'Credit Card', value: totalCredit },
                  { label: 'Cash', value: totalCash },
                  { label: 'Gas', value: totalGas },
                  { label: 'Lottery', value: totalLottery }
                ]}
              />
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
                <EqualizerIcon fontSize="small" />
                Revenue Streams
              </Typography>
              <MultiStreams data={chartsData.streams} />
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
                Daily Composition
              </Typography>
              <StackedComposition data={chartsData.composition} />
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
                <CalendarViewWeekIcon fontSize="small" />
                Weekday Average
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
                Monthly Average
              </Typography>
              <MonthlyBar data={chartsData.monthlyAverages} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  </LoadingEmptyStateWrapper>
);

