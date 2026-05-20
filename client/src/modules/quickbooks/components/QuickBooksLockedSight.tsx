import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

type QuickBooksLockedSightProps = {
  locked: boolean;
  children: React.ReactNode;
  title?: string;
  message?: string;
  actionLabel?: string;
  actionTo?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  actionHint?: string;
};

export const QuickBooksLockedSight = ({
  locked,
  children,
  title = 'Connect QuickBooks to unlock',
  message = 'Link your QuickBooks company to use this workspace.',
  actionLabel = 'Connect QuickBooks',
  actionTo = '/dashboard/quickbooks',
  onAction,
  actionDisabled = false,
  actionHint
}: QuickBooksLockedSightProps) => {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          filter: 'blur(5px)',
          pointerEvents: 'none',
          userSelect: 'none'
        }}
        aria-hidden
      >
        {children}
      </Box>
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2,
          bgcolor: 'rgba(255, 255, 255, 0.6)',
          backdropFilter: 'blur(2px)'
        }}
      >
        <Stack spacing={1.5} alignItems="center" sx={{ textAlign: 'center', px: 2, py: 3, maxWidth: 420 }}>
          <LockOutlinedIcon sx={{ fontSize: 40 }} color="action" />
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {message}
          </Typography>
          {onAction ? (
            <Button variant="contained" onClick={onAction} disabled={actionDisabled}>
              {actionLabel}
            </Button>
          ) : (
            <Button variant="contained" component={RouterLink} to={actionTo} disabled={actionDisabled}>
              {actionLabel}
            </Button>
          )}
          {actionHint ? (
            <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 360 }}>
              {actionHint}
            </Typography>
          ) : null}
        </Stack>
      </Box>
    </Box>
  );
};
