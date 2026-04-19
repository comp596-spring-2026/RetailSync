import TableRowsIcon from '@mui/icons-material/TableRows';
import {
  Chip,
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
  notes: string;
  source?: 'file' | 'google_sheets' | 'manual';
  sourceRef?: {
    profileName?: string | null;
    sheetName?: string | null;
    mode?: string | null;
    sourceId?: string | null;
  } | null;
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

type POSDailySummaryPageProps = {
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

const resolveSourceLabel = (row: PosTableRow) => {
  if (row.source === 'google_sheets') return 'Google Sheets';
  if (row.source === 'file') return 'CSV Import';
  if (row.source === 'manual') return 'Manual Entry';
  return 'Unknown source';
};

const resolveSourceDetail = (row: PosTableRow) =>
  row.sourceRef?.profileName ?? row.sourceRef?.sheetName ?? row.sourceRef?.mode ?? 'Operational source';

export const POSDailySummaryPage = ({
  loading,
  rows,
  totals,
  totalCount,
  page,
  limit,
  onPageChange,
  onLimitChange,
  primaryAction
}: POSDailySummaryPageProps) => {
  const sourceCount = new Set(rows.map((row) => resolveSourceLabel(row))).size;
  const netTotal = totals.totalSales - totals.saleTax;

  return (
    <LoadingEmptyStateWrapper
      loading={loading}
      empty={!loading && rows.length === 0}
      loadingLabel="Loading POS data..."
      emptyMessage="No POS data for this date range"
      emptySecondary="Import data from a file, sync from Google Sheets, or select a different range."
      emptyActionLabel={primaryAction.label}
      onEmptyAction={primaryAction.onClick}
    >
      <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TableRowsIcon fontSize="small" color="primary" />
                  Daily POS Summary
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Business summary first, with source-linked day rows below.
                </Typography>
              </Stack>
              <Chip
                size="small"
                label={`${rows.length} row${rows.length === 1 ? '' : 's'} in view`}
                variant="outlined"
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Paper variant="outlined" sx={{ p: 1.5, flex: 1, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Gross sales
                </Typography>
                <Typography variant="h6" fontWeight={900}>
                  {fmt(totals.totalSales)}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, flex: 1, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Tax
                </Typography>
                <Typography variant="h6" fontWeight={900}>
                  {fmt(totals.saleTax)}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, flex: 1, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Net sales
                </Typography>
                <Typography variant="h6" fontWeight={900}>
                  {fmt(netTotal)}
                </Typography>
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, flex: 1, borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">
                  Source mix
                </Typography>
                <Typography variant="h6" fontWeight={900}>
                  {sourceCount} source{sourceCount === 1 ? '' : 's'}
                </Typography>
              </Paper>
            </Stack>
          </Stack>
        </Paper>

        <Paper sx={{ p: 2 }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 860 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Day</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Gross Sales
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Tax
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">
                    Net
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Source</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Notes</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row._id} hover>
                    <TableCell>{formatDate(row.date, 'short')}</TableCell>
                    <TableCell>{row.day}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {fmt(row.totalSales)}
                    </TableCell>
                    <TableCell align="right">{fmt(row.saleTax)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {fmt(row.totalSales - row.saleTax)}
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.25}>
                        <Typography variant="body2" fontWeight={600}>
                          {resolveSourceLabel(row)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {resolveSourceDetail(row)}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {row.notes || 'No note attached'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length > 0 && (
                  <TableRow sx={{ bgcolor: 'action.selected' }}>
                    <TableCell sx={{ fontWeight: 700 }} colSpan={2}>
                      Total ({totalCount} days)
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fmt(totals.totalSales)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fmt(totals.saleTax)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {fmt(netTotal)}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{sourceCount} sources</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>-</TableCell>
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
      </Stack>
    </LoadingEmptyStateWrapper>
  );
};

export default POSDailySummaryPage;
