import LaunchIcon from '@mui/icons-material/Launch';
import GitHubIcon from '@mui/icons-material/GitHub';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import VpnKeyOutlinedIcon from '@mui/icons-material/VpnKeyOutlined';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import PolicyOutlinedIcon from '@mui/icons-material/PolicyOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
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
const CODE_OF_CONDUCT_URL = `${GITHUB_REPO_URL}/blob/development/CODE_OF_CONDUCT.md`;
const SECURITY_POLICY_URL = `${GITHUB_REPO_URL}/blob/development/SECURITY.md`;

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
              RetailSync is a multi-tenant retail operations platform that connects authentication, permissions, POS ingestion, statement
              processing, QuickBooks operations, and integration management into one reviewable product surface.
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
              <Button component={Link} to="/architecture" variant="outlined" startIcon={<ArchitectureOutlinedIcon />}>
                Architecture
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
              Retail operations data is often split across login systems, POS exports, bank statements, accounting review workflows, and
              external tools like QuickBooks and Google Sheets. That fragmentation slows reconciliation, increases manual errors, and makes
              financial activity harder to review and explain.
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">What RetailSync Does</Typography>
            <Typography variant="body1" color="text.secondary">
              RetailSync brings those workflows into one company-scoped system. It handles sign-in and onboarding, server-enforced access
              control, POS-related reporting, statement processing and review, QuickBooks operations, and integration management in a shared
              operational model.
            </Typography>
          </Stack>

          <Stack spacing={2}>
            <Typography variant="h5">Active Workspaces</Typography>
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
                        <SecurityOutlinedIcon color="primary" />
                        <Typography variant="h6">Access Control</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Tenant-scoped roles, permissions, and invite handling for traceable workspace access.
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
                        Structured POS ingestion and reporting dashboards that turn raw sales data into actionable revenue and reconciliation views.
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
                        <ReceiptLongOutlinedIcon color="primary" />
                        <Typography variant="h6">Statement Processing</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Statement upload, async extraction, artifact review, and check-processing workflows for accounting review.
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
                        <HubOutlinedIcon color="primary" />
                        <Typography variant="h6">QuickBooks Workspace</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Dedicated operational surfaces for accounts, contacts, sales, money workflows, reports, and tax-related work.
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
                        <GroupOutlinedIcon color="primary" />
                        <Typography variant="h6">Settings and Access</Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary">
                        Company-scoped user management, roles, permissions, and integration settings for Google Sheets and QuickBooks.
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">Strongest End-to-End Workflow</Typography>
            <Typography variant="body1" color="text.secondary">
              The strongest integrated demo path is: authenticate into a company-scoped account, open the accounting statements workspace,
              upload or inspect a statement, review extraction artifacts and check-processing status, and continue into downstream
              QuickBooks-related operations.
            </Typography>
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="h5">Architecture and Deployment</Typography>
            <Typography variant="body1" color="text.secondary">
              The frontend is served through Firebase Hosting in the deployed environment and through an Nginx container in local Docker. An
              Express API runs on Node.js and is deployed to Cloud Run, while local Docker runs the API as its own container. MongoDB stores
              application data, Google Cloud Storage stores statement artifacts, and background processing supports async statement and check
              workflows. The architecture page gives the full structured breakdown.
            </Typography>
            <Button component={Link} to="/architecture" variant="outlined" sx={{ alignSelf: 'flex-start' }}>
              View architecture details
            </Button>
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
              <Button href={CODE_OF_CONDUCT_URL} target="_blank" rel="noreferrer" variant="outlined">
                Code of Conduct
              </Button>
              <Button href={SECURITY_POLICY_URL} target="_blank" rel="noreferrer" variant="outlined">
                Security Policy
              </Button>
            </Stack>
          </Stack>

          <Divider />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} useFlexGap flexWrap="wrap">
            <MuiLink component={Link} to="/home-demo" underline="hover">
              Project overview
            </MuiLink>
            <MuiLink component={Link} to="/architecture" underline="hover">
              Architecture
            </MuiLink>
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
