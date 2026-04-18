import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Link as MuiLink, Stack, TextField } from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAppDispatch } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { authApi } from '../api';
import { finalizeAuthSession } from './authSession';
import { clearRegistrationCompanyDraft } from './registrationDraft';

const registerSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    email: z.string().trim().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Confirm your password')
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type RegisterForm = z.infer<typeof registerSchema>;

const resolveGoogleOrigin = () => {
  const apiBase = import.meta.env.VITE_API_URL ?? '';
  if (!apiBase) return '';
  return apiBase.endsWith('/api') ? apiBase.slice(0, -4) : apiBase.replace(/\/api$/, '');
};

export const RegisterPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loading, runAction } = useAsyncAction();

  const queryDefaults = useMemo(
    () => ({
      firstName: params.get('firstName') ?? '',
      lastName: params.get('lastName') ?? '',
      email: params.get('email') ?? ''
    }),
    [params]
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { ...queryDefaults, password: '', confirmPassword: '' }
  });

  useEffect(() => {
    clearRegistrationCompanyDraft();
    reset((current) => ({
      ...current,
      ...queryDefaults
    }));
  }, [queryDefaults, reset]);

  const onSubmit = async (values: RegisterForm) => {
    await runAction(
      async () => {
        clearRegistrationCompanyDraft();

        const response = await authApi.register({
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password
        });
        const data = response.data.data as { accessToken?: string; email?: string; message?: string };

        if (data.accessToken) {
          await finalizeAuthSession(dispatch, navigate, data.accessToken);
          return;
        }

        dispatch(
          showSnackbar({
            message: data.message ?? 'Check your email to verify your account',
            severity: 'info'
          })
        );
        const email = encodeURIComponent(data.email ?? values.email);
        navigate(`/verify-email?email=${email}&reason=verification-sent`, { replace: true });
      },
      { errorMessage: 'Registration failed' }
    );
  };

  return (
    <AuthShell
      title="Create account"
      subtitle="Create your user account first. Company setup happens after you sign in."
      width={520}
      logoHeight={184}
    >
      <Stack spacing={2.25} component="form" onSubmit={handleSubmit(onSubmit)}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField label="First name" fullWidth {...register('firstName')} error={!!errors.firstName} helperText={errors.firstName?.message} />
          <TextField label="Last name" fullWidth {...register('lastName')} error={!!errors.lastName} helperText={errors.lastName?.message} />
        </Stack>
        <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
          error={!!errors.password}
          helperText={errors.password?.message}
        />
        <TextField
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          {...register('confirmPassword')}
          error={!!errors.confirmPassword}
          helperText={errors.confirmPassword?.message}
        />
        <Button variant="contained" type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Creating account...' : 'Create account'}
        </Button>
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
        <Stack direction="row" justifyContent="space-between" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <MuiLink component={RouterLink} to="/login" underline="hover" variant="body2">
            Already have an account?
          </MuiLink>
          <MuiLink component={RouterLink} to="/verify-email" underline="hover" variant="body2">
            Verify email
          </MuiLink>
        </Stack>
      </Stack>
    </AuthShell>
  );
};
