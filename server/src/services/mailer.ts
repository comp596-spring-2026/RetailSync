import net from 'node:net';
import tls from 'node:tls';
import { APP_NAME } from '@retailsync/shared';
import { env } from '../config/env';
import {
  renderTransactionalEmailHtml,
  renderTransactionalEmailText,
  type TransactionalEmailContent
} from './emailTemplates';

type MailRecipient = {
  email: string;
  name?: string;
};

type MailMessage = {
  to: MailRecipient;
  subject: string;
  text: string;
  html?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  fromName: string;
  timeoutMs: number;
};

const stripControlChars = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();

const escapeHeaderValue = (value: string) => stripControlChars(value).replace(/"/g, '\\"');

const encodeBase64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const buildConfig = (): SmtpConfig | null => {
  if (!env.smtpHost || !env.smtpPort || !env.smtpFrom) {
    return null;
  }

  return {
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    user: env.smtpUser,
    pass: env.smtpPass,
    from: env.smtpFrom,
    fromName: env.smtpFromName,
    timeoutMs: env.smtpTimeoutMs
  };
};

export const isMailerConfigured = () => Boolean(buildConfig());

type SmtpResponse = {
  code: number;
  lines: string[];
};

const createSocket = async (config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> =>
  config.secure
    ? tls.connect({
        host: config.host,
        port: config.port,
        servername: config.host
      })
    : net.connect({ host: config.host, port: config.port });

const waitForSocketReady = async (socket: net.Socket | tls.TLSSocket, config: SmtpConfig) => {
  socket.setTimeout(config.timeoutMs);
  await new Promise<void>((resolve, reject) => {
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onSecureConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('SMTP connection timed out'));
    };
    const cleanup = () => {
      socket.off('connect', onConnect);
      socket.off('secureConnect', onSecureConnect);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };

    socket.once('connect', onConnect);
    socket.once('secureConnect', onSecureConnect);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
};

const upgradeToTls = async (
  socket: net.Socket,
  config: SmtpConfig
): Promise<tls.TLSSocket> => {
  const secureSocket = tls.connect({
    socket,
    servername: config.host
  });
  secureSocket.setTimeout(config.timeoutMs);
  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('SMTP STARTTLS timed out'));
    };
    const cleanup = () => {
      secureSocket.off('secureConnect', onReady);
      secureSocket.off('error', onError);
      secureSocket.off('timeout', onTimeout);
    };

    secureSocket.once('secureConnect', onReady);
    secureSocket.once('error', onError);
    secureSocket.once('timeout', onTimeout);
  });
  return secureSocket;
};

const readResponseFactory = (socket: net.Socket | tls.TLSSocket) => {
  let buffer = '';

  return () =>
    new Promise<SmtpResponse>((resolve, reject) => {
      let lines: string[] = [];
      let finished = false;

      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('timeout', onTimeout);
      };

      const finish = (response: SmtpResponse) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        resolve(response);
      };

      const fail = (error: Error) => {
        if (finished) {
          return;
        }
        finished = true;
        cleanup();
        reject(error);
      };

      const processBuffer = () => {
        while (buffer.includes('\r\n')) {
          const index = buffer.indexOf('\r\n');
          const line = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);

          if (!line) {
            continue;
          }

          lines.push(line);
          const match = line.match(/^(\d{3})([ -]).*$/);
          if (match && match[2] === ' ') {
            finish({
              code: Number(match[1]),
              lines: [...lines]
            });
            return;
          }
        }
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        processBuffer();
      };
      const onError = (error: Error) => fail(error);
      const onTimeout = () => fail(new Error('SMTP response timed out'));

      socket.once('data', onData);
      socket.once('error', onError);
      socket.once('timeout', onTimeout);

      processBuffer();
    });
};

const sendCommand = async (
  socket: net.Socket | tls.TLSSocket,
  readResponse: () => Promise<SmtpResponse>,
  command: string,
  expectedCodes: number[]
) => {
  socket.write(`${command}\r\n`);
  const response = await readResponse();
  if (!expectedCodes.includes(response.code)) {
    throw new Error(`SMTP command failed: ${command} -> ${response.lines.join(' | ')}`);
  }
  return response;
};

const formatRecipient = (recipient: MailRecipient) =>
  recipient.name ? `"${escapeHeaderValue(recipient.name)}" <${recipient.email}>` : recipient.email;

const escapeSmtpBody = (value: string) =>
  value
    .replace(/\r?\n/g, '\n')
    .split('\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');

const formatMessage = (config: SmtpConfig, message: MailMessage) => {
  const headers = [
    `From: "${escapeHeaderValue(config.fromName)}" <${config.from}>`,
    `To: ${formatRecipient(message.to)}`,
    `Subject: ${stripControlChars(message.subject)}`,
    'MIME-Version: 1.0'
  ];

  if (message.html) {
    const boundary = `retailsync-${Date.now().toString(16)}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    const escapedText = escapeSmtpBody(message.text);
    const escapedHtml = escapeSmtpBody(message.html);

    return [
      headers.join('\r\n'),
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapedText,
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      escapedHtml,
      `--${boundary}--`,
      '.'
    ].join('\r\n');
  }

  headers.push('Content-Type: text/plain; charset="utf-8"', 'Content-Transfer-Encoding: 8bit');
  return `${headers.join('\r\n')}\r\n\r\n${escapeSmtpBody(message.text)}\r\n.`;
};

const runSmtpConversation = async (config: SmtpConfig, message: MailMessage) => {
  let socket = await createSocket(config);
  const readResponse = readResponseFactory(socket);

  try {
    await waitForSocketReady(socket, config);
    const greeting = await readResponse();
    if (greeting.code !== 220) {
      throw new Error(`SMTP greeting failed: ${greeting.lines.join(' | ')}`);
    }

    let ehlo = await sendCommand(socket, readResponse, `EHLO ${config.host}`, [250]);
    if (!config.secure && ehlo.lines.some((line) => line.includes('STARTTLS'))) {
      await sendCommand(socket, readResponse, 'STARTTLS', [220]);
      socket = await upgradeToTls(socket as net.Socket, config);
      const secureReadResponse = readResponseFactory(socket);
      ehlo = await sendCommand(socket, secureReadResponse, `EHLO ${config.host}`, [250]);

      if (config.user && config.pass) {
        await sendCommand(socket, secureReadResponse, 'AUTH LOGIN', [334]);
        await sendCommand(socket, secureReadResponse, encodeBase64(config.user), [334]);
        await sendCommand(socket, secureReadResponse, encodeBase64(config.pass), [235]);
      }

      await sendCommand(socket, secureReadResponse, `MAIL FROM:<${config.from}>`, [250]);
      await sendCommand(socket, secureReadResponse, `RCPT TO:<${message.to.email}>`, [250, 251]);
      await sendCommand(socket, secureReadResponse, 'DATA', [354]);
      socket.write(`${formatMessage(config, message)}\r\n`);
      const dataResponse = await secureReadResponse();
      if (dataResponse.code !== 250) {
        throw new Error(`SMTP DATA failed: ${dataResponse.lines.join(' | ')}`);
      }
      await sendCommand(socket, secureReadResponse, 'QUIT', [221]);
      return;
    }

    if (config.user && config.pass) {
      await sendCommand(socket, readResponse, 'AUTH LOGIN', [334]);
      await sendCommand(socket, readResponse, encodeBase64(config.user), [334]);
      await sendCommand(socket, readResponse, encodeBase64(config.pass), [235]);
    }

    await sendCommand(socket, readResponse, `MAIL FROM:<${config.from}>`, [250]);
    await sendCommand(socket, readResponse, `RCPT TO:<${message.to.email}>`, [250, 251]);
    await sendCommand(socket, readResponse, 'DATA', [354]);
    socket.write(`${formatMessage(config, message)}\r\n`);
    const dataResponse = await readResponse();
    if (dataResponse.code !== 250) {
      throw new Error(`SMTP DATA failed: ${dataResponse.lines.join(' | ')}`);
    }
    await sendCommand(socket, readResponse, 'QUIT', [221]);
  } finally {
    socket.destroy();
  }
};

const sendConfiguredMail = async (message: MailMessage) => {
  const config = buildConfig();
  if (!config) {
    throw new Error('SMTP is not configured');
  }

  await runSmtpConversation(config, message);
};

const buildUrl = (path: string, params: Record<string, string>) => {
  const url = new URL(path, env.clientUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
};

export const buildVerificationUrl = (token: string) =>
  buildUrl('/verify-email', { token });

export const buildPasswordResetUrl = (token: string) =>
  buildUrl('/reset-password', { token });

export const buildInviteUrl = (inviteCode: string, email: string) =>
  buildUrl('/accept-invite', {
    inviteCode,
    email
  });

const sendTransactionalEmail = async (message: {
  to: MailRecipient;
  subject: string;
  content: TransactionalEmailContent;
}) => {
  await sendConfiguredMail({
    to: message.to,
    subject: message.subject,
    text: renderTransactionalEmailText(message.content),
    html: renderTransactionalEmailHtml(message.content)
  });
};

export const sendVerificationEmail = async (args: {
  email: string;
  firstName: string;
  verificationToken: string;
}) => {
  const verificationUrl = buildVerificationUrl(args.verificationToken);
  await sendTransactionalEmail({
    to: { email: args.email, name: args.firstName },
    subject: `Verify your ${APP_NAME} email`,
    content: {
      preheader: `Confirm your ${APP_NAME} email to finish signing up.`,
      title: 'Verify your email',
      greeting: `Hi ${args.firstName},`,
      paragraphs: [
        `Thanks for creating a ${APP_NAME} account. Confirm your email address to continue setting up your workspace.`
      ],
      actionLabel: 'Verify email',
      actionUrl: verificationUrl,
      footnote: 'If you did not create this account, you can safely ignore this email.'
    }
  });
};

export const sendPasswordResetEmail = async (args: {
  email: string;
  firstName: string;
  resetToken: string;
}) => {
  const resetUrl = buildPasswordResetUrl(args.resetToken);
  await sendTransactionalEmail({
    to: { email: args.email, name: args.firstName },
    subject: `Reset your ${APP_NAME} password`,
    content: {
      preheader: `Reset your ${APP_NAME} password.`,
      title: 'Reset your password',
      greeting: `Hi ${args.firstName},`,
      paragraphs: [
        `We received a request to reset the password for your ${APP_NAME} account.`,
        'Choose a new password using the button below. This link expires for your security.'
      ],
      actionLabel: 'Reset password',
      actionUrl: resetUrl,
      footnote: 'If you did not request this password reset, you can safely ignore this email.'
    }
  });
};

export const sendInviteEmail = async (args: {
  email: string;
  firstName: string;
  companyName: string;
  inviteCode: string;
  roleName: string;
}) => {
  const inviteUrl = buildInviteUrl(args.inviteCode, args.email);
  await sendTransactionalEmail({
    to: { email: args.email, name: args.firstName },
    subject: `You're invited to join ${args.companyName} on ${APP_NAME}`,
    content: {
      preheader: `${args.companyName} invited you to join ${APP_NAME} as ${args.roleName}.`,
      title: `Join ${args.companyName}`,
      greeting: `Hi ${args.firstName},`,
      paragraphs: [
        `${args.companyName} invited you to ${APP_NAME}.`,
        'Activate your access to set your password and start using the workspace.'
      ],
      detailRows: [
        { label: 'Company', value: args.companyName },
        { label: 'Role', value: args.roleName }
      ],
      actionLabel: 'Activate access',
      actionUrl: inviteUrl,
      footnote: 'If you were not expecting this invitation, you can ignore this email.'
    }
  });
};
