import GoogleIcon from '@mui/icons-material/Google';
import ShareIcon from '@mui/icons-material/Share';
import { Box, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';

export type SourceType = 'oauth' | 'shared';

type Props = {
  value: SourceType;
  onChange: (value: SourceType) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
};

export const SourceSwitch = ({
  value,
  onChange,
  disabled = false,
  size = 'small',
  fullWidth = false,
}: Props) => {
  return (
    <Box
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      sx={{ width: fullWidth ? '100%' : 'auto' }}
    >
      <ToggleButtonGroup
        exclusive
        size={size}
        value={value}
        fullWidth={fullWidth}
        onChange={(_event, next: SourceType | null) => {
          if (!next) return;
          onChange(next);
        }}
        aria-label="Google Sheets source switch"
        sx={{
          borderRadius: 999,
          p: 0.5,
          bgcolor: 'action.hover',
          '& .MuiToggleButtonGroup-grouped': {
            border: 0,
            borderRadius: '999px !important',
            px: 1.5,
            py: 0.5,
            textTransform: 'none',
            color: 'text.secondary',
          },
          '& .MuiToggleButtonGroup-grouped.Mui-selected': {
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
          },
          '& .MuiToggleButtonGroup-grouped.Mui-selected:hover': {
            bgcolor: 'primary.dark',
          },
        }}
      >
        <ToggleButton value="oauth" aria-label="OAuth source">
          <Stack direction="row" spacing={0.75} alignItems="center">
            <GoogleIcon fontSize="small" />
            <Typography variant="caption" fontWeight={700}>
              OAuth
            </Typography>
          </Stack>
        </ToggleButton>
        <ToggleButton value="shared" aria-label="Shared source">
          <Stack direction="row" spacing={0.75} alignItems="center">
            <ShareIcon fontSize="small" />
            <Typography variant="caption" fontWeight={700}>
              Shared
            </Typography>
          </Stack>
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

