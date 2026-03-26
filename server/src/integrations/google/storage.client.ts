import { Storage } from '@google-cloud/storage';
import { env } from '../../config/env';
import { resolveServiceAccountCredentials } from './serviceAccountCredentials';

let storageClient: Storage | null = null;

export const getStorageClient = () => {
  if (storageClient) return storageClient;

  const credentials = resolveServiceAccountCredentials();
  storageClient = credentials
    ? new Storage({
        credentials,
        projectId: env.gcpProjectId,
      })
    : new Storage({
        projectId: env.gcpProjectId,
      });

  return storageClient;
};

export const resetStorageClientForTests = () => {
  storageClient = null;
};
