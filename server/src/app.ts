import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import companyRoutes from './routes/companyRoutes';
import roleRoutes from './routes/roleRoutes';
import inviteRoutes from './routes/inviteRoutes';
import userRoutes from './routes/userRoutes';
import moduleRoutes from './routes/moduleRoutes';
import posRoutes from './routes/posRoutes';
import reportRoutes from './routes/reportRoutes';
import itemRoutes from './routes/itemRoutes';
import locationRoutes from './routes/locationRoutes';
import inventoryRoutes from './routes/inventoryRoutes';
import sheetsRoutes from './routes/sheetsRoutes';
import googleRoutes from './routes/googleRoutes';
import settingsRoutes from './routes/settingsRoutes';
import debugSheetsRoutes from './routes/debug.sheets.routes';
import integrationGoogleSheetsRoutes from './routes/integrationGoogleSheetsRoutes';
import integrationsSheetsRoutes from './routes/integrationsSheetsRoutes';
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { withRequestContext } from './config/requestContext';

export const createApp = () => {
  const app = express();

  app.use(
    cors({
      origin: env.clientUrl,
      credentials: true
    })
  );
  app.use(express.json());
  app.use(cookieParser());
  app.use(withRequestContext);

  app.get('/', (_req, res) => {
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RetailSync API</title>
  <style>
    body { font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, sans-serif; margin: 2rem; line-height: 1.45; color: #0f172a; }
    .card { max-width: 760px; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem 1.5rem; background: #ffffff; }
    h1 { margin: 0 0 0.75rem; font-size: 1.5rem; }
    p { margin: 0.5rem 0; }
    ul { padding-left: 1.25rem; }
    code { background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 6px; }
    .muted { color: #475569; }
    .ok { color: #166534; font-weight: 600; }
    .warn { color: #9a3412; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>RetailSync API</h1>
    <p class="muted">Welcome page for the deployed backend service.</p>
    <p><strong>Environment:</strong> <code>${env.nodeEnv}</code></p>
    <p><strong>Health endpoint:</strong> <a href="/health"><code>/health</code></a></p>
    <p><strong>API base:</strong> <code>/api</code></p>
    <p id="healthStatus" class="muted">Checking health...</p>
    <ul>
      <li>Auth: <code>/api/auth</code></li>
      <li>Company: <code>/api/company</code></li>
      <li>Items: <code>/api/items</code></li>
      <li>Inventory: <code>/api/inventory</code></li>
    </ul>
  </div>
  <script>
    (async () => {
      const el = document.getElementById('healthStatus');
      try {
        const res = await fetch('/health', { credentials: 'include' });
        const body = await res.json();
        if (res.ok && body && body.status === 'ok') {
          el.textContent = 'Health check: OK';
          el.className = 'ok';
        } else {
          el.textContent = 'Health check: unexpected response';
          el.className = 'warn';
        }
      } catch (_err) {
        el.textContent = 'Health check: unreachable';
        el.className = 'warn';
      }
    })();
  </script>
</body>
</html>`);
  });

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', data: { uptime: process.uptime() } });
  });

  app.get('/health/env-readiness', (_req, res) => {
    const required = {
      PORT: Boolean(env.port),
      MONGO_URI: Boolean(env.mongoUri),
      JWT_ACCESS_SECRET: Boolean(env.accessSecret),
      JWT_REFRESH_SECRET: Boolean(env.refreshSecret),
      CLIENT_URL: Boolean(env.clientUrl)
    };

    const optional = {
      GOOGLE_OAUTH_CLIENT_ID: Boolean(env.googleOAuthClientId),
      GOOGLE_OAUTH_CLIENT_SECRET: Boolean(env.googleOAuthClientSecret),
      GOOGLE_AUTH_REDIRECT_URI: Boolean(env.googleAuthRedirectUri)
    };

    res.json({
      status: 'ok',
      data: {
        allRequiredPresent: Object.values(required).every(Boolean),
        required,
        optional
      }
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/locations', locationRoutes);
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/sheets', sheetsRoutes);
  app.use('/api/google', googleRoutes);
  app.use('/api/integrations/google/sheets', integrationGoogleSheetsRoutes);
  app.use('/api/integrations/sheets', integrationsSheetsRoutes);
  app.use('/api/debug/sheets', debugSheetsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api', moduleRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
