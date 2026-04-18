import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Stack, TextField } from '@mui/material';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { authApi } from '../api';
import { finalizeAuthSession } from './authSession';
import { useAppDispatch } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Confirm your password')
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export const ResetPasswordPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? params.get('resetToken') ?? '';
  const email = params.get('email') ?? '';
  const { loading, runAction } = useAsyncAction();
  const {
    register,
    watch,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', confirmPassword: '' }
  });
  const tokenValue = watch('token');

  useEffect(() => {
    reset((current) => ({ ...current, token: token || current.token }));
  }, [reset, token]);

  const onSubmit = async (values: ResetPasswordForm) => {
    await runAction(
      async () => {
        const response = await authApi.resetPassword({ token: values.token, password: values.password });
        const data = response.data.data as { accessToken?: string; message?: string };

        if (data.accessToken) {
          await finalizeAuthSession(dispatch, navigate, data.accessToken);
          return;
        }

        dispatch(showSnackbar({ message: data.message ?? 'Password updated', severity: 'success' }));
        const emailQuery = email ? `&email=${encodeURIComponent(email)}` : '';
        navigate(`/login?reason=password-reset-complete${emailQuery}`, { replace: true });
      },
      { errorMessage: 'Could not reset password' }
    );
  };

  return (
    <AuthShell
      title="Reset password"
      subtitle="Choose a new password for your RetailSync account."
      width={480}
      logoHeight={184}
    >
      {!token && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Open this page from the password reset link in your email, or request a new reset link first.
        </Alert>
      )}
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
        <TextField
          label="Reset token"
          {...register('token')}
          error={!!errors.token}
          helperText={errors.token?.message}
          disabled={Boolean(token)}
        />
        <TextField
          label="New password"
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
        <Button variant="contained" type="submit" disabled={isSubmitting || loading || !tokenValue?.trim()}>
          {isSubmitting || loading ? 'Saving...' : 'Update password'}
        </Button>
        <Button component={RouterLink} to="/forgot-password" variant="text">
          Need a new reset link?
        </Button>
      </Stack>
    </AuthShell>
  );
};
