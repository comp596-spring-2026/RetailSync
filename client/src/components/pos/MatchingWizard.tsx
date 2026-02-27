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
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
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

const CONFIDENCE_LABELS: Record<string, { label: string; color: 'success' | 'warning' | 'default' }> = {
  high:   { label: 'High', color: 'success' },
  medium: { label: 'Medium', color: 'warning' },
  low:    { label: 'Low', color: 'default' }
};

const getConfidence = (score: number) => {
  if (score >= 0.8) return CONFIDENCE_LABELS.high;
  if (score >= 0.5) return CONFIDENCE_LABELS.medium;
  return CONFIDENCE_LABELS.low;
};

const TARGET_LABELS: Record<string, string> = {
  date: 'Date',
  sku: 'SKU',
  qty: 'Quantity',
  price: 'Price',
  name: 'Name',
  barcode: 'Barcode'
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
  const resolvedMapping = useMemo(() => {
    const next = { ...mapping };
    for (const s of suggestions) {
      if (!next[s.header] && s.score >= 0.5) next[s.header] = s.suggestion;
    }
    return next;
  }, [mapping, suggestions]);

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

      {/* Mapping table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 600, width: '5%' }}>#</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '22%' }}>Sheet Column</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '12%' }}>Confidence</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '5%', textAlign: 'center' }} />
              <TableCell sx={{ fontWeight: 600, width: '28%' }}>Map To</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '18%' }}>Sample</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '10%', textAlign: 'center' }}>Trim</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {headers.map((header, idx) => {
              const target = resolvedMapping[header] ?? '';
              const suggestion = suggestions.find((s) => s.header === header);
              const confidence = suggestion ? getConfidence(suggestion.score) : null;
              const transform = target ? (transforms[target] as Record<string, unknown> | undefined) : undefined;
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
                    {confidence ? (
                      <Tooltip title={`Match score: ${((suggestion?.score ?? 0) * 100).toFixed(0)}%`}>
                        <Chip label={confidence.label} size="small" color={confidence.color} variant="outlined" sx={{ fontSize: 11 }} />
                      </Tooltip>
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
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
                        {targetFields.map((field) => {
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
                      </Select>
                    </FormControl>
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
                  <TableCell sx={{ textAlign: 'center' }}>
                    {isMapped ? (
                      <Switch
                        size="small"
                        checked={Boolean(transform?.trim)}
                        onChange={(e) =>
                          onChangeTransforms({
                            ...transforms,
                            [target]: { ...(transform ?? {}), trim: e.target.checked }
                          })
                        }
                      />
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
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
