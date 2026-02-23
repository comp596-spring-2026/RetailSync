import { env } from '../config/env';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const canSendEmail = () => Boolean(env.resendApiKey && env.resendFrom);

export const testEmailOutbox: Array<SendEmailInput> = [];
export const clearTestEmailOutbox = () => {
  testEmailOutbox.length = 0;
};

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export const sendEmail = async ({ to, subject, html }: SendEmailInput) => {
  if (env.nodeEnv === 'test') {
    testEmailOutbox.push({ to, subject, html });
    return { sent: true as const, reason: 'test_capture' as const };
  }

  if (!canSendEmail()) {
    return { sent: false, reason: 'resend_not_configured' as const };
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: env.resendFrom,
      to: [to],
      subject,
      html
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend email failed: ${response.status} ${text}`);
  }

  return { sent: true as const };
};
