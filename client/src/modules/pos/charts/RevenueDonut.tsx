import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { currency } from '../utils/chartTransform';

type RevenueDonutProps = {
  data: Array<{ label: string; value: number }>;
  height?: number;
};

export const RevenueDonut = ({ data, height = 300 }: RevenueDonutProps) => {
  const labels = data.map((entry) => entry.label);
  const series = data.map((entry) => Number(entry.value ?? 0));

  const options = {
    chart: {
      type: 'donut',
      toolbar: { show: false }
    },
    labels,
    legend: {
      position: 'bottom'
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
