import {
  Box,
  Button,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import GroupIcon from '@mui/icons-material/Group';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import BadgeIcon from '@mui/icons-material/Badge';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import {
  assignRoleThunk,
  createInviteThunk,
  fetchUsersPageData,
  selectInviteCode,
  selectInvites,
  selectUsers,
  selectUsersLoading,
  selectUsersMutating
} from '../state';
import { selectRoles } from '../../rbac/state';

export const UsersPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissions, 'users', 'view');
  const users = useAppSelector(selectUsers);
  const roles = useAppSelector(selectRoles);
  const invites = useAppSelector(selectInvites);
  const inviteCode = useAppSelector(selectInviteCode);
  const loading = useAppSelector(selectUsersLoading);
  const mutating = useAppSelector(selectUsersMutating);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');

  useEffect(() => {
    if (canView) {
      void dispatch(fetchUsersPageData());
    }
  }, [canView, dispatch]);

  useEffect(() => {
    if (!roleId && roles[0]) {
      setRoleId(roles[0]._id);
    }
  }, [roleId, roles]);

  const sendInvite = async () => {
    if (!email || !roleId) {
      dispatch(showSnackbar({ message: 'Email and role are required', severity: 'error' }));
      return;
    }

    await dispatch(createInviteThunk({ email, roleId, expiresInDays: 7 })).unwrap();
    setEmail('');
  };

  const assignRole = async (userId: string, nextRoleId: string) => {
    await dispatch(assignRoleThunk({ userId, roleId: nextRoleId })).unwrap();
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader title="Users" subtitle="Invite users and manage assigned roles" icon={<GroupIcon />} />
      <LoadingEmptyStateWrapper loading={loading} empty={false} loadingLabel="Loading users and invites...">
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonAddIcon fontSize="small" color="primary" />
          Invite Member
        </Typography>
        <Stack direction="row" spacing={2}>
          <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} sx={{ minWidth: 260 }} />
          <Select value={roleId} onChange={(e) => setRoleId(e.target.value)} sx={{ minWidth: 220 }}>
            {roles.map((role) => (
              <MenuItem key={role._id} value={role._id}>
                {role.name}
              </MenuItem>
            ))}
          </Select>
          <Button variant="contained" startIcon={<MailOutlineIcon />} onClick={() => void sendInvite()} disabled={mutating}>
            Send Invite
          </Button>
        </Stack>
        {inviteCode && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">Invite code: {inviteCode}</Typography>
          </Box>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <GroupIcon fontSize="small" color="primary" />
          Members
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Assign Role</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>{`${user.firstName} ${user.lastName}`}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.roleId?.name ?? '-'}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={user.roleId?._id ?? ''}
                    onChange={(e) => void assignRole(user._id, e.target.value)}
                    disabled={mutating}
                    sx={{ minWidth: 180 }}
                  >
                    {roles.map((role) => (
                      <MenuItem key={role._id} value={role._id}>
                        {role.name}
                      </MenuItem>
                    ))}
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <BadgeIcon fontSize="small" color="primary" />
          Invites
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Code</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {invites.map((invite) => (
              <TableRow key={invite._id}>
                <TableCell>{invite.email}</TableCell>
                <TableCell>{invite.roleId?.name ?? '-'}</TableCell>
                <TableCell>{invite.code}</TableCell>
                <TableCell>{invite.acceptedAt ? 'Accepted' : 'Pending'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};
