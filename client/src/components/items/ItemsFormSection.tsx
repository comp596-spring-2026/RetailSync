import {
  Button,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SaveIcon from '@mui/icons-material/Save';
import { useState } from 'react';
import { itemsApi } from '../../api';
import { useAppDispatch, useAppSelector } from '../../app/store/hooks';
import { PermissionGate } from '../../app/guards';
import { hasPermission } from '../../utils/permissions';
import { showSnackbar } from '../../slices/ui/uiSlice';

type Props = {
  onCreated: () => Promise<void> | void;
};

export const ItemsFormSection = ({ onCreated }: Props) => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canCreate = hasPermission(permissions, 'items', 'create');

  const [form, setForm] = useState({
    upc: '',
    modifier: '',
    description: '',
    department: '',
    price: '',
    sku: ''
  });

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
    await onCreated();
  };

  return (
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
        <TextField
          label="Price"
          type="number"
          value={form.price}
          onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
        />
        <TextField
          label="SKU"
          value={form.sku}
          onChange={(e) => setForm((prev) => ({ ...prev, sku: e.target.value }))}
        />
        <PermissionGate module="items" action="create" mode="disable">
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={() => void createItem()}
            disabled={!canCreate}
          >
            Save
          </Button>
        </PermissionGate>
      </Stack>
    </Paper>
  );
};

