// Renders a branded StudioBee document (quote / invoice / receipt) as an HTML string.
// Pass the result to Puppeteer's page.setContent() then page.pdf().

function esc(s: unknown) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: unknown) {
  return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtQty(n: unknown) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function validUntil(iso: string | null | undefined, days: number | null | undefined) {
  if (!iso || !days) return '';
  const d = new Date(iso);
  d.setDate(d.getDate() + Number(days));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitWords(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}

function threeDigitWords(n: number): string {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred';
    n %= 100;
    if (n) str += ' ';
  }
  if (n > 0) str += twoDigitWords(n);
  return str;
}

/** Indian numbering system (Crore/Lakh/Thousand), not the international
 * Million/Billion grouping — matches how INR amounts are conventionally spelled out. */
function numberToIndianWords(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;
  const parts: string[] = [];
  if (crore) parts.push(threeDigitWords(crore) + ' Crore');
  if (lakh) parts.push(threeDigitWords(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigitWords(thousand) + ' Thousand');
  if (hundred) parts.push(threeDigitWords(hundred));
  return parts.join(' ');
}

/** e.g. "Indian Rupee Twenty-Three Thousand Five Hundred Only" */
function totalInWords(total: number): string {
  const rupees = Math.floor(Math.abs(total));
  const paise = Math.round((Math.abs(total) - rupees) * 100);
  let words = `Indian Rupee ${numberToIndianWords(rupees)}`;
  if (paise > 0) words += ` and ${numberToIndianWords(paise)} Paise`;
  return words + ' Only';
}

const TYPE_LABEL: Record<string, string> = { quote: 'Quote', proforma: 'Proforma Invoice', invoice: 'Invoice', receipt: 'Receipt' };

export type PdfDocument = {
  type: 'quote' | 'proforma' | 'invoice' | 'receipt';
  number: string;
  created_at: string;
  project_name?: string;
  category?: string;
  line_items: Array<{ description?: string; detail?: string; qty: number; rate: number; amount: number }>;
  subtotal: number;
  gst_enabled: boolean;
  gst_type: 'cgst_sgst' | 'igst';
  gst_rate: number;
  gst_amount: number;
  discount: number;
  discount_type?: 'flat' | 'percent';
  total: number;
  notes?: string;
  validity_days?: number;
  hide_pricing?: boolean;
  summary_view?: boolean;
  summary_label?: string | null;
};

export type PdfClient = {
  name?: string;
  contact_person?: string;
  city?: string;
  state?: string;
  email?: string;
  gstin?: string;
} | null;

export type PdfSettings = {
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  studioGstin?: string;
  studioAddress?: string;
  studioPhone?: string;
  studioEmail?: string;
};

// Inlined as a data URI so the PDF renders the logo regardless of host (localhost vs Vercel serverless).
const LOGO_DATA_URI = 'data:image/png;base64,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';

export function renderDocument(doc: PdfDocument, client: PdfClient, settings: PdfSettings = {}) {
  const {
    studioGstin = '',
    studioAddress = 'Sultanpur, Delhi', studioPhone = '', studioEmail = '',
  } = settings;

  const items = Array.isArray(doc.line_items) ? doc.line_items : [];
  const label = TYPE_LABEL[doc.type] || 'Document';

  const gstRows = doc.gst_enabled
    ? doc.gst_type === 'igst'
      ? `<tr><td class="tot-label">IGST (${doc.gst_rate}%)</td><td class="tot-val">${fmt(doc.gst_amount)}</td></tr>`
      : `<tr><td class="tot-label">CGST (${doc.gst_rate / 2}%)</td><td class="tot-val">${fmt(doc.gst_amount / 2)}</td></tr>
         <tr><td class="tot-label">SGST (${doc.gst_rate / 2}%)</td><td class="tot-val">${fmt(doc.gst_amount / 2)}</td></tr>`
    : '';

  const discountAmount = doc.discount_type === 'percent'
    ? Math.round(Number(doc.subtotal) * (Number(doc.discount) / 100) * 100) / 100
    : Number(doc.discount);
  const discountLabel = doc.discount_type === 'percent' ? `Discount (${doc.discount}%)` : 'Discount';
  const discountRow = discountAmount > 0
    ? `<tr><td class="tot-label">${discountLabel}</td><td class="tot-val" style="color:#e44;">-${fmt(discountAmount)}</td></tr>`
    : '';

  const summaryView = doc.summary_view === true;
  const hidePricing = doc.hide_pricing === true;

  // Summary view collapses every line item into a single row — the custom label
  // (or a fallback) — with no qty/rate/amount columns, same table chrome as normal.
  const displayItems = summaryView
    ? [{
        description: doc.summary_label?.trim() ||
          `${doc.project_name || 'Project'} · ${items.length} service${items.length !== 1 ? 's' : ''} included`,
      }]
    : items;
  const showQty = !summaryView;
  const showPricing = !summaryView && !hidePricing;

  const descWidth = showPricing ? '46%' : showQty ? '76%' : '96%';
  const itemsSection = `<table class="items">
    <thead>
      <tr>
        <th style="width:4%">#</th>
        <th style="width:${descWidth}">Description</th>
        ${showQty ? '<th style="width:10%;text-align:center">Qty</th>' : ''}
        ${showPricing ? `
        <th style="width:18%;text-align:right">Rate</th>
        <th style="width:22%;text-align:right">Amount</th>` : ''}
      </tr>
    </thead>
    <tbody>
      ${displayItems.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>
          ${esc(item.description || '')}
          ${'detail' in item && item.detail ? `<div class="item-detail">${esc(item.detail)}</div>` : ''}
        </td>
        ${showQty ? `<td style="text-align:center">${fmtQty('qty' in item ? item.qty : 0)}</td>` : ''}
        ${showPricing ? `
        <td style="text-align:right">${fmt('rate' in item ? item.rate : 0)}</td>
        <td>${fmt('amount' in item ? item.amount : 0)}</td>` : ''}
      </tr>`).join('')}
    </tbody>
  </table>`;

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
  table.items thead tr { background: #333; }
  table.items th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #fff; padding: 9px 12px; text-align: left; font-weight: 500; }
  table.items th:last-child { text-align: right; }
  table.items td { font-size: 13px; color: #333; padding: 12px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
  table.items td:last-child { text-align: right; font-weight: 500; }
  .item-detail { font-size: 11px; color: #999; margin-top: 2px; }

  .totals-wrap { display: flex; justify-content: flex-end; margin-bottom: 4px; }
  .words-wrap, .bank-wrap { display: flex; justify-content: flex-end; }
  .words-box { min-width: 220px; max-width: 300px; text-align: right; padding: 6px 0; }
  .words-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 3px; }
  .words-val { font-size: 12px; font-weight: 600; font-style: italic; color: #333; line-height: 1.5; }
  .bank-wrap { margin-bottom: 24px; }
  .bank-box { padding: 6px 0; }
  table.bank-table { border-collapse: collapse; }
  table.bank-table td { font-size: 11px; padding: 1.5px 0; }
  table.bank-table td:first-child { color: #999; padding-right: 20px; white-space: nowrap; }
  table.bank-table td:last-child { color: #333; font-weight: 500; }
  table.tots { border-collapse: collapse; min-width: 220px; }
  .tot-label { padding: 5px 16px 5px 0; font-size: 13px; color: #555; text-align: left; }
  .tot-val { padding: 5px 0; font-size: 13px; color: #333; text-align: right; }
  tr.grand .tot-label { font-size: 15px; font-weight: 700; color: #2F48DF; border-top: 2px solid #2F48DF; padding-top: 10px; }
  tr.grand .tot-val { font-size: 15px; font-weight: 700; color: #2F48DF; border-top: 2px solid #2F48DF; padding-top: 10px; }

  .notes-box { background: #f6f8ff; border-left: 3px solid #2F48DF; padding: 11px 15px; font-size: 12px; color: #555; margin-bottom: 24px; border-radius: 0 4px 4px 0; line-height: 1.6; }

  .terms-page { page-break-before: always; padding: 40px; }
  .terms-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
  .terms-title { font-size: 22px; font-weight: 600; color: #2F48DF; letter-spacing: -0.01em; white-space: nowrap; }
  .terms-rule { flex: 1; height: 1px; background: #d8dcf5; }
  .terms-grid { display: grid; grid-template-columns: repeat(3, 1fr); column-gap: 28px; row-gap: 22px; }
  .terms-col strong { display: block; margin-bottom: 7px; color: #2F48DF; font-size: 11.5px; font-weight: 700; }
  .terms-col p { font-size: 10.5px; color: #555; line-height: 1.55; margin-bottom: 4px; }
  .terms-col ul { margin: 0; padding-left: 13px; }
  .terms-col li { font-size: 10.5px; color: #555; line-height: 1.55; margin-bottom: 4px; }
  .terms-ack { margin-top: 30px; padding-top: 16px; border-top: 1px solid #ebebeb; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #0A0A0A; text-align: center; line-height: 1.6; }
</style>
</head>
<body>
<div class="doc-header">
  <img src="${LOGO_DATA_URI}" alt="StudioBee" class="doc-logo">
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

  ${itemsSection}

  <div class="totals-wrap">
    <table class="tots">
      <tr><td class="tot-label">Subtotal</td><td class="tot-val">${fmt(doc.subtotal)}</td></tr>
      ${discountRow}
      ${gstRows}
      <tr class="grand"><td class="tot-label">Total</td><td class="tot-val">${fmt(doc.total)}</td></tr>
    </table>
  </div>

  <div class="words-wrap">
    <div class="words-box">
      <div class="words-label">Total In Words</div>
      <div class="words-val">${esc(totalInWords(doc.total))}</div>
    </div>
  </div>

  <div class="bank-wrap">
    <div class="bank-box">
      <div class="words-label">Bank Details</div>
      <table class="bank-table">
        <tr><td>Beneficiary Name</td><td>Beenext Pvt. Ltd.</td></tr>
        <tr><td>Bank</td><td>HDFC Bank Ltd.</td></tr>
        <tr><td>A/c No</td><td>50200016917978</td></tr>
        <tr><td>IFSC</td><td>HDFC0000557</td></tr>
        <tr><td>Branch</td><td>Greater Kailash- II, New Delhi-110048</td></tr>
        <tr><td>Swift Code</td><td>HDFCINBBDEL</td></tr>
      </table>
    </div>
  </div>

  ${doc.notes ? `<div class="notes-box">${esc(doc.notes)}</div>` : ''}

</div>

${doc.type === 'quote' || doc.type === 'proforma' ? `
<div class="terms-page">
  <div class="terms-header">
    <div class="terms-title">Terms &amp; Conditions</div>
    <div class="terms-rule"></div>
  </div>
  <div class="terms-grid">
    <div class="terms-col">
      <strong>Payment &amp; Scope</strong>
      <ul>
        <li>This quotation is valid for ${esc(doc.validity_days || 15)} days from the date of issue.</li>
        <li>The quoted fee covers the deliverables outlined in this proposal.</li>
        <li>A 50% advance payment is required before project initiation.</li>
        <li>The remaining 50% must be cleared before delivery of final assets and source files.</li>
        <li>Additional assets, revisions beyond scope, or add-on services will be quoted and charged separately.</li>
        <li>Future work, updates, or extensions are not included in this proposal and will be billed separately.</li>
        <li>StudioBee reserves the right to pause or terminate work in the event of delayed payments.</li>
      </ul>
    </div>
    <div class="terms-col">
      <strong>Revisions Policy</strong>
      <ul>
        <li>Each project includes a maximum of 3 revision cycles.</li>
        <li>Revisions apply only to the originally agreed scope.</li>
        <li>Any revisions beyond the included limit will incur additional charges.</li>
        <li>Major changes or direction shifts after approval of concepts will be treated as a new scope.</li>
      </ul>
    </div>
    <div class="terms-col">
      <strong>Intellectual Property</strong>
      <ul>
        <li>Final deliverables will be transferred to the client upon full payment.</li>
        <li>StudioBee retains the right to showcase completed work in its portfolio, social media, and promotional materials unless otherwise agreed in writing.</li>
        <li>Raw files, working files, or source files will only be shared if explicitly included in the agreement.</li>
      </ul>
    </div>
    <div class="terms-col">
      <strong>Lodging &amp; Accommodation (Outstation Shoots)</strong>
      <p>For all video or photography projects outside Delhi NCR, the client will be responsible for covering travel, lodging, and accommodation for the StudioBee team.</p>
    </div>
    <div class="terms-col">
      <strong>Timelines &amp; Delivery</strong>
      <ul>
        <li>Project timelines will be mutually agreed upon before commencement.</li>
        <li>Timely delivery depends on prompt client feedback and approvals.</li>
        <li>StudioBee is not responsible for delays caused by lack of communication or delayed inputs from the client.</li>
      </ul>
    </div>
    <div class="terms-col">
      <strong>Cancellation &amp; Refund Policy</strong>
      <ul>
        <li>Advance payments are non-refundable once the project has commenced.</li>
        <li>If a project is canceled midway, the client will be billed for work completed up to that point.</li>
        <li>StudioBee reserves the right to cancel a project under unforeseen circumstances, with proportional refund if applicable.</li>
      </ul>
    </div>
    <div class="terms-col">
      <strong>Client Responsibilities</strong>
      <p>The client agrees to:</p>
      <ul>
        <li>Provide clear briefs, content, and necessary assets on time.</li>
        <li>Ensure all provided materials (text, images, logos) are legally owned or licensed.</li>
        <li>Review and provide feedback within the agreed timeframe (3 working days).</li>
      </ul>
    </div>
    <div class="terms-col">
      <strong>Confidentiality</strong>
      <p>All client information and project details will be kept confidential and will not be disclosed to third parties without consent.</p>
    </div>
    <div class="terms-col">
      <strong>Liability</strong>
      <p>StudioBee will not be held liable for:</p>
      <ul>
        <li>Any indirect or consequential losses.</li>
        <li>Errors arising from incorrect information provided by the client.</li>
        <li>Performance issues caused by third-party platforms or tools.</li>
      </ul>
    </div>
  </div>
  <div class="terms-ack">
    By engaging StudioBee&rsquo;s services, the client acknowledges that they have read, understood, and agreed to these terms &amp; conditions.
  </div>
</div>` : ''}
</body>
</html>`;
}

/** Height (px) to reserve via Puppeteer's `margin.bottom` so the repeating
 * footer template never overlaps flowed page content. Keep in sync with the
 * footer's own padding/line-height below. */
export const FOOTER_HEIGHT_PX = 40;

/** Renders the plain-text footer as a Puppeteer `footerTemplate` fragment, so it
 * repeats identically on every page instead of only appearing once at the very
 * end of the document's HTML flow. Puppeteer's header/footer templates run in
 * an isolated context — no access to the main document's <style> or web fonts,
 * and background colors on this layer are unreliable across Chrome versions —
 * so this stays plain text on a transparent background. `pageNumber`/
 * `totalPages` are Puppeteer's own template classes; it substitutes their
 * text content automatically when `displayHeaderFooter` is on. */
export function renderFooterTemplate(doc: PdfDocument) {
  const validityNote = doc.type === 'quote' && doc.validity_days
    ? esc(`Valid until ${validUntil(doc.created_at, doc.validity_days)}`) + ' &middot; studiobee.co.in'
    : doc.type === 'receipt'
    ? '<span style="color:#2a2;font-weight:600;">Payment Received</span> &middot; studiobee.co.in'
    : 'studiobee.co.in';

  return `
  <div style="width:100%;box-sizing:border-box;padding:10px 40px;display:flex;justify-content:space-between;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#888;">
    <div>${validityNote}</div>
    <div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>`;
}
