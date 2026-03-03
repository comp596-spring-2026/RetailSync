import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useEffect, useMemo } from 'react';
import {
  autoFixDuplicateColumnUsage,
  getCompatibility,
  normalizeDerivedConfig,
  serializeDerivedConfig,
  setColumnForDerivedMap,
  setColumnForTarget,
  setDerivedMode,
  toMappingByColumn,
  toMappingByTarget,
} from './matchingWizard/mappingLogic';
import {
  DERIVED_DEFINITIONS,
  DERIVED_DEFAULT_FORMULAS,
  MAPPABLE_TARGET_KEYS,
  OPTIONAL_TARGET_KEYS,
  REQUIRED_TARGET_KEYS,
  TARGET_LABELS,
  type DerivedKey,
  type MappingCompatibility,
  type MappableTargetKey,
} from './matchingWizard/mappingTypes';
import { getMissingDependencies } from './matchingWizard/expressionValidation';

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
  onCompatibilityChange?: (compatibility: MappingCompatibility) => void;
};

const isDateHeader = (value: string) => value.trim().toLowerCase() === 'date';
const hasTimestampWord = (value: string) => value.trim().toLowerCase().includes('timestamp');

const toOptionalNumber = (value: unknown): number | null => {
  if (value == null) return null;
  const cleaned = String(value).replace(/[$,\s]/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const isValidUtcDateParts = (year: number, month: number, day: number): boolean => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
};

const parsePreviewDate = (value: string): Date | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // ISO date format
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split('-').map(Number);
    if (!isValidUtcDateParts(year, month, day)) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  // US date format MM/DD/YYYY
  const usMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    const year = Number(usMatch[3]);
    if (!isValidUtcDateParts(year, month, day)) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Common dashed US format MM-DD-YYYY
  const dashedUsMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashedUsMatch) {
    const month = Number(dashedUsMatch[1]);
    const day = Number(dashedUsMatch[2]);
    const year = Number(dashedUsMatch[3]);
    if (!isValidUtcDateParts(year, month, day)) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  // Google sheets / Excel serial date fallback.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 25569) {
      const utcMs = Math.round((serial - 25569) * 86400 * 1000);
      const parsed = new Date(utcMs);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const previewDayFromDate = (value: string) => {
  const parsed = parsePreviewDate(value);
  if (!parsed) return '—';
  return parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
};

const getSafeHeaderValue = (value: string | null | undefined, headers: string[]) =>
  value && headers.includes(value) ? value : '';

const evaluateDerivedPreviewValue = (key: DerivedKey, context: Record<string, unknown>): unknown => {
  const n = (value: unknown) => toOptionalNumber(value);
  const getTotalSales = () => {
    const fromContext = n(context.totalSales);
    if (fromContext != null) return fromContext;
    const highTax = n(context.highTax);
    const lowTax = n(context.lowTax);
    if (highTax == null || lowTax == null) return null;
    return highTax + lowTax;
  };

  switch (key) {
    case 'day': {
      const rawDate = context.date;
      if (typeof rawDate !== 'string' || !rawDate.trim()) return null;
      return previewDayFromDate(rawDate.trim());
    }
    case 'totalSales': {
      return getTotalSales();
    }
    case 'creditPlusLottery': {
      const creditCard = n(context.creditCard);
      const lotteryPayout = n(context.lotteryPayout);
      if (creditCard == null || lotteryPayout == null) return null;
      return creditCard + lotteryPayout;
    }
    case 'cashDiff': {
      const totalSales = getTotalSales();
      const gas = n(context.gas);
      const lottery = n(context.lottery);
      const saleTax = n(context.saleTax);
      const creditCard = n(context.creditCard);
      const lotteryPayout = n(context.lotteryPayout);
      if (
        totalSales == null ||
        gas == null ||
        lottery == null ||
        saleTax == null ||
        creditCard == null ||
        lotteryPayout == null
      ) {
        return null;
      }
      return totalSales + gas + lottery + saleTax - (creditCard + lotteryPayout);
    }
    default:
      return null;
  }
};

export const MatchingWizard = ({
  headers,
  sampleRows,
  suggestions: _suggestions,
  mapping,
  transforms,
  targetFields: _targetFields,
  rowErrors,
  onChangeMapping,
  onChangeTransforms,
  onCompatibilityChange,
}: MatchingWizardProps) => {
  void _suggestions;
  void _targetFields;

  const mappingByTarget = useMemo(() => toMappingByTarget(mapping), [mapping]);
  const derivedConfig = useMemo(() => {
    const raw = normalizeDerivedConfig(transforms, mapping);
    const next: typeof raw = { ...raw };
    for (const key of Object.keys(next) as DerivedKey[]) {
      next[key] = {
        ...next[key],
        mode: key === 'cashDiff' ? 'calc' : (next[key].mode === 'map' ? 'map' : 'calc'),
        equation: DERIVED_DEFAULT_FORMULAS[key],
        sheetColumnId: key === 'cashDiff' ? null : next[key].sheetColumnId,
      };
    }
    return next;
  }, [mapping, transforms]);

  const compatibility = useMemo(
    () => getCompatibility({ mappingByTarget, derivedConfig, headers }),
    [derivedConfig, headers, mappingByTarget],
  );

  useEffect(() => {
    onCompatibilityChange?.(compatibility);
  }, [compatibility, onCompatibilityChange]);

  const pushState = (nextMappingByTarget: ReturnType<typeof toMappingByTarget>, nextDerivedConfig = derivedConfig) => {
    onChangeMapping(toMappingByColumn(nextMappingByTarget));
    onChangeTransforms({
      ...transforms,
      ...serializeDerivedConfig(nextDerivedConfig),
    });
  };

  const mappedCount = useMemo(
    () => Object.values(mappingByTarget).filter(Boolean).length,
    [mappingByTarget],
  );
  const totalMappableCount = MAPPABLE_TARGET_KEYS.length;
  const mappedPercent = totalMappableCount > 0 ? Math.round((mappedCount / totalMappableCount) * 100) : 0;

  const statusSeverity: 'success' | 'warning' | 'error' =
    compatibility.status === 'ok' ? 'success' : compatibility.status === 'warn' ? 'warning' : 'error';

  const canUseDateQuickFix = useMemo(() => {
    const dateHeader = headers.find(isDateHeader);
    if (!dateHeader) return false;
    return mappingByTarget.date !== dateHeader;
  }, [headers, mappingByTarget.date]);

  const canClearTimestampMapping = useMemo(() => {
    if (Object.values(mappingByTarget).some((column) => column && hasTimestampWord(column))) return true;
    return Object.values(derivedConfig).some(
      (entry) => entry.mode === 'map' && entry.sheetColumnId && hasTimestampWord(entry.sheetColumnId),
    );
  }, [derivedConfig, mappingByTarget]);

  const previewDescriptors = useMemo(() => {
    const mappedTargets = MAPPABLE_TARGET_KEYS
      .filter((key) => mappingByTarget[key])
      .map((key) => ({
        id: `target:${key}`,
        label: TARGET_LABELS[key],
        kind: 'target' as const,
        sourceText: `From: ${mappingByTarget[key]}`,
        columnId: mappingByTarget[key],
      }));

    const visibleDerivedKeys = DERIVED_DEFINITIONS.map((definition) => definition.key);
    const derived = visibleDerivedKeys.map((key) => {
        const entry = derivedConfig[key];
        return {
          id: `derived:${key}`,
          label: TARGET_LABELS[key],
          kind: 'derived' as const,
          sourceText: entry.mode === 'map' ? `From: ${entry.sheetColumnId ?? '—'}` : `Calc: ${DERIVED_DEFAULT_FORMULAS[key]}`,
          mode: entry.mode,
          columnId: entry.sheetColumnId,
        };
      });

    return [...mappedTargets, ...derived];
  }, [derivedConfig, mappingByTarget]);

  const previewRows = useMemo(() => {
    const rows = sampleRows.slice(0, 10);
    return rows.map((row) => {
      const context: Record<string, unknown> = {};
      for (const key of MAPPABLE_TARGET_KEYS) {
        const header = mappingByTarget[key];
        if (!header) continue;
        const index = headers.indexOf(header);
        if (index < 0) continue;
        const raw = row[index];
        if (key === 'date') {
          context[key] = String(raw ?? '').trim();
        } else if (key === 'notes') {
          context[key] = String(raw ?? '');
        } else {
          const numeric = toOptionalNumber(raw);
          if (numeric != null) context[key] = numeric;
        }
      }

      if (context.totalSales == null) {
        const highTax = toOptionalNumber(context.highTax);
        const lowTax = toOptionalNumber(context.lowTax);
        if (highTax != null && lowTax != null) context.totalSales = highTax + lowTax;
      }

      return previewDescriptors.map((descriptor) => {
        if (descriptor.kind === 'target') {
          const index = headers.indexOf(String(descriptor.columnId));
          const value = index >= 0 ? row[index] : '';
          if (descriptor.id === 'target:date') context.date = String(value ?? '').trim();
          return String(value ?? '—') || '—';
        }

        const derivedKey = descriptor.id.replace('derived:', '') as DerivedKey;
        if (descriptor.mode === 'map' && descriptor.columnId) {
          const index = headers.indexOf(descriptor.columnId);
          const raw = index >= 0 ? row[index] : '';
          if (derivedKey === 'day') {
            context[derivedKey] = String(raw ?? '').trim();
          } else {
            const numeric = toOptionalNumber(raw);
            if (numeric != null) context[derivedKey] = numeric;
          }
          return String(raw ?? '—') || '—';
        }

        const evaluated = evaluateDerivedPreviewValue(derivedKey, context);
        if (derivedKey === 'day') {
          const dayValue = typeof evaluated === 'string' && evaluated.trim() ? evaluated.trim() : '—';
          if (dayValue !== '—') context.day = dayValue;
          return dayValue;
        }
        const numeric = toOptionalNumber(evaluated);
        if (numeric == null) return '—';
        context[derivedKey] = numeric;
        return numeric.toFixed(2);
      });
    });
  }, [derivedConfig, headers, mappingByTarget, previewDescriptors, sampleRows]);

  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Column Mapping
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Map spreadsheet columns to RetailSync fields. Required fields must be mapped.
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1} alignItems="center">
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress variant="determinate" value={mappedPercent} size={36} thickness={5} />
                <Box
                  sx={{
                    top: 0,
                    left: 0,
                    bottom: 0,
                    right: 0,
                    position: 'absolute',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {mappedPercent}%
                  </Typography>
                </Box>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {mappedCount}/{totalMappableCount} mapped
              </Typography>
            </Stack>
          </Stack>

          <Divider />

          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Required (must map all)
          </Typography>
          {REQUIRED_TARGET_KEYS.map((target) => {
            const value = getSafeHeaderValue(mappingByTarget[target], headers);
            const isMissing = !value;
            return (
              <Stack key={target} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                <Typography variant="body2" sx={{ width: { xs: '100%', md: 220 }, fontWeight: 600 }}>
                  {TARGET_LABELS[target]} *
                </Typography>
                <FormControl size="small" fullWidth error={isMissing}>
                  <InputLabel id={`required-${target}`}>Select sheet column</InputLabel>
                  <Select
                    labelId={`required-${target}`}
                    label="Select sheet column"
                    value={value}
                    onChange={(event) => {
                      const next = setColumnForTarget(mappingByTarget, target, String(event.target.value || ''));
                      pushState(next);
                    }}
                  >
                    <MenuItem value="">
                      <em>Unmapped</em>
                    </MenuItem>
                    {headers.map((header) => (
                      <MenuItem key={`required-${target}-${header}`} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </Select>
                  {isMissing ? <FormHelperText>Required field is missing.</FormHelperText> : null}
                </FormControl>
              </Stack>
            );
          })}

          <Typography variant="body2" sx={{ fontWeight: 600, mt: 1 }}>
            Optional / Other
          </Typography>
          {OPTIONAL_TARGET_KEYS.map((target) => {
            const value = getSafeHeaderValue(mappingByTarget[target], headers);
            return (
              <Stack key={target} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }}>
                <Typography variant="body2" sx={{ width: { xs: '100%', md: 220 }, fontWeight: 600 }}>
                  {TARGET_LABELS[target]}
                </Typography>
                <FormControl size="small" fullWidth>
                  <InputLabel id={`optional-${target}`}>Select sheet column</InputLabel>
                  <Select
                    labelId={`optional-${target}`}
                    label="Select sheet column"
                    value={value}
                    onChange={(event) => {
                      const next = setColumnForTarget(mappingByTarget, target, String(event.target.value || ''));
                      pushState(next);
                    }}
                  >
                    <MenuItem value="">
                      <em>Unmapped</em>
                    </MenuItem>
                    {headers.map((header) => (
                      <MenuItem key={`optional-${target}-${header}`} value={header}>
                        {header}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            );
          })}

          <Typography variant="caption" color="text.secondary">
            + Add custom field (placeholder)
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined">
        <Stack spacing={2} sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Calculated Fields (optional)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Choose per field: Calculate or Map to column.
          </Typography>

          {DERIVED_DEFINITIONS.map((definition) => {
            const entry = derivedConfig[definition.key];
            const canMapToColumn = definition.key !== 'cashDiff';
            const missingDependencies = getMissingDependencies(definition.key, mappingByTarget, derivedConfig);
            const calcHasIssue = entry.mode === 'calc' && missingDependencies.length > 0;

            return (
              <Paper key={definition.key} variant="outlined" sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {definition.label}
                  </Typography>

                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={entry.mode === 'map' ? 'map' : 'calc'}
                    onChange={(_event, value: 'calc' | 'map' | null) => {
                      if (!value) return;
                      const nextDerived = setDerivedMode(derivedConfig, definition.key, value);
                      pushState(mappingByTarget, nextDerived);
                    }}
                    aria-label={`${definition.label} mode`}
                  >
                    <ToggleButton value="calc">Calculate</ToggleButton>
                    {canMapToColumn ? <ToggleButton value="map">Map to Column</ToggleButton> : null}
                  </ToggleButtonGroup>

                  {entry.mode === 'calc' ? (
                    <Stack spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                        Formula: {DERIVED_DEFAULT_FORMULAS[definition.key]}
                      </Typography>
                      <Typography variant="caption" color={calcHasIssue ? 'error.main' : 'text.secondary'}>
                        {missingDependencies.length > 0
                          ? `Requires: ${missingDependencies.map((key) => TARGET_LABELS[key]).join(', ')}`
                          : 'Ready to calculate'}
                      </Typography>
                    </Stack>
                  ) : null}

                  {entry.mode === 'map' && canMapToColumn ? (
                    <Stack spacing={1}>
                      <FormControl fullWidth size="small" error={!entry.sheetColumnId}>
                        <InputLabel id={`derived-map-${definition.key}`}>Sheet column</InputLabel>
                        <Select
                          labelId={`derived-map-${definition.key}`}
                          label="Sheet column"
                          value={getSafeHeaderValue(entry.sheetColumnId, headers)}
                          onChange={(event) => {
                            const result = setColumnForDerivedMap(
                              derivedConfig,
                              mappingByTarget,
                              definition.key,
                              String(event.target.value || ''),
                            );
                            pushState(result.mappingByTarget, result.derivedConfig);
                          }}
                        >
                          <MenuItem value="">
                            <em>Unmapped</em>
                          </MenuItem>
                          {headers.map((header) => (
                            <MenuItem key={`derived-${definition.key}-${header}`} value={header}>
                              {header}
                            </MenuItem>
                          ))}
                        </Select>
                        {!entry.sheetColumnId ? <FormHelperText>Select a sheet column.</FormHelperText> : null}
                      </FormControl>
                    </Stack>
                  ) : null}
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      </Paper>

      <Paper variant="outlined">
        <Stack spacing={1} sx={{ p: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Data Preview (first 10 rows)
          </Typography>
          {previewDescriptors.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No mapped targets or calculated fields enabled.
            </Typography>
          ) : (
            <TableContainer
              sx={{
                maxHeight: 360,
                width: '100%',
                overflowX: 'auto',
                overflowY: 'auto',
                border: (theme) => `1px solid ${theme.palette.divider}`,
                borderRadius: 1,
              }}
            >
              <Table size="small" stickyHeader sx={{ minWidth: 1100 }}>
                <TableHead>
                  <TableRow>
                    {previewDescriptors.map((descriptor) => (
                      <TableCell key={descriptor.id}>
                        <Stack spacing={0.25}>
                          <Typography variant="caption" sx={{ fontWeight: 700 }}>
                            {descriptor.label}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {descriptor.sourceText}
                          </Typography>
                        </Stack>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {previewRows.map((row, rowIndex) => (
                    <TableRow key={`preview-row-${rowIndex}`}>
                      {row.map((value, colIndex) => (
                        <TableCell key={`preview-cell-${rowIndex}-${colIndex}`}>{value || '—'}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={1}>
          <Alert severity={statusSeverity} variant="outlined">
            Compatibility: {compatibility.status.toUpperCase()}
          </Alert>

          {compatibility.missingRequiredTargets.length > 0 ? (
            <Typography variant="body2" color="error.main">
              Missing required: {compatibility.missingRequiredTargets.map((key) => TARGET_LABELS[key]).join(', ')}
            </Typography>
          ) : null}

          {compatibility.duplicateColumnUsage.length > 0 ? (
            <Typography variant="body2" color="error.main">
              Duplicate column usage: {compatibility.duplicateColumnUsage.map((item) => `${item.columnId} (${item.usedBy.join(', ')})`).join('; ')}
            </Typography>
          ) : null}

          {compatibility.invalidDerivedEquations.length > 0 ? (
            <Typography variant="body2" color="error.main">
              Invalid derived configuration: {compatibility.invalidDerivedEquations.map((key) => TARGET_LABELS[key]).join(', ')}
            </Typography>
          ) : null}

          {compatibility.derivedDependencyIssues.length > 0 ? (
            <Typography variant="body2" color="error.main">
              Missing dependencies: {compatibility.derivedDependencyIssues
                .map((issue) => `${TARGET_LABELS[issue.key]} (${issue.missingDependencies.map((dep) => TARGET_LABELS[dep]).join(', ')})`)
                .join('; ')}
            </Typography>
          ) : null}

          {compatibility.status !== 'ok' ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button
                size="small"
                variant="outlined"
                disabled={!canUseDateQuickFix}
                onClick={() => {
                  const dateHeader = headers.find(isDateHeader);
                  if (!dateHeader) return;
                  const next = setColumnForTarget(mappingByTarget, 'date', dateHeader);
                  pushState(next);
                }}
              >
                Use DATE as Date
              </Button>
              <Button
                size="small"
                variant="outlined"
                disabled={!canClearTimestampMapping}
                onClick={() => {
                  const nextMapping = { ...mappingByTarget };
                  for (const key of MAPPABLE_TARGET_KEYS) {
                    if (nextMapping[key] && hasTimestampWord(String(nextMapping[key]))) {
                      nextMapping[key] = null;
                    }
                  }
                  const nextDerived = { ...derivedConfig };
                  for (const key of Object.keys(nextDerived) as DerivedKey[]) {
                    const entry = nextDerived[key];
                    if (entry.mode === 'map' && entry.sheetColumnId && hasTimestampWord(entry.sheetColumnId)) {
                      nextDerived[key] = { ...entry, sheetColumnId: null };
                    }
                  }
                  pushState(nextMapping, nextDerived);
                }}
              >
                Clear Timestamp mapping
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  const fixed = autoFixDuplicateColumnUsage(mappingByTarget, derivedConfig);
                  pushState(fixed.mappingByTarget, fixed.derivedConfig);
                }}
              >
                Auto-fix duplicates
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      {rowErrors.length > 0 ? (
        <Alert severity="error" variant="outlined">
          Validation detected {rowErrors.length} row error{rowErrors.length > 1 ? 's' : ''}. Fix mapping and retry.
        </Alert>
      ) : null}
    </Stack>
  );
};
