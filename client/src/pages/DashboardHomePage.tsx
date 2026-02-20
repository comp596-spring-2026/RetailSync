import { Card, CardContent, Grid2 as Grid, Typography } from '@mui/material';
import { useAppSelector } from '../app/hooks';

export const DashboardHomePage = () => {
  const user = useAppSelector((state) => state.auth.user);
  const company = useAppSelector((state) => state.company.company);
  const role = useAppSelector((state) => state.auth.role);

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2">User</Typography>
            <Typography>{user ? `${user.firstName} ${user.lastName}` : '-'}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2">Company</Typography>
            <Typography>{company?.name ?? '-'}</Typography>
          </CardContent>
        </Card>
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
        <Card>
          <CardContent>
            <Typography variant="subtitle2">Role</Typography>
            <Typography>{role?.name ?? '-'}</Typography>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
};
