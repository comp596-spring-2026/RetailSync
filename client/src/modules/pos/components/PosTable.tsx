import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SyncIcon from '@mui/icons-material/Sync';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import type { PosDailyRecord } from '../api';
import { formatDate } from '../../../utils/date';

const fmt = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type PosTableProps = {
  rows: PosDailyRecord[];
  totals: {
    highTax: number;
    lowTax: number;
    saleTax: number;
    totalSales: number;
    creditCard: number;
    cash: number;
    gas: number;
    lottery: number;
    cashExpenses: number;
  };
  page: number;
  limit: number;
  totalCount: number;
  iconOnly: boolean;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
};

export const PosTable = ({ rows, totals, page, limit, totalCount, iconOnly, onPageChange, onLimitChange }: PosTableProps) => {
  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size={iconOnly ? 'small' : 'medium'} aria-label="POS operational table">
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Day</TableCell>
              <TableCell align="right">High Tax</TableCell>
              <TableCell align="right">Low Tax</TableCell>
              <TableCell align="right">Sale Tax</TableCell>
              <TableCell align="right">Total Sales</TableCell>
              <TableCell align="right">Credit Card</TableCell>
              <TableCell align="right">Cash</TableCell>
              <TableCell align="right">Gas</TableCell>
              <TableCell align="right">Lottery</TableCell>
              <TableCell align="right">Cash Exp.</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} align="center">
                  <Typography variant="body2" color="text.secondary">
                    No data available for selected date range.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : null}
            {rows.map((row) => (
              <TableRow key={row._id} hover>
                <TableCell>{formatDate(row.date, 'short')}</TableCell>
                <TableCell>{row.day}</TableCell>
                <TableCell align="right">{fmt(row.highTax)}</TableCell>
                <TableCell align="right">{fmt(row.lowTax)}</TableCell>
                <TableCell align="right">{fmt(row.saleTax)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(row.totalSales)}</TableCell>
                <TableCell align="right">{fmt(row.creditCard)}</TableCell>
                <TableCell align="right">{fmt(row.cash)}</TableCell>
                <TableCell align="right">{fmt(row.gas)}</TableCell>
                <TableCell align="right">{fmt(row.lottery)}</TableCell>
                <TableCell align="right">{fmt(row.cashExpenses)}</TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', gap: 0.25 }}>
                    <Tooltip title="View row details">
                      <span>
                        <IconButton size="small" aria-label={`View row ${row.date}`}>
                          <VisibilityOutlinedIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Edit row">
                      <span>
                        <IconButton size="small" aria-label={`Edit row ${row.date}`}>
                          <EditOutlinedIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Sync row metadata">
                      <span>
                        <IconButton size="small" aria-label={`Sync row ${row.date}`}>
                          <SyncIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
            {rows.length > 0 ? (
              <TableRow sx={{ bgcolor: 'action.selected' }}>
                <TableCell colSpan={2} sx={{ fontWeight: 700 }}>Totals</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.highTax)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.lowTax)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.saleTax)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.totalSales)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.creditCard)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.cash)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.gas)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.lottery)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(totals.cashExpenses)}</TableCell>
                <TableCell align="right" />
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={totalCount}
        page={Math.max(page - 1, 0)}
        onPageChange={(_event, nextPage) => onPageChange(nextPage + 1)}
        rowsPerPage={limit}
        onRowsPerPageChange={(event) => onLimitChange(Number(event.target.value))}
        rowsPerPageOptions={[25, 50, 100, 200]}
      />
    </Paper>
  );
};
