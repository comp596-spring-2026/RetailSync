import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../config/env';
import { clearTestEmailOutbox, sendEmail, testEmailOutbox } from './emailService';

const ORIGINAL_ENV = {
  nodeEnv: env.nodeEnv,
  resendApiKey: env.resendApiKey,
  resendFrom: env.resendFrom
};

describe('emailService', () => {
  beforeEach(() => {
    clearTestEmailOutbox();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    env.nodeEnv = ORIGINAL_ENV.nodeEnv;
    env.resendApiKey = ORIGINAL_ENV.resendApiKey;
    env.resendFrom = ORIGINAL_ENV.resendFrom;
  });

  it('captures email in test mode', async () => {
    env.nodeEnv = 'test';

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>'
    });

    expect(result).toEqual({ sent: true, reason: 'test_capture' });
    expect(testEmailOutbox).toHaveLength(1);
    expect(testEmailOutbox[0]).toEqual({
      to: 'user@example.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>'
    });
  });

  it('returns not configured when resend env is missing', async () => {
    env.nodeEnv = 'development';
    env.resendApiKey = undefined;
    env.resendFrom = undefined;

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'No Config',
      html: '<p>Hello</p>'
    });

    expect(result).toEqual({ sent: false, reason: 'resend_not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends email through resend endpoint when configured', async () => {
    env.nodeEnv = 'development';
    env.resendApiKey = 're_test_key';
    env.resendFrom = 'RetailSync <onboarding@resend.dev>';

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true
    } as Response);

    const result = await sendEmail({
      to: 'user@example.com',
      subject: 'Configured',
      html: '<p>Hello</p>'
    });

    expect(result).toEqual({ sent: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json'
        })
      })
    );
  });

  it('surfaces resend sandbox/domain restriction response (403)', async () => {
    env.nodeEnv = 'development';
    env.resendApiKey = 're_test_key';
    env.resendFrom = 'RetailSync <onboarding@resend.dev>';

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: async () =>
        '{"statusCode":403,"name":"validation_error","message":"You can only send testing emails to your own email address. Verify a domain to send to other recipients."}'
    } as Response);

    await expect(
      sendEmail({
        to: 'user@example.com',
        subject: 'Failure',
        html: '<p>Hello</p>'
      })
    ).rejects.toThrow(
      'Resend email failed: 403 {"statusCode":403,"name":"validation_error","message":"You can only send testing emails to your own email address. Verify a domain to send to other recipients."}'
    );
  });
});
