const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { supabase, checkAdmin } = require('./_lib/supabase');
const { getRenderDocument } = require('./_lib/renderDocument');

// Support both local (puppeteer) and Vercel (puppeteer-core + @sparticuz/chromium)
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

module.exports = async function handler(req, res) {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.status(405).end();

  const { doc_id } = req.body || {};
  if (!doc_id) return res.status(400).json({ error: 'doc_id required' });

  // Fetch document + client
  const { data: doc, error: docErr } = await supabase.from('documents').select('*').eq('id', doc_id).single();
  if (docErr || !doc) return res.status(404).json({ error: 'Document not found' });

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
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    const filename = `${doc.number.replace(/[^A-Z0-9-]/gi, '_')}-${crypto.randomBytes(8).toString('hex')}.pdf`;

    if (process.env.VERCEL) {
      // On Vercel: upload to private Supabase Storage bucket, return 1-hour signed URL
      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(`pdfs/${filename}`, pdfBuffer, { contentType: 'application/pdf', upsert: false });
      if (upErr) return res.status(500).json({ error: upErr.message });
      const { data: signed, error: signErr } = await supabase.storage
        .from('documents')
        .createSignedUrl(`pdfs/${filename}`, 604800); // expires in 7 days
      if (signErr) return res.status(500).json({ error: signErr.message });
      return res.status(200).json({ url: signed.signedUrl, filename });
    } else {
      // Local: save to media/ folder
      const mediaDir = path.join(process.cwd(), 'media');
      if (!fs.existsSync(mediaDir)) fs.mkdirSync(mediaDir, { recursive: true });
      const filePath = path.join(mediaDir, filename);
      fs.writeFileSync(filePath, pdfBuffer);
      return res.status(200).json({ url: `/media/${filename}`, filename });
    }
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: e.message });
  }
};
