import { Button, Stack, TextField } from '@mui/material';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useAppDispatch } from '../app/hooks';
import { showSnackbar } from '../features/ui/uiSlice';
import { AuthShell } from '../components/AuthShell';

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      const res = await authApi.forgotPassword({ email: email.trim() });
      const data = (res.data as { data?: { message?: string; emailDebug?: string } }).data;
      if (data?.emailDebug) {
        dispatch(showSnackbar({ message: 'Email delivery failed. Please verify Resend domain/sender.', severity: 'error' }));
        return;
      }
      dispatch(showSnackbar({ message: data?.message ?? 'If your email exists, a reset code was sent.', severity: 'success' }));
      navigate('/reset-password', { replace: true });
    } catch {
      dispatch(showSnackbar({ message: 'Failed to generate reset code', severity: 'error' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Forgot Password"
      subtitle="Enter your account email to generate a password reset code."
      icon={<KeyOutlinedIcon color="primary" />}
      width={460}
    >
      <Stack spacing={2} component="form" onSubmit={onSubmit}>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
        />
        <Button variant="contained" startIcon={<SendOutlinedIcon />} type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Generating...' : 'Generate Reset Code'}
        </Button>
        <Button component={Link} to="/login">
          Back to login
        </Button>
      </Stack>
    </AuthShell>
  );
};
