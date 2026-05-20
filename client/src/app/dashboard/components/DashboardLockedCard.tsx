import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Box, Button, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { RetailSurfaceCard, RetailSurfaceCardBody } from '../../../components';

type DashboardLockedCardProps = {
  title: string;
  message: string;
  actionLabel: string;
  actionTo?: string;
  actionDisabled?: boolean;
  onAction?: () => void;
};

export const DashboardLockedCard = ({
  title,
  message,
  actionLabel,
  actionTo = '/dashboard/settings',
  actionDisabled = false,
  onAction
}: DashboardLockedCardProps) => (
  <RetailSurfaceCard muted>
    <RetailSurfaceCardBody>
      <Box
        sx={{
          position: 'relative',
          borderRadius: 2,
          overflow: 'hidden',
          border: '1px dashed #cbd5e1',
          bgcolor: '#f8fafc',
          minHeight: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            backdropFilter: 'blur(2px)',
            background: 'rgba(255, 255, 255, 0.72)'
          }}
        />
        <Stack spacing={1.5} alignItems="center" sx={{ position: 'relative', zIndex: 1, px: 2, py: 3, textAlign: 'center' }}>
          <LockOutlinedIcon color="action" sx={{ fontSize: 40 }} />
          <Typography variant="subtitle1" fontWeight={700}>
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
            {message}
          </Typography>
          {onAction ? (
            <Button variant="contained" disabled={actionDisabled} onClick={onAction}>
              {actionLabel}
            </Button>
          ) : (
            <Button
              variant="contained"
              component={RouterLink}
              to={actionTo}
              disabled={actionDisabled}
            >
              {actionLabel}
            </Button>
          )}
        </Stack>
      </Box>
    </RetailSurfaceCardBody>
  </RetailSurfaceCard>
);
