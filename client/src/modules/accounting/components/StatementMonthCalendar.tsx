import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { Box, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';

export type StatementMonthInfo = {
  month: string;
  statementCount: number;
  latestStatementId: string;
  latestStatus: string;
  monthCloseStatus: string;
  updatedAt: string;
};

type StatementMonthCalendarProps = {
  months: StatementMonthInfo[];
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  year: number;
  onYearChange: (year: number) => void;
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthKey = (year: number, monthIndex0: number) =>
  `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`;

const cellColor = (info: StatementMonthInfo | undefined, hasMonth: boolean) => {
  if (!hasMonth || !info) return 'action.hover';
  if (info.monthCloseStatus === 'completed') return 'success.main';
  if (info.latestStatus === 'failed') return 'error.light';
  if (
    info.latestStatus === 'extracting' ||
    info.latestStatus === 'structuring' ||
    info.latestStatus === 'checks_queued' ||
    info.latestStatus === 'uploaded'
  ) {
    return 'info.light';
  }
  if (info.latestStatus === 'ready_for_review') return 'success.light';
  return 'grey.200';
};

const cellFgColor = (info: StatementMonthInfo | undefined, hasMonth: boolean) => {
  if (!hasMonth || !info) return 'text.primary';
  if (info.monthCloseStatus === 'completed') return 'common.white';
  return 'text.primary';
};

const cellLabel = (info: StatementMonthInfo | undefined, hasMonth: boolean) => {
  if (!hasMonth || !info) return 'No statement';
  if (info.monthCloseStatus === 'completed') return 'Month closed';
  if (info.latestStatus === 'failed') return 'Needs attention';
  if (
    info.latestStatus === 'uploaded' ||
    info.latestStatus === 'extracting' ||
    info.latestStatus === 'structuring' ||
    info.latestStatus === 'checks_queued'
  ) {
    return 'Processing';
  }
  if (info.latestStatus === 'ready_for_review') return 'Ready for review';
  return info.latestStatus;
};

export const StatementMonthCalendar = ({
  months,
  selectedMonth,
  onSelectMonth,
  year,
  onYearChange
}: StatementMonthCalendarProps) => {
  const byMonth = new Map(months.map((m) => [m.month, m]));

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="subtitle2">Statement months</Typography>
          <Stack direction="row" alignItems="center" spacing={0}>
            <IconButton size="small" aria-label="Previous year" onClick={() => onYearChange(year - 1)}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Typography variant="body2" sx={{ minWidth: 52, textAlign: 'center', fontWeight: 600 }}>
              {year}
            </Typography>
            <IconButton size="small" aria-label="Next year" onClick={() => onYearChange(year + 1)}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Green: month closed. Lighter green: ready. Blue: processing. Tap a month to filter the list.
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 0.75
          }}
        >
          {MONTH_SHORT.map((label, i) => {
            const key = monthKey(year, i);
            const info = byMonth.get(key);
            const hasMonth = Boolean(info && info.statementCount > 0);
            const selected = selectedMonth === key;
            const bg = cellColor(info, hasMonth);
            const fg = cellFgColor(info, hasMonth);
            const subFg =
              hasMonth && info?.monthCloseStatus === 'completed' ? 'common.white' : 'text.secondary';

            return (
              <Tooltip key={key} title={cellLabel(info, hasMonth)} placement="top">
                <Box>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => onSelectMonth(selected ? '' : key)}
                    sx={{
                      width: '100%',
                      border: '1px solid',
                      borderColor: selected ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      py: 0.75,
                      px: 0.5,
                      cursor: 'pointer',
                      bgcolor: bg,
                      color: fg,
                      font: 'inherit',
                      textAlign: 'center',
                      transition: 'box-shadow 0.15s ease',
                      boxShadow: selected ? 2 : 0,
                      '&:hover': { boxShadow: 1 }
                    }}
                  >
                    <Typography variant="caption" sx={{ display: 'block', fontWeight: 700 }}>
                      {label}
                    </Typography>
                    {hasMonth ? (
                      <Typography variant="caption" sx={{ fontSize: 10, color: subFg, opacity: 0.95 }}>
                        {info!.statementCount} file{info!.statementCount === 1 ? '' : 's'}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
                        —
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
        {selectedMonth ? (
          <Typography variant="caption" color="text.secondary">
            Showing {selectedMonth}. Click the same month again to show all.
          </Typography>
        ) : null}
      </Stack>
    </Paper>
  );
};
