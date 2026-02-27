import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LogoBig } from '../../components';

type ErrorPageLayoutProps = {
  code: number;
  title: string;
  message: string;
  primaryAction?: { label: string; to: string };
  secondaryAction?: { label: string; to: string };
  icon?: ReactNode;
};

export const ErrorPageLayout = ({
  code,
  title,
  message,
  primaryAction,
  secondaryAction,
  icon
}: ErrorPageLayoutProps) => (
  <Box
    sx={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      px: 2,
      background:
        'radial-gradient(circle at 15% 0%, rgba(156,204,180,0.2), transparent 40%), radial-gradient(circle at 85% 100%, rgba(61,156,116,0.12), transparent 40%), #f5faf7'
    }}
  >
    <Paper sx={{ width: 440, maxWidth: '100%', p: 4 }}>
      <Stack spacing={3} alignItems="center" textAlign="center">
        <LogoBig height={48} />
        {icon && <Box sx={{ color: 'text.secondary' }}>{icon}</Box>}
        <Typography variant="overline" color="text.secondary">
          Error {code}
        </Typography>
        <Typography variant="h5">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" justifyContent="center">
          {primaryAction && (
            <Button component={Link} to={primaryAction.to} variant="contained">
              {primaryAction.label}
            </Button>
          )}
          {secondaryAction && (
            <Button component={Link} to={secondaryAction.to} variant="outlined">
              {secondaryAction.label}
            </Button>
          )}
        </Stack>
      </Stack>
    </Paper>
  </Box>
);
