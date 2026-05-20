import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { PermissionsMap, type ProductCapabilityKey } from '@retailsync/shared';
import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import {
  deleteRoleThunk,
  fetchRoles,
  saveRoleThunk,
  selectRbacLoading,
  selectRbacMutating,
  selectRoles
} from '../state';
import { showSnackbar } from '../../../app/store/uiSlice';
import {
  LoadingEmptyStateWrapper,
  NoAccess,
  PageHeader,
  RetailSurfaceCard,
  RetailSurfaceCardBody
} from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import { exceedsActorProductPermissions } from '../../../utils/productPermissions';
import { ROLE_DELEGATION_FORBIDDEN_MESSAGE } from '../components/ProductRolePermissionEditor';
import { extractApiErrorMessage } from '../../../utils/apiError';
import {
  ProductRolePermissionEditor,
  createDefaultCustomRoleProductState,
  permissionsMapToProduct,
  productToPermissionsMap
} from '../components/ProductRolePermissionEditor';

type ProductState = Record<ProductCapabilityKey, boolean>;
type RolesPageProps = {
  showHeader?: boolean;
};

const SYSTEM_ROLE_ORDER = ['Admin', 'Member', 'Viewer'] as const;

export const RolesPage = ({ showHeader = true }: RolesPageProps) => {
  const dispatch = useAppDispatch();
  const permissionsAuth = useAppSelector((state) => state.auth.permissions);
  const canView = hasPermission(permissionsAuth, 'rolesSettings', 'view');
  const canCreate = hasPermission(permissionsAuth, 'rolesSettings', 'create');
  const canEdit = hasPermission(permissionsAuth, 'rolesSettings', 'edit');
  const canDelete = hasPermission(permissionsAuth, 'rolesSettings', 'delete');
  const roles = useAppSelector(selectRoles);
  const loading = useAppSelector(selectRbacLoading);
  const mutating = useAppSelector(selectRbacMutating);
  const [selectedRoleId, setSelectedRoleId] = useState<string>('');
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [name, setName] = useState('');
  const [productPermissions, setProductPermissions] = useState<ProductState>(
    createDefaultCustomRoleProductState()
  );
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const sortedRoles = useMemo(() => {
    const system = roles
      .filter((role) => role.isSystem)
      .sort(
        (left, right) =>
          SYSTEM_ROLE_ORDER.indexOf(left.name as (typeof SYSTEM_ROLE_ORDER)[number]) -
          SYSTEM_ROLE_ORDER.indexOf(right.name as (typeof SYSTEM_ROLE_ORDER)[number])
      );
    const custom = roles
      .filter((role) => !role.isSystem)
      .sort((left, right) => left.name.localeCompare(right.name));
    return [...system, ...custom];
  }, [roles]);

  const selectedRole = useMemo(
    () => roles.find((role) => role._id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );
  const isSystemRole = Boolean(selectedRole?.isSystem);
  const matrixReadOnly = isCreateMode ? !canCreate : isSystemRole || !canEdit;
  const canSave = isCreateMode ? canCreate : Boolean(selectedRole && canEdit && !isSystemRole);
  const canShowDelete = Boolean(selectedRole && !isSystemRole && canDelete && !isCreateMode);

  useEffect(() => {
    if (canView) {
      void dispatch(fetchRoles());
    }
  }, [canView, dispatch]);

  useEffect(() => {
    if (isCreateMode || sortedRoles.length === 0) {
      return;
    }
    if (!selectedRoleId || !sortedRoles.some((role) => role._id === selectedRoleId)) {
      setSelectedRoleId(sortedRoles[0]._id);
    }
  }, [isCreateMode, selectedRoleId, sortedRoles]);

  useEffect(() => {
    if (isCreateMode) {
      setName('');
      setProductPermissions(createDefaultCustomRoleProductState());
      return;
    }

    if (selectedRole) {
      setName(selectedRole.name);
      setProductPermissions(permissionsMapToProduct(selectedRole.permissions));
    }
  }, [isCreateMode, selectedRole]);

  const permissionsForSave = useMemo(
    () => productToPermissionsMap(productPermissions),
    [productPermissions]
  );

  const startCreateMode = () => {
    setIsCreateMode(true);
    setName('');
    setProductPermissions(createDefaultCustomRoleProductState());
  };

  const cancelCreateMode = () => {
    setIsCreateMode(false);
    if (sortedRoles[0]) {
      setSelectedRoleId(sortedRoles[0]._id);
    }
  };

  const saveRole = async () => {
    if (!canSave || (!isCreateMode && isSystemRole)) {
      return;
    }

    if (!name.trim()) {
      dispatch(showSnackbar({ message: 'Role name is required', severity: 'error' }));
      return;
    }

    if (permissionsAuth && exceedsActorProductPermissions(productPermissions, permissionsAuth)) {
      dispatch(showSnackbar({ message: ROLE_DELEGATION_FORBIDDEN_MESSAGE, severity: 'error' }));
      return;
    }

    try {
      if (isCreateMode) {
        const createdRole = await dispatch(
          saveRoleThunk({ name: name.trim(), permissions: permissionsForSave })
        ).unwrap();
        setIsCreateMode(false);
        if (createdRole?._id) {
          setSelectedRoleId(createdRole._id);
        } else if (sortedRoles[0]) {
          setSelectedRoleId(sortedRoles[0]._id);
        }
      } else if (selectedRole) {
        await dispatch(
          saveRoleThunk({
            id: selectedRole._id,
            name: name.trim(),
            permissions: permissionsForSave
          })
        ).unwrap();
      }
    } catch (error) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(error, 'Failed to save role'),
          severity: 'error'
        })
      );
    }
  };

  const removeRole = async () => {
    if (!selectedRole || !canDelete) return;
    try {
      await dispatch(deleteRoleThunk(selectedRole._id)).unwrap();
      setDeleteConfirmOpen(false);
      const remaining = sortedRoles.filter((role) => role._id !== selectedRole._id);
      setSelectedRoleId(remaining[0]?._id ?? '');
    } catch (error) {
      dispatch(
        showSnackbar({
          message: extractApiErrorMessage(error, 'Failed to delete role'),
          severity: 'error'
        })
      );
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      {showHeader ? (
        <PageHeader
          title="Roles & Permissions"
          subtitle="Manage team access using simple product capabilities."
          icon={<AdminPanelSettingsIcon />}
        />
      ) : null}

      <LoadingEmptyStateWrapper loading={loading} empty={false} loadingLabel="Loading roles...">
        <Stack spacing={2}>
          <RetailSurfaceCard data-testid="roles-workspace-card">
            <RetailSurfaceCardBody sx={{ p: 0 }}>
              <Box sx={{ px: { xs: 2, md: 2.5 }, pt: { xs: 2, md: 2.5 }, pb: 2 }}>
              {isCreateMode ? (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ sm: 'center' }}
                  sx={{ width: '100%' }}
                >
                  <TextField
                    data-testid="role-create-name"
                    size="small"
                    label="Role name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && name.trim().length >= 2 && canCreate && !mutating) {
                        event.preventDefault();
                        void saveRole();
                      }
                    }}
                    helperText="At least 2 characters"
                    sx={{ flex: 1, minWidth: 0 }}
                  />
                  <Button
                    data-testid="role-create-submit"
                    variant="contained"
                    color="success"
                    startIcon={mutating ? <CircularProgress size={14} color="inherit" /> : <AddIcon />}
                    onClick={() => void saveRole()}
                    disabled={mutating || name.trim().length < 2}
                    sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    Create role
                  </Button>
                  <Box sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }} />
                  <Button
                    color="inherit"
                    onClick={cancelCreateMode}
                    disabled={mutating}
                    sx={{ flexShrink: 0, ml: { xs: 0, sm: 'auto' } }}
                  >
                    Cancel
                  </Button>
                </Stack>
              ) : (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={2}
                  alignItems={{ sm: 'center' }}
                >
                  <FormControl fullWidth size="small" data-testid="role-select-control" sx={{ flex: 1 }}>
                    <InputLabel id="role-select-label">Role</InputLabel>
                    <Select
                      labelId="role-select-label"
                      label="Role"
                      data-testid="role-select"
                      value={
                        sortedRoles.some((role) => role._id === selectedRoleId) ? selectedRoleId : ''
                      }
                      onChange={(event) => setSelectedRoleId(event.target.value)}
                      renderValue={(value) => {
                        const role = sortedRoles.find((item) => item._id === value);
                        if (!role) return '';
                        return (
                          <Stack direction="row" spacing={1} alignItems="center">
                            <span>{role.name}</span>
                            <Chip
                              size="small"
                              label={role.isSystem ? 'System' : 'Custom'}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </Stack>
                        );
                      }}
                    >
                      {sortedRoles.map((role) => (
                        <MenuItem
                          key={role._id}
                          value={role._id}
                          data-testid={`role-option-${role._id}`}
                        >
                          <Stack direction="row" spacing={1} alignItems="center">
                            <span>{role.name}</span>
                            <Chip
                              size="small"
                              label={role.isSystem ? 'System' : 'Custom'}
                              variant="outlined"
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                          </Stack>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {canCreate ? (
                    <Button
                      data-testid="create-role-btn"
                      variant="contained"
                      color="success"
                      startIcon={<AddIcon />}
                      onClick={startCreateMode}
                      sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                    >
                      New role
                    </Button>
                  ) : null}
                </Stack>
              )}
              </Box>

              {!isCreateMode && !isSystemRole && !canEdit && selectedRole ? (
                <Alert severity="info" sx={{ mx: { xs: 2, md: 2.5 }, mb: 2 }}>
                  You can view this role, but you do not have permission to edit it.
                </Alert>
              ) : null}

              {permissionsAuth ? (
                <>
                  <Divider />
                  <ProductRolePermissionEditor
                    embedded
                    value={productPermissions}
                    actorPermissions={permissionsAuth}
                    readOnly={matrixReadOnly}
                    onChange={setProductPermissions}
                  />
                </>
              ) : null}

              {!isCreateMode && (canSave || canShowDelete) ? (
                <>
                  <Divider />
                  <Stack
                    direction="row"
                    spacing={1}
                    justifyContent="flex-end"
                    flexWrap="wrap"
                    sx={{ px: { xs: 2, md: 2.5 }, py: 2 }}
                  >
                    {canShowDelete ? (
                      <Button
                        data-testid="role-delete-btn"
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteOutlineIcon />}
                        onClick={() => setDeleteConfirmOpen(true)}
                        disabled={mutating}
                      >
                        Delete role
                      </Button>
                    ) : null}
                    {canSave ? (
                      <Button
                        data-testid="role-save-btn"
                        variant="contained"
                        color="success"
                        startIcon={mutating ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
                        onClick={() => void saveRole()}
                        disabled={mutating}
                      >
                        Save changes
                      </Button>
                    ) : null}
                  </Stack>
                </>
              ) : null}
            </RetailSurfaceCardBody>
          </RetailSurfaceCard>
        </Stack>
      </LoadingEmptyStateWrapper>

      <Dialog
        open={deleteConfirmOpen}
        onClose={() => {
          if (!mutating) setDeleteConfirmOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Delete role?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will delete the custom role &quot;{selectedRole?.name}&quot;. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)} color="inherit" disabled={mutating}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            startIcon={mutating ? <CircularProgress size={14} color="inherit" /> : undefined}
            onClick={() => void removeRole()}
            disabled={mutating}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
};
