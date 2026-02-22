import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import Groups2Icon from '@mui/icons-material/Groups2';
import LoginIcon from '@mui/icons-material/Login';
import { companyJoinSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '../api/authApi';
import { companyApi } from '../api/companyApi';
import { useAppDispatch } from '../app/hooks';
import { setAuthContext } from '../features/auth/authSlice';
import { setCompany } from '../features/company/companySlice';
import { showSnackbar } from '../features/ui/uiSlice';

type JoinForm = z.infer<typeof companyJoinSchema>;

export const JoinCompanyPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<JoinForm>({ resolver: zodResolver(companyJoinSchema) });

  const onSubmit = async (values: JoinForm) => {
    try {
      await companyApi.join(values);
      const meRes = await authApi.me();
      dispatch(setAuthContext({ user: meRes.data.data.user, role: meRes.data.data.role, permissions: meRes.data.data.permissions }));
      dispatch(setCompany(meRes.data.data.company));
      dispatch(showSnackbar({ message: 'Joined company', severity: 'success' }));
      navigate('/dashboard', { replace: true });
    } catch (error) {
      dispatch(showSnackbar({ message: 'Join request failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, #fffbeb 0%, #f1f5f9 100%)'
      }}
    >
      <Paper sx={{ width: 460, p: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Groups2Icon color="primary" />
          Join Company
        </Typography>
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
          <TextField label="Company Code" {...register('companyCode')} error={!!errors.companyCode} helperText={errors.companyCode?.message} />
          <TextField label="Invite Code" {...register('inviteCode')} error={!!errors.inviteCode} helperText={errors.inviteCode?.message} />
          <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
          <Button variant="contained" startIcon={<LoginIcon />} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Joining...' : 'Join Company'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};
