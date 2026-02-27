import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
};

export const SectionHeader = ({ title, icon, actions }: SectionHeaderProps) => {
  return (
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{ mb: 1.5 }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        {icon && (
          <Box sx={{ display: 'flex', alignItems: 'center', color: 'primary.main' }}>
            {icon}
          </Box>
        )}
        <Typography variant="h6">{title}</Typography>
      </Stack>
      {actions && <Box>{actions}</Box>}
    </Stack>
  );
};

