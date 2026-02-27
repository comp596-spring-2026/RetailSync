import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import Inventory2Icon from '@mui/icons-material/Inventory2';
import { useEffect, useRef, useState } from 'react';
import { itemsApi } from '../../api';

type ItemSummary = {
  _id: string;
  barcode: string;
  description: string;
  department?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export const BarcodeSearchModal = ({ open, onClose }: Props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [barcode, setBarcode] = useState('');
  const [loading, setLoading] = useState(false);
  const [item, setItem] = useState<ItemSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      setBarcode('');
      setItem(null);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    let timer: number | undefined;
    if (open && error) {
      timer = window.setTimeout(() => {
        setError(null);
        onClose();
      }, 3000);
    }
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [open, error, onClose]);

  const playErrorSound = () => {
    const audio = new Audio('/sounds/error-beep.mp3');
    void audio.play().catch(() => {});
  };

  const handleSearch = async () => {
    if (!barcode.trim()) return;
    setLoading(true);
    setItem(null);
    setError(null);
    try {
      const res = await itemsApi.list(barcode.trim());
      const found = (res.data.data?.[0] ?? null) as ItemSummary | null;
      if (!found) {
        setError('No item found for this barcode.');
        playErrorSound();
        return;
      }
      setItem(found);
    } catch {
      setError('Failed to search by barcode.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleSearch();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Scan / Search Barcode</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            inputRef={inputRef}
            label="Barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={handleKeyDown}
            InputProps={{
              startAdornment: (
                <SearchIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
              )
            }}
            autoFocus
          />
          <Button
            variant="contained"
            startIcon={<SearchIcon />}
            onClick={() => void handleSearch()}
            disabled={loading}
          >
            {loading ? 'Searching…' : 'Search'}
          </Button>

          {item && (
            <Stack
              direction="row"
              spacing={1.5}
              alignItems="center"
              sx={{
                p: 1.5,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
                mt: 1
              }}
            >
              <Inventory2Icon color="primary" />
              <Stack spacing={0.25}>
                <Typography variant="subtitle1">{item.description}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Barcode: {item.barcode}
                </Typography>
                {item.department && (
                  <Typography variant="body2" color="text.secondary">
                    Department: {item.department}
                  </Typography>
                )}
              </Stack>
            </Stack>
          )}

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};

