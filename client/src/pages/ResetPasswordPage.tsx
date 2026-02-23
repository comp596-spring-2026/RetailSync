import { Alert, Button, Stack, TextField } from '@mui/material';
import LockResetIcon from '@mui/icons-material/LockReset';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { useAppDispatch } from '../app/hooks';
import { showSnackbar } from '../features/ui/uiSlice';
import { AuthShell } from '../components/AuthShell';

export const ResetPasswordPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryToken = useMemo(() => params.get('token') ?? '', [params]);
  const [token, setToken] = useState(queryToken);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      await authApi.resetPassword({
        token,
        password,
        confirmPassword
      });
      dispatch(showSnackbar({ message: 'Password reset successful', severity: 'success' }));
      navigate('/login', { replace: true });
    } catch {
      dispatch(showSnackbar({ message: 'Password reset failed', severity: 'error' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthShell
      title="Reset Password"
      subtitle="Set your new password."
      icon={<LockResetIcon color="primary" />}
      width={460}
    >
      <Stack spacing={2} component="form" onSubmit={onSubmit}>
        {!token && <Alert severity="info">Enter the 3-3 reset code sent to your email.</Alert>}
        <TextField
          label="Reset Code"
          placeholder="123-456"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="New Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Confirm New Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          fullWidth
        />
        <Button
          variant="contained"
          type="submit"
          disabled={isSubmitting || !/^\d{3}-\d{3}$/.test(token)}
        >
          {isSubmitting ? 'Resetting...' : 'Reset Password'}
        </Button>
        <Button component={Link} to="/login">
          Back to login
        </Button>
      </Stack>
    </AuthShell>
  );
};
