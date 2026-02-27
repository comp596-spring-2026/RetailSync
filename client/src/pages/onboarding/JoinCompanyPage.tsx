import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField } from '@mui/material';
import Groups2Icon from '@mui/icons-material/Groups2';
import LoginIcon from '@mui/icons-material/Login';
import { companyJoinSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { companyApi } from '../../api';
import { useAppDispatch } from '../../app/store/hooks';
import { fetchMeAndSync } from '../../app/auth/fetchMeAndSync';
import { showSnackbar } from '../../slices/ui/uiSlice';
import { AuthShell } from '../../components';

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
      await fetchMeAndSync(dispatch);
      dispatch(showSnackbar({ message: 'Joined company', severity: 'success' }));
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
      icon={<Groups2Icon color="primary" />}
      width={460}
      logoHeight={96}
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
