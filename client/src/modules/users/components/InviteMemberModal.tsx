import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import type { RoleItem } from '../../rbac/state/rbacSlice';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type InviteMemberModalProps = {
  open: boolean;
  roles: RoleItem[];
  mutating: boolean;
  onClose: () => void;
  onSubmit: (payload: { email: string; roleId: string }) => Promise<void>;
};

export const InviteMemberModal = ({ open, roles, mutating, onClose, onSubmit }: InviteMemberModalProps) => {
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setRoleId('');
      setEmailError(null);
      setRoleError(null);
      return;
    }
    if (!roleId && roles[0]) {
      setRoleId(roles[0]._id);
    }
  }, [open, roleId, roles]);

  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = useMemo(
    () => Boolean(normalizedEmail && EMAIL_PATTERN.test(normalizedEmail) && roleId),
    [normalizedEmail, roleId]
  );

  const handleSubmit = async () => {
    const nextEmailError = !normalizedEmail
      ? 'Email is required'
      : !EMAIL_PATTERN.test(normalizedEmail)
        ? 'Enter a valid email address'
        : null;
    const nextRoleError = !roleId ? 'Role is required' : null;
    setEmailError(nextEmailError);
    setRoleError(nextRoleError);
    if (nextEmailError || nextRoleError) return;

    await onSubmit({ email: normalizedEmail, roleId });
  };

  return (
    <Dialog open={open} onClose={mutating ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Invite Member</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setEmailError(null);
            }}
            error={Boolean(emailError)}
            helperText={emailError}
            autoFocus
            fullWidth
          />
          <Select
            value={roleId}
            onChange={(e) => {
              setRoleId(e.target.value);
              setRoleError(null);
            }}
            displayEmpty
            fullWidth
            error={Boolean(roleError)}
          >
            {roles.map((role) => (
              <MenuItem key={role._id} value={role._id}>
                {role.name}
              </MenuItem>
            ))}
          </Select>
          {roleError ? (
            <span style={{ color: '#d32f2f', fontSize: 12 }}>{roleError}</span>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutating}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={!canSubmit || mutating}
          startIcon={mutating ? <CircularProgress size={14} color="inherit" /> : undefined}
          onClick={() => void handleSubmit()}
        >
          Send Invite
        </Button>
      </DialogActions>
    </Dialog>
  );
};
