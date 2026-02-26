import {
  Alert,
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
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
  const mappedByDefault = useMemo(() => {
    const next = { ...mapping };
    for (const suggestion of suggestions) {
      if (!next[suggestion.header] && suggestion.score >= 0.5) {
        next[suggestion.header] = suggestion.suggestion;
      }
    }
    return next;
  }, [mapping, suggestions]);

  const previewRows = sampleRows.slice(0, 3);

  return (
    <Stack spacing={2}>
      <Alert severity="info">Map each sheet column to a RetailSync target field.</Alert>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Column</TableCell>
            <TableCell>Suggested</TableCell>
            <TableCell>Map To</TableCell>
            <TableCell>Trim</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {headers.map((header) => {
            const selected = mappedByDefault[header] ?? '';
            const transform = selected ? (transforms[selected] as Record<string, unknown> | undefined) : undefined;
            return (
              <TableRow key={header}>
                <TableCell>{header}</TableCell>
                <TableCell>
                  {suggestions.find((entry) => entry.header === header)?.suggestion ?? '-'}
                </TableCell>
                <TableCell>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`target-${header}`}>Target</InputLabel>
                    <Select
                      labelId={`target-${header}`}
                      value={selected}
                      label="Target"
                      onChange={(event) =>
                        onChangeMapping({
                          ...mappedByDefault,
                          [header]: String(event.target.value)
                        })
                      }
                    >
                      <MenuItem value="">Unmapped</MenuItem>
                      {targetFields.map((field) => (
                        <MenuItem key={field} value={field}>
                          {field}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell>
                  {selected ? (
                    <Switch
                      checked={Boolean(transform?.trim)}
                      onChange={(event) =>
                        onChangeTransforms({
                          ...transforms,
                          [selected]: {
                            ...(transform ?? {}),
                            trim: event.target.checked
                          }
                        })
                      }
                    />
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {rowErrors.length > 0 && (
        <Alert severity="warning">
          {rowErrors[0].errors[0]?.message ?? 'Mapping validation returned row-level issues.'}
        </Alert>
      )}

      <Box>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Sample Preview (first 3 rows)
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              {headers.map((header) => (
                <TableCell key={`head-${header}`}>{header}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {previewRows.map((row, index) => (
              <TableRow key={`row-${index}`}>
                {headers.map((_, col) => (
                  <TableCell key={`cell-${index}-${col}`}>{row[col] ?? ''}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
};
