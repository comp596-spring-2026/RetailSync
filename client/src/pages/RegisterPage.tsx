import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Stack, TextField } from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { registerSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '../api/authApi';
import { useAppDispatch } from '../app/hooks';
import { showSnackbar } from '../features/ui/uiSlice';
import { AuthShell } from '../components/AuthShell';

type RegisterForm = z.infer<typeof registerSchema>;

export const RegisterPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema)
  });

  const onSubmit = async (values: RegisterForm) => {
    try {
      await authApi.register(values);
      dispatch(showSnackbar({ message: 'Account created. Enter verification OTP to continue.', severity: 'success' }));
      navigate('/verify-email', { replace: true, state: { email: values.email } });
    } catch (error) {
      dispatch(showSnackbar({ message: 'Registration failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <AuthShell
      title="Register"
      subtitle="Create your RetailSync account."
      icon={<PersonAddAlt1Icon color="primary" />}
      width={560}
      logoHeight={126}
      paperPadding={5}
      hideHeader
    >
      <Stack spacing={2} component="form" onSubmit={handleSubmit(onSubmit)}>
        <TextField label="First name" {...register('firstName')} error={!!errors.firstName} helperText={errors.firstName?.message} />
        <TextField label="Last name" {...register('lastName')} error={!!errors.lastName} helperText={errors.lastName?.message} />
        <TextField label="Email" {...register('email')} error={!!errors.email} helperText={errors.email?.message} />
        <TextField label="Password" type="password" {...register('password')} error={!!errors.password} helperText={errors.password?.message} />
        <TextField
          label="Confirm Password"
          type="password"
          {...register('confirmPassword')}
          error={!!errors.confirmPassword}
          helperText={errors.confirmPassword?.message}
        />
        <Button variant="contained" startIcon={<HowToRegIcon />} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Loading...' : 'Create Account'}
        </Button>
        <Button component={Link} to="/login">
          Already have an account? Login
        </Button>
      </Stack>
    </AuthShell>
  );
};
