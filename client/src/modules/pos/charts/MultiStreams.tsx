import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { withCurrencyTooltip } from '../utils/chartTransform';

type MultiStreamsPoint = {
  x: string;
  gas: number;
  lottery: number;
  creditCard: number;
  totalSales: number;
};

type MultiStreamsProps = {
  data: MultiStreamsPoint[];
  height?: number;
};

export const MultiStreams = ({ data, height = 300 }: MultiStreamsProps) => {
  const series = [
    { name: 'Gas', data: data.map((entry) => ({ x: entry.x, y: entry.gas })) },
    { name: 'Lottery', data: data.map((entry) => ({ x: entry.x, y: entry.lottery })) },
    { name: 'Credit Card', data: data.map((entry) => ({ x: entry.x, y: entry.creditCard })) },
    { name: 'Total Sales', data: data.map((entry) => ({ x: entry.x, y: entry.totalSales })) }
  ];

  const options = withCurrencyTooltip({
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
    xaxis: {
      type: 'datetime',
      title: {
        text: 'Date'
      }
    },
    yaxis: {
      title: {
        text: 'Revenue (USD)'
      }
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    colors: ['#ef6c00', '#8e24aa', '#2e7d32', '#1976d2']
  });

  return (
    <Box role="img" aria-label="Revenue streams chart">
      <ReactApexChart type="line" series={series} options={options} height={height} />
    </Box>
  );
};
