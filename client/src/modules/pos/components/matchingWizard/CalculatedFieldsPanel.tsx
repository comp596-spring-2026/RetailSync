import {
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import type { DerivedDefinition, DerivedKey } from './mappingTypes';

type Props = {
  derivedDefinitions: DerivedDefinition[];
  enabledDerived: DerivedKey[];
  mappedTargets: Set<string>;
  onToggle: (key: DerivedKey, enabled: boolean) => void;
};

export const CalculatedFieldsPanel = ({
  derivedDefinitions,
  enabledDerived,
  mappedTargets,
  onToggle,
}: Props) => {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Calculated Fields
        </Typography>
        {derivedDefinitions.map((definition) => {
          const missingDependencies = definition.dependencies.filter(
            (dependency) => !mappedTargets.has(String(dependency).toLowerCase()),
          );
          const disabled = missingDependencies.length > 0;
          const checked = enabledDerived.includes(definition.key);

          return (
            <Stack key={definition.key} spacing={0.25}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={checked}
                    onChange={(_event, value) => onToggle(definition.key, value)}
                    disabled={disabled}
                  />
                }
                label={definition.label}
              />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                Formula: {definition.formula}
              </Typography>
              {disabled ? (
                <Typography variant="caption" color="warning.main" sx={{ ml: 4 }}>
                  Requires: {missingDependencies.join(', ')}
                </Typography>
              ) : null}
            </Stack>
          );
        })}
      </Stack>
    </Paper>
  );
};
