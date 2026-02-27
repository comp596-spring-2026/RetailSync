import { Card, CardContent, Chip, Grid2 as Grid, Stack, Typography } from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ApartmentIcon from '@mui/icons-material/Apartment';
import BadgeIcon from '@mui/icons-material/Badge';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { useAppSelector } from '../../app/store/hooks';
import { PageHeader } from '../../components';

export const DashboardHomePage = () => {
  const user = useAppSelector((state) => state.auth.user);
  const company = useAppSelector((state) => state.company.company);
  const role = useAppSelector((state) => state.auth.role);

  return (
    <Stack spacing={2.5}>
      <PageHeader title="Dashboard" subtitle="Your current account context" icon={<DashboardIcon />} />
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <PersonOutlineIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2">User</Typography>
              </Stack>
              <Typography>{user ? `${user.firstName} ${user.lastName}` : '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <ApartmentIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2">Company</Typography>
              </Stack>
              <Typography>{company?.name ?? '-'}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card>
            <CardContent>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <BadgeIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2">Role</Typography>
              </Stack>
              <Chip label={role?.name ?? '-'} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
};
