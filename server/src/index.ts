import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

const start = async () => {
  await connectDb();
  const app = createApp();
  app.listen(env.port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${env.port}`);
  });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
