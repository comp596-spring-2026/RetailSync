import { describe, expect, it } from 'vitest';
import { env } from '../config/env';
import { resetPasswordTemplate, verifyEmailTemplate } from './emailTemplates';

describe('email templates', () => {
  it('renders branded logo in verification and reset templates', () => {
    const verifyHtml = verifyEmailTemplate('123-456');
    const resetHtml = resetPasswordTemplate('654-321');
    const expectedLogo = env.resendBrandIconUrl || `${env.clientUrl}/brand/icon.png`;

    expect(verifyHtml).toContain(expectedLogo);
    expect(resetHtml).toContain(expectedLogo);
    expect(verifyHtml).toContain('alt="RetailSync"');
    expect(resetHtml).toContain('alt="RetailSync"');
  });

  it('keeps verification and reset templates distinct', () => {
    const verifyHtml = verifyEmailTemplate('123-456');
    const resetHtml = resetPasswordTemplate('123-456');

    expect(verifyHtml).toContain('Verify Your Account');
    expect(verifyHtml).toContain('Email Verification');
    expect(verifyHtml).toContain('expires in 24 hours');

    expect(resetHtml).toContain('Reset Your Password');
    expect(resetHtml).toContain('Account Recovery');
    expect(resetHtml).toContain('expires in 30 minutes');
  });
});

