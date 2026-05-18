import { Stack, Typography } from '@mui/material';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import { AuthShell } from '../../../../components';

export const TermsPage = () => {
  return (
    <AuthShell
      title="Terms of Service"
      subtitle="Terms for using the RetailSync application."
      icon={<GavelOutlinedIcon color="primary" />}
      width={760}
      logoHeight={80}
    >
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">
          Last updated: May 17, 2026
        </Typography>
        <Typography variant="body2">
          RetailSync is provided for business POS, accounting, access-management, and integration-assisted operations. By using the service,
          you agree to use it only for lawful business purposes and to keep account credentials secure.
        </Typography>
        <Typography variant="h6">Account responsibilities</Typography>
        <Typography variant="body2">
          You are responsible for users invited to your workspace, permissions assigned to them, and accuracy of operational data entered into
          the system.
        </Typography>
        <Typography variant="h6">Allowed use of the platform</Typography>
        <Typography variant="body2">
          RetailSync may be used to manage company-scoped workflows such as sign-in, POS data handling, statement review, role management,
          and integrations. You are responsible for ensuring that uploaded data and connected systems are authorized for your use.
        </Typography>
        <Typography variant="h6">Availability and changes</Typography>
        <Typography variant="body2">
          Features may evolve over time. RetailSync may apply updates, security fixes, and maintenance actions to keep the service reliable.
        </Typography>
        <Typography variant="h6">Acceptable use</Typography>
        <Typography variant="body2">
          You must not attempt unauthorized access, interfere with service operation, or upload malicious content through any RetailSync
          endpoint.
        </Typography>
        <Typography variant="h6">Infrastructure and third-party services</Typography>
        <Typography variant="body2">
          Some features depend on providers such as Google Cloud, MongoDB, Google APIs, and QuickBooks APIs. Availability of those services
          can affect specific workflows even when the application itself is reachable.
        </Typography>
        <Typography variant="h6">Support and contact</Typography>
        <Typography variant="body2">
          For support, legal, or privacy requests contact{' '}
          <Typography
            component="a"
            href="mailto:trupal.work@gmail.com"
            variant="body2"
            sx={{ fontWeight: 600, textDecoration: 'none', color: 'primary.main' }}
          >
            trupal.work@gmail.com
          </Typography>
          .
        </Typography>
      </Stack>
    </AuthShell>
  );
};
