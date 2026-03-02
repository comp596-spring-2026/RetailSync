import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { withCurrencyTooltip } from '../utils/chartTransform';

type CompositionPoint = {
  x: string;
  gas: number;
  lottery: number;
  other: number;
};

type StackedCompositionProps = {
  data: CompositionPoint[];
  height?: number;
};

export const StackedComposition = ({ data, height = 300 }: StackedCompositionProps) => {
  const series = [
    { name: 'Gas', data: data.map((entry) => ({ x: entry.x, y: entry.gas })) },
    { name: 'Lottery', data: data.map((entry) => ({ x: entry.x, y: entry.lottery })) },
    { name: 'Other', data: data.map((entry) => ({ x: entry.x, y: entry.other })) }
  ];

  const options = withCurrencyTooltip({
    chart: {
      type: 'bar',
      stacked: true,
      toolbar: { show: false }
    },
    xaxis: {
      type: 'datetime'
    },
    plotOptions: {
      bar: {
        columnWidth: '45%'
      }
    },
    colors: ['#ef6c00', '#8e24aa', '#90caf9']
  });

  return (
    <Box role="img" aria-label="Daily composition chart">
      <ReactApexChart type="bar" series={series} options={options} height={height} />
    </Box>
  );
};
