import LaunchIcon from '@mui/icons-material/Launch';
import GitHubIcon from '@mui/icons-material/GitHub';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  Link as MuiLink,
  Stack,
  Typography
} from '@mui/material';
import { Link } from 'react-router-dom';

const WEB_APP_URL = 'https://lively-infinity-488304-m9.web.app';
const BACKEND_HEALTH_URL = 'https://retailsync-api-qbdqiyjkbq-uw.a.run.app/health';
const GITHUB_REPO_URL = 'https://github.com/comp596-spring-2026/RetailSync';

export const HomeDemoPage = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 20% 0%, rgba(156,204,180,0.24), transparent 35%), radial-gradient(circle at 90% 100%, rgba(61,156,116,0.15), transparent 35%), #f5faf7',
        py: { xs: 6, md: 8 }
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={5}>
          <Stack spacing={2.5}>
            <Typography variant="h3" component="h1">
              RetailSync
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 900 }}>
              RetailSync is a multi-tenant retail operations platform that unifies inventory, POS ingestion, permissions, and reporting into
              one secure workflow.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button
                variant="contained"
                href={WEB_APP_URL}
                target="_blank"
                rel="noreferrer"
                startIcon={<LaunchIcon />}
              >
                Open Web App
              </Button>
              <Button
                variant="outlined"
                href={BACKEND_HEALTH_URL}
                target="_blank"
                rel="noreferrer"
                startIcon={<HealthAndSafetyIcon />}
              >
                Backend Health
              </Button>
              <Button
                variant="outlined"
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noreferrer"
                startIcon={<GitHubIcon />}
              >
                GitHub Repository
              </Button>
            </Stack>
            <Typography variant="body2">
              Contact: <MuiLink href="mailto:trupal.work@gmail.com">trupal.work@gmail.com</MuiLink>
            </Typography>
          </Stack>

          <Divider />

          <Stack spacing={1.5}>
            <Typography variant="h5">Problem Statement</Typography>
            <Typography variant="body1" color="text.secondary">
              Retail teams often experience inventory drift from spreadsheet-based updates, weak permission enforcement that exposes critical
              actions, limited audit history for stock movements, and fragmented POS import workflows that slow operations and reporting.
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">Solution Overview</Typography>
            <Typography variant="body1" color="text.secondary">
              RetailSync enforces tenant boundaries with company-scoped data access, applies server-side RBAC checks on protected endpoints,
              records immutable inventory movements through the InventoryLedger, streamlines POS ingestion workflows, and exposes reporting views
              for operational visibility.
            </Typography>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h5">Core Features</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <Card>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <VpnKeyOutlinedIcon color="primary" />
                        <Typography variant="h6">Auth + JWT</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Secure login flows with access and refresh token handling, account recovery, and optional Google OAuth support.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Card>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Inventory2OutlinedIcon color="primary" />
                        <Typography variant="h6">Inventory Management</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Tenant-scoped item, location, and stock workflows backed by immutable ledger entries for traceability.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Card>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <AssessmentOutlinedIcon color="primary" />
                        <Typography variant="h6">POS Import & Reporting</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Structured POS ingestion and reporting dashboards that turn raw sales data into actionable inventory and revenue views.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Card>
                  <CardContent>
                    <Stack spacing={1}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <SecurityOutlinedIcon color="primary" />
                        <Typography variant="h6">Role & Permission System</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Fine-grained module permissions with enforced server-side authorization for secure team operations.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">Integrations</Typography>
            <Typography variant="body1" color="text.secondary">
              RetailSync supports optional Google OAuth sign-in, configurable Google Sheets integration paths, MongoDB Atlas for durable data
              storage, Secret Manager-backed runtime configuration, and CI/CD pipelines authenticated with Workload Identity Federation.
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">Security & Architecture</Typography>
            <Typography variant="body1" color="text.secondary">
              The frontend is served through Firebase Hosting, while an Express API runs on Cloud Run and connects to MongoDB Atlas. Sensitive
              values including MONGO_URI and JWT secrets are injected from Secret Manager. Backend releases are delivered through Docker-based
              builds and GitHub Actions CI/CD automation.
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">Support & Bug Reporting</Typography>
            <Typography variant="body1" color="text.secondary">
              For support, contact <MuiLink href="mailto:trupal.work@gmail.com">trupal.work@gmail.com</MuiLink>. For bug reports, open a GitHub
              issue with reproduction steps, expected behavior, actual behavior, and screenshots or logs if available.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="outlined" href="mailto:trupal.work@gmail.com">
                Email Support
              </Button>
              <Button variant="outlined" href={`${GITHUB_REPO_URL}/issues`} target="_blank" rel="noreferrer">
                Report via GitHub Issues
              </Button>
              <Button component={Link} to="/data-deletion" variant="outlined">
                Data Deletion Request
              </Button>
            </Stack>
          </Stack>

          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <MuiLink component={Link} to="/privacy" underline="hover">
              Privacy Policy
            </MuiLink>
            <MuiLink component={Link} to="/terms" underline="hover">
              Terms of Service
            </MuiLink>
            <MuiLink component={Link} to="/data-deletion" underline="hover">
              Data Deletion
            </MuiLink>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
};
