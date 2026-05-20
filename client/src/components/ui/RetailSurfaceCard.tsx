import { Box, Paper, type PaperProps, type SxProps, type Theme } from '@mui/material';
import type { ReactNode } from 'react';

/** Matches PageHeader / standard workspace Paper panels (white, divider border). */
export const retailSurfaceSx = {
  p: 0,
  borderRadius: 2,
  border: '1px solid',
  borderColor: 'divider',
  backgroundColor: 'background.paper',
  boxShadow: 'none'
} as const;

type RetailSurfaceCardProps = PaperProps & {
  children: ReactNode;
  muted?: boolean;
};

export const RetailSurfaceCard = ({ children, muted = false, sx, ...props }: RetailSurfaceCardProps) => (
  <Paper
    elevation={0}
    sx={{
      ...retailSurfaceSx,
      ...(muted
        ? {
            backgroundColor: 'grey.50'
          }
        : {}),
      ...sx
    }}
    {...props}
  >
    {children}
  </Paper>
);

export const RetailSurfaceCardBody = ({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) => (
  <Box sx={{ p: { xs: 2, md: 2.5 }, ...sx }}>{children}</Box>
);
