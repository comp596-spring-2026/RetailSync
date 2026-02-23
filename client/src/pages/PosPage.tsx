import {
  Alert,
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
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import RefreshIcon from '@mui/icons-material/Refresh';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import TableRowsIcon from '@mui/icons-material/TableRows';
import PointOfSaleIcon from '@mui/icons-material/PointOfSale';
import { useEffect, useMemo, useState } from 'react';
import { posApi } from '../api/posApi';
import { useAppSelector } from '../app/hooks';
import { ImportPOSDataModal } from '../components/ImportPOSDataModal';
import { NoAccess } from '../components/NoAccess';
import { PermissionGate } from '../components/PermissionGate';
import { PageHeader } from '../components/PageHeader';
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
  const permissions = useAppSelector((state) => state.auth.permissions);

  const canView = hasPermission(permissions, 'pos', 'view');
  const canImport = hasPermission(permissions, 'pos', 'create') && hasPermission(permissions, 'pos', 'actions:import');

  const [rows, setRows] = useState<PosRow[]>([]);
  const [openImportModal, setOpenImportModal] = useState(false);
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

  if (!canView) {
    return <NoAccess />;
  }

  return (
    <Stack spacing={2}>
      <PageHeader
        title="POS"
        subtitle="Import daily sales CSV and review summaries"
        icon={<PointOfSaleIcon />}
      />
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <TextField
            label="Month"
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CalendarMonthIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => void loadDaily()} disabled={loading}>
            Refresh
          </Button>
          <PermissionGate module="pos" action="actions:import" mode="disable">
            <Button
              variant="contained"
              color="secondary"
              startIcon={<UploadFileIcon />}
              onClick={() => setOpenImportModal(true)}
              disabled={!canImport || loading}
            >
              Add POS Source
            </Button>
          </PermissionGate>
        </Stack>
      </Paper>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          <TableRowsIcon fontSize="small" color="primary" />
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
      <ImportPOSDataModal
        open={openImportModal}
        onClose={() => setOpenImportModal(false)}
        onImported={() => loadDaily()}
      />
    </Stack>
  );
};
