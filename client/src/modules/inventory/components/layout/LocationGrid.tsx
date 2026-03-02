import { Box, Grid } from '@mui/material';
import type { ReactNode } from 'react';

type LocationGridProps = {
  rows: number;
  cols: number;
  renderSlot?: (row: number, col: number) => ReactNode;
  onSlotClick?: (row: number, col: number) => void;
};

export const LocationGrid = ({ rows, cols, renderSlot, onSlotClick }: LocationGridProps) => {
  const cells: ReactNode[] = [];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push(
        <Grid key={`${r}-${c}`} item xs={3}>
          <Box
            onClick={() => onSlotClick?.(r, c)}
            sx={{
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              minHeight: 48,
              cursor: onSlotClick ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              '&:hover': {
                bgcolor: onSlotClick ? 'action.hover' : undefined
              }
            }}
          >
            {renderSlot ? renderSlot(r, c) : null}
          </Box>
        </Grid>
      );
    }
  }

  return (
    <Grid container spacing={1}>
      {cells}
    </Grid>
  );
};

