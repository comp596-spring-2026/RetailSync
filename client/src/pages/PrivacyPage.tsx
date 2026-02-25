import { Stack, Typography } from '@mui/material';
import PrivacyTipOutlinedIcon from '@mui/icons-material/PrivacyTipOutlined';
import { AuthShell } from '../components/AuthShell';

export const PrivacyPage = () => {
  return (
    <AuthShell
      title="Privacy Policy"
      subtitle="How RetailSync handles data for sign-in and operations."
      icon={<PrivacyTipOutlinedIcon color="primary" />}
      width={760}
      logoHeight={80}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Last updated: February 25, 2026
        </Typography>
        <Typography variant="body2">
          RetailSync collects account profile data, authentication identifiers, and operational records such as inventory, POS imports,
          locations, and role permissions required to run your workspace.
        </Typography>
        <Typography variant="h6">How we use data</Typography>
        <Typography variant="body2">
          Data is used to authenticate users, enforce access permissions, maintain inventory and reporting features, and provide account
          recovery and security notices.
        </Typography>
        <Typography variant="h6">Google API data</Typography>
        <Typography variant="body2">
          If Google sign-in or Google integrations are enabled, RetailSync receives profile and OAuth tokens needed to complete the specific
          integration flow you request.
        </Typography>
        <Typography variant="h6">Sharing</Typography>
        <Typography variant="body2">
          RetailSync does not sell personal data. Data is shared only with infrastructure providers required to operate the service (such as
          Google Cloud and MongoDB) and only for service delivery.
        </Typography>
        <Typography variant="h6">Retention and deletion</Typography>
        <Typography variant="body2">
          Data is retained while your account is active. You can request deletion by contacting{' '}
          <Typography
            component="a"
            href="mailto:trupal.work@gmail.com"
            variant="body2"
            sx={{ fontWeight: 600, textDecoration: 'none', color: 'primary.main' }}
          >
            trupal.work@gmail.com
          </Typography>
          . See the data deletion page for request details and expected processing.
        </Typography>
        <Typography variant="h6">Security</Typography>
        <Typography variant="body2">
          RetailSync uses encrypted transport, role-based access control, and secret-managed credentials to protect account and operational
          data.
        </Typography>
      </Stack>
    </AuthShell>
  );
};
