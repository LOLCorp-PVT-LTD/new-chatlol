import { config } from '../config';

export interface Mail { to: string; subject: string; text: string; html: string }

/** Last messages sent — used by tests and handy in dev when SMTP isn't configured. */
export const outbox: Mail[] = [];
let transport: import('nodemailer').Transporter | null = null;

export async function sendMail(m: Mail) {
  outbox.push(m);
  if (outbox.length > 50) outbox.shift();
  if (!config.mail.smtpUrl) {
    console.log(`[mail] (SMTP_URL not set) to=${m.to} subject="${m.subject}"\n${m.text}`);
    return;
  }
  if (!transport) {
    const nodemailer = await import('nodemailer');
    transport = nodemailer.default.createTransport(config.mail.smtpUrl);
  }
  try {
    await transport.sendMail({ from: config.mail.from, ...m });
  } catch (e) {
    console.error('[mail] send failed', (e as Error).message);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Branded, email-client-safe template (tables + inline styles). */
export function template(opts: { title: string; intro: string; cta: string; url: string; outro: string }) {
  const html = `<!doctype html><html><body style="margin:0;background:#fff8f5;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;color:#251911">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f5;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:32px;overflow:hidden">
<tr><td style="padding:28px 32px 8px;border-bottom:4px solid #ff5e00"><img src="${config.appUrl}/brand/wordmark.png" width="200" height="34" alt="ChatLOL" style="display:block;border:0;height:34px;width:200px"></td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 12px;font-size:22px">${esc(opts.title)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:22px;color:#5b4137">${esc(opts.intro)}</p>
<a href="${esc(opts.url)}" style="display:inline-block;background:#ff5e00;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:999px">${esc(opts.cta)}</a>
<p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#8f7065">${esc(opts.outro)}<br>Or paste this link: <a href="${esc(opts.url)}" style="color:#a63b00">${esc(opts.url)}</a></p>
</td></tr></table>
<p style="font-size:11px;color:#8f7065;margin-top:16px">You’re receiving this because someone used this address on ChatLOL.</p>
</td></tr></table></body></html>`;
  const text = `${opts.title}\n\n${opts.intro}\n\n${opts.cta}: ${opts.url}\n\n${opts.outro}`;
  return { html, text };
}
