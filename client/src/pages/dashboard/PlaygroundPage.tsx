import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  Typography
} from '@mui/material';
import ScienceOutlinedIcon from '@mui/icons-material/ScienceOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import { PageHeader } from '../../components';
import { api } from '../../api';

type CheckStatus = 'idle' | 'running' | 'ok' | 'error';

type CheckResult = {
  status: CheckStatus;
  detail: string;
};

const CLIENT_ENV_ITEMS = [
  { key: 'VITE_API_URL', value: import.meta.env.VITE_API_URL ?? 'TBD' }
];

const SERVER_ENV_ITEMS = [
  'PORT',
  'MONGO_URI',
  'CLIENT_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET'
];

const getHealthUrl = (apiBase: string) => {
  if (!apiBase) return '/health';
  const withoutApi = apiBase.replace(/\/api\/?$/, '');
  return `${withoutApi}/health`;
};

const getEnvReadinessUrl = (apiBase: string) => {
  if (!apiBase) return '/health/env-readiness';
  const withoutApi = apiBase.replace(/\/api\/?$/, '');
  return `${withoutApi}/health/env-readiness`;
};

const FRONTEND_REQUIRED_KEYS = ['VITE_API_URL'] as const;

type EnvReadinessResponse = {
  status: 'ok';
  data: {
    allRequiredPresent: boolean;
    required: Record<string, boolean>;
    optional: Record<string, boolean>;
  };
};

const statusChip = (status: CheckStatus) => {
  if (status === 'ok') return <Chip size="small" color="success" icon={<CheckCircleOutlineIcon />} label="OK" />;
  if (status === 'error') return <Chip size="small" color="error" icon={<ErrorOutlineIcon />} label="Failed" />;
  if (status === 'running') return <Chip size="small" color="warning" icon={<HourglassTopIcon />} label="Running" />;
  return <Chip size="small" variant="outlined" label="Not run" />;
};

export const PlaygroundPage = () => {
  const [tab, setTab] = useState(0);
  const [apiHealth, setApiHealth] = useState<CheckResult>({ status: 'idle', detail: 'Health check has not run yet.' });
  const [authCheck, setAuthCheck] = useState<CheckResult>({
    status: 'idle',
    detail: 'Auth check has not run yet.'
  });
  const [dbCheck, setDbCheck] = useState<CheckResult>({ status: 'idle', detail: 'DB check has not run yet.' });
  const [backendEnvCheck, setBackendEnvCheck] = useState<CheckResult>({
    status: 'idle',
    detail: 'Backend env readiness check has not run yet.'
  });
  const [backendRequiredEnv, setBackendRequiredEnv] = useState<Record<string, boolean>>({});
  const [backendOptionalEnv, setBackendOptionalEnv] = useState<Record<string, boolean>>({});

  const apiBase = import.meta.env.VITE_API_URL ?? '';
  const healthUrl = useMemo(() => getHealthUrl(apiBase), [apiBase]);
  const envReadinessUrl = useMemo(() => getEnvReadinessUrl(apiBase), [apiBase]);
  const frontendRequiredStatus = useMemo(
    () =>
      FRONTEND_REQUIRED_KEYS.map((key) => ({
        key,
        present: Boolean(import.meta.env[key])
      })),
    []
  );
  const frontendAllRequiredPresent = frontendRequiredStatus.every((item) => item.present);

  const runApiHealth = async () => {
    setApiHealth({ status: 'running', detail: 'Checking /health...' });
    try {
      const res = await fetch(healthUrl, { credentials: 'include' });
      if (!res.ok) {
        setApiHealth({ status: 'error', detail: `Health endpoint returned ${res.status}` });
        return;
      }
      setApiHealth({ status: 'ok', detail: `Health endpoint reachable at ${healthUrl}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown network error';
      setApiHealth({ status: 'error', detail: message });
    }
  };

  const runAuthCheck = async () => {
    setAuthCheck({ status: 'running', detail: 'Checking /api/auth/me...' });
    try {
      const res = await api.get('/auth/me');
      const email = (res.data as { data?: { email?: string } }).data?.email ?? 'authenticated user';
      setAuthCheck({ status: 'ok', detail: `Authenticated as ${email}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auth check failed';
      setAuthCheck({ status: 'error', detail: message });
    }
  };

  const runDbCheck = async () => {
    setDbCheck({ status: 'running', detail: 'Checking data path through /api/company/mine...' });
    try {
      const res = await api.get('/company/mine');
      const name = (res.data as { data?: { name?: string } }).data?.name ?? 'company loaded';
      setDbCheck({ status: 'ok', detail: `Company data reachable (${name})` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DB check failed';
      setDbCheck({ status: 'error', detail: message });
    }
  };

  const runBackendEnvCheck = async () => {
    setBackendEnvCheck({ status: 'running', detail: 'Checking backend environment readiness...' });
    try {
      const res = await fetch(envReadinessUrl, { credentials: 'include' });
      if (!res.ok) {
        setBackendEnvCheck({ status: 'error', detail: `Env readiness endpoint returned ${res.status}` });
        return;
      }
      const payload = (await res.json()) as EnvReadinessResponse;
      setBackendRequiredEnv(payload.data.required ?? {});
      setBackendOptionalEnv(payload.data.optional ?? {});
      if (payload.data.allRequiredPresent) {
        setBackendEnvCheck({ status: 'ok', detail: 'All required backend env vars are present.' });
      } else {
        setBackendEnvCheck({ status: 'error', detail: 'One or more required backend env vars are missing.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Backend env check failed';
      setBackendEnvCheck({ status: 'error', detail: message });
    }
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Developer Playground"
        subtitle="Runtime checks for setup, environment variables, and connectivity."
        icon={<ScienceOutlinedIcon />}
      />

      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_e, next) => setTab(next)} variant="scrollable" allowScrollButtonsMobile>
            <Tab label="Compliance" />
            <Tab label="Environment" />
            <Tab label="Connections" />
          </Tabs>
        </CardContent>
      </Card>

      {tab === 0 && (
        <Card>
          <CardContent>
            <Stack spacing={1.25}>
              <Typography variant="h6">Local Run Compliance</Typography>
              <Alert severity="info">Use this checklist before debugging route or DB failures.</Alert>
              <List dense>
                <ListItem>
                  <ListItemText primary="Node.js 20+ and pnpm installed" secondary="Run: node -v && pnpm -v" />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Server env file is present"
                    secondary="Required: PORT, MONGO_URI, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CLIENT_URL"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="MongoDB is reachable"
                    secondary="Run: docker compose up -d mongo OR ensure mongodb://127.0.0.1:27017 is active"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="API is healthy"
                    secondary={`Expect GET ${healthUrl} to return status: ok`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Client API base is correct"
                    secondary={`Current VITE_API_URL=${apiBase || 'TBD'}`}
                  />
                </ListItem>
              </List>
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === 1 && (
        <Card>
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="h6">Environment Visibility</Typography>
              <Alert severity="warning">
                Browser can only read variables prefixed with <code>VITE_</code>. Server env vars are intentionally hidden.
              </Alert>
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Client Variables
              </Typography>
              <Stack spacing={1}>
                {CLIENT_ENV_ITEMS.map((item) => (
                  <Box
                    key={item.key}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#f8fafc'
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">
                      {item.key}
                    </Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: 13 }}>{String(item.value)}</Typography>
                  </Box>
                ))}
              </Stack>
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Frontend Required Variables
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {frontendRequiredStatus.map((item) => (
                  <Chip
                    key={item.key}
                    label={`${item.key}: ${item.present ? 'present' : 'missing'}`}
                    color={item.present ? 'success' : 'error'}
                    variant={item.present ? 'filled' : 'outlined'}
                  />
                ))}
              </Stack>
              {!frontendAllRequiredPresent && (
                <Alert severity="error">Frontend required env is incomplete. Set missing VITE_* keys and rebuild the client.</Alert>
              )}
              {frontendAllRequiredPresent && (
                <Alert severity="success">Frontend required env is present.</Alert>
              )}
              <Divider />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Server Variables (expected)
              </Typography>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {SERVER_ENV_ITEMS.map((name) => (
                  <Chip key={name} label={name} variant="outlined" />
                ))}
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runBackendEnvCheck}>
                  Run Backend Env Check
                </Button>
                {statusChip(backendEnvCheck.status)}
                <Typography variant="body2" color="text.secondary">
                  {backendEnvCheck.detail}
                </Typography>
              </Stack>
              {Object.keys(backendRequiredEnv).length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Backend Required Status
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {Object.entries(backendRequiredEnv).map(([name, present]) => (
                      <Chip
                        key={name}
                        label={`${name}: ${present ? 'present' : 'missing'}`}
                        color={present ? 'success' : 'error'}
                        variant={present ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Stack>
                </>
              )}
              {Object.keys(backendOptionalEnv).length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    Backend Optional Status
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    {Object.entries(backendOptionalEnv).map(([name, present]) => (
                      <Chip
                        key={name}
                        label={`${name}: ${present ? 'present' : 'not set'}`}
                        color={present ? 'success' : 'default'}
                        variant={present ? 'filled' : 'outlined'}
                      />
                    ))}
                  </Stack>
                </>
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {tab === 2 && (
        <Stack spacing={2}>
          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runApiHealth}>
                  Run API Health Check
                </Button>
                {statusChip(apiHealth.status)}
                <Typography variant="body2" color="text.secondary">
                  {apiHealth.detail}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runAuthCheck}>
                  Run Auth Check
                </Button>
                {statusChip(authCheck.status)}
                <Typography variant="body2" color="text.secondary">
                  {authCheck.detail}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
                <Button variant="contained" onClick={runDbCheck}>
                  Run DB Path Check
                </Button>
                {statusChip(dbCheck.status)}
                <Typography variant="body2" color="text.secondary">
                  {dbCheck.detail}
                </Typography>
              </Stack>
            </CardContent>
          </Card>

          {(apiHealth.status === 'error' ||
            authCheck.status === 'error' ||
            dbCheck.status === 'error' ||
            backendEnvCheck.status === 'error') && (
            <Alert severity="error">
              One or more checks failed. Review server logs and confirm Mongo and env setup before retrying.
            </Alert>
          )}
        </Stack>
      )}
    </Stack>
  );
};
