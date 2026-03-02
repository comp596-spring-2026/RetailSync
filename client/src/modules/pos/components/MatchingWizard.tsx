import {
  Alert,
  alpha,
  Box,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
  TextField
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useMemo } from 'react';

export type MappingSuggestion = {
  col: string;
  header: string;
  suggestion: string;
  score: number;
};

type MatchingWizardProps = {
  headers: string[];
  sampleRows: string[][];
  suggestions: MappingSuggestion[];
  mapping: Record<string, string>;
  transforms: Record<string, unknown>;
  targetFields: string[];
  rowErrors: Array<{ rowIndex: number; errors: Array<{ col: string; message: string }> }>;
  onChangeMapping: (next: Record<string, string>) => void;
  onChangeTransforms: (next: Record<string, unknown>) => void;
};

const AUTO_MAP_CONFIDENCE_THRESHOLD = 0.85;
const normalizeTargetValue = (target: string) => {
  const trimmed = String(target ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('custom:')) {
    return `custom:${trimmed.replace(/^custom:/, '').trim().toLowerCase()}`;
  }
  return trimmed.toLowerCase();
};

const TARGET_LABELS: Record<string, string> = {
  date: 'Date',
  day: 'Day',
  highTax: 'High Tax',
  lowTax: 'Low Tax',
  saleTax: 'Sale Tax',
  totalSales: 'Total Sales',
  gas: 'Gas',
  lottery: 'Lottery',
  creditCard: 'Credit Card',
  lotteryPayout: 'Lottery Payout (Cash)',
  clTotal: 'Credit + Lottery Total',
  cash: 'Cash Diff',
  cashPayout: 'Cash Payout',
  cashExpenses: 'Cash Expenses',
  notes: 'Notes / Description'
};

export const MatchingWizard = ({
  headers,
  sampleRows,
  suggestions,
  mapping,
  transforms,
  targetFields,
  rowErrors,
  onChangeMapping,
  onChangeTransforms
}: MatchingWizardProps) => {
  void transforms;
  void targetFields;
  void onChangeTransforms;

  const resolvedMapping = useMemo(() => {
    const next: Record<string, string> = {};
    const used = new Set<string>();

    for (const header of headers) {
      const chosen = mapping[header];
      if (!chosen) continue;
      const key = normalizeTargetValue(chosen);
      if (!key || used.has(key)) {
        next[header] = '';
        continue;
      }
      used.add(key);
      next[header] = chosen;
    }

    for (const s of suggestions) {
      if (next[s.header]) continue;
      if (s.score < AUTO_MAP_CONFIDENCE_THRESHOLD) continue;
      const candidate = String(s.suggestion ?? '').trim();
      if (!candidate) continue;
      const key = normalizeTargetValue(candidate);
      if (!key || used.has(key)) continue;
      next[s.header] = candidate;
      used.add(key);
    }
    return next;
  }, [headers, mapping, suggestions]);

  const requiredTargets = useMemo(
    () => [
      'date',
      'highTax',
      'lowTax',
      'saleTax',
      'gas',
      'lottery',
      'creditCard',
      'lotteryPayout',
      'cashExpenses'
    ],
    []
  );

  const optionalTargets = useMemo(() => ['notes'], []);
  const calculatedTargets = useMemo(
    () => ['day', 'totalSales', 'cash', 'clTotal', 'cashPayout'],
    []
  );

  const mappedTargets = useMemo(
    () => new Set(Object.values(resolvedMapping).filter(Boolean)),
    [resolvedMapping]
  );

  const missingRequired = useMemo(
    () => requiredTargets.filter((t) => !mappedTargets.has(t)),
    [requiredTargets, mappedTargets]
  );

  const calculatedFields = useMemo(
    () => [
      { key: 'day', label: 'Day' },
      { key: 'totalSales', label: 'Total Sales (highTax + lowTax)' },
      { key: 'cash', label: 'Cash (totalSales - creditCard)' },
      { key: 'clTotal', label: 'CL Total (creditCard + lottery)' },
      { key: 'cashPayout', label: 'Cash Payout (cashExpenses fallback)' }
    ],
    []
  );

  const mappedCount = useMemo(
    () => Object.values(resolvedMapping).filter(Boolean).length,
    [resolvedMapping]
  );
  const totalCols = headers.length;
  const mappedPct = totalCols > 0 ? Math.round((mappedCount / totalCols) * 100) : 0;

  const usedTargets = useMemo(
    () => new Set(Object.values(resolvedMapping).filter(Boolean)),
    [resolvedMapping]
  );

  const previewRows = sampleRows.slice(0, 3);
  const flatErrors = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const re of rowErrors) {
      for (const e of re.errors) {
        const list = map.get(e.col) ?? [];
        list.push(e.message);
        map.set(e.col, list);
      }
    }
    return map;
  }, [rowErrors]);

  return (
    <Stack spacing={2.5}>
      {/* Summary bar */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle2">
              Column Mapping
            </Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip
                icon={<CheckCircleIcon />}
                label={`${mappedCount} / ${totalCols} mapped`}
                size="small"
                color={mappedCount === totalCols ? 'success' : mappedCount > 0 ? 'warning' : 'default'}
                variant="outlined"
              />
              {rowErrors.length > 0 && (
                <Chip
                  icon={<WarningAmberIcon />}
                  label={`${rowErrors.length} error${rowErrors.length > 1 ? 's' : ''}`}
                  size="small"
                  color="error"
                  variant="outlined"
                />
              )}
            </Stack>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={mappedPct}
            sx={{
              height: 6,
              borderRadius: 3,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
              '& .MuiLinearProgress-bar': { borderRadius: 3 }
            }}
          />
          <Typography variant="caption" color="text.secondary">
            Map your spreadsheet columns to RetailSync fields. Columns with high-confidence matches are pre-filled.
          </Typography>
        </Stack>
      </Paper>

      {/* Required/optional + calculated */}
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.25}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
            <Typography variant="subtitle2">Required fields</Typography>
            <Chip
              size="small"
              variant="outlined"
              color={missingRequired.length === 0 ? 'success' : 'warning'}
              label={
                missingRequired.length === 0
                  ? 'All required fields mapped'
                  : `Missing: ${missingRequired.map((t) => TARGET_LABELS[t] ?? t).join(', ')}`
              }
            />
          </Stack>

          <Stack direction="row" spacing={1} flexWrap="wrap">
            {requiredTargets.map((t) => (
              <Chip
                key={t}
                size="small"
                variant={mappedTargets.has(t) ? 'filled' : 'outlined'}
                color={mappedTargets.has(t) ? 'success' : 'default'}
                label={TARGET_LABELS[t] ?? t}
              />
            ))}
          </Stack>

          <Typography variant="subtitle2" sx={{ mt: 0.5 }}>Optional fields</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {optionalTargets.map((t) => (
              <Chip
                key={t}
                size="small"
                variant={mappedTargets.has(t) ? 'filled' : 'outlined'}
                color={mappedTargets.has(t) ? 'success' : 'default'}
                label={TARGET_LABELS[t] ?? t}
              />
            ))}
            <Chip size="small" variant="outlined" label="Custom fields allowed" />
          </Stack>

          <Typography variant="subtitle2" sx={{ mt: 0.5 }}>Calculated fields (optional direct mapping)</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {calculatedFields.map((f) => (
              <Chip
                key={f.key}
                size="small"
                variant="outlined"
                color={mappedTargets.has(f.key) ? 'success' : missingRequired.length === 0 ? 'default' : 'default'}
                label={mappedTargets.has(f.key) ? `${f.label} (mapped)` : missingRequired.length === 0 ? `${f.label} (auto)` : `${f.label} (needs required fields)`}
              />
            ))}
          </Stack>
        </Stack>
      </Paper>

      {/* Mapping table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 600, width: '5%' }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '22%' }}>Sheet Column</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '12%' }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '5%', textAlign: 'center' }} />
              <TableCell sx={{ fontWeight: 600, width: '28%' }}>Map To</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '18%' }}>Sample</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {headers.map((header, idx) => {
              const target = resolvedMapping[header] ?? '';
              const isMapped = !!target;
              const hasError = flatErrors.has(header);
              const sampleVal = previewRows[0]?.[idx] ?? '';

              return (
                <TableRow
                  key={header}
                  sx={{
                    bgcolor: hasError
                      ? (t) => alpha(t.palette.error.main, 0.04)
                      : isMapped
                        ? (t) => alpha(t.palette.success.main, 0.03)
                        : undefined,
                    '&:hover': { bgcolor: 'action.hover' }
                  }}
                >
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">{String.fromCharCode(65 + idx)}</Typography>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={0.5}>
                      {isMapped
                        ? <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
                        : <LinkOffIcon sx={{ fontSize: 16, color: 'text.disabled' }} />}
                      <Typography variant="body2" fontWeight={500}>{header}</Typography>
                    </Stack>
                    {hasError && (
                      <Typography variant="caption" color="error.main" sx={{ display: 'block', mt: 0.25 }}>
                        {flatErrors.get(header)?.[0]}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {isMapped ? (
                      <Chip label="Mapped" size="small" color="success" variant="outlined" sx={{ fontSize: 11 }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Unmapped
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <ArrowForwardIcon sx={{ fontSize: 16, color: isMapped ? 'primary.main' : 'text.disabled' }} />
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" fullWidth>
                      <InputLabel id={`map-${header}`}>Target</InputLabel>
                      <Select
                        labelId={`map-${header}`}
                        value={target}
                        label="Target"
                        onChange={(e) => onChangeMapping({ ...resolvedMapping, [header]: String(e.target.value) })}
                      >
                        <MenuItem value="">
                          <em>Unmapped</em>
                        </MenuItem>
                        <MenuItem disabled>
                          <Typography variant="caption" color="text.secondary">Required</Typography>
                        </MenuItem>
                        {requiredTargets.map((field) => {
                          const taken = usedTargets.has(field) && target !== field;
                          return (
                            <MenuItem key={field} value={field} disabled={taken}>
                              {TARGET_LABELS[field] ?? field}
                              {taken && (
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                                  (in use)
                                </Typography>
                              )}
                            </MenuItem>
                          );
                        })}
                        <MenuItem disabled>
                          <Typography variant="caption" color="text.secondary">Optional</Typography>
                        </MenuItem>
                        {optionalTargets.map((field) => {
                          const taken = usedTargets.has(field) && target !== field;
                          return (
                            <MenuItem key={field} value={field} disabled={taken}>
                              {TARGET_LABELS[field] ?? field}
                              {taken && (
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                                  (in use)
                                </Typography>
                              )}
                            </MenuItem>
                          );
                        })}
                        <MenuItem disabled>
                          <Typography variant="caption" color="text.secondary">Calculated (optional direct mapping)</Typography>
                        </MenuItem>
                        {calculatedTargets.map((field) => {
                          const taken = usedTargets.has(field) && target !== field;
                          return (
                            <MenuItem key={field} value={field} disabled={taken}>
                              {TARGET_LABELS[field] ?? field}
                              {taken && (
                                <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
                                  (in use)
                                </Typography>
                              )}
                            </MenuItem>
                          );
                        })}
                        <MenuItem value="custom:">
                          <em>Custom field…</em>
                        </MenuItem>
                      </Select>
                    </FormControl>
                    {target.startsWith('custom:') && (
                      <TextField
                        size="small"
                        margin="dense"
                        fullWidth
                        label="Custom field name"
                        placeholder="e.g. timestamp"
                        value={target.replace(/^custom:/, '')}
                        onChange={(e) => onChangeMapping({ ...resolvedMapping, [header]: `custom:${e.target.value}` })}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={sampleVal || '(empty)'}>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          maxWidth: 140,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: sampleVal ? 'text.primary' : 'text.disabled',
                          fontFamily: 'monospace'
                        }}
                      >
                        {sampleVal || '—'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Validation errors */}
      {rowErrors.length > 0 && (
        <Alert severity="warning" variant="outlined">
          <Typography variant="subtitle2" gutterBottom>Validation Issues</Typography>
          {rowErrors.slice(0, 5).map((re, i) => (
            <Typography key={i} variant="caption" display="block">
              Row {re.rowIndex + 1}: {re.errors.map((e) => `${e.col} — ${e.message}`).join(', ')}
            </Typography>
          ))}
          {rowErrors.length > 5 && (
            <Typography variant="caption" color="text.secondary">
              ...and {rowErrors.length - 5} more
            </Typography>
          )}
        </Alert>
      )}

      {/* Data preview */}
      {previewRows.length > 0 && (
        <Box>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Data Preview (first {previewRows.length} rows)
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 200, overflow: 'auto' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper', width: 40 }}>#</TableCell>
                  {headers.map((header) => {
                    const target = resolvedMapping[header];
                    return (
                      <TableCell key={header} sx={{ fontWeight: 600, bgcolor: 'background.paper' }}>
                        <Stack spacing={0}>
                          <Typography variant="caption" fontWeight={600}>{header}</Typography>
                          {target && (
                            <Typography variant="caption" color="primary.main" sx={{ fontSize: 10 }}>
                              → {TARGET_LABELS[target] ?? target}
                            </Typography>
                          )}
                        </Stack>
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {previewRows.map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{rowIdx + 1}</Typography>
                    </TableCell>
                    {headers.map((_, colIdx) => (
                      <TableCell key={colIdx}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                          {row[colIdx] ?? ''}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Stack>
  );
};
