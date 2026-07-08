import nodemailer from "nodemailer";

/** Same SMTP_* env vars as the marketing site's serve.mjs — same account can
 * be reused across both. Returns null if not configured so callers can
 * surface a clear "email isn't set up yet" error instead of an opaque one. */
export function getSmtpTransport() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

export function getSmtpFrom() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "";
}
