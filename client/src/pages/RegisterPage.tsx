import { zodResolver } from '@hookform/resolvers/zod';
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { registerSchema } from '@retailsync/shared';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { authApi } from '../api/authApi';
import { useAppDispatch } from '../app/hooks';
import { setAccessToken } from '../features/auth/authSlice';
import { showSnackbar } from '../features/ui/uiSlice';

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
      const res = await authApi.register(values);
      dispatch(setAccessToken(res.data.data.accessToken));
      dispatch(showSnackbar({ message: 'Account created', severity: 'success' }));
      navigate('/onboarding', { replace: true });
    } catch (error) {
      dispatch(showSnackbar({ message: 'Registration failed', severity: 'error' }));
      console.error(error);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(180deg, #fffbeb 0%, #f1f5f9 100%)'
      }}
    >
      <Paper sx={{ width: 460, p: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonAddAlt1Icon color="primary" />
          Register
        </Typography>
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
      </Paper>
    </Box>
  );
};
