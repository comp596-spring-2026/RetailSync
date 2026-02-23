import { Alert, Button, Stack, TextField } from '@mui/material';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useAppDispatch } from '../app/hooks';
import { showSnackbar } from '../features/ui/uiSlice';
import { AuthShell } from '../components/AuthShell';

export const VerifyEmailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [email, setEmail] = useState(String((location.state as { email?: string } | null)?.email ?? ''));
  const [token, setToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      await authApi.verifyEmail({ token });
      dispatch(showSnackbar({ message: 'Email verified successfully', severity: 'success' }));
      navigate('/login', { replace: true });
    } catch {
      dispatch(showSnackbar({ message: 'Verification code is invalid or expired', severity: 'error' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onResend = async () => {
    if (!email.trim()) {
      dispatch(showSnackbar({ message: 'Enter email to resend code', severity: 'error' }));
      return;
    }
    try {
      setIsResending(true);
      await authApi.resendVerification({ email: email.trim() });
      dispatch(showSnackbar({ message: 'Verification OTP sent', severity: 'success' }));
    } catch {
      dispatch(showSnackbar({ message: 'Failed to resend verification OTP', severity: 'error' }));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <AuthShell
      title="Verify Email"
      subtitle="Enter the verification code from your email."
      icon={<MarkEmailReadOutlinedIcon color="primary" />}
      width={460}
    >
      <Stack spacing={2} component="form" onSubmit={onSubmit}>
        <Alert severity="info">Enter the OTP code from your email. No verification URL is required.</Alert>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Verification Code"
          placeholder="123-456"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          fullWidth
        />
        <Button
          variant="contained"
          type="submit"
          disabled={isSubmitting || !/^\d{3}-\d{3}$/.test(token)}
        >
          {isSubmitting ? 'Verifying...' : 'Verify Email'}
        </Button>
        <Button
          variant="outlined"
          startIcon={<SendOutlinedIcon />}
          onClick={onResend}
          disabled={isResending}
        >
          {isResending ? 'Sending...' : 'Resend OTP'}
        </Button>
        <Button component={Link} to="/login">
          Back to login
        </Button>
      </Stack>
    </AuthShell>
  );
};
