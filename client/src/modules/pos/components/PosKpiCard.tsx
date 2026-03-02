import { Box, Card, CardContent, Stack, Typography } from '@mui/material';
import ReactApexChart from 'react-apexcharts';
import { currency } from '../utils/chartTransform';

type PosKpiCardProps = {
  title: string;
  value: number;
  subtitle?: string;
  icon?: React.ReactNode;
  sparkline?: Array<{ x: string; y: number }>;
};

export const PosKpiCard = ({ title, value, subtitle, icon, sparkline = [] }: PosKpiCardProps) => {
  const sparklineSeries = [{ name: title, data: sparkline.map((entry) => ({ x: entry.x, y: entry.y })) }];

  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="caption" color="text.secondary">
              {title}
            </Typography>
            {icon ? <Box sx={{ color: 'text.secondary', display: 'inline-flex' }}>{icon}</Box> : null}
          </Stack>
          <Typography variant="h6" fontWeight={700}>
            {currency.format(value)}
          </Typography>
          {subtitle ? (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          ) : null}
          {sparkline.length > 0 ? (
            <Box role="img" aria-label={`${title} sparkline`}>
              <ReactApexChart
                type="line"
                series={sparklineSeries}
                options={{
                  chart: { sparkline: { enabled: true }, toolbar: { show: false } },
                  stroke: { curve: 'smooth', width: 2 },
                  tooltip: {
                    y: {
                      formatter: (entry: number) => currency.format(Number(entry ?? 0))
                    }
                  },
                  colors: ['#1976d2']
                }}
                height={72}
              />
            </Box>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
};
