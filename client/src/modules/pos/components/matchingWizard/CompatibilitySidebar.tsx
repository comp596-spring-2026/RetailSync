import {
  Alert,
  Button,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { MappingCompatibility, TargetKey } from './mappingTypes';

type Props = {
  compatibility: MappingCompatibility;
  targetLabels: Record<TargetKey, string>;
  canUseDateQuickFix: boolean;
  canClearTimestampMapping: boolean;
  onAutoFixDuplicates: () => void;
  onUseDateQuickFix: () => void;
  onClearTimestampMapping: () => void;
};

export const CompatibilitySidebar = ({
  compatibility,
  targetLabels,
  canUseDateQuickFix,
  canClearTimestampMapping,
  onAutoFixDuplicates,
  onUseDateQuickFix,
  onClearTimestampMapping,
}: Props) => {
  const statusLabel = compatibility.isValid
    ? 'OK'
    : compatibility.duplicateTargets.length > 0
      ? 'ERROR'
      : 'WARN';

  const severity = compatibility.isValid
    ? 'success'
    : compatibility.duplicateTargets.length > 0
      ? 'error'
      : 'warning';

  return (
    <Paper variant="outlined" sx={{ p: 2, position: 'sticky', top: 16 }}>
      <Stack spacing={1.25}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Compatibility
        </Typography>
        <Alert severity={severity} variant="outlined">
          Status: {statusLabel}
        </Alert>

        {!compatibility.isValid ? (
          <Stack spacing={0.75}>
            {compatibility.missingRequiredTargets.length > 0 ? (
              <Typography variant="body2" color="text.secondary">
                Missing required: {compatibility.missingRequiredTargets.map((target) => targetLabels[target]).join(', ')}
              </Typography>
            ) : null}
            {compatibility.duplicateTargets.length > 0 ? (
              <Typography variant="body2" color="text.secondary">
                Duplicate targets: {compatibility.duplicateTargets.join(', ')}
              </Typography>
            ) : null}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            All required fields are mapped and unique.
          </Typography>
        )}

        <Typography variant="caption" color="text.secondary">
          Suggested fixes
        </Typography>
        <Stack spacing={0.75}>
          <Button size="small" variant="outlined" onClick={onAutoFixDuplicates} disabled={compatibility.duplicateTargets.length === 0}>
            Auto-fix duplicates
          </Button>
          <Button size="small" variant="outlined" onClick={onUseDateQuickFix} disabled={!canUseDateQuickFix}>
            Use DATE as Date
          </Button>
          <Button size="small" variant="outlined" onClick={onClearTimestampMapping} disabled={!canClearTimestampMapping}>
            Clear Timestamp mapping
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
};
