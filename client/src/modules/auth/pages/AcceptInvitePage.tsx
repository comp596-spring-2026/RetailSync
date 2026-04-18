import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { authApi, type AuthSessionResponse } from '../api';
import { finalizeAuthSession } from './authSession';
import { useAppDispatch } from '../../../app/store/hooks';

const acceptInviteSchema = z
  .object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Confirm your password')
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword']
  });

type AcceptInviteForm = z.infer<typeof acceptInviteSchema>;

type InviteDetails = {
  email: string;
  inviteCode: string;
  company: { _id: string; name: string; code: string };
  role: { _id: string; name: string };
  expiresAt: string;
};

export const AcceptInvitePage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loading, runAction } = useAsyncAction();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);

  const email = params.get('email') ?? '';
  const inviteCode = params.get('inviteCode') ?? '';

  const defaults = useMemo(() => ({ firstName: '', lastName: '', password: '', confirmPassword: '' }), []);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<AcceptInviteForm>({
    resolver: zodResolver(acceptInviteSchema),
    defaultValues: defaults
  });

  useEffect(() => {
    if (!email || !inviteCode) {
      setLoadError('This invite link is incomplete. Ask your admin to send a new one.');
      return;
    }

    let cancelled = false;
    setLoadingInvite(true);

    void authApi
      .getInvite({ email, inviteCode })
      .then((response) => {
        if (cancelled) return;
        setInvite(response.data.data as InviteDetails);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          typeof error === 'object' && error && 'response' in error
            ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'This invite link is no longer valid.')
            : 'This invite link is no longer valid.';
        setLoadError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingInvite(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [email, inviteCode]);

  const onSubmit = async (values: AcceptInviteForm) => {
    if (!email || !inviteCode) return;

    await runAction(
      async () => {
        const response = await authApi.acceptInvite({
          firstName: values.firstName,
          lastName: values.lastName,
          email,
          inviteCode,
          password: values.password
        });
        const data = response.data.data as AuthSessionResponse;
        if (!data.accessToken) {
          throw new Error('Invite acceptance did not return a session');
        }
        await finalizeAuthSession(dispatch, navigate, data.accessToken);
      },
      { errorMessage: 'Could not activate invite' }
    );
  };

  return (
    <AuthShell
      title="Activate invite"
      subtitle="Set your password to join the invited company."
      width={500}
      logoHeight={184}
    >
      <Stack spacing={2.25}>
        {loadError && <Alert severity="error">{loadError}</Alert>}
        {invite && (
          <Stack spacing={0.75}>
            <Typography variant="subtitle2">{invite.company.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              Joining as {invite.role.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {invite.email}
            </Typography>
          </Stack>
        )}
        <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="First name" fullWidth {...register('firstName')} error={!!errors.firstName} helperText={errors.firstName?.message} />
            <TextField label="Last name" fullWidth {...register('lastName')} error={!!errors.lastName} helperText={errors.lastName?.message} />
          </Stack>
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            error={!!errors.password}
            helperText={errors.password?.message}
            disabled={!invite}
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            {...register('confirmPassword')}
            error={!!errors.confirmPassword}
            helperText={errors.confirmPassword?.message}
            disabled={!invite}
          />
          <Button variant="contained" type="submit" disabled={isSubmitting || loading || loadingInvite || !invite}>
            {isSubmitting || loading ? 'Activating...' : loadingInvite ? 'Loading invite...' : 'Set password and continue'}
          </Button>
          <Button component={RouterLink} to="/login" variant="text">
            Back to sign in
          </Button>
        </Stack>
      </Stack>
    </AuthShell>
  );
};
