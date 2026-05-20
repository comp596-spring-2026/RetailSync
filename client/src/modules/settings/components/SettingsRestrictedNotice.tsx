import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Chip, Stack, Typography } from '@mui/material';

type SettingsRestrictedNoticeProps = {
  compact?: boolean;
};

export const SettingsRestrictedNotice = ({ compact = false }: SettingsRestrictedNoticeProps) => {
  if (compact) {
    return (
      <Stack direction="row" spacing={1} alignItems="center">
        <Chip size="small" icon={<LockOutlinedIcon />} label="Restricted" variant="outlined" color="default" />
        <Typography variant="caption" color="text.secondary">
          Admin permission required to make changes.
        </Typography>
      </Stack>
    );
  }

  return (
    <Alert severity="info" icon={<LockOutlinedIcon fontSize="inherit" />} sx={{ borderRadius: 2 }}>
      You can view this area, but you need admin permission to make changes.
    </Alert>
  );
};
