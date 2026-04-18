import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { authApi, type AuthSessionResponse } from '../api';
import { finalizeAuthSession } from './authSession';
import { useAppDispatch } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';

const verifyEmailRequestSchema = z.object({
  email: z.string().trim().email('Enter a valid email')
});

type VerifyEmailRequestForm = z.infer<typeof verifyEmailRequestSchema>;

export const VerifyEmailPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? params.get('verificationToken') ?? '';
  const emailFromQuery = params.get('email') ?? '';
  const reason = params.get('reason');
  const [status, setStatus] = useState<'idle' | 'confirming' | 'confirmed' | 'request-sent' | 'error'>('idle');
  const hasConfirmedToken = useRef(false);
  const { loading, runAction } = useAsyncAction();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<VerifyEmailRequestForm>({
    resolver: zodResolver(verifyEmailRequestSchema),
    defaultValues: { email: emailFromQuery }
  });

  useEffect(() => {
    if (!token || hasConfirmedToken.current) return;

    hasConfirmedToken.current = true;
    setStatus('confirming');

    void runAction(
      async () => {
        const response = await authApi.confirmEmailVerification({ token });
        const data = response.data.data as AuthSessionResponse;

        if (data.accessToken) {
          await finalizeAuthSession(dispatch, navigate, data.accessToken);
          return;
        }

        setStatus('confirmed');
        dispatch(
          showSnackbar({
            message: data.message ?? 'Email verified. You can sign in now.',
            severity: 'success'
          })
        );
        navigate(`/login?reason=verified${emailFromQuery ? `&email=${encodeURIComponent(emailFromQuery)}` : ''}`, { replace: true });
      },
      { errorMessage: 'Could not verify email' }
    ).catch(() => {
      setStatus('error');
    });
  }, [dispatch, emailFromQuery, navigate, runAction, token]);

  const onRequestVerification = async (values: VerifyEmailRequestForm) => {
    await runAction(
      async () => {
        await authApi.requestEmailVerification(values);
        setStatus('request-sent');
        dispatch(showSnackbar({ message: 'Verification email sent', severity: 'success' }));
        navigate(`/login?reason=verification-sent&email=${encodeURIComponent(values.email)}`, { replace: true });
      },
      { errorMessage: 'Could not send verification email' }
    );
  };

  return (
    <AuthShell
      title="Verify email"
      subtitle="Confirm your inbox or request a fresh verification link."
      width={480}
      logoHeight={184}
    >
      {reason === 'verification-sent' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Verification email sent. Check your inbox first. If it does not arrive, you can resend it below.
        </Alert>
      )}
      {reason === 'verified' && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Your email has been verified. Sign in to continue.
        </Alert>
      )}
      {status === 'error' && (
        <Alert severity="error" sx={{ mb: 2 }}>
          We could not verify that link. Request a new verification email below.
        </Alert>
      )}
      {!token ? (
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onRequestVerification)}>
          <Typography variant="body2" color="text.secondary">
            Enter the email address used to create your account and we will send a verification link.
          </Typography>
          <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
          <Button variant="contained" type="submit" disabled={isSubmitting || loading}>
            {isSubmitting || loading ? 'Sending...' : reason === 'verification-sent' ? 'Resend verification email' : 'Send verification email'}
          </Button>
          <Button component={RouterLink} to="/login" variant="text">
            Back to sign in
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {status === 'confirming' ? 'Verifying your email address...' : 'This link will confirm your email address.'}
          </Typography>
          <Button component={RouterLink} to="/login" variant="text">
            Go to sign in
          </Button>
        </Stack>
      )}
    </AuthShell>
  );
};
