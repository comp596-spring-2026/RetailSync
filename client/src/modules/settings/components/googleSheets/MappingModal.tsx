import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';

type MappingPair = {
  systemField: string;
  sheetColumn: string;
  targetKey: string;
};

type MappingReadiness = 'not_configured' | 'invalid' | 'needs_review' | 'ready';

type Props = {
  open: boolean;
  profileName: string;
  mapping: Record<string, string>;
  mappingPairs: MappingPair[];
  readiness: MappingReadiness;
  onClose: () => void;
  onConfirm?: () => Promise<void> | void;
  onEdit?: () => void;
};

export const MappingModal = ({
  open,
  profileName,
  mapping,
  mappingPairs,
  readiness,
  onClose,
  onConfirm,
  onEdit,
}: Props) => {
  const [view, setView] = useState<'table' | 'json'>('table');

  const mappingJson = useMemo(() => JSON.stringify(mapping, null, 2), [mapping]);

  const showConfirm = readiness === 'needs_review';
  const showEdit = readiness === 'invalid';

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>View Mapping · {profileName}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.25}>
          <ToggleButtonGroup
            size="small"
            value={view}
            exclusive
            onChange={(_event, next: 'table' | 'json' | null) => {
              if (!next) return;
              setView(next);
            }}
          >
            <ToggleButton value="table">Table</ToggleButton>
            <ToggleButton value="json">JSON</ToggleButton>
          </ToggleButtonGroup>

          {view === 'json' ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                p: 1,
                borderRadius: 1,
                bgcolor: 'grey.50',
                border: 1,
                borderColor: 'divider',
                maxHeight: 420,
                overflow: 'auto',
                fontSize: 12,
              }}
            >
              {mappingJson}
            </Box>
          ) : (
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>System Field</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Sheet Column</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mappingPairs.length > 0 ? (
                  mappingPairs.map((entry) => (
                    <TableRow key={`${entry.targetKey}:${entry.sheetColumn}`}>
                      <TableCell>{entry.systemField}</TableCell>
                      <TableCell>{entry.sheetColumn}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2}>
                      <Typography variant="caption" color="text.secondary">
                        No mapping configured yet.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{showConfirm || showEdit ? 'Cancel' : 'Close'}</Button>
        {showEdit ? (
          <Button variant="contained" onClick={onEdit}>
            Edit mapping
          </Button>
        ) : null}
        {showConfirm ? (
          <Button variant="contained" onClick={() => void onConfirm?.()}>
            Confirm mapping
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
};
