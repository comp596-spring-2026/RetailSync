import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

type WorkspaceShortcutCardProps = {
  title: string;
  description: string;
  icon: ReactNode;
  to?: string;
  locked?: boolean;
  lockedHint?: string;
  onClick?: () => void;
};

export const WorkspaceShortcutCard = ({
  title,
  description,
  icon,
  to,
  locked = false,
  lockedHint = 'Ask an admin for access',
  onClick
}: WorkspaceShortcutCardProps) => {
  const content = (
    <CardContent sx={{ p: 2.25 }}>
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1.25} alignItems="center" justifyContent="space-between">
          <Stack direction="row" spacing={1.25} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                display: 'grid',
                placeItems: 'center',
                bgcolor: locked ? '#f1f5f9' : '#e8f5e9',
                color: locked ? 'text.disabled' : 'success.dark'
              }}
            >
              {icon}
            </Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {title}
            </Typography>
          </Stack>
          {locked ? <Chip size="small" icon={<LockOutlinedIcon />} label="Locked" variant="outlined" /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {locked ? lockedHint : description}
        </Typography>
      </Stack>
    </CardContent>
  );

  return (
    <Card
      variant="outlined"
      sx={{
        height: '100%',
        borderRadius: 3,
        borderColor: locked ? '#e2e8f0' : '#d7ead8',
        bgcolor: locked ? '#fafafa' : '#f8fcf7',
        opacity: locked ? 0.9 : 1
      }}
    >
      {locked ? (
        content
      ) : to ? (
        <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      ) : (
        <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
          {content}
        </CardActionArea>
      )}
    </Card>
  );
};
