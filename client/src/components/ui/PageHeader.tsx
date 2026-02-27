import { Box, Stack, Typography } from '@mui/material';
import { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
};

export const PageHeader = ({ title, subtitle, icon }: PageHeaderProps) => {
  return (
    <Stack direction="row" spacing={1.5} alignItems="center">
      {icon && (
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: 2,
            display: 'grid',
            placeItems: 'center',
            color: 'primary.main',
            backgroundColor: 'rgba(17, 94, 89, 0.1)'
          }}
        >
          {icon}
        </Box>
      )}
      <Box>
        <Typography variant="h5">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        )}
      </Box>
    </Stack>
  );
};
