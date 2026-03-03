import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  LinearProgress,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { accountingApi } from '../api';

type UploadStatementDialogProps = {
  open: boolean;
  onClose: () => void;
  onUploaded: () => Promise<void>;
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

export const UploadStatementDialog = ({ open, onClose, onUploaded }: UploadStatementDialogProps) => {
  const [statementMonth, setStatementMonth] = useState(currentMonth());
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatementMonth(currentMonth());
    setFile(null);
    setUploadProgress(0);
    setUploading(false);
  }, [open]);

  const uploadDisabled = useMemo(() => {
    if (uploading) return true;
    if (!file) return true;
    if (!statementMonth) return true;
    return false;
  }, [file, statementMonth, uploading]);

  const submit = async () => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const signed = await accountingApi.requestUploadUrl({
        fileName: file.name,
        statementMonth,
        contentType: 'application/pdf'
      });

      const payload = signed.data.data;

      await axios.put(payload.uploadUrl, file, {
        headers: {
          'Content-Type': 'application/pdf'
        },
        onUploadProgress: (event) => {
          if (!event.total) return;
          const percent = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(Math.max(0, Math.min(100, percent)));
        }
      });

      await accountingApi.createStatement({
        statementId: payload.statementId,
        fileName: file.name,
        statementMonth,
        gcsPath: payload.gcsPath,
        source: 'upload'
      });

      await onUploaded();
      onClose();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onClose={uploading ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload Bank Statement</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Statement Month"
            type="month"
            value={statementMonth}
            onChange={(event) => setStatementMonth(event.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <Button
            variant="outlined"
            component="label"
            disabled={uploading}
          >
            {file ? `Selected: ${file.name}` : 'Choose PDF'}
            <input
              hidden
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => {
                const picked = event.target.files?.[0] ?? null;
                setFile(picked);
              }}
            />
          </Button>

          <Typography variant="body2" color="text.secondary">
            Uploaded file is stored in secure object storage and processed in background jobs.
          </Typography>

          {uploading && (
            <Stack spacing={1}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" color="text.secondary">
                Uploading {uploadProgress}%
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={uploading}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} variant="contained" disabled={uploadDisabled}>
          {uploading ? 'Uploading...' : 'Upload & Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
