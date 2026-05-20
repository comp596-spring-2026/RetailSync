import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowLeftIcon from '@mui/icons-material/KeyboardArrowLeft';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid2 as Grid,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { LoadingEmptyStateWrapper } from '../../../components';
import { posApi, type PosDailyRecord } from '../api';
import type { PosPrimaryAction } from './types';
import { buildSalesTaxReviewIndex, type SalesTaxMonthlyReview } from '../utils/saleTaxReview';

const ALL_POS_START = '2000-01-01';
const ALL_POS_END = '2100-12-31';

const fmtCurrency = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const SummaryLine = ({
  label,
  value,
  help,
  tone = 'default'
}: {
  label: string;
  value: string;
  help?: string;
  tone?: 'default' | 'warning';
}) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={700} color="text.primary">
        {label}
      </Typography>
      {help ? (
        <Tooltip title={help} placement="top" arrow>
          <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        </Tooltip>
      ) : null}
    </Stack>
    <Typography
      variant="body2"
      fontWeight={700}
      sx={{ color: tone === 'warning' ? 'warning.dark' : 'text.primary', textAlign: 'right' }}
    >
      {value}
    </Typography>
  </Stack>
);

const PosDataMetric = ({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) => (
  <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="flex-start">
    <Stack spacing={0.25} sx={{ minWidth: 0 }}>
      <Typography variant="body2" fontWeight={700} color="text.primary">
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {helper}
      </Typography>
    </Stack>
    <Typography variant="body2" fontWeight={700} sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
      {value}
    </Typography>
  </Stack>
);

const MonthlyPosDataCard = ({ review }: { review: SalesTaxMonthlyReview }) => (
  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
    <Stack spacing={1.1} sx={{ flex: 1, minWidth: 0 }}>
      <PosDataMetric
        label="High Tax Food"
        value={`$${fmtCurrency(review.highTaxSales)}`}
        helper="Full-rate taxable sales."
      />
      <PosDataMetric
        label="Low Tax Grocery"
        value={`$${fmtCurrency(review.lowTaxSales)}`}
        helper="Local-only taxable sales."
      />
      <PosDataMetric
        label="Total Tax Collected"
        value={`$${fmtCurrency(review.totalTaxCollected)}`}
        helper="POS/imported tax collected."
      />
    </Stack>
    <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
    <Divider sx={{ display: { xs: 'block', md: 'none' } }} />
    <Stack spacing={1.1} sx={{ flex: 1, minWidth: 0 }}>
      <PosDataMetric
        label="Gasoline Sales"
        value={`$${fmtCurrency(review.gasolineSales)}`}
        helper="Reference POS sales."
      />
      <PosDataMetric
        label="Lottery Sales"
        value={`$${fmtCurrency(review.lotterySales)}`}
        helper="Reference POS sales."
      />
      <PosDataMetric
        label="Total Sales"
        value={`$${fmtCurrency(review.totalSales)}`}
        helper="High + Low + Gas + Lottery."
      />
    </Stack>
  </Stack>
);

const SectionCard = ({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) => (
  <Paper variant="outlined" sx={{ p: 1.75, borderRadius: 3 }}>
    <Stack spacing={1.1}>
      <Typography variant="subtitle1" fontWeight={800}>
        {title}
      </Typography>
      {children}
    </Stack>
  </Paper>
);

const TaxMetricRow = ({ label, value }: { label: string; value: string }) => (
  <Stack direction="row" justifyContent="space-between" spacing={2}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography variant="body2" fontWeight={700} sx={{ textAlign: 'right' }}>
      {value}
    </Typography>
  </Stack>
);

const TaxCalculationColumn = ({
  title,
  rows,
  helper
}: {
  title: string;
  rows: { label: string; value: string }[];
  helper: string;
}) => (
  <Stack spacing={1.1} sx={{ flex: 1, minWidth: 0 }}>
    <Typography variant="overline" fontWeight={800} color="text.secondary" letterSpacing={1.1}>
      {title}
    </Typography>
    <Stack spacing={0.75}>
      {rows.map((row) => (
        <TaxMetricRow key={row.label} label={row.label} value={row.value} />
      ))}
    </Stack>
    <Typography variant="caption" color="text.secondary">
      {helper}
    </Typography>
  </Stack>
);

const TaxCalculationCard = ({ review }: { review: SalesTaxMonthlyReview }) => (
  <Stack spacing={1.75}>
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="stretch">
      <TaxCalculationColumn
        title="State Tax"
        rows={[
          { label: 'Tax Base', value: `$${fmtCurrency(review.georgiaStateTaxBase)}` },
          { label: 'Rate', value: '4%' },
          { label: 'Tax Due', value: `$${fmtCurrency(review.georgiaStateTaxDue)}` }
        ]}
        helper="High Tax Sales × 4%"
      />
      <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
      <Divider sx={{ display: { xs: 'block', md: 'none' } }} />
      <TaxCalculationColumn
        title="County Tax"
        rows={[
          { label: 'Tax Base', value: `$${fmtCurrency(review.troupCountyTaxBase)}` },
          { label: 'Rate', value: '3%' },
          { label: 'Tax Due', value: `$${fmtCurrency(review.troupCountyTaxDue)}` }
        ]}
        helper="Local Tax Base × 3%"
      />
    </Stack>

    <Divider />

    <Stack spacing={0.5}>
      <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="baseline">
        <Typography variant="subtitle1" fontWeight={800}>
          Calculated Sales Tax
        </Typography>
        <Typography variant="h6" fontWeight={900}>
          ${fmtCurrency(review.calculatedSalesTax)}
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary">
        Georgia State Tax Due + Troup County Tax Due
      </Typography>
      <Typography variant="caption" color="text.secondary">
        = ${fmtCurrency(review.georgiaStateTaxDue)} + ${fmtCurrency(review.troupCountyTaxDue)}
      </Typography>
    </Stack>
  </Stack>
);

type POSSaleTaxPageProps = {
  loading: boolean;
  primaryAction: PosPrimaryAction;
  dataVersion?: string;
};

export const POSSaleTaxPage = ({
  loading,
  primaryAction,
  dataVersion = ''
}: POSSaleTaxPageProps) => {
  const [rows, setRows] = useState<PosDailyRecord[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchingRows, setFetchingRows] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<SalesTaxMonthlyReview | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadRows = async () => {
      setFetchingRows(true);
      setFetchError(null);
      try {
        const response = await posApi.daily(ALL_POS_START, ALL_POS_END);
        const nextRows = Array.isArray(response.data?.data) ? response.data.data : [];
        if (!cancelled) {
          setRows(nextRows);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            'Failed to load monthly sales tax review data.';
          setFetchError(message);
          setRows([]);
        }
      } finally {
        if (!cancelled) {
          setFetchingRows(false);
        }
      }
    };

    void loadRows();

    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const reviewIndex = useMemo(() => buildSalesTaxReviewIndex(rows), [rows]);
  const availableYears = reviewIndex.availableYears;

  useEffect(() => {
    if (availableYears.length === 0) {
      setSelectedYear(null);
      return;
    }

    setSelectedYear((current) =>
      current && availableYears.includes(current) ? current : reviewIndex.latestYear
    );
  }, [availableYears, reviewIndex.latestYear]);

  const monthsForSelectedYear = selectedYear ? reviewIndex.monthlyReviewsByYear[selectedYear] ?? [] : [];
  const selectedYearIndex = selectedYear ? availableYears.indexOf(selectedYear) : -1;
  const canMovePrevYear = selectedYearIndex > 0;
  const canMoveNextYear = selectedYearIndex >= 0 && selectedYearIndex < availableYears.length - 1;

  const combinedLoading = loading || fetchingRows;

  return (
    <>
      <LoadingEmptyStateWrapper
        loading={combinedLoading}
        empty={!combinedLoading && rows.length === 0}
        loadingLabel="Loading sales tax review..."
        emptyMessage="No POS sales tax data found."
        emptySecondary="Import POS data from Google Sheets to generate monthly sales tax reviews."
        emptyActionLabel={primaryAction.label}
        onEmptyAction={primaryAction.onClick}
      >
        <Stack spacing={2.5}>
          <Paper sx={{ p: 2.5, borderRadius: 3 }}>
            <Stack spacing={2}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', md: 'center' }}
                spacing={2}
              >
                <Stack spacing={0.5}>
                  <Typography
                    variant="overline"
                    sx={{ letterSpacing: 1.1, color: 'primary.main', fontWeight: 700 }}
                  >
                    RetailSync | POS Module
                  </Typography>
                  <Typography variant="h5" fontWeight={900}>
                    Georgia Sales Tax Review
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Troup County, GA
                  </Typography>
                </Stack>

                <Stack direction="row" alignItems="center" spacing={1}>
                  <IconButton
                    aria-label="Previous sales tax year"
                    onClick={() => {
                      if (!canMovePrevYear || selectedYearIndex < 1) return;
                      setSelectedYear(availableYears[selectedYearIndex - 1] ?? null);
                    }}
                    disabled={!canMovePrevYear}
                  >
                    <KeyboardArrowLeftIcon />
                  </IconButton>
                  <Typography variant="h6" fontWeight={800} sx={{ minWidth: 72, textAlign: 'center' }}>
                    {selectedYear ?? '—'}
                  </Typography>
                  <IconButton
                    aria-label="Next sales tax year"
                    onClick={() => {
                      if (!canMoveNextYear) return;
                      setSelectedYear(availableYears[selectedYearIndex + 1] ?? null);
                    }}
                    disabled={!canMoveNextYear}
                  >
                    <KeyboardArrowRightIcon />
                  </IconButton>
                </Stack>
              </Stack>

              <Divider />
              {fetchError ? <Alert severity="error">{fetchError}</Alert> : null}

              {selectedYear && monthsForSelectedYear.length === 0 ? (
                <Paper
                  variant="outlined"
                  sx={{ p: 3, borderRadius: 3, textAlign: 'center', color: 'text.secondary' }}
                >
                  No monthly sales tax records found for this year.
                </Paper>
              ) : (
                <Grid container spacing={2}>
                  {monthsForSelectedYear.map((review) => {
                    return (
                      <Grid key={review.monthKey} size={{ xs: 12, md: 6, lg: 4 }}>
                        <Card
                          variant="outlined"
                          sx={{
                            height: '100%',
                            borderRadius: 3,
                            transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
                            '&:hover': {
                              transform: 'translateY(-4px)',
                              boxShadow: 4,
                              borderColor: 'primary.light'
                            }
                          }}
                        >
                          <CardActionArea
                            onClick={() => setSelectedMonth(review)}
                            sx={{ height: '100%', alignItems: 'stretch' }}
                          >
                            <CardContent sx={{ p: 2.25, height: '100%' }}>
                              <Stack spacing={2} height="100%">
                                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                                  <Stack spacing={0.35}>
                                    <Typography variant="h6" fontWeight={800}>
                                      {review.monthLabel}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      Monthly sales tax summary
                                    </Typography>
                                  </Stack>

                                  <Stack
                                    direction="row"
                                    spacing={0.5}
                                    alignItems="center"
                                    sx={{ color: 'primary.main', fontWeight: 700, typography: 'button' }}
                                  >
                                    <Box component="span">View Breakdown</Box>
                                    <NorthEastIcon fontSize="inherit" />
                                  </Stack>
                                </Stack>

                                <Stack spacing={1}>
                                  <SummaryLine
                                    label="Total Tax Collected"
                                    value={`$${fmtCurrency(review.totalTaxCollected)}`}
                                  />
                                  <SummaryLine
                                    label="Vendor Compensation"
                                    value={`$${fmtCurrency(review.vendorCompensation.total)}`}
                                  />
                                  <SummaryLine
                                    label="Payable Sales Tax"
                                    value={`$${fmtCurrency(review.amountPayableSalesTax)}`}
                                  />
                                </Stack>

                                <Box sx={{ mt: 'auto' }} />
                              </Stack>
                            </CardContent>
                          </CardActionArea>
                        </Card>
                      </Grid>
                    );
                  })}
                </Grid>
              )}
            </Stack>
          </Paper>
        </Stack>
      </LoadingEmptyStateWrapper>

      <Dialog
        open={Boolean(selectedMonth)}
        onClose={() => setSelectedMonth(null)}
        fullWidth
        maxWidth="lg"
      >
        {selectedMonth ? (
          <>
            <DialogTitle sx={{ pb: 1.5 }}>
              <Stack spacing={0.35}>
                <Typography variant="h6" fontWeight={900}>
                  Monthly Sales Tax Breakdown
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedMonth.subtitle}
                </Typography>
              </Stack>
            </DialogTitle>

            <DialogContent dividers>
              <Stack spacing={1.5}>
                <SectionCard title="1. Monthly POS Data">
                  <MonthlyPosDataCard review={selectedMonth} />
                </SectionCard>

                <SectionCard title="2. Tax Calculation">
                  <TaxCalculationCard review={selectedMonth} />
                </SectionCard>

                <SectionCard title="3. Vendor Compensation">
                  <Stack spacing={0.9}>
                    <SummaryLine
                      label="Vendor Compensation Base"
                      value={`$${fmtCurrency(selectedMonth.totalTaxCollected)}`}
                      help="Total tax collected from POS."
                    />
                    <SummaryLine
                      label="First Bracket"
                      value={`$${fmtCurrency(selectedMonth.vendorCompensation.firstBracketBase)}`}
                      help="Up to first $3,000 of collected tax."
                    />
                    <SummaryLine
                      label="First Bracket Rate"
                      value="3%"
                      help="Georgia vendor compensation rate for first bracket."
                    />
                    <SummaryLine
                      label="First Bracket Compensation"
                      value={`$${fmtCurrency(selectedMonth.vendorCompensation.firstBracketCompensation)}`}
                      help="First Bracket × 3%."
                    />
                    <SummaryLine
                      label="Excess Bracket"
                      value={`$${fmtCurrency(selectedMonth.vendorCompensation.overBracketBase)}`}
                      help="Amount above $3,000."
                    />
                    <SummaryLine
                      label="Excess Bracket Rate"
                      value="0.5%"
                      help="Georgia vendor compensation rate above $3,000."
                    />
                    <SummaryLine
                      label="Excess Bracket Compensation"
                      value={`$${fmtCurrency(selectedMonth.vendorCompensation.overBracketCompensation)}`}
                      help="Excess Bracket × 0.5%."
                    />
                    <Divider />
                    <SummaryLine
                      label="Total Vendor Compensation"
                      value={`$${fmtCurrency(selectedMonth.vendorCompensation.total)}`}
                      help="First Bracket Compensation + Excess Bracket Compensation."
                    />
                  </Stack>
                </SectionCard>

                <SectionCard title="4. Payable Sales Tax">
                  <Stack spacing={0.9}>
                    <SummaryLine
                      label="Total Tax Collected"
                      value={`$${fmtCurrency(selectedMonth.totalTaxCollected)}`}
                      help="Tax collected from POS."
                    />
                    <SummaryLine
                      label="Less Vendor Compensation"
                      value={`-${selectedMonth.vendorCompensation.total > 0 ? '$' : ''}${fmtCurrency(selectedMonth.vendorCompensation.total)}`}
                      help="Total Vendor Compensation."
                    />
                    <Divider />
                    <SummaryLine
                      label="Payable Sales Tax"
                      value={`$${fmtCurrency(selectedMonth.amountPayableSalesTax)}`}
                      help="Total Tax Collected - Vendor Compensation."
                    />
                  </Stack>
                </SectionCard>

                <SectionCard title="5. Daily POS Records">
                  <TableContainer sx={{ maxHeight: 360, borderRadius: 2 }}>
                      <Table size="small" stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Date</TableCell>
                            <TableCell>Day</TableCell>
                            <TableCell align="right">High Tax</TableCell>
                            <TableCell align="right">Low Tax</TableCell>
                            <TableCell align="right">Sale Tax</TableCell>
                            <TableCell align="right">Gasoline</TableCell>
                            <TableCell align="right">Lottery</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {selectedMonth.rows.map((row) => (
                            <TableRow key={row._id}>
                              <TableCell>
                                {new Date(`${String(row.date).slice(0, 10)}T00:00:00.000Z`).toLocaleDateString('en-US', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  year: 'numeric',
                                  timeZone: 'UTC'
                                })}
                              </TableCell>
                              <TableCell>{row.day}</TableCell>
                              <TableCell align="right">{fmtCurrency(Number(row.highTax ?? 0))}</TableCell>
                              <TableCell align="right">{fmtCurrency(Number(row.lowTax ?? 0))}</TableCell>
                              <TableCell align="right">{fmtCurrency(Number(row.saleTax ?? 0))}</TableCell>
                              <TableCell align="right">{fmtCurrency(Number(row.gas ?? 0))}</TableCell>
                              <TableCell align="right">{fmtCurrency(Number(row.lottery ?? 0))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
                              Totals
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {fmtCurrency(selectedMonth.highTaxSales)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {fmtCurrency(selectedMonth.lowTaxSales)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {fmtCurrency(selectedMonth.posSalesTaxCollected)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {fmtCurrency(selectedMonth.gasSales)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                              {fmtCurrency(selectedMonth.lotterySold)}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </TableContainer>
                  </SectionCard>
              </Stack>
            </DialogContent>

            <DialogActions sx={{ px: 3, py: 2 }}>
              <Button onClick={() => setSelectedMonth(null)}>Close</Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
    </>
  );
};

export default POSSaleTaxPage;
