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

function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
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

/** doc_date/valid_until are directly editable overrides (see quote-editor.tsx);
 * documents predating that feature have neither set, so both fall back to the
 * original created_at/validity_days-derived values. */
function displayDocDate(doc: PdfDocument): string {
  return fmtDate(doc.doc_date || doc.created_at);
}

function displayValidUntil(doc: PdfDocument): string {
  return doc.valid_until ? fmtDate(doc.valid_until) : validUntil(doc.created_at, doc.validity_days);
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

// Mirrors src/lib/categories.ts's CATEGORY_LABELS — kept as a local literal (like
// TYPE_LABEL above) since this module intentionally has no imports of its own.
const CATEGORY_LABEL: Record<string, string> = { video: 'Video Production', web: 'Web', design: 'Design', retainer: 'Retainer' };

type ScopeListItem = { text: string; nested: string };
type ScopeListFrame = { level: number; items: ScopeListItem[] };

/** Turns a Scope of Work section body into HTML: lines starting with "-" or "*"
 * become a real <ul><li> list (matching the Terms & Conditions page's bullet
 * style); the number of leading "*" sets nesting depth, so "**" nests as a
 * sub-bullet under the "*"/"-" line above it (and "***" nests under that, and
 * so on). Consecutive plain lines become a <p> joined with <br>, and a blank
 * line closes whatever block is open — a lightweight markdown-lite so users
 * typing in a plain textarea can still produce proper (nested) bullets in the PDF. */
function renderScopeBody(body: string): string {
  const lines = (body || '').split('\n');
  const blocks: string[] = [];
  let para: string[] = [];
  const stack: ScopeListFrame[] = [];

  const flushPara = () => {
    if (para.length) blocks.push(`<p>${para.map((l) => esc(l)).join('<br>')}</p>`);
    para = [];
  };

  // Closes every open list level down to (but not including) `level` — each
  // closed level's <ul> is folded into the still-open parent item above it
  // (or pushed as a top-level block once nothing remains open), which is what
  // lets "**" render nested *inside* the preceding "*" bullet's <li>.
  const closeListsTo = (level: number) => {
    while (stack.length && stack[stack.length - 1].level >= level) {
      const frame = stack.pop()!;
      const html = `<ul>${frame.items.map((it) => `<li>${esc(it.text)}${it.nested}</li>`).join('')}</ul>`;
      if (stack.length) {
        const parentItems = stack[stack.length - 1].items;
        parentItems[parentItems.length - 1].nested += html;
      } else {
        blocks.push(html);
      }
    }
  };
  const closeAllLists = () => closeListsTo(0);

  for (const raw of lines) {
    const line = raw.trim();
    const bullet = /^(-|\*+)\s*(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      const level = bullet[1] === '-' ? 1 : bullet[1].length;
      const text = bullet[2];
      if (!stack.length || stack[stack.length - 1].level < level) {
        stack.push({ level, items: [{ text, nested: '' }] });
      } else {
        closeListsTo(level + 1);
        if (stack.length && stack[stack.length - 1].level === level) {
          stack[stack.length - 1].items.push({ text, nested: '' });
        } else {
          stack.push({ level, items: [{ text, nested: '' }] });
        }
      }
    } else if (line === '') {
      closeAllLists();
      flushPara();
    } else {
      closeAllLists();
      para.push(line);
    }
  }
  closeAllLists();
  flushPara();

  return blocks.join('');
}

/** Shared between the standalone cover-only PDF pass (no footer) and the
 * cover markup embedded in renderDocument() (kept for any caller that still
 * wants a single-pass full document) — see renderCoverDocument() below. */
const COVER_STYLE = `
  .cover-page {
    width: 794px; height: 1060px; box-sizing: border-box;
    background: #fff;
    display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px;
  }
  .cover-page.paginated { page-break-after: always; }
  .cover-logo { height: 34px; width: auto; margin-bottom: 40px; }
  .cover-rule { width: 44px; height: 2px; background: #d8dcf5; margin-bottom: 28px; }
  .cover-title { font-size: 20px; font-weight: 600; color: #2F48DF; letter-spacing: -0.01em; margin-bottom: 56px; text-align: center; }
  .cover-meta { text-align: center; }
  .cover-meta-row { margin-bottom: 16px; }
  .cover-meta-row:last-child { margin-bottom: 0; }
  .cover-meta-lbl { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #999; margin-bottom: 5px; }
  .cover-meta-val { font-size: 16px; font-weight: 500; color: #0A0A0A; }
`;

function coverPageDiv(doc: PdfDocument, client: PdfClient, label: string, paginated: boolean) {
  return `<div class="cover-page${paginated ? ' paginated' : ''}">
  <img src="${LOGO_BLUE_DATA_URI}" alt="StudioBee" class="cover-logo">
  <div class="cover-rule"></div>
  <div class="cover-title">${esc(label)}</div>
  <div class="cover-meta">
    <div class="cover-meta-row">
      <div class="cover-meta-lbl">Prepared For</div>
      <div class="cover-meta-val">${esc(client?.name || '—')}</div>
    </div>
    <div class="cover-meta-row">
      <div class="cover-meta-lbl">${esc(label)}#</div>
      <div class="cover-meta-val">${esc(doc.number)}</div>
    </div>
    <div class="cover-meta-row">
      <div class="cover-meta-lbl">Date</div>
      <div class="cover-meta-val">${esc(displayDocDate(doc))}</div>
    </div>
  </div>
</div>`;
}

/** Standalone single-page cover document, rendered as its own Puppeteer pass with
 * no footer/margin so the branded cover has no page-number bar on it — then merged
 * with the (footered) rest of the document. See renderDocumentToPdf() in render.ts. */
export function renderCoverDocument(doc: PdfDocument, client: PdfClient) {
  const label = TYPE_LABEL[doc.type] || 'Document';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(label)} ${esc(doc.number)} — Cover</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 794px; background: #fff; font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; }
  ${COVER_STYLE}
</style>
</head>
<body>
${coverPageDiv(doc, client, label, false)}
</body>
</html>`;
}

export type PdfDocument = {
  type: 'quote' | 'proforma' | 'invoice' | 'receipt';
  number: string;
  created_at: string;
  doc_date?: string | null;
  valid_until?: string | null;
  project_name?: string;
  category?: string;
  line_items: Array<{ description?: string; detail?: string; qty: number; rate: number; amount: number; group?: string | null }>;
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
  line_item_view?: 'itemised' | 'summary' | 'grouped';
  summary_label?: string | null;
  summary_qty?: number | null;
  summary_rate?: number | null;
  scope_of_work?: Array<{ heading: string; body: string }>;
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

// Blue-on-transparent variant (studiobee.png) for light backgrounds, e.g. the white cover page.
const LOGO_BLUE_DATA_URI = 'data:image/png;base64,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';

export function renderDocument(
  doc: PdfDocument,
  client: PdfClient,
  settings: PdfSettings = {},
  options: { includeCover?: boolean } = {},
) {
  const {
    studioGstin = '',
    studioAddress = 'Sultanpur, Delhi', studioPhone = '', studioEmail = '',
  } = settings;
  const includeCover = options.includeCover !== false;

  const items = Array.isArray(doc.line_items) ? doc.line_items : [];
  const scopeSections = Array.isArray(doc.scope_of_work) ? doc.scope_of_work : [];
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

  const lineItemView = doc.line_item_view ?? 'itemised';
  const hidePricing = doc.hide_pricing === true;

  // Both the summary and grouped views default their editable override to the
  // non-GST total — what the client owes before tax — rather than the
  // GST-inclusive total, since GST is already broken out as its own line below.
  const nonGstTotal = Math.round((Number(doc.total) - Number(doc.gst_amount)) * 100) / 100;
  const summaryQty = doc.summary_qty ?? 1;
  const summaryRate = doc.summary_rate ?? nonGstTotal;

  type DisplayItem = { description?: string; detail?: string; qty: number; rate: number; amount: number };
  let displayItems: DisplayItem[] = items;

  if (lineItemView === 'summary') {
    // Collapses every line item into a single row — the custom label (or a
    // fallback) — with its own manually-entered qty/rate (not derived from the
    // real line items), same table chrome and columns as normal.
    displayItems = [{
      description: doc.summary_label?.trim() ||
        `${doc.project_name || 'Project'} · ${items.length} service${items.length !== 1 ? 's' : ''} included`,
      qty: summaryQty,
      rate: summaryRate,
      amount: Math.round(summaryQty * summaryRate * 100) / 100,
    }];
  } else if (lineItemView === 'grouped') {
    // Each named group collapses to one row (its member amounts summed); items
    // with no group still render individually so nothing silently disappears
    // from the invoice. The Subtotal/GST/Discount/Total box below the table
    // already shows the real total, so no extra "Total" row is added here.
    const order: string[] = [];
    const groupTotals = new Map<string, number>();
    const ungrouped: DisplayItem[] = [];
    for (const item of items) {
      const g = item.group?.trim();
      if (!g) {
        ungrouped.push(item);
        continue;
      }
      if (!groupTotals.has(g)) {
        order.push(g);
        groupTotals.set(g, 0);
      }
      groupTotals.set(g, Math.round((groupTotals.get(g)! + Number(item.amount)) * 100) / 100);
    }
    displayItems = [
      ...order.map((g) => ({ description: g, qty: 1, rate: groupTotals.get(g)!, amount: groupTotals.get(g)! })),
      ...ungrouped,
    ];
  }
  const showQty = true;
  const showPricing = !hidePricing;

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

  ${COVER_STYLE}

  .doc-header { background: #2F48DF; padding: 24px 40px; display: flex; justify-content: space-between; align-items: center; min-height: 80px; }
  .doc-logo { height: 28px; width: auto; display: block; }
  .doc-title-block { text-align: right; }
  .doc-brand { font-size: 18px; font-weight: 400; color: #fff; letter-spacing: 0.01em; line-height: 1; }
  .doc-brand-address { font-size: 12px; color: rgba(255,255,255,0.55); margin-top: 5px; }

  .doc-body { padding: 32px 40px; }

  .parties { display: flex; gap: 32px; margin-bottom: 20px; }
  .parties > div { flex: 1; min-width: 0; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #2F48DF; font-weight: 600; margin-bottom: 7px; }
  .party-name { font-size: 14px; font-weight: 600; color: #0A0A0A; margin-bottom: 3px; }
  .party-detail { font-size: 12px; color: #666; line-height: 1.7; }

  .section-divider { position: relative; height: 1px; background: #ebebeb; margin-bottom: 24px; }
  .section-divider span { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 0 14px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #2F48DF; font-weight: 600; white-space: nowrap; }

  table.quote-meta { border-collapse: collapse; }
  table.quote-meta td { font-size: 12px; padding: 2px 0; }
  table.quote-meta td:first-child { font-weight: 600; color: #0A0A0A; padding-right: 14px; white-space: nowrap; }
  table.quote-meta td:last-child { color: #2F48DF; font-weight: 500; }

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
  .words-wrap { display: flex; justify-content: flex-end; }
  .words-box { min-width: 220px; max-width: 300px; text-align: right; padding: 6px 0; }
  .words-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 3px; }
  .words-val { font-size: 12px; font-weight: 600; font-style: italic; color: #333; line-height: 1.5; }
  .bank-wrap { display: flex; justify-content: flex-start; margin-bottom: 24px; }
  .bank-box { padding: 6px 0; }
  table.bank-table { border-collapse: collapse; }
  table.bank-table td { font-size: 13px; padding: 3px 0; }
  table.bank-table td:first-child { color: #999; padding-right: 20px; white-space: nowrap; }
  table.bank-table td:last-child { color: #333; font-weight: 500; }
  table.tots { border-collapse: collapse; min-width: 220px; }
  .tot-label { padding: 5px 16px 5px 0; font-size: 13px; color: #555; text-align: left; }
  .tot-val { padding: 5px 0; font-size: 13px; color: #333; text-align: right; }
  tr.grand .tot-label { font-size: 15px; font-weight: 700; color: #2F48DF; border-top: 2px solid #2F48DF; padding-top: 10px; }
  tr.grand .tot-val { font-size: 15px; font-weight: 700; color: #2F48DF; border-top: 2px solid #2F48DF; padding-top: 10px; }

  .notes-box { background: #f6f8ff; border-left: 3px solid #2F48DF; padding: 11px 15px; font-size: 12px; color: #555; margin-bottom: 24px; border-radius: 0 4px 4px 0; line-height: 1.6; }

  .scope-page { page-break-before: always; padding: 40px; }
  .scope-header { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
  .scope-title { font-size: 22px; font-weight: 600; color: #2F48DF; letter-spacing: -0.01em; white-space: nowrap; }
  .scope-rule { flex: 1; height: 1px; background: #d8dcf5; }
  .scope-section { margin-bottom: 22px; }
  .scope-section:last-child { margin-bottom: 0; }
  .scope-section strong { display: block; margin-bottom: 7px; color: #2F48DF; font-size: 12.5px; font-weight: 700; }
  .scope-section p { font-size: 11.5px; color: #555; line-height: 1.6; margin-bottom: 8px; }
  .scope-section p:last-child { margin-bottom: 0; }
  .scope-section ul { margin: 0 0 8px 14px; }
  .scope-section ul:last-child { margin-bottom: 0; }
  .scope-section li { font-size: 11.5px; color: #555; line-height: 1.6; margin-bottom: 4px; }
  .scope-section li > ul { margin-top: 4px; margin-bottom: 0; }

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
${includeCover ? coverPageDiv(doc, client, label, true) : ''}

<div class="doc-header">
  <img src="${LOGO_DATA_URI}" alt="StudioBee" class="doc-logo">
  <div class="doc-title-block">
    <div class="doc-brand">StudioBee</div>
    <div class="doc-brand-address">${esc(studioAddress)}</div>
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
    <div>
      <div class="party-label">${label} Info</div>
      <table class="quote-meta">
        <tr><td>${label}#</td><td>${esc(doc.number)}</td></tr>
        <tr><td>${label} Date</td><td>${esc(displayDocDate(doc))}</td></tr>
        ${doc.project_name ? `<tr><td>Project Name</td><td>${esc(doc.project_name)}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <div class="section-divider"><span>${label}</span></div>

  ${doc.type === 'quote' || doc.category ? `
  <div class="meta-row">
    ${doc.type === 'quote' ? `
    <div class="meta-item">
      <div class="meta-lbl">Valid Until</div>
      <div class="meta-val">${esc(displayValidUntil(doc))}</div>
    </div>` : ''}
    ${doc.category ? `
    <div class="meta-item">
      <div class="meta-lbl">Category</div>
      <div class="meta-val">${esc(CATEGORY_LABEL[doc.category] || capitalize(doc.category))}</div>
    </div>` : ''}
  </div>` : ''}

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
        <tr><td>Beneficiary Name</td><td>Mcbee Pvt. Ltd.</td></tr>
        <tr><td>Bank</td><td>HDFC Bank Ltd.</td></tr>
        <tr><td>A/c No</td><td>50200036093106</td></tr>
        <tr><td>IFSC</td><td>HDFC0000557</td></tr>
        <tr><td>Branch</td><td>Shop No. M-29, GK-II, New Delhi-110048</td></tr>
        <tr><td>Swift Code</td><td>HDFCINBBDEL</td></tr>
        <tr><td>GSTIN</td><td>07AALCM9895R1Z1</td></tr>
        <tr><td>CIN</td><td>U51909DL2018PTC337055</td></tr>
        <tr><td>UDYAM</td><td>UDYAM-DL-08-0010644</td></tr>
      </table>
    </div>
  </div>

  ${doc.notes ? `<div class="notes-box">${esc(doc.notes)}</div>` : ''}

</div>

${(doc.type === 'quote' || doc.type === 'proforma') && scopeSections.length > 0 ? `
<div class="scope-page">
  <div class="scope-header">
    <div class="scope-title">Scope of Work</div>
    <div class="scope-rule"></div>
  </div>
  ${scopeSections.map((section) => `
  <div class="scope-section">
    <strong>${esc(section.heading || 'Untitled Section')}</strong>
    ${renderScopeBody(section.body || '')}
  </div>`).join('')}
</div>` : ''}

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
export const FOOTER_HEIGHT_PX = 44;

/** Renders the black footer bar as a Puppeteer `footerTemplate` fragment, so it
 * repeats identically on every page instead of only appearing once at the very
 * end of the document's HTML flow. Puppeteer's header/footer templates run in
 * an isolated context — no access to the main document's <style> or web fonts —
 * so all styling here is inlined and font-family falls back to system fonts.
 * Chrome's print pipeline drops background colors/images by default even with
 * `printBackground: true` on the main page, *specifically* inside header/footer
 * templates, unless `-webkit-print-color-adjust: exact` is set within the
 * template's own markup — that omission (not an inherent Chrome limitation)
 * is why the black bar wasn't showing up before. `pageNumber`/`totalPages` are
 * Puppeteer's own template classes; it substitutes their text automatically. */
export function renderFooterTemplate(doc: PdfDocument) {
  const validityNote = doc.type === 'quote' && doc.validity_days
    ? esc(`Valid until ${displayValidUntil(doc)}`) + ' &middot; studiobee.co.in'
    : doc.type === 'receipt'
    ? '<span style="color:#6ee;font-weight:600;">Payment Received</span> &middot; studiobee.co.in'
    : 'studiobee.co.in';

  return `
  <style>* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }</style>
  <div style="position:fixed;bottom:0;left:0;width:100%;height:${FOOTER_HEIGHT_PX}px;box-sizing:border-box;background:#0A0A0A;padding:0 40px;display:flex;justify-content:space-between;align-items:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;color:#999;">
    <div>${validityNote}</div>
    <div>Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>
  </div>`;
}
