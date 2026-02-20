import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

const start = async () => {
  await connectDb();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
};

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
