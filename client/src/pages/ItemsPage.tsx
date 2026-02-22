import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { useEffect, useState } from 'react';
import { itemsApi } from '../api/itemsApi';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { NoAccess } from '../components/NoAccess';
import { PermissionGate } from '../components/PermissionGate';
import { PageHeader } from '../components/PageHeader';
import { showSnackbar } from '../features/ui/uiSlice';
import { hasPermission } from '../utils/permissions';

type Item = {
  _id: string;
  barcode: string;
  upc: string;
  modifier: string;
  description: string;
  department: string;
  price: number;
  sku: string;
};

export const ItemsPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'items', 'view');
  const canCreate = hasPermission(permissions, 'items', 'create');
  const canEdit = hasPermission(permissions, 'items', 'edit');
  const canDelete = hasPermission(permissions, 'items', 'delete');
  const canImport = hasPermission(permissions, 'items', 'actions:import');

  const [items, setItems] = useState<Item[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ upc: '', modifier: '', description: '', department: '', price: '', sku: '' });

  const load = async () => {
    setError(null);
    try {
      const res = await itemsApi.list();
      setItems(res.data.data);
    } catch (err) {
      setError('Failed to load items');
      console.error(err);
    }
  };

  useEffect(() => {
    if (canView) {
      void load();
    }
  }, [canView]);

  const createItem = async () => {
    if (!form.upc || !form.description || !form.department || !form.price) {
      dispatch(showSnackbar({ message: 'Fill all required fields', severity: 'error' }));
      return;
    }

    await itemsApi.create({
      upc: form.upc,
      modifier: form.modifier,
      description: form.description,
      department: form.department,
      price: Number(form.price),
      sku: form.sku
    });
    setForm({ upc: '', modifier: '', description: '', department: '', price: '', sku: '' });
    dispatch(showSnackbar({ message: 'Item created', severity: 'success' }));
    await load();
  };

  const removeItem = async (id: string) => {
    await itemsApi.remove(id);
    dispatch(showSnackbar({ message: 'Item deleted', severity: 'success' }));
    await load();
  };

  const upload = async () => {
    if (!file) return;
    await itemsApi.importCsv(file);
    setFile(null);
    dispatch(showSnackbar({ message: 'Items CSV imported', severity: 'success' }));
    await load();
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader title="Items" subtitle="Manage catalog and import item files" icon={<Inventory2Icon />} />
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <UploadFileIcon fontSize="small" color="primary" />
          Import Items CSV
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center">
          <PermissionGate module="items" action="actions:import" mode="disable">
            <Button variant="contained" startIcon={<UploadFileIcon />} component="label" disabled={!canImport}>
              Choose CSV
              <input hidden type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Button>
          </PermissionGate>
          <PermissionGate module="items" action="actions:import" mode="disable">
            <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => void upload()} disabled={!file || !canImport}>
              Import
            </Button>
          </PermissionGate>
          {file && <Typography variant="body2">{file.name}</Typography>}
        </Stack>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <AddBoxIcon fontSize="small" color="primary" />
          Create Item
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <TextField
            label="UPC"
            value={form.upc}
            onChange={(e) => setForm((prev) => ({ ...prev, upc: e.target.value }))}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Inventory2Icon fontSize="small" />
                </InputAdornment>
              )
            }}
          />
          <TextField
            label="Modifier"
            value={form.modifier}
            onChange={(e) => setForm((prev) => ({ ...prev, modifier: e.target.value }))}
          />
          <TextField
            label="Description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <TextField
            label="Department"
            value={form.department}
            onChange={(e) => setForm((prev) => ({ ...prev, department: e.target.value }))}
          />
          <TextField label="Price" type="number" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} />
          <TextField label="SKU" value={form.sku} onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))} />
          <PermissionGate module="items" action="create" mode="disable">
            <Button variant="contained" startIcon={<SaveIcon />} onClick={() => void createItem()} disabled={!canCreate}>
              Save
            </Button>
          </PermissionGate>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Items
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Barcode</TableCell>
              <TableCell>Description</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Price</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item._id}>
                <TableCell>{item.barcode}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell>{item.department}</TableCell>
                <TableCell>{item.price.toFixed(2)}</TableCell>
                <TableCell>{item.sku || '-'}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1}>
                    <PermissionGate module="items" action="edit" mode="disable">
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={!canEdit}
                        onClick={() =>
                          void itemsApi.update(item._id, {
                            description: `${item.description} (Updated)`
                          }).then(() => load())
                        }
                      >
                        Quick Edit
                      </Button>
                    </PermissionGate>
                    <PermissionGate module="items" action="delete" mode="disable">
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        startIcon={<DeleteOutlineIcon />}
                        disabled={!canDelete}
                        onClick={() => void removeItem(item._id)}
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
    </Stack>
  );
};
