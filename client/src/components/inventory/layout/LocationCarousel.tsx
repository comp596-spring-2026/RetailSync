import { Box, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';

type Location = {
  id: string;
  label: string;
  type?: string;
};

type Props = {
  locations: Location[];
  activeId: string | null;
  onSelect: (id: string) => void;
  icon?: (loc: Location) => ReactNode;
};

export const LocationCarousel = ({ locations, activeId, onSelect, icon }: Props) => {
  return (
    <Box
      sx={{
        display: 'flex',
        overflowX: 'auto',
        py: 1,
        gap: 1
      }}
    >
      {locations.map((loc) => {
        const active = loc.id === activeId;
        return (
          <Box
            key={loc.id}
            onClick={() => onSelect(loc.id)}
            sx={{
              flex: '0 0 auto',
              minWidth: 140,
              borderRadius: 2,
              border: '1px solid',
              borderColor: active ? 'primary.main' : 'divider',
              bgcolor: active ? 'primary.light' : 'background.paper',
              cursor: 'pointer',
              px: 1.5,
              py: 1
            }}
          >
            <Stack spacing={0.5}>
              <Stack direction="row" spacing={0.75} alignItems="center">
                {icon?.(loc)}
                <Typography variant="subtitle2">{loc.label}</Typography>
              </Stack>
              {loc.type && (
                <Typography variant="caption" color="text.secondary">
                  {loc.type}
                </Typography>
              )}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
};

