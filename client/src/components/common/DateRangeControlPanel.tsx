import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  ClickAwayListener,
  Divider,
  Paper,
  Popper,
  Stack
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DateRangeIcon from '@mui/icons-material/DateRange';
import {
  DateRangePicker,
  createStaticRanges,
  type RangeKeyDict,
  type Range
} from 'react-date-range';
import moment from 'moment';
import { useCallback, useMemo, useRef, useState } from 'react';

const todayISO = () => moment().format('YYYY-MM-DD');
const firstOfMonthISO = () => moment().startOf('month').format('YYYY-MM-DD');

const monthToRange = (monthVal: string) => {
  const m = moment(monthVal, 'YYYY-MM');
  return {
    from: m.startOf('month').format('YYYY-MM-DD'),
    to: m.endOf('month').format('YYYY-MM-DD')
  };
};

const dateToMonth = (dateStr: string) => dateStr.slice(0, 7);

export type DateRange = { from: string; to: string };

const customStaticRanges = createStaticRanges([
  {
    label: 'Today',
    range: () => {
      const start = moment().startOf('day');
      const end = moment().endOf('day');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'This Week',
    range: () => {
      const start = moment().startOf('week');
      const end = moment().endOf('week');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'This Month',
    range: () => {
      const start = moment().startOf('month');
      const end = moment().endOf('month');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'Last Month',
    range: () => {
      const end = moment().startOf('month').subtract(1, 'day').endOf('day');
      const start = end.clone().startOf('month');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'Last 7 Days',
    range: () => {
      const end = moment().endOf('day');
      const start = end.clone().subtract(6, 'days').startOf('day');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'Last 30 Days',
    range: () => {
      const end = moment().endOf('day');
      const start = end.clone().subtract(29, 'days').startOf('day');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'This Year',
    range: () => {
      const start = moment().startOf('year');
      const end = moment().endOf('year');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  },
  {
    label: 'Last Year',
    range: () => {
      const end = moment().startOf('year').subtract(1, 'day').endOf('day');
      const start = end.clone().startOf('year');
      return { startDate: start.toDate(), endDate: end.toDate() };
    }
  }
]);

type DateRangeControlPanelProps = {
  from: string;
  to: string;
  onFromChange: (date: string) => void;
  onToChange: (date: string) => void;
  loading?: boolean;
  onRefresh: () => void;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
};

export const DateRangeControlPanel = ({
  from,
  to,
  onFromChange,
  onToChange,
  loading = false,
  onRefresh,
  actions,
  stats
}: DateRangeControlPanelProps) => {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const dateError = useMemo(() => {
    if (!from || !to) return null;
    if (from > to) return '"From" must be before "To".';
    return null;
  }, [from, to]);

  const selectionRange: Range = useMemo(
    () => ({
      startDate: new Date(from + 'T00:00:00'),
      endDate: new Date(to + 'T00:00:00'),
      key: 'selection'
    }),
    [from, to]
  );

  const handleSelect = useCallback(
    (rangesByKey: RangeKeyDict) => {
      const sel = rangesByKey.selection;
      if (sel.startDate) onFromChange(moment(sel.startDate).format('YYYY-MM-DD'));
      if (sel.endDate) onToChange(moment(sel.endDate).format('YYYY-MM-DD'));
    },
    [onFromChange, onToChange]
  );

  const displayFrom = moment(from).format('MMM D, YYYY');
  const displayTo = moment(to).format('MMM D, YYYY');

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: 1.5 }}>
          <Box ref={anchorRef}>
            <Chip
              icon={<DateRangeIcon />}
              label={`${displayFrom}  →  ${displayTo}`}
              onClick={() => setOpen((o) => !o)}
              variant={open ? 'filled' : 'outlined'}
              color={dateError ? 'error' : open ? 'primary' : 'default'}
              sx={{
                fontSize: 14,
                height: 36,
                cursor: 'pointer',
                '& .MuiChip-label': { px: 1.5 }
              }}
            />
          </Box>

          <Popper
            open={open}
            anchorEl={anchorRef.current}
            placement="bottom-start"
            sx={{ zIndex: 1300 }}
          >
            <ClickAwayListener onClickAway={() => setOpen(false)}>
              <Paper elevation={8} sx={{ mt: 0.5, borderRadius: 2, overflow: 'hidden' }}>
                <DateRangePicker
                  ranges={[selectionRange]}
                  onChange={handleSelect}
                  months={2}
                  direction="horizontal"
                  staticRanges={customStaticRanges}
                  inputRanges={[]}
                  rangeColors={['#1976d2']}
                  maxDate={moment().add(1, 'month').toDate()}
                />
              </Paper>
            </ClickAwayListener>
          </Popper>

          <Box sx={{ flex: 1 }} />

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              startIcon={loading ? <CircularProgress size={14} /> : <RefreshIcon />}
              onClick={onRefresh}
              disabled={loading || !!dateError}
            >
              Refresh
            </Button>
            {actions}
          </Stack>
        </Stack>

        {dateError && <Alert severity="warning" sx={{ py: 0.5 }}>{dateError}</Alert>}

        {stats && (
          <>
            <Divider />
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              {stats}
            </Stack>
          </>
        )}
      </Stack>
    </Paper>
  );
};

export { todayISO, firstOfMonthISO, monthToRange, dateToMonth };
