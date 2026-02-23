import { env } from '../config/env';

const brandIconUrl = env.resendBrandIconUrl || `${env.clientUrl}/brand/icon.png`;

const wrapper = (title: string, subtitle: string, body: string) => `
  <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Arial,sans-serif;color:#0f172a;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
        <div style="display:flex;align-items:center;gap:12px;">
          <img src="${brandIconUrl}" alt="RetailSync" width="36" height="36" style="display:block;border-radius:8px;" />
          <div>
            <div style="font-size:18px;font-weight:700;line-height:1.2;">RetailSync</div>
            <div style="font-size:12px;color:#64748b;">${subtitle}</div>
          </div>
        </div>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;">${title}</h2>
        ${body}
      </div>
    </div>
  </div>
`;

export const verifyEmailTemplate = (code: string) =>
  wrapper(
    'Verify Your Account',
    'Email Verification',
    `<p style="margin:0 0 14px;">Use this verification code to confirm your account:</p>
     <div style="display:inline-block;padding:12px 18px;border-radius:10px;border:1px dashed #94a3b8;background:#f8fafc;font-size:28px;font-weight:700;letter-spacing:2px;">${code}</div>
     <p style="margin:14px 0 0;color:#475569;">This code expires in 24 hours.</p>`
  );

export const resetPasswordTemplate = (code: string) =>
  wrapper(
    'Reset Your Password',
    'Account Recovery',
    `<p style="margin:0 0 14px;">Use this code to reset your password:</p>
     <div style="display:inline-block;padding:12px 18px;border-radius:10px;border:1px dashed #94a3b8;background:#f8fafc;font-size:28px;font-weight:700;letter-spacing:2px;">${code}</div>
     <p style="margin:14px 0 0;color:#475569;">This code expires in 30 minutes.</p>`
  );
