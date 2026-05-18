import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  Box,
  Chip,
  CircularProgress,
  Grid2 as Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import type { StatementOverview, StatementInternalCheck } from '../../utils/statementOverviewModel';

type Props = {
  overview: StatementOverview;
};

const CheckStatusIcon = ({ status }: { status: StatementInternalCheck['status'] }) => {
  if (status === 'pass') {
    return <CheckCircleOutlineIcon fontSize="small" color="success" />;
  }
  if (status === 'fail') {
    return <ErrorOutlineIcon fontSize="small" color="error" />;
  }
  return <HelpOutlineIcon fontSize="small" color="disabled" />;
};

const statusCaption = (status: StatementInternalCheck['status']) => {
  if (status === 'pass') return 'Passed';
  if (status === 'fail') return 'Failed';
  return 'Not enough data';
};

export const StatementOverviewTab = ({ overview }: Props) => {
  const { summary, sections, checks, checksMeta } = overview;
  const allResolved = checksMeta.ready && checksMeta.unknownCount === 0;
  const allPassed = allResolved && checksMeta.failedCount === 0 && checks.length > 0;

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }} data-testid="statement-summary-card">
        <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
          Statement Summary
        </Typography>
        <Grid container spacing={2}>
          {[
            { label: 'Beginning Balance', field: summary.beginningBalance },
            { label: 'Total Credits', field: summary.totalCreditsAmount },
            { label: 'Total Debits', field: summary.totalDebitsAmount },
            { label: 'Ending Balance', field: summary.endingBalance }
          ].map((item) => (
            <Grid key={item.label} size={{ xs: 6, md: 3 }}>
              <Typography variant="caption" color="text.secondary">
                {item.label}
              </Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                {item.field.display}
              </Typography>
            </Grid>
          ))}
        </Grid>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 1.5 }}>
          <Typography variant="body2" color="text.secondary">
            Credits: {summary.creditCount.display === 'Not detected' ? 'Not detected' : `${summary.creditCount.display} items`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Debits: {summary.debitCount.display === 'Not detected' ? 'Not detected' : `${summary.debitCount.display} items`}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Total entries: {summary.totalEntries.display}
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }} data-testid="statement-sections-card">
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Statement Sections
        </Typography>
        {sections.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No statement sections detected yet.
          </Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Section</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell align="right">Count</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Review type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sections.map((section) => (
                  <TableRow key={section.key} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{section.label}</TableCell>
                    <TableCell sx={{ textTransform: 'capitalize' }}>{section.direction}</TableCell>
                    <TableCell align="right">{section.count.display}</TableCell>
                    <TableCell align="right">{section.total.display}</TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {section.sourceLabel}
                      </Typography>
                    </TableCell>
                    <TableCell>{section.reviewType}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      <Paper
        variant="outlined"
        data-testid="statement-checks-card"
        sx={{
          p: 2,
          bgcolor: allPassed ? 'success.50' : 'background.paper',
          borderColor: allPassed ? 'success.light' : 'divider'
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle2">Statement validation</Typography>
          {checksMeta.ready && allPassed ? (
            <Chip
              size="small"
              color="success"
              variant="outlined"
              icon={<CheckCircleOutlineIcon />}
              label="All checks passed"
            />
          ) : checksMeta.ready && checksMeta.failedCount > 0 ? (
            <Chip
              size="small"
              color="error"
              variant="outlined"
              icon={<ErrorOutlineIcon />}
              label={`${checksMeta.failedCount} failed`}
            />
          ) : null}
        </Stack>

        {!checksMeta.ready ? (
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={18} />
            <Typography variant="body2" color="text.secondary">
              Validation runs after extraction and structuring finish.
            </Typography>
          </Stack>
        ) : (
          <List disablePadding dense>
            {checks.map((check) => (
              <ListItem
                key={check.id}
                disableGutters
                sx={{
                  py: 1,
                  alignItems: 'flex-start',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                  '&:first-of-type': { borderTop: 'none', pt: 0 }
                }}
              >
                <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                  <CheckStatusIcon status={check.status} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {check.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color:
                            check.status === 'pass'
                              ? 'success.main'
                              : check.status === 'fail'
                                ? 'error.main'
                                : 'text.secondary',
                          fontWeight: 600
                        }}
                      >
                        {statusCaption(check.status)}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="span"
                      sx={{ display: 'block', mt: 0.25, lineHeight: 1.45 }}
                    >
                      {check.formula}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>
    </Stack>
  );
};
