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
import { useEffect, useState } from 'react';
import { rbacApi } from '../api/rbacApi';
import { userApi } from '../api/userApi';
import { useAppDispatch } from '../app/hooks';
import { showSnackbar } from '../features/ui/uiSlice';

type UserItem = {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  roleId: { _id: string; name: string } | null;
};

type RoleItem = {
  _id: string;
  name: string;
};

type InviteItem = {
  _id: string;
  email: string;
  code: string;
  acceptedAt: string | null;
  roleId: { _id: string; name: string } | null;
};

export const UsersPage = () => {
  const dispatch = useAppDispatch();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const loadData = async () => {
    const [usersRes, rolesRes, invitesRes] = await Promise.all([userApi.listUsers(), rbacApi.listRoles(), userApi.listInvites()]);
    setUsers(usersRes.data.data);
    setRoles(rolesRes.data.data);
    setInvites(invitesRes.data.data);
    if (!roleId && rolesRes.data.data[0]) {
      setRoleId(rolesRes.data.data[0]._id);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const sendInvite = async () => {
    if (!email || !roleId) {
      dispatch(showSnackbar({ message: 'Email and role are required', severity: 'error' }));
      return;
    }

    const res = await userApi.createInvite({ email, roleId, expiresInDays: 7 });
    setInviteCode(res.data.data.inviteCode);
    dispatch(showSnackbar({ message: 'Invite created', severity: 'success' }));
    setEmail('');
    await loadData();
  };

  const assignRole = async (userId: string, nextRoleId: string) => {
    await userApi.assignRole(userId, nextRoleId);
    dispatch(showSnackbar({ message: 'Role updated', severity: 'success' }));
    await loadData();
  };

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>
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
          <Button variant="contained" onClick={sendInvite}>
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
        <Typography variant="h6" sx={{ mb: 2 }}>
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
                    onChange={(e) => assignRole(user._id, e.target.value)}
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
        <Typography variant="h6" sx={{ mb: 2 }}>
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
    </Stack>
  );
};
