import type { Request } from 'express';

export const sharedServiceSecretHeader = 'x-service-secret';

export const readRequestSecretHeader = (req: Request) =>
  req.header(sharedServiceSecretHeader)?.trim() || undefined;

export const attachServiceSecretHeaders = ({
  headers,
  secret
}: {
  headers: Record<string, string>;
  secret?: string;
}) => {
  if (!secret) return headers;
  headers[sharedServiceSecretHeader] = secret;
  return headers;
};
