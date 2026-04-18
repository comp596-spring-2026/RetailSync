import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Divider, Link as MuiLink, Stack, TextField, Typography } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { fetchMeAndSync } from '../../../app/auth/fetchMeAndSync';
import { useAppDispatch } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { authApi, type AuthSessionResponse } from '../api';
import { setAccessToken } from '../state';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required')
});

type LoginForm = z.infer<typeof loginSchema>;

const resolveGoogleOrigin = () => {
  const apiBase = import.meta.env.VITE_API_URL ?? '';
  if (!apiBase) return '';
  return apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase.replace(/\/api$/, '');
};

const reasonMessages: Record<string, string> = {
  unauthorized: 'Your session expired. Sign in again to continue.',
  'password-reset-sent': 'If the email exists, a password reset link has been sent.',
  'password-reset-complete': 'Your password was updated. Sign in with the new password.',
  'verification-required': 'Please verify your email before signing in.',
  verified: 'Your email was verified. You can sign in now.',
  'verification-sent': 'A verification link has been sent to your inbox.'
};

export const LoginPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loading, runAction } = useAsyncAction();
  const reason = params.get('reason') ?? '';
  const email = params.get('email') ?? '';

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: useMemo(() => ({ email, password: '' }), [email])
  });

  useEffect(() => {
    reset((current) => ({ ...current, email: email || current.email }));
  }, [email, reset]);

  const onSubmit = async (values: LoginForm) => {
    await runAction(
      async () => {
        const response = await authApi.login(values);
        const data = response.data.data as AuthSessionResponse;

        if (!data.accessToken) {
          dispatch(
            showSnackbar({
              message: data.message ?? 'Please verify your email before signing in.',
              severity: 'info'
            })
          );
          navigate(`/verify-email?email=${encodeURIComponent(values.email)}&reason=verification-required`, { replace: true });
          return;
        }

        dispatch(setAccessToken(data.accessToken));
        const meData = await fetchMeAndSync(dispatch);
        navigate(meData.company ? '/dashboard' : '/onboarding', { replace: true });
      },
      { errorMessage: 'Could not sign in' }
    );
  };

  return (
    <AuthShell
      title="Sign in"
      width={460}
      logoHeight={184}
      hideHeader
    >
      <Stack spacing={2.25}>
        {reason && reasonMessages[reason] && <Alert severity="info">{reasonMessages[reason]}</Alert>}
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={!!errors.email}
            helperText={errors.email?.message}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
          />
          <Button variant="contained" type="submit" disabled={isSubmitting || loading}>
            {isSubmitting || loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </Stack>

        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <MuiLink component={RouterLink} to="/register" underline="hover" variant="body2">
            Create an account
          </MuiLink>
          <MuiLink component={RouterLink} to="/forgot-password" underline="hover" variant="body2">
            Forgot password?
          </MuiLink>
          <MuiLink component={RouterLink} to="/verify-email" underline="hover" variant="body2">
            Verify email
          </MuiLink>
        </Stack>

        <Divider sx={{ my: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            or
          </Typography>
        </Divider>

        <Button
          variant="outlined"
          startIcon={<GoogleIcon />}
          onClick={() => {
            const origin = resolveGoogleOrigin();
            window.location.href = `${origin}/api/auth/google/start`;
          }}
        >
          Continue with Google
        </Button>
      </Stack>
    </AuthShell>
  );
};
