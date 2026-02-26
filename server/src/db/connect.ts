import mongoose from 'mongoose';
import { env } from '../config/env';

export const connectDb = async () => {
  const maxAttempts = 10;
  const retryDelayMs = 3000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(env.mongoUri);
      return;
    } catch (error) {
      lastError = error;
      console.error(
        `Mongo connection attempt ${attempt}/${maxAttempts} failed. Retrying in ${retryDelayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw lastError;
};
