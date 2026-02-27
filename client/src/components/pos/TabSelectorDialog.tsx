import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Alert,
  Typography
} from '@mui/material';

type TabSelectorDialogProps = {
  open: boolean;
  tabs: Array<{ title: string; rowCount: number | null; columnCount: number | null }>;
  selectedTab: string;
  onClose: () => void;
  onSelect: (tab: string) => void;
};

export const TabSelectorDialog = ({
  open,
  tabs,
  selectedTab,
  onClose,
  onSelect
}: TabSelectorDialogProps) => {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Select Sheet Tab</DialogTitle>
      <DialogContent dividers>
        {tabs.length === 0 ? (
          <Alert severity="info">No tabs returned from the configured spreadsheet.</Alert>
        ) : (
          <List dense>
            {tabs.map((tab) => (
              <ListItemButton
                key={tab.title}
                selected={tab.title === selectedTab}
                onClick={() => onSelect(tab.title)}
              >
                <ListItemText
                  primary={tab.title}
                  secondary={
                    <Typography variant="caption" color="text.secondary">
                      rows: {tab.rowCount ?? 'n/a'} | columns: {tab.columnCount ?? 'n/a'}
                    </Typography>
                  }
                />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
};
