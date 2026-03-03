import { Box, Card, CardContent, Grid2 as Grid, Typography } from '@mui/material';

type KpiItem = {
  label: string;
  value: string;
};

type PosKpiStackProps = {
  title?: string;
  items: KpiItem[];
};

export const PosKpiStack = ({ title = 'KPI Overview', items }: PosKpiStackProps) => (
  <Card variant="outlined" sx={{ height: '100%' }}>
    <CardContent sx={{ p: 1.5 }}>
      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Grid container spacing={1}>
        {items.map((item, index) => (
          <Grid key={`${item.label}-${index}`} size={{ xs: 12, sm: 6, md: 4 }}>
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 1.25,
                minHeight: 84,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center'
              }}
            >
              <Typography variant="subtitle2" color="text.secondary" fontWeight={700}>
                {item.label}
              </Typography>
              <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
                {item.value}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>
    </CardContent>
  </Card>
);
