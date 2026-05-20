import { APP_NAME, APP_SYSTEM_EMAIL } from '@retailsync/shared';
import { env } from '../config/env';

export const EMAIL_BRAND_COLORS = {
  pageBackground: '#eef4f1',
  cardBackground: '#ffffff',
  cardBorder: '#d4e5dc',
  headerBackground: '#0f2d22',
  primary: '#1f7a52',
  primaryDark: '#165c3f',
  title: '#10281f',
  body: '#2d4a3d',
  muted: '#5a7469',
  footer: '#6c8579',
  detailLabel: '#5d7d70',
  detailValue: '#18352a'
} as const;

export type EmailDetailRow = {
  label: string;
  value: string;
};

export type TransactionalEmailContent = {
  preheader: string;
  title: string;
  greeting: string;
  paragraphs: string[];
  detailRows?: EmailDetailRow[];
  actionLabel: string;
  actionUrl: string;
  footnote: string;
};

export const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const buildAppHomeUrl = () => env.clientUrl;

const renderDetailRowsHtml = (rows: EmailDetailRow[]) => {
  if (rows.length === 0) return '';

  const rowHtml = rows
    .map(
      (row) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid ${EMAIL_BRAND_COLORS.cardBorder};font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${EMAIL_BRAND_COLORS.detailLabel};width:34%;vertical-align:top;">
            ${escapeHtml(row.label)}
          </td>
          <td style="padding:10px 14px;border-bottom:1px solid ${EMAIL_BRAND_COLORS.cardBorder};font-size:15px;line-height:1.5;color:${EMAIL_BRAND_COLORS.detailValue};vertical-align:top;">
            ${escapeHtml(row.value)}
          </td>
        </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border:1px solid ${EMAIL_BRAND_COLORS.cardBorder};border-radius:14px;overflow:hidden;background:#f8fbf9;">
      ${rowHtml}
    </table>`;
};

const renderParagraphsHtml = (paragraphs: string[]) =>
  paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${EMAIL_BRAND_COLORS.body};">${escapeHtml(paragraph)}</p>`
    )
    .join('');

export const renderTransactionalEmailHtml = (content: TransactionalEmailContent) => {
  const appHomeUrl = buildAppHomeUrl();
  const safeActionUrl = escapeHtml(content.actionUrl);
  const safeAppHomeUrl = escapeHtml(appHomeUrl);
  const year = new Date().getUTCFullYear();

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(content.title)}</title>
    <style>
      @media only screen and (max-width: 620px) {
        .email-shell { width: 100% !important; }
        .email-card { padding: 24px 20px !important; }
        .email-brand-title { font-size: 26px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_BRAND_COLORS.pageBackground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${EMAIL_BRAND_COLORS.body};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">
      ${escapeHtml(content.preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BRAND_COLORS.pageBackground};padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" class="email-shell" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
            <tr>
              <td style="padding:0 0 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BRAND_COLORS.headerBackground};border-radius:18px 18px 0 0;">
                  <tr>
                    <td align="center" style="padding:28px 28px 24px;">
                      <a href="${safeAppHomeUrl}" style="text-decoration:none;color:#ffffff;">
                        <p class="email-brand-title" style="margin:0 0 6px;font-size:30px;line-height:1.15;font-weight:800;letter-spacing:-0.02em;color:#ffffff;">
                          ${escapeHtml(APP_NAME)}
                        </p>
                        <p style="margin:0;font-size:13px;line-height:1.5;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.78);">
                          Retail operations, synced
                        </p>
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${EMAIL_BRAND_COLORS.cardBackground};border:1px solid ${EMAIL_BRAND_COLORS.cardBorder};border-top:0;border-radius:0 0 18px 18px;box-shadow:0 10px 30px rgba(16,40,31,0.06);">
                  <tr>
                    <td class="email-card" style="padding:32px 32px 28px;">
                      <h1 style="margin:0 0 12px;font-size:28px;line-height:1.25;color:${EMAIL_BRAND_COLORS.title};font-weight:700;">
                        ${escapeHtml(content.title)}
                      </h1>
                      <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:${EMAIL_BRAND_COLORS.body};">
                        ${escapeHtml(content.greeting)}
                      </p>
                      ${renderParagraphsHtml(content.paragraphs)}
                      ${content.detailRows ? renderDetailRowsHtml(content.detailRows) : ''}
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td style="border-radius:12px;background:${EMAIL_BRAND_COLORS.primary};">
                            <a
                              href="${safeActionUrl}"
                              style="display:inline-block;padding:14px 26px;border-radius:12px;background:${EMAIL_BRAND_COLORS.primary};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;line-height:1.2;mso-padding-alt:0;"
                            >
                              ${escapeHtml(content.actionLabel)}
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:${EMAIL_BRAND_COLORS.muted};">
                        If the button does not work, copy and paste this link into your browser:
                      </p>
                      <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;">
                        <a href="${safeActionUrl}" style="color:${EMAIL_BRAND_COLORS.primary};text-decoration:underline;">
                          ${safeActionUrl}
                        </a>
                      </p>
                      <p style="margin:0;font-size:13px;line-height:1.7;color:${EMAIL_BRAND_COLORS.footer};">
                        ${escapeHtml(content.footnote)}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0;text-align:center;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${EMAIL_BRAND_COLORS.footer};">
                  Sent by <strong style="color:${EMAIL_BRAND_COLORS.title};">${escapeHtml(APP_NAME)}</strong>
                  &middot;
                  <a href="mailto:${escapeHtml(APP_SYSTEM_EMAIL)}" style="color:${EMAIL_BRAND_COLORS.primary};text-decoration:none;">
                    ${escapeHtml(APP_SYSTEM_EMAIL)}
                  </a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:${EMAIL_BRAND_COLORS.footer};">
                  &copy; ${year} ${escapeHtml(APP_NAME)}.
                  <a href="${escapeHtml(appHomeUrl)}" style="color:${EMAIL_BRAND_COLORS.primary};text-decoration:none;">Open app</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

export const renderTransactionalEmailText = (content: TransactionalEmailContent) => {
  const lines = [
    APP_NAME,
    content.title,
    '',
    content.greeting,
    '',
    ...content.paragraphs,
    ''
  ];

  if (content.detailRows?.length) {
    for (const row of content.detailRows) {
      lines.push(`${row.label}: ${row.value}`);
    }
    lines.push('');
  }

  lines.push(
    `${content.actionLabel}: ${content.actionUrl}`,
    '',
    'If the link does not work, copy and paste it into your browser.',
    content.actionUrl,
    '',
    content.footnote,
    '',
    `— ${APP_NAME} (${APP_SYSTEM_EMAIL})`
  );

  return lines.join('\n');
};
