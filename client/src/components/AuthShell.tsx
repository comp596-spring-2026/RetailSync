import { Box, Paper, Stack, Typography } from '@mui/material';
import { ReactNode } from 'react';
import { BrandLogo } from './BrandLogo';

type AuthShellProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  width?: number;
  logoHeight?: number;
  hideHeader?: boolean;
  paperPadding?: number;
  children: ReactNode;
};

export const AuthShell = ({
  title,
  subtitle,
  icon,
  width = 460,
  logoHeight = 62,
  hideHeader = false,
  paperPadding = 4,
  children
}: AuthShellProps) => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        position: 'relative',
        px: 2,
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 15% 0%, rgba(156,204,180,0.25), transparent 35%), radial-gradient(circle at 85% 100%, rgba(61,156,116,0.16), transparent 35%), #f5faf7'
      }}
    >
      <Paper sx={{ width, maxWidth: '100%', p: paperPadding }}>
        <Stack spacing={2.5}>
          <Stack spacing={1.25} alignItems="center">
            <BrandLogo variant="big" height={logoHeight} />
          </Stack>
          {!hideHeader && (
            <Box sx={{ textAlign: 'center' }}>
              <Typography
                variant="h5"
                gutterBottom
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}
              >
                {icon}
                {title}
              </Typography>
              {subtitle && (
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              )}
            </Box>
          )}
          {children}
        </Stack>
      </Paper>
    </Box>
  );
};
