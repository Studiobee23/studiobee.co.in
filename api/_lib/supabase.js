const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL    || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
);

const ADMIN_KEY = process.env.ADMIN_KEY || '';

function checkAdmin(req) {
  if (!ADMIN_KEY) return false;
  const supplied = String(req.headers['x-admin-key'] || '');
  const expected = Buffer.from(ADMIN_KEY);
  const given = Buffer.from(supplied);
  // Constant-time compare — Buffer lengths must match first, or timingSafeEqual throws
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

const SITE_ORIGINS = new Set(['https://studiobee.co.in', 'https://www.studiobee.co.in']);
function checkOrigin(req) {
  const origin = req.headers.origin;
  // No Origin header at all (some legitimate same-origin/non-browser requests omit it) — allow.
  // Present but mismatched — a cross-site form/fetch, reject.
  return !origin || SITE_ORIGINS.has(origin);
}

function getIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
}

const rateLimits = new Map();
function checkRateLimit(key, maxPerMin) {
  const now = Date.now();
  let rec = rateLimits.get(key);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + 60000 };
  }
  rec.count++;
  rateLimits.set(key, rec);
  return rec.count <= maxPerMin;
}

module.exports = { supabase, ADMIN_KEY, checkAdmin, checkOrigin, getIp, checkRateLimit };
