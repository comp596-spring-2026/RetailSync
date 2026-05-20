import { beforeEach, describe, expect, it } from 'vitest';
import { APP_NAME, APP_SYSTEM_EMAIL } from '@retailsync/shared';
import { env } from '../config/env';
import {
  buildAppHomeUrl,
  escapeHtml,
  renderTransactionalEmailHtml,
  renderTransactionalEmailText
} from './emailTemplates';

describe('emailTemplates', () => {
  beforeEach(() => {
    env.clientUrl = 'https://app.retailsync.dev';
  });

  it('escapes unsafe HTML in dynamic content', () => {
    const html = renderTransactionalEmailHtml({
      preheader: 'Test',
      title: '<script>alert(1)</script>',
      greeting: 'Hi <b>Ada</b>,',
      paragraphs: ['Company & Co.'],
      actionLabel: 'Go',
      actionUrl: 'https://app.retailsync.dev/verify?token=abc',
      footnote: 'Ignore me'
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Hi &lt;b&gt;Ada&lt;/b&gt;,');
    expect(html).toContain('Company &amp; Co.');
  });

  it('renders a text-only branded header and support footer without hosted images', () => {
    const html = renderTransactionalEmailHtml({
      preheader: 'Verify your email',
      title: 'Verify your email',
      greeting: 'Hi Ada,',
      paragraphs: ['Please verify your email address.'],
      actionLabel: 'Verify email',
      actionUrl: 'https://app.retailsync.dev/verify-email?token=abc',
      footnote: 'You can ignore this if you did not sign up.'
    });

    expect(html).not.toContain('<img');
    expect(html).toContain(buildAppHomeUrl());
    expect(html).toContain(APP_NAME);
    expect(html).toContain('Retail operations, synced');
    expect(html).toContain(APP_SYSTEM_EMAIL);
    expect(html).toContain('Verify email');
  });

  it('renders detail rows for invite-style emails', () => {
    const html = renderTransactionalEmailHtml({
      preheader: 'Invitation',
      title: 'You are invited',
      greeting: 'Hi Pat,',
      paragraphs: ['You have been invited to join a workspace.'],
      detailRows: [
        { label: 'Company', value: 'Ada Retail' },
        { label: 'Role', value: 'Member' }
      ],
      actionLabel: 'Activate access',
      actionUrl: 'https://app.retailsync.dev/accept-invite?inviteCode=xyz',
      footnote: 'Finish setup to join.'
    });

    expect(html).toContain('Company');
    expect(html).toContain('Ada Retail');
    expect(html).toContain('Role');
    expect(html).toContain('Member');
  });

  it('builds a plain-text multipart body with action link', () => {
    const text = renderTransactionalEmailText({
      preheader: 'Reset password',
      title: 'Reset your password',
      greeting: 'Hi Grace,',
      paragraphs: ['Use the link below to reset your password.'],
      actionLabel: 'Reset password',
      actionUrl: 'https://app.retailsync.dev/reset-password?token=xyz',
      footnote: 'Ignore if you did not request this.'
    });

    expect(text).toContain(APP_NAME);
    expect(text).toContain('Reset password: https://app.retailsync.dev/reset-password?token=xyz');
    expect(text).toContain(APP_SYSTEM_EMAIL);
  });
});
