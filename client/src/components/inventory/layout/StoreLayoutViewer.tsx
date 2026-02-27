import { Box, Paper, Stack, Typography } from '@mui/material';
import WarehouseIcon from '@mui/icons-material/Warehouse';
import { useEffect, useMemo, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../app/store/hooks';
import { fetchLocations, selectLocations } from '../../../slices/locations/locationsSlice';
import { LocationCarousel } from './LocationCarousel';
import { LocationGrid } from './LocationGrid';
import { SlotDetailsDrawer } from './SlotDetailsDrawer';

type LocationRecord = {
  _id: string;
  code: string;
  type: 'shelf' | 'fridge' | 'freezer' | 'backroom';
  label: string;
};

export const StoreLayoutViewer = () => {
  const dispatch = useAppDispatch();
  const locations = useAppSelector(selectLocations) as LocationRecord[];
  const [activeId, setActiveId] = useState<string | null>(null);
  const [slotOpen, setSlotOpen] = useState(false);
  const [slotRow, setSlotRow] = useState<number | undefined>();
  const [slotCol, setSlotCol] = useState<number | undefined>();

  useEffect(() => {
    if (locations.length === 0) {
      void dispatch(fetchLocations());
    } else if (!activeId) {
      setActiveId(locations[0]._id);
    }
  }, [dispatch, locations, activeId]);

  const active = useMemo(
    () => locations.find((loc) => loc._id === activeId) ?? null,
    [locations, activeId]
  );

  const mockItems = useMemo(
    () =>
      active
        ? [
            {
              id: `${active._id}-sample-1`,
              name: `${active.label} Item A`,
              barcode: '123456789012',
              qty: 4
            },
            {
              id: `${active._id}-sample-2`,
              name: `${active.label} Item B`,
              barcode: '987654321098',
              qty: 2
            }
          ]
        : [],
    [active]
  );

  const handleSlotClick = (row: number, col: number) => {
    setSlotRow(row);
    setSlotCol(col);
    setSlotOpen(true);
  };

  const gridSize = useMemo(() => {
    if (!active) return { rows: 2, cols: 4 };
    if (active.type === 'fridge' || active.type === 'freezer') return { rows: 3, cols: 3 };
    if (active.type === 'backroom') return { rows: 4, cols: 4 };
    return { rows: 2, cols: 5 };
  }, [active]);

  return (
    <Paper sx={{ p: 2, height: '100%' }}>
      <Stack spacing={1.5} sx={{ height: '100%' }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <WarehouseIcon fontSize="small" color="primary" />
          <Typography variant="subtitle1">Store Layout</Typography>
        </Stack>

        <LocationCarousel
          locations={locations.map((loc) => ({
            id: loc._id,
            label: loc.label,
            type: loc.type
          }))}
          activeId={activeId}
          onSelect={setActiveId}
          icon={() => <WarehouseIcon fontSize="small" />}
        />

        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {active ? (
            <LocationGrid
              rows={gridSize.rows}
              cols={gridSize.cols}
              onSlotClick={handleSlotClick}
              renderSlot={(r, c) => (
                <Typography variant="caption" color="text.secondary">
                  {r + 1}-{c + 1}
                </Typography>
              )}
            />
          ) : (
            <Typography variant="body2" color="text.secondary">
              No locations yet. Create at least one location to see the layout.
            </Typography>
          )}
        </Box>
      </Stack>

      <SlotDetailsDrawer
        open={slotOpen}
        onClose={() => setSlotOpen(false)}
        locationLabel={active?.label}
        row={slotRow}
        col={slotCol}
        items={mockItems}
      />
    </Paper>
  );
};

