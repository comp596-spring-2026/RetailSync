import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { ReactNode } from 'react';

const LOADER_ICON_SIZE = 40;
const LOADER_RING_SIZE = 64;

/** Loader: rotating icon with circular progress ring */
const LoadingSpinner = ({ label }: { label: string }) => (
  <Stack alignItems="center" spacing={2}>
    <Box
      sx={{
        position: 'relative',
        width: LOADER_RING_SIZE,
        height: LOADER_RING_SIZE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <CircularProgress
        size={LOADER_RING_SIZE}
        thickness={4}
        sx={{ position: 'absolute', color: 'primary.main' }}
      />
      <Box
        component="img"
        src="/brand/icon.png"
        alt=""
        sx={{
          width: LOADER_ICON_SIZE,
          height: LOADER_ICON_SIZE,
          objectFit: 'contain',
          animation: 'loaderIconSpin 1s linear infinite',
          '@keyframes loaderIconSpin': {
            from: { transform: 'rotate(0deg)' },
            to: { transform: 'rotate(360deg)' }
          }
        }}
      />
    </Box>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
  </Stack>
);

export type LoadingEmptyStateWrapperProps = {
  /** When true, shows the loading UI instead of children or empty state */
  loading: boolean;
  /** When true and not loading, shows the empty state instead of children */
  empty: boolean;
  /** Content to render when not loading and not empty */
  children: ReactNode;
  /** Label shown under the loader (default: "Loading..." ) */
  loadingLabel?: string;
  /** Minimum height for loading/empty area so layout doesn't jump (default: 200) */
  minHeight?: number;
  /** Empty state: primary message */
  emptyMessage?: string;
  /** Empty state: optional secondary line */
  emptySecondary?: string;
  /** Empty state: optional action button label */
  emptyActionLabel?: string;
  /** Empty state: called when empty action is clicked */
  onEmptyAction?: () => void;
  /** Empty state: custom content (overrides message/action when provided) */
  emptyContent?: ReactNode;
};

export const LoadingEmptyStateWrapper = ({
  loading,
  empty,
  children,
  loadingLabel = 'Loading...',
  minHeight = 200,
  emptyMessage = 'No data yet',
  emptySecondary,
  emptyActionLabel,
  onEmptyAction,
  emptyContent
}: LoadingEmptyStateWrapperProps) => {
  if (loading) {
    return (
      <Box sx={{ minHeight, display: 'grid', placeItems: 'center' }}>
        <LoadingSpinner label={loadingLabel} />
      </Box>
    );
  }

  if (empty) {
    return (
      <Box sx={{ minHeight, display: 'grid', placeItems: 'center', py: 4 }}>
        {emptyContent ?? (
          <Stack alignItems="center" spacing={1.5} sx={{ maxWidth: 360, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              {emptyMessage}
            </Typography>
            {emptySecondary && (
              <Typography variant="body2" color="text.secondary">
                {emptySecondary}
              </Typography>
            )}
            {emptyActionLabel && onEmptyAction && (
              <Button variant="outlined" onClick={onEmptyAction} size="medium">
                {emptyActionLabel}
              </Button>
            )}
          </Stack>
        )}
      </Box>
    );
  }

  return <>{children}</>;
};
