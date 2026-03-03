import { Box } from '@mui/material';
import { Tab, Tabs } from '@mui/material';
import { useMemo, useState } from 'react';
import ReactApexChart from 'react-apexcharts';
import { withCurrencyTooltip } from '../utils/chartTransform';

type DailyTrendPoint = {
  x: string;
  totalSales: number;
  creditCard: number;
  cash: number;
  gas: number;
  lottery: number;
};

type DailyTrendChartProps = {
  dailyData: DailyTrendPoint[];
  weeklyData: Array<{
    label: string;
    range: string;
    totalSales: number;
    creditCard: number;
    cash: number;
    gas: number;
    lottery: number;
  }>;
  height?: number;
};

type TrendMode = 'daily' | 'weekly';

export const DailyTrendChart = ({ dailyData, weeklyData, height = 390 }: DailyTrendChartProps) => {
  const [mode, setMode] = useState<TrendMode>('daily');

  const ordered = useMemo(
    () =>
      [...dailyData]
        .filter((entry) => Boolean(entry.x))
        .sort((a, b) => new Date(a.x).getTime() - new Date(b.x).getTime()),
    [dailyData]
  );

  const dailySeries = [
    {
      name: 'Total Sales',
      data: ordered
        .map((entry) => ({ x: new Date(entry.x).getTime(), y: entry.totalSales }))
        .filter((entry) => Number.isFinite(entry.x))
    },
    {
      name: 'Credit Card',
      data: ordered
        .map((entry) => ({ x: new Date(entry.x).getTime(), y: entry.creditCard }))
        .filter((entry) => Number.isFinite(entry.x))
    },
    {
      name: 'Cash',
      data: ordered
        .map((entry) => ({ x: new Date(entry.x).getTime(), y: entry.cash }))
        .filter((entry) => Number.isFinite(entry.x))
    },
    {
      name: 'Gas',
      data: ordered
        .map((entry) => ({ x: new Date(entry.x).getTime(), y: entry.gas }))
        .filter((entry) => Number.isFinite(entry.x))
    },
    {
      name: 'Lottery',
      data: ordered
        .map((entry) => ({ x: new Date(entry.x).getTime(), y: entry.lottery }))
        .filter((entry) => Number.isFinite(entry.x))
    }
  ];

  const weeklyCategories = weeklyData.map((entry) => entry.label);
  const weeklyRangeByLabel = weeklyData.reduce<Record<string, string>>((acc, entry) => {
    acc[entry.label] = entry.range;
    return acc;
  }, {});
  const weeklySeries = [
    { name: 'Total Sales', data: weeklyData.map((entry) => entry.totalSales) },
    { name: 'Credit Card', data: weeklyData.map((entry) => entry.creditCard) },
    { name: 'Cash', data: weeklyData.map((entry) => entry.cash) },
    { name: 'Gas', data: weeklyData.map((entry) => entry.gas) },
    { name: 'Lottery', data: weeklyData.map((entry) => entry.lottery) }
  ];

  const commonChartOptions = {
    chart: {
      type: 'line',
      toolbar: {
        show: true,
        tools: {
          download: true,
          selection: false,
          zoom: false,
          zoomin: false,
          zoomout: false,
          pan: false,
          reset: false
        }
      },
      zoom: { enabled: false }
    },
    yaxis: {
      title: {
        text: 'Amount (USD)'
      },
      labels: {
        formatter: (value: number) => Math.round(value).toLocaleString('en-US')
      }
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    colors: ['#1976d2', '#2e7d32', '#6d4c41', '#ef6c00', '#8e24aa']
  };

  const dailyOptions = withCurrencyTooltip({
    ...commonChartOptions,
    xaxis: {
      type: 'datetime',
      title: {
        text: 'Date'
      }
    },
    tooltip: {
      x: {
        formatter: (value: string | number) => {
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return String(value);
          return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
        }
      }
    }
  });

  const weeklyOptions = withCurrencyTooltip({
    ...commonChartOptions,
    xaxis: {
      type: 'category',
      categories: weeklyCategories,
      title: {
        text: 'ISO Week (Mon-Sun)'
      }
    },
    tooltip: {
      x: {
        formatter: (
          value: string | number,
          opts?: { dataPointIndex?: number }
        ) => {
          const index = typeof opts?.dataPointIndex === 'number' ? opts.dataPointIndex : -1;
          const labelFromIndex =
            index >= 0 && index < weeklyCategories.length ? weeklyCategories[index] : null;
          const rawLabel = String(value);
          const label =
            (rawLabel && weeklyRangeByLabel[rawLabel] ? rawLabel : null) ??
            labelFromIndex ??
            rawLabel;
          const range = weeklyRangeByLabel[label];
          return range ? `${label} (${range})` : label;
        }
      }
    }
  });

  return (
    <Box role="img" aria-label="Daily trend multi-series chart">
      <Tabs
        value={mode}
        onChange={(_event, next: TrendMode) => setMode(next)}
        aria-label="Daily trend mode tabs"
        sx={{ mb: 1 }}
      >
        <Tab label="Daily" value="daily" />
        <Tab label="Weekly" value="weekly" />
      </Tabs>
      <ReactApexChart
        key={`daily-trend-${mode}`}
        type="line"
        series={mode === 'weekly' ? weeklySeries : dailySeries}
        options={mode === 'weekly' ? weeklyOptions : dailyOptions}
        height={height}
      />
    </Box>
  );
};
