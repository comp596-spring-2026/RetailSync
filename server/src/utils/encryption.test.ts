import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from './encryption';

describe('encryption utilities', () => {
  const key = Buffer.alloc(32, 7).toString('base64');

  it('encrypts and decrypts json payloads', () => {
    const payload = {
      accessToken: 'abc123',
      refreshToken: 'refresh-token',
      expiryDate: 123456789
    };

    const encrypted = encryptJson(payload, key);
    const decrypted = decryptJson<typeof payload>(encrypted, key);

    expect(decrypted).toEqual(payload);
    expect(encrypted).not.toContain(payload.accessToken);
  });

  it('throws for invalid key length', () => {
    const invalid = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptJson({ ok: true }, invalid)).toThrow(/ENCRYPTION_KEY/);
  });
});
