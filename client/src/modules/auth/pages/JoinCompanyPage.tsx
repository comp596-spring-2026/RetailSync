import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField } from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import { companyJoinSchema } from '@retailsync/shared';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAppDispatch } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { AuthShell } from '../../../components';
import { joinCompanyThunk } from '../../users/state';

type JoinForm = z.infer<typeof companyJoinSchema>;

export const JoinCompanyPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [params] = useSearchParams();
  const defaults = useMemo(
    () => ({
      companyCode: params.get('companyCode') ?? '',
      inviteCode: params.get('inviteCode') ?? '',
      email: params.get('email') ?? ''
    }),
    [params]
  );
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<JoinForm>({
    resolver: zodResolver(companyJoinSchema),
    defaultValues: defaults
  });

  useEffect(() => {
    reset((current) => ({ ...current, ...defaults }));
  }, [defaults, reset]);

  const onSubmit = async (values: JoinForm) => {
    try {
      await dispatch(joinCompanyThunk(values)).unwrap();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      dispatch(showSnackbar({ message: 'Join request failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <AuthShell
      title="Join Company"
      subtitle="Use your company and invite codes to join."
      width={460}
      logoHeight={192}
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
        <TextField label="Company Code" {...register('companyCode')} error={!!errors.companyCode} helperText={errors.companyCode?.message} />
        <TextField label="Invite Code" {...register('inviteCode')} error={!!errors.inviteCode} helperText={errors.inviteCode?.message} />
        <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
        <Button variant="contained" startIcon={<LoginIcon />} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Joining...' : 'Join Company'}
        </Button>
      </Stack>
    </AuthShell>
  );
};
