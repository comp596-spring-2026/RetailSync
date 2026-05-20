import { Grid2 as Grid, Typography } from '@mui/material';
import { formatCurrency } from '../formatters';

export type DashboardKpiItem = {
  label: string;
  value: number | null | undefined;
};

export const DashboardKpiGrid = ({ items }: { items: DashboardKpiItem[] }) => (
  <Grid container spacing={1.5}>
    {items.map((item) => (
      <Grid key={item.label} size={{ xs: 6, sm: 4, md: 2 }}>
        <Grid
          sx={{
            border: '1px solid #e2e8f0',
            borderRadius: 2,
            p: 1.5,
            bgcolor: '#fff',
            height: '100%'
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {item.label}
          </Typography>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 0.25 }}>
            {formatCurrency(item.value)}
          </Typography>
        </Grid>
      </Grid>
    ))}
  </Grid>
);
