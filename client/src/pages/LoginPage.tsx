import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import { loginSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '../api/authApi';
import { companyApi } from '../api/companyApi';
import { useAppDispatch } from '../app/hooks';
import { setAccessToken, setAuthContext, setAuthError } from '../features/auth/authSlice';
import { setCompany } from '../features/company/companySlice';
import { showSnackbar } from '../features/ui/uiSlice';

type LoginForm = z.infer<typeof loginSchema>;

export const LoginPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema)
  });

  const onSubmit = async (values: LoginForm) => {
    try {
      const loginRes = await authApi.login(values);
      const accessToken = loginRes.data.data.accessToken as string;
      dispatch(setAccessToken(accessToken));

      const meRes = await authApi.me();
      dispatch(
        setAuthContext({
          user: meRes.data.data.user,
          role: meRes.data.data.role,
          permissions: meRes.data.data.permissions
        })
      );

      if (meRes.data.data.company) {
        dispatch(setCompany(meRes.data.data.company));
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/onboarding', { replace: true });
      }
      dispatch(showSnackbar({ message: 'Login successful', severity: 'success' }));
    } catch (error) {
      dispatch(setAuthError('Login failed'));
      dispatch(showSnackbar({ message: 'Login failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, #ecfeff 0%, #f1f5f9 100%)'
      }}
    >
      <Paper sx={{ width: 420, p: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LockOpenIcon color="primary" />
          Login
        </Typography>
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
          <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
          <TextField
            label="Password"
            type="password"
            {...register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
          />
          <Button variant="contained" startIcon={<LoginIcon />} type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Loading...' : 'Login'}
          </Button>
          <Button component={Link} to="/register">
            Need an account? Register
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
};
