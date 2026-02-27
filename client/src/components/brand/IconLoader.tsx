import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { BRAND_ASSETS } from './assets';

const DEFAULT_ICON_SIZE = 40;
const DEFAULT_RING_SIZE = 64;

type IconLoaderProps = {
  /** Label shown below the spinner */
  label?: string;
  /** Icon size in pixels */
  iconSize?: number;
  /** Outer ring size in pixels */
  ringSize?: number;
};

export const IconLoader = ({
  label = 'Loading...',
  iconSize = DEFAULT_ICON_SIZE,
  ringSize = DEFAULT_RING_SIZE
}: IconLoaderProps) => (
  <Stack alignItems="center" spacing={2}>
    <Box
      sx={{
        position: 'relative',
        width: ringSize,
        height: ringSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <CircularProgress
        size={ringSize}
        thickness={4}
        sx={{ position: 'absolute', color: 'primary.main' }}
      />
      <Box
        component="img"
        src={BRAND_ASSETS.icon}
        alt=""
        sx={{
          width: iconSize,
          height: iconSize,
          objectFit: 'contain',
          animation: 'brandIconLoaderSpin 1s linear infinite',
          '@keyframes brandIconLoaderSpin': {
            from: { transform: 'rotate(0deg)' },
            to: { transform: 'rotate(360deg)' }
          }
        }}
      />
    </Box>
    {label ? (
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    ) : null}
  </Stack>
);
