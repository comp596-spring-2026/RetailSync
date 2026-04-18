import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField, Typography } from '@mui/material';
import { useForm } from 'react-hook-form';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthShell } from '../../../components';
import { useAsyncAction } from '../../../hooks/useAsyncAction';
import { authApi } from '../api';

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email')
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { loading, runAction } = useAsyncAction();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: params.get('email') ?? '' }
  });

  const onSubmit = async (values: ForgotPasswordForm) => {
    await runAction(
      async () => {
        await authApi.forgotPassword(values);
        navigate(`/login?reason=password-reset-sent&email=${encodeURIComponent(values.email)}`, { replace: true });
      },
      { errorMessage: 'Could not send password reset email' }
    );
  };

  return (
    <AuthShell
      title="Forgot password"
      subtitle="We will send a password reset link to your inbox."
      width={460}
      logoHeight={184}
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
        <TextField label="Email" type="email" autoComplete="email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
        <Button variant="contained" type="submit" disabled={isSubmitting || loading}>
          {isSubmitting || loading ? 'Sending...' : 'Send reset email'}
        </Button>
        <Button component={RouterLink} to="/login" variant="text">
          Back to sign in
        </Button>
      </Stack>
    </AuthShell>
  );
};
