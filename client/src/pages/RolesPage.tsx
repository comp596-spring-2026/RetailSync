import {
  Box,
  Button,
  Checkbox,
  Divider,
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
import { ModuleKey, PermissionsMap, moduleKeys } from '@retailsync/shared';
import { useEffect, useMemo, useState } from 'react';
import { rbacApi } from '../api/rbacApi';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { setRoles } from '../features/rbac/rbacSlice';
import { showSnackbar } from '../features/ui/uiSlice';

type LocalPermission = PermissionsMap;

const emptyPermissions = (): LocalPermission =>
  moduleKeys.reduce((acc, module) => {
    acc[module] = { view: true, create: false, edit: false, delete: false, actions: [] };
    return acc;
  }, {} as LocalPermission);

export const RolesPage = () => {
  const dispatch = useAppDispatch();
  const roles = useAppSelector((state) => state.rbac.roles);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('new');
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<LocalPermission>(emptyPermissions());

  const selectedRole = useMemo(() => roles.find((r) => r._id === selectedRoleId) ?? null, [roles, selectedRoleId]);

  const loadRoles = async () => {
    const [modulesRes, rolesRes] = await Promise.all([rbacApi.modules(), rbacApi.listRoles()]);
    dispatch(setRoles(rolesRes.data.data));
    const modules = modulesRes.data.data.modules as ModuleKey[];
    const built = modules.reduce((acc, module) => {
      acc[module] = { view: true, create: false, edit: false, delete: false, actions: [] };
      return acc;
    }, {} as LocalPermission);
    setPermissions(built);
  };

  useEffect(() => {
    void loadRoles();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      setName(selectedRole.name);
      setPermissions(selectedRole.permissions);
    } else {
      setName('');
      setPermissions(emptyPermissions());
    }
  }, [selectedRole]);

  const updatePermissionField = (module: ModuleKey, field: 'view' | 'create' | 'edit' | 'delete', checked: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [field]: checked
      }
    }));
  };

  const updateActions = (module: ModuleKey, actionsCsv: string) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        actions: actionsCsv
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      }
    }));
  };

  const saveRole = async () => {
    if (!name.trim()) {
      dispatch(showSnackbar({ message: 'Role name is required', severity: 'error' }));
      return;
    }

    if (selectedRole) {
      await rbacApi.updateRole(selectedRole._id, { name, permissions });
      dispatch(showSnackbar({ message: 'Role updated', severity: 'success' }));
    } else {
      await rbacApi.createRole({ name, permissions });
      dispatch(showSnackbar({ message: 'Role created', severity: 'success' }));
    }

    await loadRoles();
  };

  const removeRole = async () => {
    if (!selectedRole) return;
    await rbacApi.deleteRole(selectedRole._id);
    dispatch(showSnackbar({ message: 'Role deleted', severity: 'success' }));
    setSelectedRoleId('new');
    await loadRoles();
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Roles & Permissions</Typography>
        <Select size="small" value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
          <MenuItem value="new">Create New Role</MenuItem>
          {roles.map((role) => (
            <MenuItem key={role._id} value={role._id}>{`${role.name}${role.isSystem ? ' (system)' : ''}`}</MenuItem>
          ))}
        </Select>
        <TextField size="small" label="Role Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="contained" onClick={saveRole}>
          Save
        </Button>
        {selectedRole && (
          <Button variant="outlined" color="error" onClick={removeRole} disabled={selectedRole.isSystem}>
            Delete
          </Button>
        )}
      </Stack>
      <Divider sx={{ mb: 2 }} />
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Module</TableCell>
              <TableCell>View</TableCell>
              <TableCell>Create</TableCell>
              <TableCell>Edit</TableCell>
              <TableCell>Delete</TableCell>
              <TableCell>Actions (comma-separated)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {moduleKeys.map((module) => (
              <TableRow key={module}>
                <TableCell>{module}</TableCell>
                <TableCell>
                  <Checkbox
                    checked={permissions[module]?.view ?? false}
                    onChange={(e) => updatePermissionField(module, 'view', e.target.checked)}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={permissions[module]?.create ?? false}
                    onChange={(e) => updatePermissionField(module, 'create', e.target.checked)}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={permissions[module]?.edit ?? false}
                    onChange={(e) => updatePermissionField(module, 'edit', e.target.checked)}
                  />
                </TableCell>
                <TableCell>
                  <Checkbox
                    checked={permissions[module]?.delete ?? false}
                    onChange={(e) => updatePermissionField(module, 'delete', e.target.checked)}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={permissions[module]?.actions.join(',') ?? ''}
                    onChange={(e) => updateActions(module, e.target.value)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
};
