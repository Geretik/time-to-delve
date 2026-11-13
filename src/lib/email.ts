import "server-only";
import { headers } from "next/headers";

type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Sends e-mail through Resend (https://resend.com).
 * Without RESEND_API_KEY the message is only printed to the server log (outside production),
 * so local development works without an account.
 */
export async function sendEmail(mail: Mail): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Time to Delve <onboarding@resend.dev>";

  const notSetUp = emailSetupError();
  if (notSetUp) {
    console.error("RESEND_API_KEY není nastaven – e-mail nebyl odeslán.");
    return { ok: false, error: notSetUp };
  }
  if (!apiKey) {
    console.info(`[e-mail – RESEND_API_KEY není nastaven]\nKomu: ${mail.to}\nPředmět: ${mail.subject}\n\n${mail.text}`);
    return { ok: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Resend ${res.status}: ${body}`);
    return { ok: false, error: "E-mail se nepodařilo odeslat." };
  }
  return { ok: true };
}

/**
 * Why no e-mail can go out at all (production without RESEND_API_KEY), or undefined.
 * Known before anything is sent, so a form can say so without revealing whom it would write to.
 */
export function emailSetupError(): string | undefined {
  if (!process.env.RESEND_API_KEY && process.env.VERCEL_ENV === "production") {
    return "Odesílání e-mailů zatím není nastavené (chybí RESEND_API_KEY).";
  }
}

/** Absolute base URL for links in e-mails. */
export async function appUrl(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Simple branded e-mail with one call-to-action link. */
export function linkEmail(opts: { heading: string; intro: string; cta: string; url: string; outro: string }) {
  const text = `${opts.heading}\n\n${opts.intro}\n\n${opts.cta}: ${opts.url}\n\n${opts.outro}`;
  const html = `<!doctype html><html><body style="margin:0;background:#15181d;font-family:Arial,Helvetica,sans-serif;color:#e9e4d8">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1e232a;border:1px solid #343b45;border-radius:12px">
<tr><td style="padding:28px 28px 8px;font-family:Georgia,serif;font-size:22px;letter-spacing:1px;color:#f1ece2">Time to Delve</td></tr>
<tr><td style="padding:8px 28px;font-size:18px;font-weight:bold">${escapeHtml(opts.heading)}</td></tr>
<tr><td style="padding:8px 28px;font-size:15px;line-height:1.5;color:#c9c3b6">${escapeHtml(opts.intro)}</td></tr>
<tr><td style="padding:16px 28px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#c8a15a;color:#15181d;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:8px">${escapeHtml(opts.cta)}</a></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:13px;line-height:1.5;color:#8d877c">${escapeHtml(opts.outro)}<br><br>Odkaz: ${escapeHtml(opts.url)}</td></tr>
</table></td></tr></table></body></html>`;
  return { text, html };
}
