import { config } from '../config.js';

/** Last messages sent — used by tests and handy in dev when SMTP isn't configured. */
export const outbox = [];
let transport = null;

/** True when an SMTP server is set (SMTP_HOST, or the SMTP_URL alternative). */
export const smtpConfigured = () => !!(config.mail.host || config.mail.url);

/** The last delivery failure (shown in Admin → Integrations), or null after a success. */
export let lastMailError = null;

function getTransport() {
  if (transport) return transport;
  return import('nodemailer').then((nodemailer) => {
    const c = config.mail;
    const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
    transport = nodemailer.default.createTransport(
      c.host
        ? {
            host: c.host,
            port: c.port,
            secure: c.secure,
            auth: c.user ? { user: c.user, pass: c.pass } : undefined,
            tls: c.allowSelfSigned ? { rejectUnauthorized: false } : undefined,
            ...timeouts,
          }
        : c.url,
      c.host ? undefined : timeouts,
    );
    return transport;
  });
}

/**
 * Sends an email. Returns { ok, error }: failures are logged and remembered (Admin → Integrations shows the last one)
 * instead of vanishing. Never throws.
 */
export async function sendMail(m) {
  outbox.push(m);
  if (outbox.length > 50) outbox.shift();
  if (!smtpConfigured()) {
    const error = 'No SMTP server is configured (set SMTP_HOST or SMTP_URL)';
    lastMailError = { at: new Date().toISOString(), to: m.to, error };
    console.warn(`[mail] ${error} — not sent: to=${m.to} subject="${m.subject}"`);
    return { ok: false, error };
  }
  try {
    const t = await getTransport();
    const info = await t.sendMail({ from: config.mail.from, ...m });
    if (info.rejected?.length) throw new Error(`Rejected by the server for ${info.rejected.join(', ')} (${info.response ?? ''})`);
    lastMailError = null;
    return { ok: true, id: info.messageId };
  } catch (e) {
    transport = null; // rebuild next time (credentials or settings may have changed)
    lastMailError = { at: new Date().toISOString(), to: m.to, error: e.message };
    console.error('[mail] send failed', e.message);
    return { ok: false, error: e.message };
  }
}

/** Admin check: connects and logs in to the SMTP server, then sends a test message. Returns the real error if any. */
export async function testMail(to) {
  if (!smtpConfigured()) return { ok: false, step: 'config', error: 'No SMTP server is configured (set SMTP_HOST or SMTP_URL)' };
  try {
    await (await getTransport()).verify();
  } catch (e) {
    transport = null;
    return { ok: false, step: 'connect', error: e.message };
  }
  const r = await sendMail({ to, subject: 'ChatLOL test email ✅', text: `SMTP works. Sent from ${config.mail.from}. Links in emails point to ${config.appUrl}.` });
  return r.ok ? { ok: true, from: config.mail.from, appUrl: config.appUrl } : { ok: false, step: 'send', error: r.error };
}

const esc = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Branded, email-client-safe template (tables + inline styles). */
export function template(opts) {
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
