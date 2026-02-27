import { Stack, Typography } from '@mui/material';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { AuthShell } from '../../components';

export const DataDeletionPage = () => {
  return (
    <AuthShell
      title="Data Deletion"
      subtitle="How to request account and data deletion in RetailSync."
      icon={<DeleteOutlineOutlinedIcon color="primary" />}
      width={760}
      logoHeight={80}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Last updated: February 25, 2026
        </Typography>
        <Typography variant="body2">
          To request deletion of your RetailSync account and related data, email{' '}
          <Typography
            component="a"
            href="mailto:trupal.work@gmail.com"
            variant="body2"
            sx={{ fontWeight: 600, textDecoration: 'none', color: 'primary.main' }}
          >
            trupal.work@gmail.com
          </Typography>{' '}
          from the account owner email address.
        </Typography>
        <Typography variant="h6">What can be deleted</Typography>
        <Typography variant="body2">
          We can delete account profile data, workspace membership, inventory and POS import records, roles, and application settings
          associated with your workspace.
        </Typography>
        <Typography variant="h6">What may be retained</Typography>
        <Typography variant="body2">
          Limited operational logs may be temporarily retained for security and incident response requirements before scheduled removal.
        </Typography>
        <Typography variant="h6">Processing timeline</Typography>
        <Typography variant="body2">
          Deletion requests are reviewed and processed as soon as practical after identity confirmation.
        </Typography>
      </Stack>
    </AuthShell>
  );
};
