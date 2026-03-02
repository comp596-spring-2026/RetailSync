import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import RefreshIcon from '@mui/icons-material/Refresh';
import SyncIcon from '@mui/icons-material/Sync';
import TableRowsIcon from '@mui/icons-material/TableRows';
import ViewCompactAltIcon from '@mui/icons-material/ViewCompactAlt';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Paper,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import { useRef } from 'react';
import type { PosDateRange, PosView } from '../state';

type PosToolbarProps = {
  dateRange: PosDateRange;
  onDateRangeChange: (range: PosDateRange) => void;
  onRefresh: () => void;
  onImportCsv: (file: File) => void;
  onSyncGoogleSheet: () => void;
  onViewChange: (view: PosView) => void;
  onIconOnlyChange: (iconOnly: boolean) => void;
  view: PosView;
  iconOnly: boolean;
  loading: boolean;
  importing: boolean;
  syncing: boolean;
  canImport: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
};

export const PosToolbar = ({
  dateRange,
  onDateRangeChange,
  onRefresh,
  onImportCsv,
  onSyncGoogleSheet,
  onViewChange,
  onIconOnlyChange,
  view,
  iconOnly,
  loading,
  importing,
  syncing,
  canImport,
  syncEnabled,
  lastSyncAt
}: PosToolbarProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePicked = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onImportCsv(file);
    event.target.value = '';
  };

  const lastSyncLabel = lastSyncAt ? new Date(lastSyncAt).toLocaleString() : 'Never synced';

  return (
    <Paper
      variant="outlined"
      sx={{
        position: 'sticky',
        top: 70,
        zIndex: 10,
        p: 1.5,
        borderRadius: 2
      }}
    >
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" sx={{ gap: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap">
            <Typography variant="h6">POS</Typography>
            <TextField
              size="small"
              type="date"
              label="From"
              value={dateRange.from}
              onChange={(event) => onDateRangeChange({ ...dateRange, from: event.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ 'aria-label': 'From date' }}
            />
            <TextField
              size="small"
              type="date"
              label="To"
              value={dateRange.to}
              onChange={(event) => onDateRangeChange({ ...dateRange, to: event.target.value })}
              InputLabelProps={{ shrink: true }}
              inputProps={{ 'aria-label': 'To date' }}
            />
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Tooltip title="Refresh current date range">
              <span>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
                  onClick={onRefresh}
                  disabled={loading}
                  aria-label="Refresh POS data"
                >
                  {iconOnly ? '' : 'Refresh'}
                </Button>
              </span>
            </Tooltip>

            <Tooltip title={`Last synced: ${lastSyncLabel}`}>
              <Typography variant="caption" color="text.secondary" aria-label="Last sync status">
                Last synced: {lastSyncLabel}
              </Typography>
            </Tooltip>

            <Divider flexItem orientation="vertical" />

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              hidden
              onChange={handleFilePicked}
              aria-label="Import CSV file"
            />
            <Button
              variant="contained"
              size="small"
              color="primary"
              startIcon={importing ? <CircularProgress size={14} /> : <CloudUploadIcon />}
              disabled={!canImport || importing}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Import CSV"
            >
              {iconOnly ? '' : 'Import CSV'}
            </Button>

            <Tooltip title={`Sync now. Last synced: ${lastSyncLabel}`}>
              <span>
                <Button
                  variant="contained"
                  size="small"
                  color="success"
                  startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                  disabled={!canImport || !syncEnabled || syncing}
                  onClick={onSyncGoogleSheet}
                  aria-label="Sync Google Sheet"
                >
                  {iconOnly ? '' : 'Sync Google Sheet'}
                </Button>
              </span>
            </Tooltip>

            <ToggleButtonGroup
              size="small"
              exclusive
              value={view}
              onChange={(_event, value: PosView | null) => {
                if (!value) return;
                onViewChange(value);
              }}
              aria-label="POS view toggle"
            >
              <ToggleButton value="table" aria-label="Table view">
                <TableRowsIcon fontSize="small" />
                {iconOnly ? null : <Box sx={{ ml: 0.75 }}>Table</Box>}
              </ToggleButton>
              <ToggleButton value="dashboard" aria-label="Analytics view">
                <DashboardRoundedIcon fontSize="small" />
                {iconOnly ? null : <Box sx={{ ml: 0.75 }}>Analytics</Box>}
              </ToggleButton>
            </ToggleButtonGroup>

            <Stack direction="row" spacing={0.5} alignItems="center">
              <ViewCompactAltIcon fontSize="small" color="action" />
              <Switch
                checked={iconOnly}
                onChange={(event) => onIconOnlyChange(event.target.checked)}
                inputProps={{ 'aria-label': 'Icon only mode toggle' }}
              />
              {!iconOnly ? <Typography variant="caption">Icon only</Typography> : null}
            </Stack>
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
};
