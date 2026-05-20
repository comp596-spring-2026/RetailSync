import {
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle
} from '@mui/material';
import type { MemberUser } from '../utils/memberAccess';

type DeleteMemberDialogProps = {
  open: boolean;
  member: MemberUser | null;
  mutating: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export const DeleteMemberDialog = ({ open, member, mutating, onClose, onConfirm }: DeleteMemberDialogProps) => {
  const fullName = member ? `${member.firstName} ${member.lastName}`.trim() : '';

  return (
    <Dialog open={open} onClose={mutating ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Remove member?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Remove {fullName || 'this member'} ({member?.email}) from the organization? They will lose access to this
          workspace.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={mutating}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={mutating}
          startIcon={mutating ? <CircularProgress size={14} color="inherit" /> : undefined}
          onClick={() => void onConfirm()}
        >
          Remove
        </Button>
      </DialogActions>
    </Dialog>
  );
};
