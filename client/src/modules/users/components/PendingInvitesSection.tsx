import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useMemo, useState } from 'react';
import type { InviteItem } from '../state/usersSlice';

type InviteFilter = 'pending' | 'accepted' | 'expired' | 'all';

type PendingInvitesSectionProps = {
  invites: InviteItem[];
  canRevoke: boolean;
  mutating: boolean;
  onRevoke: (inviteId: string) => Promise<void>;
};

const formatDate = (value?: string | null) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const inviteStatus = (invite: InviteItem) => {
  if (invite.acceptedAt) return 'Accepted';
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() < Date.now()) return 'Expired';
  return 'Pending';
};

export const PendingInvitesSection = ({ invites, canRevoke, mutating, onRevoke }: PendingInvitesSectionProps) => {
  const [filter, setFilter] = useState<InviteFilter>('pending');

  const filteredInvites = useMemo(() => {
    return invites.filter((invite) => {
      const status = inviteStatus(invite);
      if (filter === 'all') return true;
      if (filter === 'pending') return status === 'Pending';
      if (filter === 'accepted') return status === 'Accepted';
      return status === 'Expired';
    });
  }, [filter, invites]);

  return (
    <Accordion defaultExpanded={invites.some((invite) => inviteStatus(invite) === 'Pending')}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="h6">Pending Invites</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems="center">
          <Select size="small" value={filter} onChange={(e) => setFilter(e.target.value as InviteFilter)} sx={{ minWidth: 160 }}>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="accepted">Accepted</MenuItem>
            <MenuItem value="expired">Expired</MenuItem>
            <MenuItem value="all">All</MenuItem>
          </Select>
          {/* TODO: resend invite when backend API exists */}
        </Stack>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Sent</TableCell>
              <TableCell>Expires</TableCell>
              {canRevoke ? <TableCell align="right">Actions</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredInvites.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canRevoke ? 6 : 5}>
                  <Typography variant="body2" color="text.secondary">
                    No invites in this filter.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredInvites.map((invite) => {
                const status = inviteStatus(invite);
                const canRevokeInvite = canRevoke && status === 'Pending';

                return (
                  <TableRow key={invite._id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{invite.roleId?.name ?? '—'}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={status}
                        color={status === 'Pending' ? 'warning' : status === 'Accepted' ? 'success' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>{formatDate(invite.createdAt)}</TableCell>
                    <TableCell>{formatDate(invite.expiresAt)}</TableCell>
                    {canRevoke ? (
                      <TableCell align="right">
                        {canRevokeInvite ? (
                          <Tooltip title="Revoke invite">
                            <span>
                              <IconButton
                                size="small"
                                color="error"
                                disabled={mutating}
                                onClick={() => void onRevoke(invite._id)}
                              >
                                {mutating ? <CircularProgress size={16} /> : <DeleteOutlineIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </AccordionDetails>
    </Accordion>
  );
};
