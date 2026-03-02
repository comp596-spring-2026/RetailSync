import TableRowsIcon from '@mui/icons-material/TableRows';
import {
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography
} from '@mui/material';
import { LoadingEmptyStateWrapper } from '../../../components';
import { TABLE_PAGE_SIZE_OPTIONS } from '../../../constants/pagination';
import { formatDate } from '../../../utils/date';
import type { PosPrimaryAction } from './types';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type PosTableRow = {
  _id: string;
  date: string;
  day: string;
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

type PosTableTotals = {
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

type PosTableViewPageProps = {
  loading: boolean;
  rows: PosTableRow[];
  totals: PosTableTotals;
  totalCount: number;
  page: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  primaryAction: PosPrimaryAction;
};

export const PosTableViewPage = ({
  loading,
  rows,
  totals,
  totalCount,
  page,
  limit,
  onPageChange,
  onLimitChange,
  primaryAction
}: PosTableViewPageProps) => (
  <LoadingEmptyStateWrapper
    loading={loading}
    empty={!loading && rows.length === 0}
    loadingLabel="Loading POS data..."
    emptyMessage="No POS data for this date range"
    emptySecondary="Import data from a file, sync from Google Sheets, or select a different range."
    emptyActionLabel={primaryAction.label}
    onEmptyAction={primaryAction.onClick}
  >
    <Paper sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TableRowsIcon fontSize="small" color="primary" />
          Daily POS Summary
        </Typography>
      </Stack>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Day</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                High Tax
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Low Tax
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Sale Tax
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Total Sales
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Credit Card
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Cash
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Gas
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Lottery
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Cash Exp.
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row._id} hover>
                <TableCell>{formatDate(row.date, 'short')}</TableCell>
                <TableCell>{row.day}</TableCell>
                <TableCell align="right">{fmt(row.highTax)}</TableCell>
                <TableCell align="right">{fmt(row.lowTax)}</TableCell>
                <TableCell align="right">{fmt(row.saleTax)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {fmt(row.totalSales)}
                </TableCell>
                <TableCell align="right">{fmt(row.creditCard)}</TableCell>
                <TableCell align="right">{fmt(row.cash)}</TableCell>
                <TableCell align="right">{fmt(row.gas)}</TableCell>
                <TableCell align="right">{fmt(row.lottery)}</TableCell>
                <TableCell align="right">{fmt(row.cashExpenses)}</TableCell>
              </TableRow>
            ))}
            {rows.length > 0 && (
              <TableRow sx={{ bgcolor: 'action.selected' }}>
                <TableCell sx={{ fontWeight: 700 }} colSpan={2}>
                  Total ({totalCount} days)
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.highTax)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.lowTax)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.saleTax)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.totalSales)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.creditCard)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.cash)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.gas)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.lottery)}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>
                  {fmt(totals.cashExpenses)}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={totalCount}
        page={Math.max(0, page - 1)}
        onPageChange={(_event, nextPage) => onPageChange(nextPage + 1)}
        rowsPerPage={limit}
        onRowsPerPageChange={(event) => onLimitChange(Number(event.target.value))}
        rowsPerPageOptions={[...TABLE_PAGE_SIZE_OPTIONS]}
      />
    </Paper>
  </LoadingEmptyStateWrapper>
);
