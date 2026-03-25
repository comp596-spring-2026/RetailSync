import {
  Alert,
  Button,
  InputAdornment,
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
import AddLocationIcon from '@mui/icons-material/AddLocation';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { PermissionGate } from '../../../app/guards';
import { LoadingEmptyStateWrapper, NoAccess, PageHeader } from '../../../components';
import { hasPermission } from '../../../utils/permissions';
import {
  createLocationThunk,
  deleteLocationThunk,
  fetchLocations,
  selectLocations,
  selectLocationsError,
  selectLocationsLoading,
  selectLocationsMutating,
  updateLocationThunk,
  type LocationItem
} from '../state';

export const LocationsPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'locations', 'view');
  const canCreate = hasPermission(permissions, 'locations', 'create');
  const canEdit = hasPermission(permissions, 'locations', 'edit');
  const canDelete = hasPermission(permissions, 'locations', 'delete');

  const items = useAppSelector(selectLocations);
  const error = useAppSelector(selectLocationsError);
  const loading = useAppSelector(selectLocationsLoading);
  const mutating = useAppSelector(selectLocationsMutating);
  const [form, setForm] = useState<{ code: string; type: LocationItem['type']; label: string }>({
    code: '',
    type: 'shelf',
    label: ''
  });

  useEffect(() => {
    if (canView) {
      void dispatch(fetchLocations());
    }
  }, [canView, dispatch]);

  const createLocation = async () => {
    await dispatch(createLocationThunk(form)).unwrap();
    setForm({ code: '', type: 'shelf', label: '' });
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader title="Locations" subtitle="Maintain shelves, coolers, and storage areas" icon={<WarehouseIcon />} />
      {error && <Alert severity="error">{error}</Alert>}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddLocationIcon fontSize="small" color="primary" />
          Create Location
        </Typography>
        <Stack direction="row" spacing={2}>
          <TextField
            label="Code"
            value={form.code}
            onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <WarehouseIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />
          <Select value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as LocationItem['type'] }))}>
            <MenuItem value="shelf">Shelf</MenuItem>
            <MenuItem value="fridge">Fridge</MenuItem>
            <MenuItem value="freezer">Freezer</MenuItem>
            <MenuItem value="backroom">Backroom</MenuItem>
          </Select>
          <TextField label="Label" value={form.label} onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))} />
          <PermissionGate module="locations" action="create" mode="disable">
            <Button variant="contained" startIcon={<SaveIcon />} disabled={!canCreate || mutating} onClick={() => void createLocation()}>
              Save
            </Button>
          </PermissionGate>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <LoadingEmptyStateWrapper
        loading={loading}
        empty={!loading && items.length === 0}
        loadingLabel="Loading locations..."
        emptyMessage="No locations yet"
        emptySecondary="Create a location above to get started."
      >
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Locations
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Code</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Label</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((row) => (
              <TableRow key={row._id}>
                <TableCell>{row.code}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.label}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <PermissionGate module="locations" action="edit" mode="disable">
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={!canEdit || mutating}
                        onClick={() =>
                          void dispatch(updateLocationThunk({ id: row._id, payload: { label: `${row.label} (Updated)` } }))
                        }
                      >
                        Quick Edit
                      </Button>
                    </PermissionGate>
                    <PermissionGate module="locations" action="delete" mode="disable">
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        startIcon={<DeleteOutlineIcon />}
                        disabled={!canDelete || mutating}
                        onClick={() => void dispatch(deleteLocationThunk(row._id))}
                      >
                        Delete
                      </Button>
                    </PermissionGate>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      </LoadingEmptyStateWrapper>
    </Stack>
  );
};
