const nodemailer = require('nodemailer');
const { supabase, checkRateLimit, getIp } = require('./_lib/supabase');

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
  });
  console.log(`SMTP transport ready: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT} user=${process.env.SMTP_USER}`);
} else {
  console.warn('SMTP_HOST not set — email notifications disabled');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!checkRateLimit(getIp(req) + ':contact', 5)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }

  const body = req.body || {};
  const name    = String(body.name    || '').trim().slice(0, 200);
  const email   = String(body.email   || '').trim().slice(0, 200);
  const phone   = String(body.phone   || '').trim().slice(0, 50);
  const city    = String(body.city    || '').trim().slice(0, 100);
  const message = String(body.message || '').trim().slice(0, 5000);

  try {
    const insertPromise = supabase.from('contacts').insert({ name, email, phone, city, message });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000));
    const { error } = await Promise.race([insertPromise, timeoutPromise]);
    if (error) console.error('Contact insert failed (non-fatal):', error.message);
    else console.log(`Contact saved to Supabase: ${name} <${email}>`);
  } catch (e) {
    console.error('Contact insert error (non-fatal):', e.message);
  }
  console.log(`New contact: ${name} <${email}> — ${city}`);

  // Send email before responding — Vercel kills the function immediately after res.json()
  // so fire-and-forget doesn't work in serverless
  if (transport) {
    const smtpTo   = process.env.SMTP_TO   || 'arora.nikhil@studiobee.ai';
    const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
    try {
      await transport.sendMail({
        from: `"StudioBee Website" <${smtpFrom}>`,
        to: smtpTo,
        subject: `New Project Inquiry — ${name}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px;">
            <h2 style="color:#2F48DF;margin-bottom:24px;font-size:22px;">New project inquiry</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;width:100px;">Name</td><td style="padding:10px 0;border-bottom:1px solid #eee;font-weight:600;">${escHtml(name)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;">Email</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${escHtml(email)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;">Phone</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${escHtml(phone)}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #eee;color:#888;">City</td><td style="padding:10px 0;border-bottom:1px solid #eee;">${escHtml(city)}</td></tr>
            </table>
            <div style="margin-top:24px;">
              <p style="color:#888;margin-bottom:8px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">Message</p>
              <p style="background:#f7f7f7;padding:18px;border-radius:8px;line-height:1.65;color:#333;">${escHtml(message).replace(/\n/g, '<br/>')}</p>
            </div>
            <p style="margin-top:32px;font-size:12px;color:#bbb;">Sent from studiobee.co.in</p>
          </div>
        `,
      });
      console.log('Email sent to', smtpTo);
    } catch (e) {
      console.error('Email failed:', e.message);
    }
  }

  res.status(200).json({ ok: true });
};
