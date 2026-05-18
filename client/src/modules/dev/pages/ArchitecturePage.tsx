import CloudDoneOutlinedIcon from '@mui/icons-material/CloudDoneOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import LanOutlinedIcon from '@mui/icons-material/LanOutlined';
import MemoryOutlinedIcon from '@mui/icons-material/MemoryOutlined';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import {
  Box,
  Card,
  CardContent,
  Container,
  Divider,
  Grid,
  Paper,
  Stack,
  Typography
} from '@mui/material';

export const ArchitecturePage = () => {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 18% 0%, rgba(156,204,180,0.22), transparent 35%), radial-gradient(circle at 88% 100%, rgba(61,156,116,0.14), transparent 35%), #f5faf7',
        py: { xs: 6, md: 8 }
      }}
    >
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <Stack spacing={1.5}>
            <Typography variant="h3" component="h1">
              RetailSync Architecture
            </Typography>
            <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 980 }}>
              Local-first view of how RetailSync runs in Docker, how browser traffic reaches the API, where workflow state lives, and how
              statement-processing jobs run without a separate Cloud Tasks dependency.
            </Typography>
          </Stack>

          <Paper
            elevation={0}
            sx={{
              p: 4,
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
              backgroundColor: '#f8fafc',
              display: 'flex',
              justifyContent: 'center',
              overflow: 'auto'
            }}
          >
            <img
              src="/architecture-diagram.png"
              alt="RetailSync official architecture diagram"
              style={{ maxWidth: '100%', height: 'auto', minWidth: '900px' }}
            />
          </Paper>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Stack spacing={1.25}>
                      <Stack direction="row" spacing={1} alignItems="center">
                      <LanOutlinedIcon color="primary" />
                      <Typography variant="h6">Client delivery</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      The React single-page application is built once and served locally by an Nginx container. That same Nginx layer handles
                      SPA routing and forwards `/api` requests to the backend container at `server:4000`.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MemoryOutlinedIcon color="primary" />
                    <Typography variant="h6">Backend runtime</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      The API layer is a Node.js and Express server running inside its own Docker container. It owns authentication, RBAC,
                      accounting workflows, POS operations, QuickBooks coordination, and settings management.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <StorageOutlinedIcon color="primary" />
                    <Typography variant="h6">Database and storage</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      MongoDB stores users, companies, permissions, statement records, checks, and workflow progress. Statement artifacts are
                      handled as a separate storage concern so uploaded PDFs, OCR outputs, structured JSON, and check crops stay outside the
                      main database documents.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Stack spacing={1.25}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <CloudDoneOutlinedIcon color="primary" />
                      <Typography variant="h6">Background processing</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Statement extraction and per-check review are still asynchronous, but this local architecture keeps that work inside the
                      server runtime. The API dispatches `statement.extract`, `statement.structure`, `checks.spawn`, and `check.process`
                      without introducing a separate Cloud Tasks service into the diagram.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Divider />

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LanOutlinedIcon color="primary" />
                      <Typography variant="h6">Docker topology</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Docker Compose runs MongoDB, the server container, the Nginx-based client container, and an optional smoke-check
                      container. This is the cleanest architecture story for a local demo because every core app runtime is visible in one
                      stack.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                    <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <StorageOutlinedIcon color="primary" />
                      <Typography variant="h6">Workflow data path</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Browser requests enter through Nginx, the Express API persists workflow state in MongoDB, and long-running accounting
                      jobs generate artifacts outside the database. That separation keeps the review workflow traceable without turning MongoDB
                      into a binary-file store.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <HubOutlinedIcon color="primary" />
                    <Typography variant="h6">Integrations</Typography>
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      RetailSync integrates with Google OAuth, Google Sheets, and QuickBooks. Those integrations support sign-in, data-source
                      configuration, and downstream accounting workflows without changing the fact that the main app runtime in this diagram is
                      local and containerized.
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Stack spacing={1.5}>
                <Typography variant="h5">Runtime breakdown</Typography>
                <Typography variant="body2" color="text.secondary">
                  The main browser experience is a React SPA served by Nginx. The API is an Express server that owns authentication, RBAC,
                  accounting workflows, and integration coordination. The statement-processing path still uses async job stages, but in this
                  local view those jobs execute from within the server runtime instead of relying on a separate queue service in the diagram.
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  For the final project story, the most important path is: user sign-in to tenant-scoped API access, browser navigation
                  through the local app shell, statement upload, async extraction and check processing, review workspace visibility, and
                  QuickBooks-related follow-through.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        </Stack>
      </Container>
    </Box>
  );
};
