import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import { renderDocument } from './pdf-template.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = parseInt(process.env.PORT) || 3000;
const MEDIA_DIR = path.join(__dirname, 'media');

// ── Supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL              || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);

process.on('uncaughtException',  e => console.error('Uncaught exception:', e));
process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));

fs.mkdirSync(MEDIA_DIR, { recursive: true });

// ── Security constants ────────────────────────────────────────────────────────
const MAX_UPLOAD_BYTES    = 50 * 1024 * 1024; // 50 MB
const MAX_CONTACT_BYTES   = 64 * 1024;         // 64 KB
const MAX_ANALYTICS_BYTES = 4  * 1024;         //  4 KB

// Files that must never be served via static file handler
const BLOCKED_FILES = new Set([
  'smtp-config.json',
  'contacts.json',
  'analytics.json',   // served only via protected GET /analytics
  'timelog.json',     // served only via protected GET /timelog
  'package.json',
  'package-lock.json',
  'serve.mjs',
  'screenshot.mjs',
]);

// Allowed extensions for /upload
const ALLOWED_UPLOAD_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.mp4', '.webm', '.mov', '.avi', '.mkv',
]);

// HTML-escape helper for email bodies
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Admin key ─────────────────────────────────────────────────────────────────
// Priority: ADMIN_KEY env var → smtp-config.json "adminKey" → random (logged once)
let adminKey = process.env.ADMIN_KEY || '';
if (!adminKey) {
  try {
    const smtpCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'smtp-config.json'), 'utf8'));
    adminKey = String(smtpCfg.adminKey || '');
  } catch (e) {}
}
if (!adminKey) {
  adminKey = crypto.randomBytes(16).toString('hex');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`Admin key (set ADMIN_KEY env var to persist): ${adminKey}`);
  console.log('──────────────────────────────────────────────────────────────');
}

// ── Optional SMTP config ──────────────────────────────────────────────────────
// Priority: SMTP_* env vars → smtp-config.json → no email (contacts.json only)
let smtpTransport = null;
let smtpTo        = 'arora.nikhil@studiobee.ai';
let smtpFrom      = 'noreply@studiobee.ai';
if (process.env.SMTP_HOST) {
  smtpTransport = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  smtpTo   = process.env.SMTP_TO   || smtpTo;
  smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER;
  console.log(`SMTP configured via env → emails to ${smtpTo}`);
} else {
  try {
    const smtpCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'smtp-config.json'), 'utf8'));
    smtpTransport = nodemailer.createTransport({
      host:   smtpCfg.host,
      port:   smtpCfg.port   || 587,
      secure: smtpCfg.secure || false,
      auth: { user: smtpCfg.user, pass: smtpCfg.pass },
    });
    smtpTo   = smtpCfg.to   || smtpTo;
    smtpFrom = smtpCfg.from || smtpCfg.user;
    console.log(`SMTP configured → emails to ${smtpTo}`);
  } catch (e) {
    console.log('No SMTP config — contact submissions saved to contacts.json only');
  }
}

// ── Per-IP rate limiter ───────────────────────────────────────────────────────
const rateLimits = new Map();
function checkRateLimit(key, maxPerMin) {
  const now = Date.now();
  let rec = rateLimits.get(key);
  if (!rec || now > rec.resetAt) rec = { count: 0, resetAt: now + 60000 };
  rec.count++;
  rateLimits.set(key, rec);
  return rec.count <= maxPerMin;
}
// Clean up stale entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, rec] of rateLimits) {
    if (now > rec.resetAt + 60000) rateLimits.delete(k);
  }
}, 120000);

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.json': 'application/json',
  '.xml':  'application/xml',
  '.txt':  'text/plain',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
  '.mov':  'video/quicktime',
  '.avi':  'video/x-msvideo',
  '.mkv':  'video/x-matroska',
};

// ── CSP header value ──────────────────────────────────────────────────────────
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://images.unsplash.com https://placehold.co https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "connect-src 'self'",
  "frame-ancestors 'self'",
].join('; ');

// ── Allowed CORS origins ──────────────────────────────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://studiobee.co.in',
  'https://www.studiobee.co.in',
  'http://localhost:3000',
  'http://localhost:5500',
]);

const server = http.createServer(async (req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);

  // Client IP (respects reverse-proxy X-Forwarded-For)
  const ip = ((req.headers['x-forwarded-for'] || '').split(',')[0].trim()
           || req.socket.remoteAddress
           || '').replace('::ffff:', '');

  // ── Security headers on ALL responses ────────────────────────────────────
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', CSP);

  // ── CORS (restricted to known origins) ───────────────────────────────────
  const reqOrigin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.has(reqOrigin) ? reqOrigin : 'https://studiobee.co.in');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-Filename, Content-Type, X-Admin-Key');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // ── GET /ping ─────────────────────────────────────────────────────────────
  if ((req.method === 'GET' || req.method === 'HEAD') && urlPath === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── GET /analytics (admin protected) ─────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/analytics') {
    if (req.headers['x-admin-key'] !== adminKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    const analyticsFile = path.join(__dirname, 'analytics.json');
    try {
      const raw = fs.readFileSync(analyticsFile, 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(raw);
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('[]');
    }
    return;
  }

  // ── POST /analytics ───────────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/analytics') {
    // Skip known bots
    const ua = (req.headers['user-agent'] || '').toLowerCase();
    if (/bot|crawler|spider|slurp|baidu|googlebot|yandex|facebookexternalhit|semrush|ahrefs/.test(ua)) {
      res.writeHead(204); res.end(); return;
    }
    // Rate limit: 30/min per IP
    if (!checkRateLimit(ip + ':analytics', 30)) {
      res.writeHead(429); res.end('Too Many Requests'); return;
    }
    let totalSize = 0;
    const chunks = [];
    req.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_ANALYTICS_BYTES) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const locale = String(body.locale || '');
        const locParts = locale.split('-');
        const country = locParts.length > 1 ? locParts[locParts.length - 1].toUpperCase().slice(0, 2) : '';
        const entry = {
          sid:      String(body.sessionId || '').slice(0, 64),
          ts:       new Date().toISOString(),
          page:     String(body.page || '/').slice(0, 256),
          ref:      String(body.referrer || '').slice(0, 256),
          duration: Math.min(Math.max(0, Number(body.duration) || 0), 86400),
          country,
          locale:   locale.slice(0, 20),
          tz:       String(body.tz || '').slice(0, 64),
        };
        const analyticsFile = path.join(__dirname, 'analytics.json');
        let arr = [];
        try { arr = JSON.parse(fs.readFileSync(analyticsFile, 'utf8')); } catch (e) {}
        if (!Array.isArray(arr)) arr = [];
        arr.push(entry);
        if (arr.length > 10000) arr = arr.slice(arr.length - 10000);
        fs.writeFileSync(analyticsFile, JSON.stringify(arr));
        res.writeHead(204); res.end();
      } catch (e) {
        res.writeHead(400); res.end('Bad request');
      }
    });
    return;
  }

  // ── Time Log helpers ──────────────────────────────────────────────────────
  const timelogFile = path.join(__dirname, 'timelog.json');
  function readTimelog() {
    try {
      const arr = JSON.parse(fs.readFileSync(timelogFile, 'utf8'));
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function writeTimelog(entries) {
    fs.writeFileSync(timelogFile, JSON.stringify(entries, null, 2));
  }
  function requireTimelogAdmin() {
    if (req.headers['x-admin-key'] !== adminKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return false;
    }
    return true;
  }
  async function readJsonBody(maxBytes) {
    return new Promise((resolve, reject) => {
      let totalSize = 0;
      const chunks = [];
      req.on('data', c => {
        totalSize += c.length;
        if (totalSize > maxBytes) { req.destroy(); reject(new Error('Too large')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString() || '{}')); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  // ── GET /timelog (admin protected) ────────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/timelog') {
    if (!requireTimelogAdmin()) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readTimelog()));
    return;
  }

  // ── POST /timelog/clockin (admin protected) ───────────────────────────────
  if (req.method === 'POST' && urlPath === '/timelog/clockin') {
    if (!requireTimelogAdmin()) return;
    try {
      const body = await readJsonBody(MAX_CONTACT_BYTES);
      const name = String(body.name || '').trim().slice(0, 100);
      const note = String(body.note || '').trim().slice(0, 500);
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Name is required' })); return; }
      const entries = readTimelog();
      if (entries.some(e => !e.clockOut && (e.name || '').trim().toLowerCase() === name.toLowerCase())) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Already clocked in as ' + name }));
        return;
      }
      const entry = { id: crypto.randomBytes(8).toString('hex'), name, note, clockIn: new Date().toISOString(), clockOut: null, pausedMs: 0, pauseStart: null };
      entries.push(entry);
      writeTimelog(entries);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry));
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
    return;
  }

  // ── POST /timelog/pause (admin protected) ─────────────────────────────────
  if (req.method === 'POST' && urlPath === '/timelog/pause') {
    if (!requireTimelogAdmin()) return;
    try {
      const body = await readJsonBody(MAX_CONTACT_BYTES);
      const id = String(body.id || '');
      const entries = readTimelog();
      const entry = entries.find(e => e.id === id && !e.clockOut && !e.pauseStart);
      if (!entry) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No matching running entry' })); return; }
      entry.pauseStart = new Date().toISOString();
      writeTimelog(entries);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry));
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
    return;
  }

  // ── POST /timelog/resume (admin protected) ────────────────────────────────
  if (req.method === 'POST' && urlPath === '/timelog/resume') {
    if (!requireTimelogAdmin()) return;
    try {
      const body = await readJsonBody(MAX_CONTACT_BYTES);
      const id = String(body.id || '');
      const entries = readTimelog();
      const entry = entries.find(e => e.id === id && !e.clockOut && e.pauseStart);
      if (!entry) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'No matching paused entry' })); return; }
      entry.pausedMs = (entry.pausedMs || 0) + (Date.now() - new Date(entry.pauseStart).getTime());
      entry.pauseStart = null;
      writeTimelog(entries);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry));
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
    return;
  }

  // ── POST /timelog/clockout (admin protected) ──────────────────────────────
  if (req.method === 'POST' && urlPath === '/timelog/clockout') {
    if (!requireTimelogAdmin()) return;
    try {
      const body = await readJsonBody(MAX_CONTACT_BYTES);
      const id = String(body.id || '');
      const entries = readTimelog();
      const entry = entries.find(e => e.id === id && !e.clockOut);
      if (!entry) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No matching open entry' }));
        return;
      }
      if (entry.pauseStart) {
        entry.pausedMs = (entry.pausedMs || 0) + (Date.now() - new Date(entry.pauseStart).getTime());
        entry.pauseStart = null;
      }
      entry.clockOut = new Date().toISOString();
      writeTimelog(entries);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry));
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
    return;
  }

  // ── POST /timelog/manual (admin protected) — add a completed entry by hand ─
  if (req.method === 'POST' && urlPath === '/timelog/manual') {
    if (!requireTimelogAdmin()) return;
    try {
      const body = await readJsonBody(MAX_CONTACT_BYTES);
      const name = String(body.name || '').trim().slice(0, 100);
      const note = String(body.note || '').trim().slice(0, 500);
      const clockIn = new Date(body.clockIn);
      const clockOut = new Date(body.clockOut);
      if (!name) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Name is required' })); return; }
      if (isNaN(clockIn) || isNaN(clockOut) || clockOut <= clockIn) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid clock in/out times' }));
        return;
      }
      const entries = readTimelog();
      const entry = { id: crypto.randomBytes(8).toString('hex'), name, note, clockIn: clockIn.toISOString(), clockOut: clockOut.toISOString(), pausedMs: 0, pauseStart: null };
      entries.push(entry);
      writeTimelog(entries);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(entry));
    } catch (e) {
      res.writeHead(400); res.end('Bad request');
    }
    return;
  }

  // ── DELETE /timelog/:id (admin protected) ─────────────────────────────────
  if (req.method === 'DELETE' && urlPath.startsWith('/timelog/')) {
    if (!requireTimelogAdmin()) return;
    const id = urlPath.split('/')[2];
    const entries = readTimelog().filter(e => e.id !== id);
    writeTimelog(entries);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── POST /contact ─────────────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/contact') {
    if (!checkRateLimit(ip + ':contact', 5)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests. Please wait a moment.' }));
      return;
    }
    let totalSize = 0;
    const chunks = [];
    req.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_CONTACT_BYTES) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const name    = String(body.name    || '').trim().slice(0, 200);
        const email   = String(body.email   || '').trim().slice(0, 200);
        const phone   = String(body.phone   || '').trim().slice(0, 50);
        const city    = String(body.city    || '').trim().slice(0, 100);
        const message = String(body.message || '').trim().slice(0, 5000);

        const contactsFile = path.join(__dirname, 'contacts.json');
        let contacts = [];
        try { contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8')); } catch (e) {}
        contacts.push({ name, email, phone, city, message, timestamp: new Date().toISOString() });
        fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));
        console.log(`New contact: ${name} <${email}> — ${city}`);

        if (smtpTransport) {
          try {
            await smtpTransport.sendMail({
              from:    `"studiobee Website" <${smtpFrom}>`,
              to:      smtpTo,
              subject: `New Project Inquiry — ${escHtml(name)}`,
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
            console.log(`Email sent to ${smtpTo}`);
          } catch (e) {
            console.error('Email failed:', e.message);
          }

          // Confirmation email to submitter
          if (email) {
            try {
              await smtpTransport.sendMail({
                from:    `"studiobee" <${smtpFrom}>`,
                to:      email,
                subject: `We received your inquiry, ${name}`,
                html: `
                  <div style="background:#0A0A0A;padding:0;margin:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
                    <div style="max-width:560px;margin:0 auto;padding:48px 32px;">
                      <p style="font-size:22px;font-weight:700;color:#2F48DF;letter-spacing:-0.02em;margin:0 0 32px;">studiobee</p>
                      <h1 style="font-size:28px;font-weight:400;color:#FBFBFB;line-height:1.25;margin:0 0 16px;">Thanks for reaching out,<br/>${escHtml(name)}.</h1>
                      <p style="font-size:15px;line-height:1.7;color:rgba(251,251,251,0.55);margin:0 0 36px;">We've received your brief and will review it shortly. Expect a reply within <strong style="color:#FBFBFB;">one business day</strong>.</p>
                      <div style="background:rgba(47,72,223,0.12);border:1px solid rgba(47,72,223,0.25);border-radius:12px;padding:24px 28px;margin-bottom:36px;">
                        <p style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,251,251,0.35);margin:0 0 16px;">Your submission</p>
                        <table style="width:100%;border-collapse:collapse;">
                          <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:rgba(251,251,251,0.4);font-size:13px;width:80px;">Name</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#FBFBFB;font-size:13px;">${escHtml(name)}</td></tr>
                          <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:rgba(251,251,251,0.4);font-size:13px;">City</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.07);color:#FBFBFB;font-size:13px;">${escHtml(city)}</td></tr>
                          <tr><td style="padding:8px 0;color:rgba(251,251,251,0.4);font-size:13px;vertical-align:top;">Message</td><td style="padding:8px 0;color:rgba(251,251,251,0.65);font-size:13px;line-height:1.6;">${escHtml(message).replace(/\n/g, '<br/>')}</td></tr>
                        </table>
                      </div>
                      <p style="font-size:13px;color:rgba(251,251,251,0.25);margin:0;">studiobee · creative studio, Gurgaon · <a href="https://studiobee.co.in" style="color:#2F48DF;text-decoration:none;">studiobee.co.in</a></p>
                    </div>
                  </div>
                `,
              });
              console.log(`Confirmation email sent to ${email}`);
            } catch (e) {
              console.error('Confirmation email failed:', e.message);
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400); res.end('Bad request');
      }
    });
    return;
  }

  // ── POST /upload ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/upload') {
    if (!checkRateLimit(ip + ':upload', 10)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    const rawName = req.headers['x-filename']
      ? decodeURIComponent(req.headers['x-filename'])
      : 'upload.bin';
    const ext = path.extname(rawName).toLowerCase() || '.bin';
    if (!ALLOWED_UPLOAD_EXTS.has(ext)) {
      res.writeHead(415, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'File type not allowed' }));
      return;
    }
    try {
      fs.mkdirSync(MEDIA_DIR, { recursive: true });
    } catch (e) {
      console.error('Cannot create media dir:', e);
      res.writeHead(500); res.end('Upload failed');
      return;
    }
    const base = path.basename(rawName, ext).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const name = Date.now() + '-' + base + ext;
    const dest = path.join(MEDIA_DIR, name);
    const writeStream = fs.createWriteStream(dest);
    let totalSize = 0;
    let aborted = false;

    req.on('error', () => {
      aborted = true;
      writeStream.destroy();
      fs.unlink(dest, () => {});
      if (!res.headersSent) { res.writeHead(400); res.end('Upload error'); }
    });
    req.on('data', c => {
      if (aborted) return;
      totalSize += c.length;
      if (totalSize > MAX_UPLOAD_BYTES) {
        aborted = true;
        writeStream.destroy();
        fs.unlink(dest, () => {});
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'File too large (max 50 MB)' }));
        req.destroy();
        return;
      }
      writeStream.write(c);
    });
    req.on('end', () => {
      if (aborted) return;
      writeStream.end();
    });
    writeStream.on('finish', () => {
      if (aborted) return;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ url: '/media/' + name }));
    });
    writeStream.on('error', err => {
      console.error('Upload write error:', err);
      aborted = true;
      fs.unlink(dest, () => {});
      if (!res.headersSent) { res.writeHead(500); res.end('Upload failed'); }
    });
    return;
  }

  // ── POST /save-config (admin protected) ───────────────────────────────────
  if (req.method === 'POST' && urlPath === '/save-config') {
    if (req.headers['x-admin-key'] !== adminKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }
    if (!checkRateLimit(ip + ':save-config', 20)) {
      res.writeHead(429); res.end('Too Many Requests'); return;
    }
    let totalSize = 0;
    const chunks = [];
    req.on('data', c => {
      totalSize += c.length;
      if (totalSize > MAX_UPLOAD_BYTES) { req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString();
        JSON.parse(body); // validate JSON
        fs.writeFileSync(path.join(__dirname, 'config.json'), body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400); res.end('Bad JSON');
      }
    });
    return;
  }

  // ── Billing API helpers ───────────────────────────────────────────────────
  function requireAdmin() {
    if (req.headers['x-admin-key'] !== adminKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return false;
    }
    return true;
  }

  async function readBody(maxBytes = 512 * 1024) {
    return new Promise((resolve, reject) => {
      let total = 0;
      const chunks = [];
      req.on('data', c => {
        total += c.length;
        if (total > maxBytes) { req.destroy(); reject(new Error('Too large')); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  function jsonOk(data) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  function jsonErr(code, msg) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }

  async function nextDocNumber(type) {
    const { data } = await supabase.from('document_series').select('last_number').eq('type', type).single();
    const n = (data?.last_number || 0) + 1;
    await supabase.from('document_series').update({ last_number: n }).eq('type', type);
    const prefix = type === 'quote' ? 'SB-Q' : type === 'invoice' ? 'SB-I' : 'SB-R';
    return `${prefix}-${String(n).padStart(3, '0')}`;
  }

  // ── GET /api/clients ──────────────────────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/api/clients') {
    if (!requireAdmin()) return;
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) return jsonErr(500, error.message);
    return jsonOk(data);
  }

  // ── POST /api/clients ─────────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/api/clients') {
    if (!requireAdmin()) return;
    try {
      const b = await readBody();
      const client = {
        name:           String(b.name           || '').trim().slice(0, 200),
        contact_person: String(b.contact_person || '').trim().slice(0, 200),
        email:          String(b.email          || '').trim().slice(0, 200),
        phone:          String(b.phone          || '').trim().slice(0, 50),
        gstin:          String(b.gstin          || '').trim().slice(0, 50),
        address:        String(b.address        || '').trim().slice(0, 500),
        city:           String(b.city           || '').trim().slice(0, 100),
        state:          String(b.state          || '').trim().slice(0, 100),
      };
      if (!client.name) return jsonErr(400, 'Name is required');
      const { data, error } = await supabase.from('clients').insert(client).select().single();
      if (error) return jsonErr(500, error.message);
      return jsonOk(data);
    } catch (e) { return jsonErr(400, 'Invalid request'); }
  }

  // ── PUT /api/clients/:id ──────────────────────────────────────────────────
  if (req.method === 'PUT' && urlPath.startsWith('/api/clients/')) {
    if (!requireAdmin()) return;
    const id = urlPath.split('/')[3];
    if (!id) return jsonErr(400, 'Missing id');
    try {
      const b = await readBody();
      const client = {
        name:           String(b.name           || '').trim().slice(0, 200),
        contact_person: String(b.contact_person || '').trim().slice(0, 200),
        email:          String(b.email          || '').trim().slice(0, 200),
        phone:          String(b.phone          || '').trim().slice(0, 50),
        gstin:          String(b.gstin          || '').trim().slice(0, 50),
        address:        String(b.address        || '').trim().slice(0, 500),
        city:           String(b.city           || '').trim().slice(0, 100),
        state:          String(b.state          || '').trim().slice(0, 100),
      };
      const { data, error } = await supabase.from('clients').update(client).eq('id', id).select().single();
      if (error) return jsonErr(500, error.message);
      return jsonOk(data);
    } catch (e) { return jsonErr(400, 'Invalid request'); }
  }

  // ── GET /api/documents ────────────────────────────────────────────────────
  if (req.method === 'GET' && urlPath === '/api/documents') {
    if (!requireAdmin()) return;
    const params = new URL('http://x' + req.url).searchParams;
    let q = supabase.from('documents').select('*, clients(name, email, phone)').order('created_at', { ascending: false });
    if (params.get('type'))      q = q.eq('type', params.get('type'));
    if (params.get('client_id')) q = q.eq('client_id', params.get('client_id'));
    const { data, error } = await q;
    if (error) return jsonErr(500, error.message);
    return jsonOk(data);
  }

  // ── POST /api/documents ───────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/api/documents') {
    if (!requireAdmin()) return;
    try {
      const b = await readBody();
      const type = ['quote', 'invoice', 'receipt'].includes(b.type) ? b.type : 'quote';
      const number = await nextDocNumber(type);
      const doc = {
        type,
        number,
        client_id:    b.client_id    || null,
        status:       b.status       || 'draft',
        project_name: String(b.project_name || '').trim().slice(0, 200),
        category:     String(b.category     || '').trim().slice(0, 100),
        line_items:   Array.isArray(b.line_items) ? b.line_items : [],
        subtotal:     Number(b.subtotal)    || 0,
        gst_enabled:  b.gst_enabled !== false,
        gst_type:     b.gst_type === 'igst' ? 'igst' : 'cgst_sgst',
        gst_rate:     Number(b.gst_rate)    || 18,
        gst_amount:   Number(b.gst_amount)  || 0,
        discount:     Number(b.discount)    || 0,
        total:        Number(b.total)       || 0,
        notes:        String(b.notes        || '').trim().slice(0, 2000),
        validity_days: Number(b.validity_days) || 15,
        converted_from: b.converted_from || null,
      };
      const { data, error } = await supabase.from('documents').insert(doc).select().single();
      if (error) return jsonErr(500, error.message);
      return jsonOk(data);
    } catch (e) { return jsonErr(400, 'Invalid request'); }
  }

  // ── PUT /api/documents/:id ────────────────────────────────────────────────
  if (req.method === 'PUT' && urlPath.startsWith('/api/documents/') && !urlPath.endsWith('/convert')) {
    if (!requireAdmin()) return;
    const id = urlPath.split('/')[3];
    if (!id) return jsonErr(400, 'Missing id');
    try {
      const b = await readBody();
      const allowed = ['client_id', 'status', 'project_name', 'category', 'line_items',
        'subtotal', 'gst_enabled', 'gst_type', 'gst_rate', 'gst_amount', 'discount',
        'total', 'notes', 'validity_days'];
      const update = {};
      for (const k of allowed) if (k in b) update[k] = b[k];
      const { data, error } = await supabase.from('documents').update(update).eq('id', id).select().single();
      if (error) return jsonErr(500, error.message);
      return jsonOk(data);
    } catch (e) { return jsonErr(400, 'Invalid request'); }
  }

  // ── POST /api/documents/:id/convert ──────────────────────────────────────
  if (req.method === 'POST' && urlPath.match(/^\/api\/documents\/[^/]+\/convert$/)) {
    if (!requireAdmin()) return;
    const id = urlPath.split('/')[3];
    try {
      const { data: src, error: srcErr } = await supabase.from('documents').select('*').eq('id', id).single();
      if (srcErr || !src) return jsonErr(404, 'Document not found');
      const nextType = src.type === 'quote' ? 'invoice' : src.type === 'invoice' ? 'receipt' : null;
      if (!nextType) return jsonErr(400, 'Cannot convert receipt');
      const number = await nextDocNumber(nextType);
      const newDoc = {
        type:         nextType,
        number,
        client_id:    src.client_id,
        status:       'draft',
        project_name: src.project_name,
        category:     src.category,
        line_items:   src.line_items,
        subtotal:     src.subtotal,
        gst_enabled:  src.gst_enabled,
        gst_type:     src.gst_type,
        gst_rate:     src.gst_rate,
        gst_amount:   src.gst_amount,
        discount:     src.discount,
        total:        src.total,
        notes:        src.notes,
        validity_days: src.validity_days,
        converted_from: src.id,
      };
      const { data, error } = await supabase.from('documents').insert(newDoc).select().single();
      if (error) return jsonErr(500, error.message);
      return jsonOk(data);
    } catch (e) { return jsonErr(500, e.message); }
  }

  // ── POST /generate-pdf ────────────────────────────────────────────────────
  if (req.method === 'POST' && (urlPath === '/generate-pdf' || urlPath === '/api/generate-pdf')) {
    if (!requireAdmin()) return;
    try {
      const b = await readBody();
      let doc = b.doc;
      let client = b.client || null;

      // Support doc_id-based fetch (same interface as Vercel API)
      if (!doc && b.doc_id) {
        const { data: d } = await supabase.from('documents').select('*').eq('id', b.doc_id).single();
        if (!d) return jsonErr(404, 'Document not found');
        doc = d;
        if (doc.client_id) {
          const { data: c } = await supabase.from('clients').select('*').eq('id', doc.client_id).single();
          client = c || null;
        }
      }
      if (!doc) return jsonErr(400, 'Missing doc or doc_id');

      // Build settings from smtp-config / env
      const settings = {
        studioGstin:   process.env.STUDIO_GSTIN   || '',
        studioAddress: process.env.STUDIO_ADDRESS  || 'Bangalore, Karnataka',
        studioPhone:   process.env.STUDIO_PHONE    || '',
        studioEmail:   process.env.SMTP_FROM       || '',
        bankName:      process.env.BANK_NAME       || '',
        accountNumber: process.env.BANK_ACCOUNT    || '',
        ifsc:          process.env.BANK_IFSC       || '',
      };

      const html = renderDocument(doc, client, settings);

      // Lazy-load puppeteer so it doesn't crash if not installed
      let puppeteer;
      try { puppeteer = (await import('puppeteer')).default; }
      catch (e) { return jsonErr(500, 'Puppeteer not available'); }

      const browser = await puppeteer.launch({
        executablePath: 'C:/Users/arora/.cache/puppeteer/chrome/win64-145.0.7632.77/chrome-win64/chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        width: '794px',
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });
      await browser.close();

      // Save to media/ and return JSON URL (consistent with Vercel API)
      const fname = `${doc.number.replace(/[^a-zA-Z0-9-]/g, '_')}-${crypto.randomBytes(16).toString('hex')}.pdf`;
      fs.writeFileSync(path.join(MEDIA_DIR, fname), pdf);
      return jsonOk({ url: `/media/${fname}`, filename: fname });
    } catch (e) {
      console.error('PDF generation error:', e);
      return jsonErr(500, e.message);
    }
    return;
  }

  // ── POST /api/send-email ──────────────────────────────────────────────────
  if (req.method === 'POST' && urlPath === '/api/send-email') {
    if (!requireAdmin()) return;
    try {
      const b = await readBody();
      let { doc, client, to, subject, body: emailBody } = b;
      if (!to) return jsonErr(400, 'Missing to');
      if (!smtpTransport) return jsonErr(503, 'SMTP not configured');

      // Support doc_id-based fetch
      if (!doc && b.doc_id) {
        const { data: d } = await supabase.from('documents').select('*').eq('id', b.doc_id).single();
        if (!d) return jsonErr(404, 'Document not found');
        doc = d;
        if (doc.client_id) {
          const { data: c } = await supabase.from('clients').select('*').eq('id', doc.client_id).single();
          client = c || null;
        }
      }
      if (!doc) return jsonErr(400, 'Missing doc or doc_id');

      const settings = {
        studioGstin:   process.env.STUDIO_GSTIN   || '',
        studioAddress: process.env.STUDIO_ADDRESS  || 'Bangalore, Karnataka',
        bankName:      process.env.BANK_NAME       || '',
        accountNumber: process.env.BANK_ACCOUNT    || '',
        ifsc:          process.env.BANK_IFSC       || '',
      };

      const html = renderDocument(doc, client, settings);

      let puppeteer;
      try { puppeteer = (await import('puppeteer')).default; }
      catch (e) { return jsonErr(500, 'Puppeteer not available'); }

      const browser = await puppeteer.launch({
        executablePath: 'C:/Users/arora/.cache/puppeteer/chrome/win64-145.0.7632.77/chrome-win64/chrome.exe',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        width: '794px',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      await browser.close();

      const typeLabel = doc.type === 'quote' ? 'Quote' : doc.type === 'invoice' ? 'Invoice' : 'Receipt';
      await smtpTransport.sendMail({
        from:    smtpFrom,
        to:      to.trim(),
        subject: subject || `StudioBee ${typeLabel} ${doc.number}`,
        html:    emailBody || `<p>Please find your ${typeLabel} from StudioBee attached.</p>`,
        attachments: [{
          filename: `${doc.number}.pdf`,
          content:  pdf,
          contentType: 'application/pdf',
        }],
      });

      return jsonOk({ ok: true });
    } catch (e) {
      console.error('Send email error:', e);
      return jsonErr(500, e.message);
    }
  }

  // ── Static file server ─────────────────────────────────────────────────────
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.resolve(__dirname, '.' + urlPath);

  // Path traversal guard
  const rootWithSep = __dirname + path.sep;
  if (!filePath.startsWith(rootWithSep) && filePath !== __dirname) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Block sensitive files
  const basename = path.basename(filePath);
  if (BLOCKED_FILES.has(basename)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Block node_modules and dotfiles
  if (filePath.includes(path.sep + 'node_modules' + path.sep) || basename.startsWith('.')) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const fileExt     = path.extname(filePath).toLowerCase();
  const contentType = MIME[fileExt] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    if (fileExt === '.html') {
      // Inject server-side config before content.js loads
      let cfgJson = 'null';
      try {
        const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8').trim();
        cfgJson = JSON.stringify(JSON.parse(raw));
      } catch (e) {}
      const cfgInjection = `<script>window.__SITE_CONFIG__ = ${cfgJson};</script>\n`;
      let html = data.toString().replace(
        '<script src="content.js">',
        cfgInjection + '<script src="content.js">'
      );
      // Inject admin key into admin pages
      if (basename === 'config.html' || basename === 'billing.html') {
        html = html.replace(
          '</head>',
          `<script>window.__ADMIN_KEY__ = ${JSON.stringify(adminKey)};</script>\n</head>`
        );
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = Object.values(os.networkInterfaces()).flat();
  const lan  = nets.find(n => n.family === 'IPv4' && !n.internal);
  console.log(`studiobee server running at http://localhost:${PORT}`);
  if (lan) console.log(`On your phone (same WiFi):   http://${lan.address}:${PORT}`);
});
