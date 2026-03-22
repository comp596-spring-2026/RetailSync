import { createApp } from './app';
import { connectDb } from './db/connect';
import { env } from './config/env';
import { startLocalScheduler } from './jobs/scheduler';
import { debugLog } from './utils/debugLogger';

const start = async () => {
  await connectDb();
  const app = createApp();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${env.port}`);
    debugLog('[api.startup.env]', {
      nodeEnv: env.nodeEnv,
      port: env.port,
      tasksMode: env.tasksMode,
      clientUrl: env.clientUrl,
      hasMongoUri: Boolean(env.mongoUri),
      hasEncryptionKey: Boolean(env.encryptionKey),
      hasGcsBucketName: Boolean(env.gcsBucketName),
      hasInternalTasksEndpoint: Boolean(env.internalTasksEndpoint),
      hasGcpProjectId: Boolean(env.gcpProjectId),
      hasPipelineQueue: Boolean(env.tasksQueuePipeline),
      hasSyncQueue: Boolean(env.tasksQueueSync),
      hasApiServiceName: Boolean(env.apiServiceName),
      hasGoogleOAuthClientId: Boolean(env.googleOAuthClientId),
      hasGoogleOAuthClientSecret: Boolean(env.googleOAuthClientSecret),
      hasQuickBooksClientId: Boolean(env.quickbooksClientId),
      hasQuickBooksClientSecret: Boolean(env.quickbooksClientSecret),
      debugVerboseApi: env.debugVerboseApi
    });
  });

  startLocalScheduler();
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
