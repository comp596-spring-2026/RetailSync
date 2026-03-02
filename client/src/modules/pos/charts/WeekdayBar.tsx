import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { withCurrencyTooltip } from '../utils/chartTransform';

type WeekdayBarProps = {
  data: Array<{ day: string; totalSales: number }>;
  height?: number;
};

export const WeekdayBar = ({ data, height = 260 }: WeekdayBarProps) => {
  const series = [
    {
      name: 'Average Sales',
      data: data.map((entry) => entry.totalSales)
    }
  ];

  const options = withCurrencyTooltip({
    chart: {
      type: 'bar',
      toolbar: { show: false }
    },
    xaxis: {
      categories: data.map((entry) => entry.day)
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '52%'
      }
    },
    colors: ['#1565c0']
  });

  return (
    <Box role="img" aria-label="Weekday average sales chart">
      <ReactApexChart type="bar" series={series} options={options} height={height} />
    </Box>
  );
};
