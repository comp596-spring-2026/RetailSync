import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { withCurrencyTooltip } from '../utils/chartTransform';

type MonthlyBarProps = {
  data: Array<{ month: string; totalSales: number }>;
  height?: number;
};

const monthLabel = (month: string) => {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return month;
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

export const MonthlyBar = ({ data, height = 260 }: MonthlyBarProps) => {
  const series = [
    {
      name: 'Average Sales',
      data: data.map((entry) => entry.totalSales)
    }
  ];

  const options = withCurrencyTooltip({
    chart: {
      type: 'bar',
      toolbar: { show: true }
    },
    xaxis: {
      categories: data.map((entry) => monthLabel(entry.month)),
      title: {
        text: 'Month'
      }
    },
    yaxis: {
      title: {
        text: 'Average Sales (USD)'
      }
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '58%'
      }
    },
    colors: ['#2e7d32']
  });

  return (
    <Box role="img" aria-label="Monthly average sales chart">
      <ReactApexChart type="bar" series={series} options={options} height={height} />
    </Box>
  );
};
