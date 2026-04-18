import {
  Chip,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField
} from '@mui/material';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TuneIcon from '@mui/icons-material/Tune';
import { ModuleKey, PermissionsMap, moduleActionCatalog, moduleKeys } from '@retailsync/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import {
  deleteRoleThunk,
  fetchRoles,
  saveRoleThunk,
  selectRbacLoading,
  selectRbacModules,
  selectRbacMutating,
  selectRoles
} from '../state';
import { showSnackbar } from '../../../app/store/uiSlice';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import { modulePresentation, navVisibleRoleModules } from '../modulePresentation';

type LocalPermission = PermissionsMap;
type RolesPageProps = {
  showHeader?: boolean;
};

const emptyPermissions = (): LocalPermission =>
  moduleKeys.reduce((acc, module) => {
    acc[module] = { view: true, create: false, edit: false, delete: false, actions: [] };
    return acc;
  }, {} as LocalPermission);

export const RolesPage = ({ showHeader = true }: RolesPageProps) => {
  const dispatch = useAppDispatch();
  const permissionsAuth = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissionsAuth, 'rolesSettings', 'view');
  const roles = useAppSelector(selectRoles);
  const reduxModules = useAppSelector(selectRbacModules);
  const loading = useAppSelector(selectRbacLoading);
  const mutating = useAppSelector(selectRbacMutating);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('new');
  const [name, setName] = useState('');
  const [permissions, setPermissions] = useState<LocalPermission>(emptyPermissions());
  const [actionsModule, setActionsModule] = useState<ModuleKey | null>(null);

  const selectedRole = useMemo(() => roles.find((r) => r._id === selectedRoleId) ?? null, [roles, selectedRoleId]);
  const availableActions = actionsModule ? moduleActionCatalog[actionsModule] ?? [] : [];
  const visibleModules = useMemo(
    () => (reduxModules.length > 0 ? reduxModules : moduleKeys).filter((module) => navVisibleRoleModules.includes(module)),
    [reduxModules]
  );

  useEffect(() => {
    if (canView) {
      void dispatch(fetchRoles());
    }
  }, [canView, dispatch]);

  useEffect(() => {
    const sourceModules = visibleModules;
    setPermissions((prev) => {
      const next = {} as LocalPermission;
      sourceModules.forEach((module) => {
        next[module] = prev[module] ?? { view: true, create: false, edit: false, delete: false, actions: [] };
      });
      return next;
    });
  }, [visibleModules]);

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

  const updateViewScope = (module: ModuleKey, checked: boolean) => {
    updatePermissionField(module, 'view', checked);
  };

  const updateActions = (module: ModuleKey, nextActions: string[]) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        actions: nextActions
      }
    }));
  };

  const toggleAction = (module: ModuleKey, action: string, checked: boolean) => {
    const current = permissions[module]?.actions ?? [];
    const nextActions = checked
      ? Array.from(new Set([...current, action]))
      : current.filter((item) => item !== action);
    updateActions(module, nextActions);
  };

  const saveRole = async () => {
    if (!name.trim()) {
      dispatch(showSnackbar({ message: 'Role name is required', severity: 'error' }));
      return;
    }

    if (selectedRole) {
      await dispatch(saveRoleThunk({ id: selectedRole._id, name, permissions })).unwrap();
    } else {
      await dispatch(saveRoleThunk({ name, permissions })).unwrap();
    }
  };

  const removeRole = async () => {
    if (!selectedRole) return;
    await dispatch(deleteRoleThunk(selectedRole._id)).unwrap();
    setSelectedRoleId('new');
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      {showHeader ? (
        <PageHeader
          title="Roles & Permissions"
          subtitle="Define module-level access rules for each role"
          icon={<AdminPanelSettingsIcon />}
        />
      ) : null}
      <LoadingEmptyStateWrapper loading={loading} empty={false} loadingLabel="Loading roles...">
    <Paper sx={{ p: 3 }}>
      <Stack spacing={2} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        <Select size="small" value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)}>
          <MenuItem value="new">Create New Role</MenuItem>
          {roles.map((role) => (
            <MenuItem key={role._id} value={role._id}>{`${role.name}${role.isSystem ? ' (system)' : ''}`}</MenuItem>
          ))}
        </Select>
        <TextField size="small" label="Role Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void saveRole()} disabled={mutating}>
          Save
        </Button>
        {selectedRole && (
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            onClick={() => void removeRole()}
            disabled={selectedRole.isSystem || mutating}
          >
            Delete
          </Button>
        )}
      </Stack>
      </Stack>
      <Divider sx={{ mb: 2 }} />
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Module</TableCell>
              <TableCell>Pages</TableCell>
              <TableCell>View</TableCell>
              <TableCell>Create</TableCell>
              <TableCell>Edit</TableCell>
              <TableCell>Delete</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleModules.map((module) => (
              <TableRow key={module}>
                <TableCell>
                  <Stack spacing={0.5}>
                    <Box component="span" sx={{ fontWeight: 700 }}>
                      {modulePresentation[module]?.label ?? module}
                    </Box>
                    <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}>
                      {module}
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell sx={{ minWidth: 220 }}>
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    {(modulePresentation[module]?.surfaces ?? []).map((surface) => (
                      <Chip key={`${module}-${surface}`} size="small" label={surface} variant="outlined" />
                    ))}
                  </Stack>
                </TableCell>
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
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<TuneIcon />}
                      onClick={() => setActionsModule(module)}
                    >
                      {permissions[module]?.actions.length ? 'Configure' : 'Open'}
                    </Button>
                    {(permissions[module]?.actions ?? []).length > 0 ? (
                      (permissions[module]?.actions ?? []).map((action) => (
                        <Chip key={`${module}-${action}`} size="small" label={action} />
                      ))
                    ) : (
                      <Box component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>
                        No actions selected
                      </Box>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Paper>
      </LoadingEmptyStateWrapper>
      <Dialog open={Boolean(actionsModule)} onClose={() => setActionsModule(null)} fullWidth maxWidth="xs">
        <DialogTitle>
          {actionsModule ? modulePresentation[actionsModule]?.label ?? actionsModule : 'Module access'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <DialogContentText sx={{ m: 0 }}>
              This workspace maps to the surfaces below. View access controls everything listed for this module.
            </DialogContentText>

            {actionsModule ? (
              <Stack spacing={1}>
                <Box sx={{ fontWeight: 700 }}>Pages</Box>
                <FormGroup>
                  {(modulePresentation[actionsModule]?.surfaces ?? []).map((surface) => (
                    <FormControlLabel
                      key={`${actionsModule}-surface-${surface}`}
                      control={
                        <Checkbox
                          checked={permissions[actionsModule]?.view ?? false}
                          onChange={(e) => updateViewScope(actionsModule, e.target.checked)}
                        />
                      }
                      label={surface}
                    />
                  ))}
                </FormGroup>
              </Stack>
            ) : null}

            {actionsModule ? (
              <Stack spacing={1}>
                <Box sx={{ fontWeight: 700 }}>Base permissions</Box>
                <FormGroup>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={permissions[actionsModule]?.view ?? false}
                        onChange={(e) => updatePermissionField(actionsModule, 'view', e.target.checked)}
                      />
                    }
                    label="View"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={permissions[actionsModule]?.create ?? false}
                        onChange={(e) => updatePermissionField(actionsModule, 'create', e.target.checked)}
                      />
                    }
                    label="Create"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={permissions[actionsModule]?.edit ?? false}
                        onChange={(e) => updatePermissionField(actionsModule, 'edit', e.target.checked)}
                      />
                    }
                    label="Edit"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={permissions[actionsModule]?.delete ?? false}
                        onChange={(e) => updatePermissionField(actionsModule, 'delete', e.target.checked)}
                      />
                    }
                    label="Delete"
                  />
                </FormGroup>
              </Stack>
            ) : null}

            <Stack spacing={1}>
              <Box sx={{ fontWeight: 700 }}>Actions</Box>
              {actionsModule && availableActions.length > 0 ? (
                <FormGroup>
                  {availableActions.map((action) => (
                    <FormControlLabel
                      key={`${actionsModule}-${action}`}
                      control={
                        <Checkbox
                          checked={permissions[actionsModule]?.actions.includes(action) ?? false}
                          onChange={(e) => toggleAction(actionsModule, action, e.target.checked)}
                        />
                      }
                      label={action}
                    />
                  ))}
                </FormGroup>
              ) : (
                <Box sx={{ color: 'text.secondary' }}>No custom actions are available for this module.</Box>
              )}
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          {actionsModule ? (
            <Button onClick={() => updateActions(actionsModule, [])} color="inherit">
              Clear
            </Button>
          ) : null}
          <Button onClick={() => setActionsModule(null)} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
