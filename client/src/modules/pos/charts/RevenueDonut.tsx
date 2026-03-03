import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { currency } from '../utils/chartTransform';

type RevenueDonutProps = {
  data: Array<{ label: string; value: number }>;
  height?: number;
  showLegend?: boolean;
  colors?: string[];
};

export const RevenueDonut = ({ data, height = 300, showLegend = true, colors }: RevenueDonutProps) => {
  const labels = data.map((entry) => entry.label);
  const series = data.map((entry) => Number(entry.value ?? 0));
  const total = series.reduce((sum, value) => sum + value, 0);

  const options = {
    chart: {
      type: 'donut',
      toolbar: { show: false }
    },
    labels,
    colors,
    legend: {
      show: showLegend,
      position: 'bottom',
      formatter: (seriesName: string, opts: { seriesIndex: number; w: { globals: { series: number[] } } }) => {
        const value = Number(opts?.w?.globals?.series?.[opts.seriesIndex] ?? 0);
        const percent = total > 0 ? (value / total) * 100 : 0;
        return `${seriesName}: ${currency.format(value)} (${percent.toFixed(1)}%)`;
      }
    },
    plotOptions: {
      pie: {
        donut: {
          labels: {
            show: true,
            total: {
              show: true,
              label: 'Total',
              formatter: () => currency.format(total)
            },
            value: {
              formatter: (value: string) => currency.format(Number(value ?? 0))
            }
          }
        }
      }
    },
    tooltip: {
      y: {
        formatter: (value: number) => currency.format(Number(value ?? 0))
      }
    },
    dataLabels: {
      enabled: true,
      formatter: (value: number) => `${value.toFixed(1)}%`
    }
  };

  return (
    <Box role="img" aria-label="Revenue distribution donut chart">
      <ReactApexChart type="donut" series={series as any} options={options as any} height={height} />
    </Box>
  );
};
