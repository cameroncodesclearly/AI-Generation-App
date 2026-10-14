import type { Env } from "../env";
import { HttpError } from "./util";

export async function sendMail(env: Env, to: string, subject: string, html: string, text: string): Promise<void> {
  if (!env.RESEND_API_KEY) throw new HttpError(503, "RESEND_API_KEY is not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new HttpError(502, `Resend error ${res.status}: ${body.slice(0, 200)}`);
  }
}

export function magicLinkEmail(appName: string, link: string, minutes: number): { html: string; text: string } {
  const text = `Sign in to ${appName}\n\nOpen this link to sign in (valid for ${minutes} minutes):\n${link}\n\nIf you didn't request this, you can ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#0d1b2b;font-family:-apple-system,Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#f1f2f4">
  <div style="max-width:520px;margin:40px auto;padding:32px;border-radius:20px;background:linear-gradient(160deg,#1a5276,#0d1b2b);border:1px solid rgba(255,255,255,.08)">
    <div style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#d9b435;font-weight:700">${appName}</div>
    <h1 style="font-size:26px;margin:14px 0 8px;letter-spacing:-.01em">Your sign-in link</h1>
    <p style="color:#aab6cc;line-height:1.5;margin:0 0 22px">Tap the button to sign in. This link is valid for ${minutes} minutes and can only be used once.</p>
    <a href="${link}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#d9b435;color:#1a1307;font-weight:700;text-decoration:none">Sign in</a>
    <p style="color:#6f7d96;font-size:12px;margin-top:26px;word-break:break-all">Or paste this into your browser:<br>${link}</p>
  </div></body></html>`;
  return { html, text };
}

export function inviteEmail(appName: string, link: string, inviter: string, credits: number): { html: string; text: string } {
  const text = `${inviter} invited you to ${appName}.\n\nYou have ${credits} credits per month. Sign in here:\n${link}`;
  const html = `<!doctype html><html><body style="margin:0;background:#0d1b2b;font-family:-apple-system,Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#f1f2f4">
  <div style="max-width:520px;margin:40px auto;padding:32px;border-radius:20px;background:linear-gradient(160deg,#1a5276,#0d1b2b);border:1px solid rgba(255,255,255,.08)">
    <div style="font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:#d9b435;font-weight:700">${appName}</div>
    <h1 style="font-size:26px;margin:14px 0 8px">You're in.</h1>
    <p style="color:#aab6cc;line-height:1.5">${inviter} invited you to the team studio. You have <b style="color:#fff">${credits} credits</b> per month to generate images, video and copy.</p>
    <a href="${link}" style="display:inline-block;margin-top:10px;padding:14px 22px;border-radius:999px;background:#d9b435;color:#1a1307;font-weight:700;text-decoration:none">Open the studio</a>
  </div></body></html>`;
  return { html, text };
}
