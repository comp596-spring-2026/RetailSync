import { Card, CardActionArea, CardContent, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type ActionCardProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  onClick?: () => void;
};

export const ActionCard = ({ title, description, icon, onClick }: ActionCardProps) => {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea onClick={onClick} sx={{ height: '100%' }}>
        <CardContent>
          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              {icon}
              <Typography variant="subtitle1" fontWeight={600}>
                {title}
              </Typography>
            </Stack>
            {description && (
              <Typography variant="body2" color="text.secondary">
                {description}
              </Typography>
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
};

