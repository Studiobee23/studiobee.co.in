const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
const { supabase, checkAdmin } = require('./_lib/supabase');
const { getRenderDocument } = require('./_lib/renderDocument');

async function launchBrowser() {
  if (process.env.VERCEL) {
    const chromium = await import('@sparticuz/chromium');
    const puppeteer = await import('puppeteer-core');
    return puppeteer.default.launch({
      args: chromium.default.args,
      defaultViewport: chromium.default.defaultViewport,
      executablePath: await chromium.default.executablePath(),
      headless: chromium.default.headless,
    });
  } else {
    const puppeteer = require('puppeteer');
    return puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
}

function getTransporter() {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  // Try loading local smtp-config.json
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'smtp-config.json'), 'utf8'));
    return nodemailer.createTransport({
      host: cfg.host, port: cfg.port || 587, secure: cfg.secure || false,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { doc_id, to, subject, body } = req.body || {};
  if (!doc_id || !to || !subject) return res.status(400).json({ error: 'doc_id, to, subject required' });

  const transporter = getTransporter();
  if (!transporter) return res.status(500).json({ error: 'SMTP not configured' });

  const { data: doc } = await supabase.from('documents').select('*').eq('id', doc_id).single();
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  let client = null;
  if (doc.client_id) {
    const { data } = await supabase.from('clients').select('*').eq('id', doc.client_id).single();
    client = data;
  }

  const settings = {
    bank_name:    process.env.BANK_NAME    || '',
    bank_account: process.env.BANK_ACCOUNT || '',
    bank_ifsc:    process.env.BANK_IFSC    || '',
    studio_gstin: process.env.STUDIO_GSTIN || '',
  };

  const renderDocument = await getRenderDocument();
  const html = renderDocument(doc, client, settings);

  let browser;
  let pdfBuffer;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: `PDF generation failed: ${e.message}` });
  }

  const filename = `${doc.number}.pdf`;
  try {
    await transporter.sendMail({
      from: process.env.SMTP_USER || process.env.SMTP_FROM || 'hello@studiobee.co.in',
      to,
      subject,
      text: body || '',
      attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: `Email send failed: ${e.message}` });
  }
};
