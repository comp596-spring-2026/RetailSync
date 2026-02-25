import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import GoogleIcon from '@mui/icons-material/Google';
import type { AxiosError } from 'axios';
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
import { AuthShell } from '../components/AuthShell';

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
      const axiosError = error as AxiosError<{ error?: { message?: string } }>;
      const status = axiosError.response?.status;
      const apiMessage = axiosError.response?.data?.error?.message;
      if (status === 403) {
        dispatch(showSnackbar({ message: apiMessage ?? 'Email not verified. Enter OTP to verify.', severity: 'warning' }));
        navigate('/verify-email', { state: { email: values.email } });
        return;
      }
      dispatch(setAuthError('Login failed'));
      dispatch(showSnackbar({ message: apiMessage ?? 'Login failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <AuthShell
      title="Login"
      subtitle="Access your company workspace."
      icon={<LockOpenIcon color="primary" />}
      width={420}
      logoHeight={96}
    >
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
        <Button
          variant="outlined"
          startIcon={<GoogleIcon />}
          onClick={() => {
            const apiBase = import.meta.env.VITE_API_URL;
            const origin = apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase;
            window.location.href = `${origin}/api/auth/google/start`;
          }}
        >
          Continue with Google
        </Button>
        <Button component={Link} to="/forgot-password">
          Forgot password?
        </Button>
        <Button component={Link} to="/register">
          Need an account? Register
        </Button>
      </Stack>
    </AuthShell>
  );
};
