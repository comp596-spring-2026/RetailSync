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
import { notFound } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';

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

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', data: { uptime: process.uptime() } });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/company', companyRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/invites', inviteRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/pos', posRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api', moduleRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};
