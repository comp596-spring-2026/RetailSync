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
  TextField,
  Typography
} from '@mui/material';
import { useEffect, useState } from 'react';
import type { RoleItem } from '../../rbac/state/rbacSlice';
import type { MemberUser } from '../utils/memberAccess';

type EditMemberModalProps = {
  open: boolean;
  member: MemberUser | null;
  roles: RoleItem[];
  canEditName: boolean;
  canAssignRole: boolean;
  mutating: boolean;
  onClose: () => void;
  onSave: (payload: { userId: string; firstName: string; lastName: string; roleId?: string }) => Promise<void>;
};

export const EditMemberModal = ({
  open,
  member,
  roles,
  canEditName,
  canAssignRole,
  mutating,
  onClose,
  onSave
}: EditMemberModalProps) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [roleId, setRoleId] = useState('');

  useEffect(() => {
    if (!member) return;
    setFirstName(member.firstName);
    setLastName(member.lastName);
    setRoleId(member.roleId?._id ?? '');
  }, [member]);

  if (!member) return null;

  const handleSave = async () => {
    const nextFirst = canEditName ? firstName.trim() : member.firstName;
    const nextLast = canEditName ? lastName.trim() : member.lastName;
    if (canEditName && (!nextFirst || !nextLast)) return;
    if (!canEditName && !canAssignRole) return;

    await onSave({
      userId: member._id,
      firstName: nextFirst,
      lastName: nextLast,
      roleId: canAssignRole && roleId !== member.roleId?._id ? roleId : undefined
    });
  };

  return (
    <Dialog open={open} onClose={mutating ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Member</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {member.email}
          </Typography>
          {canEditName ? (
            <>
              <TextField label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} fullWidth />
              <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} fullWidth />
            </>
          ) : null}
          {canAssignRole ? (
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} fullWidth>
              {roles.map((role) => (
                <MenuItem key={role._id} value={role._id}>
                  {role.name}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <Typography variant="body2" color="text.secondary">
              You do not have permission to change this member&apos;s role.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutating}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={mutating || !firstName.trim() || !lastName.trim()}
          startIcon={mutating ? <CircularProgress size={14} color="inherit" /> : undefined}
          onClick={() => void handleSave()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};
