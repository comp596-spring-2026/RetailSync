import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  Stack,
  TextField
} from '@mui/material';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import SaveIcon from '@mui/icons-material/Save';
import { useState } from 'react';
import { useAppDispatch } from '../../app/store/hooks';
import { showSnackbar } from '../../slices/ui/uiSlice';
import { createItemThunk } from '../../slices/items/itemsSlice';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

export const CreateItemModal = ({ open, onClose, onCreated }: Props) => {
  const dispatch = useAppDispatch();
  const [form, setForm] = useState({
    upc: '',
    modifier: '',
    description: '',
    department: '',
    price: '',
    sku: ''
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!form.upc || !form.description || !form.department || !form.price) {
      dispatch(showSnackbar({ message: 'Fill all required fields', severity: 'error' }));
      return;
    }

    setLoading(true);
    try {
      await dispatch(
        createItemThunk({
          upc: form.upc,
          modifier: form.modifier,
          description: form.description,
          department: form.department,
          price: Number(form.price),
          sku: form.sku
        })
      ).unwrap();
      await onCreated();
      onClose();
      setForm({ upc: '', modifier: '', description: '', department: '', price: '', sku: '' });
    } catch {
      // Error feedback handled via snackbar in thunk
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Create Item</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={() => void handleSubmit()}
          disabled={loading}
        >
          {loading ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

