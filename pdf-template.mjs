// Renders a branded StudioBee document (quote / invoice / receipt) as an HTML string.
// Pass the result to Puppeteer's page.setContent() then page.pdf().

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function validUntil(iso, days) {
  if (!iso || !days) return '';
  const d = new Date(iso);
  d.setDate(d.getDate() + Number(days));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

const TYPE_LABEL = { quote: 'Quote', invoice: 'Invoice', receipt: 'Receipt' };

export function renderDocument(doc, client, settings = {}) {
  const {
    bankName = '', accountNumber = '', ifsc = '', studioGstin = '',
    studioAddress = 'Bangalore, Karnataka', studioPhone = '', studioEmail = '',
  } = settings;

  const items = Array.isArray(doc.line_items) ? doc.line_items : [];
  const label = TYPE_LABEL[doc.type] || 'Document';

  const gstRows = doc.gst_enabled
    ? doc.gst_type === 'igst'
      ? `<tr><td class="tot-label">IGST (${doc.gst_rate}%)</td><td class="tot-val">${fmt(doc.gst_amount)}</td></tr>`
      : `<tr><td class="tot-label">CGST (${doc.gst_rate / 2}%)</td><td class="tot-val">${fmt(doc.gst_amount / 2)}</td></tr>
         <tr><td class="tot-label">SGST (${doc.gst_rate / 2}%)</td><td class="tot-val">${fmt(doc.gst_amount / 2)}</td></tr>`
    : '';

  const discountRow = Number(doc.discount) > 0
    ? `<tr><td class="tot-label">Discount</td><td class="tot-val" style="color:#e44;">-${fmt(doc.discount)}</td></tr>`
    : '';

  const validityNote = doc.type === 'quote' && doc.validity_days
    ? `<span>Valid until ${esc(validUntil(doc.created_at, doc.validity_days))}</span>`
    : doc.type === 'receipt'
    ? `<span style="color:#6ee;font-weight:600;">Payment Received</span>`
    : '';

  const bankInfo = bankName
    ? `<strong>${esc(bankName)}</strong> &nbsp;·&nbsp; A/C ${esc(accountNumber)} &nbsp;·&nbsp; IFSC ${esc(ifsc)}`
    : 'Bank details on file';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${label} ${esc(doc.number)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 794px; background: #fff; font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #333; }

  .doc-header { background: #2F48DF; padding: 24px 40px; display: flex; justify-content: space-between; align-items: center; min-height: 80px; }
  .doc-logo { height: 28px; width: auto; display: block; }
  .doc-title-block { text-align: right; }
  .doc-type { font-size: 18px; font-weight: 400; color: #fff; letter-spacing: 0.01em; line-height: 1; }
  .doc-num { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 5px; }

  .doc-body { padding: 32px 40px; }

  .parties { display: flex; gap: 48px; margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #ebebeb; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #2F48DF; font-weight: 600; margin-bottom: 7px; }
  .party-name { font-size: 14px; font-weight: 600; color: #0A0A0A; margin-bottom: 3px; }
  .party-detail { font-size: 12px; color: #666; line-height: 1.7; }

  .meta-row { display: flex; gap: 28px; margin-bottom: 24px; flex-wrap: wrap; }
  .meta-item { }
  .meta-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 3px; }
  .meta-val { font-size: 13px; color: #0A0A0A; font-weight: 500; }

  table.items { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  table.items thead tr { background: #0A0A0A; }
  table.items th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #fff; padding: 9px 12px; text-align: left; font-weight: 500; }
  table.items th:last-child { text-align: right; }
  table.items td { font-size: 13px; color: #333; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
  table.items td:last-child { text-align: right; font-weight: 500; }
  table.items tr:nth-child(even) td { background: #f6f8ff; }
  .item-detail { font-size: 11px; color: #999; margin-top: 2px; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 24px; }
  table.tots { border-collapse: collapse; min-width: 220px; }
  .tot-label { padding: 5px 16px 5px 0; font-size: 13px; color: #555; text-align: left; }
  .tot-val { padding: 5px 0; font-size: 13px; color: #333; text-align: right; }
  tr.grand .tot-label { font-size: 15px; font-weight: 700; color: #2F48DF; border-top: 2px solid #2F48DF; padding-top: 10px; }
  tr.grand .tot-val { font-size: 15px; font-weight: 700; color: #2F48DF; border-top: 2px solid #2F48DF; padding-top: 10px; }

  .notes-box { background: #f6f8ff; border-left: 3px solid #2F48DF; padding: 11px 15px; font-size: 12px; color: #555; margin-bottom: 24px; border-radius: 0 4px 4px 0; line-height: 1.6; }

  .doc-footer { background: #0A0A0A; padding: 16px 40px; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
  .footer-bank { font-size: 12px; color: #888; }
  .footer-bank strong { color: #fff; display: block; margin-bottom: 2px; font-size: 12px; }
  .footer-right { font-size: 12px; color: #666; text-align: right; line-height: 1.6; }
  .footer-right span { display: block; }
</style>
</head>
<body>
<div class="doc-header">
  <img src="http://localhost:3000/studiobee white.png" alt="StudioBee" class="doc-logo">
  <div class="doc-title-block">
    <div class="doc-type">${label}</div>
    <div class="doc-num">${esc(doc.number)} &nbsp;·&nbsp; ${esc(fmtDate(doc.created_at))}</div>
  </div>
</div>

<div class="doc-body">
  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">StudioBee</div>
      <div class="party-detail">
        studiobee.co.in<br>
        ${esc(studioAddress)}
        ${studioPhone ? '<br>' + esc(studioPhone) : ''}
        ${studioGstin ? '<br>GSTIN: ' + esc(studioGstin) : ''}
      </div>
    </div>
    <div>
      <div class="party-label">Billed To</div>
      <div class="party-name">${esc(client?.name || '—')}</div>
      <div class="party-detail">
        ${esc(client?.contact_person || '')}${client?.contact_person ? '<br>' : ''}
        ${esc(client?.city || '')}${client?.city && client?.state ? ', ' : ''}${esc(client?.state || '')}
        ${client?.email ? '<br>' + esc(client.email) : ''}
        ${client?.gstin ? '<br>GSTIN: ' + esc(client.gstin) : ''}
      </div>
    </div>
  </div>

  <div class="meta-row">
    <div class="meta-item">
      <div class="meta-lbl">Date</div>
      <div class="meta-val">${esc(fmtDate(doc.created_at))}</div>
    </div>
    ${doc.type === 'quote' ? `
    <div class="meta-item">
      <div class="meta-lbl">Valid Until</div>
      <div class="meta-val">${esc(validUntil(doc.created_at, doc.validity_days))}</div>
    </div>` : ''}
    ${doc.project_name ? `
    <div class="meta-item">
      <div class="meta-lbl">Project</div>
      <div class="meta-val">${esc(doc.project_name)}</div>
    </div>` : ''}
    ${doc.category ? `
    <div class="meta-item">
      <div class="meta-lbl">Category</div>
      <div class="meta-val">${esc(doc.category)}</div>
    </div>` : ''}
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:50%">Service / Description</th>
        <th style="width:10%;text-align:center">Qty</th>
        <th style="width:18%;text-align:right">Rate</th>
        <th style="width:22%;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(item => `
      <tr>
        <td>
          ${esc(item.description || '')}
          ${item.detail ? `<div class="item-detail">${esc(item.detail)}</div>` : ''}
        </td>
        <td style="text-align:center">${esc(item.qty)}</td>
        <td style="text-align:right">${fmt(item.rate)}</td>
        <td>${fmt(item.amount)}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="totals-wrap">
    <table class="tots">
      <tr><td class="tot-label">Subtotal</td><td class="tot-val">${fmt(doc.subtotal)}</td></tr>
      ${discountRow}
      ${gstRows}
      <tr class="grand"><td class="tot-label">Total</td><td class="tot-val">${fmt(doc.total)}</td></tr>
    </table>
  </div>

  ${doc.notes ? `<div class="notes-box">${esc(doc.notes)}</div>` : ''}
</div>

<div class="doc-footer">
  <div class="footer-bank">
    <strong>Bank Transfer</strong>
    ${bankInfo}
  </div>
  <div class="footer-right">
    ${validityNote}
    <span style="color:#555;margin-top:4px">studiobee.co.in</span>
  </div>
</div>
</body>
</html>`;
}
