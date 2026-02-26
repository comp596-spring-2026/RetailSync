import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';

type ConfirmDeleteDialogProps = {
  open: boolean;
  title: string;
  description: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDeleteDialog = ({
  open,
  title,
  description,
  loading = false,
  onConfirm,
  onCancel
}: ConfirmDeleteDialogProps) => {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{description}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" disabled={loading}>
          {loading ? 'Deleting...' : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
