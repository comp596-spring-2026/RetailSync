import { Box } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { toLineSeries, withCurrencyTooltip, type ApexPoint } from '../utils/chartTransform';

type TotalSalesLineProps = {
  seriesData: ApexPoint[];
  height?: number;
};

export const TotalSalesLine = ({ seriesData, height = 280 }: TotalSalesLineProps) => {
  const series = toLineSeries('Total Sales', seriesData);
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
        text: 'Total Sales (USD)'
      },
      labels: {
        formatter: (value: number) => `$${Math.round(value).toLocaleString('en-US')}`
      }
    },
    colors: ['#1976d2']
  });

  return (
    <Box role="img" aria-label="Total sales trend chart">
      <ReactApexChart type="line" series={series as any} options={options as any} height={height} />
    </Box>
  );
};
