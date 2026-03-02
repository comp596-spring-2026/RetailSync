import {
  Box,
  Drawer,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography
} from '@mui/material';

type SlotItem = {
  id: string;
  name: string;
  barcode: string;
  qty: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  locationLabel?: string;
  row?: number;
  col?: number;
  items?: SlotItem[];
};

export const SlotDetailsDrawer = ({
  open,
  onClose,
  locationLabel,
  row,
  col,
  items = []
}: Props) => {
  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 320, p: 2 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Slot Details
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Location: {locationLabel ?? '-'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Row {row !== undefined ? row + 1 : '-'}, Column {col !== undefined ? col + 1 : '-'}
        </Typography>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Items in this slot
        </Typography>

        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No items in this slot yet.
          </Typography>
        ) : (
          <List dense>
            {items.map((it) => (
              <ListItem key={it.id} sx={{ px: 0 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="body2">{it.name}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        x{it.qty}
                      </Typography>
                    </Stack>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      {it.barcode}
                    </Typography>
                  }
                />
              </ListItem>
            ))}
          </List>
        )}

        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Actions (coming soon): Move item, Adjust quantity, Remove from slot.
          </Typography>
        </Box>
      </Box>
    </Drawer>
  );
};

