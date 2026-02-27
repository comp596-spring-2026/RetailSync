import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useState } from 'react';
import { useAppDispatch } from '../../app/store/hooks';
import { importItems } from '../../slices/items/itemsSlice';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
};

export const ImportItemsModal = ({ open, onClose, onImported }: Props) => {
  const dispatch = useAppDispatch();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (f: File | null) => {
    setFile(f);
    if (!f) {
      setPreview(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const firstLines = text.split('\n').slice(0, 5).join('\n');
      setPreview(firstLines);
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    try {
      await dispatch(importItems(file)).unwrap();
      await onImported();
      onClose();
      setFile(null);
      setPreview(null);
    } catch {
      // Error feedback handled via snackbar in thunk
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import Items</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            component="label"
          >
            Choose CSV / Excel
            <input
              hidden
              type="file"
              accept=".csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
          </Button>
          {file && (
            <Typography variant="body2" color="text.secondary">
              Selected: {file.name}
            </Typography>
          )}
          {preview && (
            <Typography
              component="pre"
              variant="body2"
              sx={{
                p: 1,
                borderRadius: 1,
                bgcolor: 'action.hover',
                fontFamily: 'monospace',
                fontSize: 12,
                maxHeight: 160,
                overflow: 'auto'
              }}
            >
              {preview}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={() => void handleImport()}
          disabled={!file || loading}
        >
          {loading ? 'Importing…' : 'Import'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

