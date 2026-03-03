import {
  FormControl,
  InputLabel,
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
  Typography,
} from '@mui/material';
import type { TargetKey } from './mappingTypes';

type Props = {
  headers: string[];
  sampleRows: string[][];
  mappingByColumn: Record<string, string>;
  targetOptions: Array<{ key: TargetKey; label: string }>;
  onMapToTarget: (columnId: string, targetKeyOrNull: string | null) => void;
};

export const MappingTable = ({
  headers,
  sampleRows,
  mappingByColumn,
  targetOptions,
  onMapToTarget,
}: Props) => {
  const firstRow = sampleRows[0] ?? [];

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ fontWeight: 700, width: 36 }}>#</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Sheet Column</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 120 }}>Status</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Map To</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Sample</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {headers.map((header, index) => {
            const target = String(mappingByColumn[header] ?? '');
            const mapped = target.length > 0;
            return (
              <TableRow key={header}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {header}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color={mapped ? 'success.main' : 'text.secondary'}>
                    {mapped ? 'Mapped' : 'Unmapped'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`map-to-${header}`}>Target</InputLabel>
                    <Select
                      labelId={`map-to-${header}`}
                      label="Target"
                      value={target}
                      onChange={(event) => {
                        const value = String(event.target.value ?? '');
                        onMapToTarget(header, value || null);
                      }}
                    >
                      <MenuItem value="">
                        <em>Unmapped</em>
                      </MenuItem>
                      {targetOptions.map((option) => (
                        <MenuItem key={`${header}-${option.key}`} value={option.key}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </TableCell>
                <TableCell>
                  <Stack>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {firstRow[index] || '—'}
                    </Typography>
                  </Stack>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
