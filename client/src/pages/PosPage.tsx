import {
  Alert,
  Box,
  Button,
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
import { useEffect, useMemo, useState } from 'react';
import { posApi } from '../api/posApi';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { NoAccess } from '../components/NoAccess';
import { PermissionGate } from '../components/PermissionGate';
import { showSnackbar } from '../features/ui/uiSlice';
import { hasPermission } from '../utils/permissions';

type PosRow = {
  _id: string;
  date: string;
  day: string;
  highTax: number;
  lowTax: number;
  saleTax: number;
  totalSales: number;
  gas: number;
  lottery: number;
  creditCard: number;
  cash: number;
  cashExpenses: number;
  notes: string;
};

const monthToRange = (month: string) => {
  const [year, monthNum] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
};

export const PosPage = () => {
  const dispatch = useAppDispatch();
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'pos', 'view');
  const canImport = hasPermission(permissions, 'pos', 'create') && hasPermission(permissions, 'pos', 'actions:import');

  const [rows, setRows] = useState<PosRow[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => monthToRange(month), [month]);

  const loadDaily = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await posApi.daily(range.start, range.end);
      setRows(res.data.data);
    } catch (err) {
      setError('Failed to load POS daily data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canView) {
      void loadDaily();
    }
  }, [canView, month]);

  const upload = async () => {
    if (!selectedFile) {
      dispatch(showSnackbar({ message: 'Select a CSV file first', severity: 'error' }));
      return;
    }

    try {
      setLoading(true);
      await posApi.importCsv(selectedFile);
      dispatch(showSnackbar({ message: 'POS CSV imported', severity: 'success' }));
      setSelectedFile(null);
      await loadDaily();
    } catch (err) {
      dispatch(showSnackbar({ message: 'Import failed', severity: 'error' }));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            label="Month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="outlined" onClick={() => void loadDaily()} disabled={loading}>
            Refresh
          </Button>
          <PermissionGate module="pos" action="actions:import" mode="disable">
            <Button variant="contained" component="label" disabled={!canImport || loading}>
              Choose CSV
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
            </Button>
          </PermissionGate>
          <PermissionGate module="pos" action="actions:import" mode="disable">
            <Button variant="contained" onClick={() => void upload()} disabled={!selectedFile || !canImport || loading}>
              Upload
            </Button>
          </PermissionGate>
        </Stack>
        {selectedFile && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2">Selected: {selectedFile.name}</Typography>
          </Box>
        )}
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Daily POS Summary
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Day</TableCell>
              <TableCell>High Tax</TableCell>
              <TableCell>Low Tax</TableCell>
              <TableCell>Total Sales</TableCell>
              <TableCell>Credit Card</TableCell>
              <TableCell>Cash</TableCell>
              <TableCell>Gas</TableCell>
              <TableCell>Lottery</TableCell>
              <TableCell>Cash Expenses</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row._id}>
                <TableCell>{new Date(row.date).toISOString().slice(0, 10)}</TableCell>
                <TableCell>{row.day}</TableCell>
                <TableCell>{row.highTax.toFixed(2)}</TableCell>
                <TableCell>{row.lowTax.toFixed(2)}</TableCell>
                <TableCell>{row.totalSales.toFixed(2)}</TableCell>
                <TableCell>{row.creditCard.toFixed(2)}</TableCell>
                <TableCell>{row.cash.toFixed(2)}</TableCell>
                <TableCell>{row.gas.toFixed(2)}</TableCell>
                <TableCell>{row.lottery.toFixed(2)}</TableCell>
                <TableCell>{row.cashExpenses.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
};
