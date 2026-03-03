import {
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import type { TargetKey } from './mappingTypes';

type TargetDefinition = {
  key: TargetKey;
  label: string;
  required: boolean;
};

type Props = {
  targets: TargetDefinition[];
  headers: string[];
  targetToColumn: Record<string, string>;
  missingRequiredTargets: string[];
  onAssignTarget: (target: TargetKey, columnIdOrNull: string | null) => void;
};

export const TargetsPanel = ({
  targets,
  headers,
  targetToColumn,
  missingRequiredTargets,
  onAssignTarget,
}: Props) => {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Targets
        </Typography>
        {targets.map((target) => {
          const selectedColumn = targetToColumn[target.key] ?? '';
          const missing = target.required && missingRequiredTargets.includes(target.key);
          return (
            <Stack key={target.key} spacing={0.5}>
              <Typography variant="body2" sx={{ fontWeight: target.required ? 700 : 500 }}>
                {target.label}
              </Typography>
              <FormControl size="small" error={missing} fullWidth>
                <InputLabel id={`target-${target.key}`}>Sheet column</InputLabel>
                <Select
                  labelId={`target-${target.key}`}
                  label="Sheet column"
                  value={selectedColumn}
                  onChange={(event) => {
                    const value = String(event.target.value ?? '');
                    onAssignTarget(target.key, value || null);
                  }}
                >
                  <MenuItem value="">
                    <em>Unmapped</em>
                  </MenuItem>
                  {headers.map((header) => (
                    <MenuItem key={`${target.key}-${header}`} value={header}>
                      {header}
                    </MenuItem>
                  ))}
                </Select>
                {missing ? <FormHelperText>Required target is not mapped.</FormHelperText> : null}
              </FormControl>
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
};
