import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type EncryptedPayload = {
  iv: string;
  tag: string;
  ciphertext: string;
};

const ALGO = 'aes-256-gcm';

const getKeyBuffer = (encryptionKeyBase64?: string) => {
  if (!encryptionKeyBase64) {
    throw new Error('Missing ENCRYPTION_KEY');
  }

  const key = Buffer.from(encryptionKeyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be base64-encoded 32-byte key');
  }

  return key;
};

export const encryptJson = <T extends object>(payload: T, encryptionKeyBase64?: string) => {
  const key = getKeyBuffer(encryptionKeyBase64);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf-8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const encrypted: EncryptedPayload = {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };

  return JSON.stringify(encrypted);
};

export const decryptJson = <T>(encryptedPayload: string, encryptionKeyBase64?: string): T => {
  const key = getKeyBuffer(encryptionKeyBase64);
  const parsed = JSON.parse(encryptedPayload) as EncryptedPayload;
  const decipher = createDecipheriv(ALGO, key, Buffer.from(parsed.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf-8');

  return JSON.parse(plaintext) as T;
};
