import { Box, Button, Stack, Typography } from '@mui/material';
import { ReactNode } from 'react';
import { IconLoader } from '../brand/IconLoader';

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
        <IconLoader label={loadingLabel} />
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
