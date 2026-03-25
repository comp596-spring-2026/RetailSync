import {
  Button,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { useState } from 'react';
import { PermissionGate } from '../../../../app/guards';
import { useAppDispatch, useAppSelector } from '../../../../app/store/hooks';
import { hasPermission } from '../../../../utils/permissions';
import { importItems } from '../../state';

type Props = {
  onImported: () => Promise<void> | void;
};

export const ItemsImportSection = ({ onImported }: Props) => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);
  const canImport = hasPermission(permissions, 'items', 'actions:import');

  const [file, setFile] = useState<File | null>(null);

  const upload = async () => {
    if (!file) return;
    await dispatch(importItems(file)).unwrap();
    setFile(null);
    await onImported();
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <UploadFileIcon fontSize="small" color="primary" />
        Import Items CSV
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <PermissionGate module="items" action="actions:import" mode="disable">
          <Button
            variant="contained"
            startIcon={<UploadFileIcon />}
            component="label"
            disabled={!canImport}
          >
            Choose CSV
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Button>
        </PermissionGate>
        <PermissionGate module="items" action="actions:import" mode="disable">
          <Button
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={() => void upload()}
            disabled={!file || !canImport}
          >
            Import
          </Button>
        </PermissionGate>
        {file && <Typography variant="body2">{file.name}</Typography>}
      </Stack>
    </Paper>
  );
};
