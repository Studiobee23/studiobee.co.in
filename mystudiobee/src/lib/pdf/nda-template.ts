// Renders a signed NDA as a standalone HTML string for Puppeteer. Self-contained
// (no imports of its own, mirrors template.ts's own documented convention) so it
// never depends on module resolution quirks inside the Puppeteer render pass.

import type { NdaAgreementRow } from "@/lib/nda/types";

function esc(s: unknown) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export const CLAUSES: Array<{ title: string; body: string }> = [
  {
    title: "1. Definition of Confidential Information",
    body: `“Confidential Information” means any information disclosed by either Party (the “Disclosing Party”) to the other (the “Receiving Party”), whether in writing, orally, electronically, or by any other means, before or after the date of this Agreement, that is designated as confidential or that a reasonable person would understand to be confidential given its nature and the circumstances of disclosure. This includes, without limitation: business plans, financials, and pricing; designs, prototypes, source code, and creative concepts; customer, vendor, and personnel information; and the existence, terms, and status of discussions between the Parties.`,
  },
  {
    title: "2. Obligations of the Receiving Party",
    body: `The Receiving Party shall: (a) hold the Confidential Information in strict confidence and protect it with at least the same degree of care it uses for its own confidential information, and no less than reasonable care; (b) use the Confidential Information solely for the Purpose; (c) not disclose the Confidential Information to any third party without the Disclosing Party's prior written consent; and (d) limit access to employees, contractors, or advisors who need to know it for the Purpose and who are bound by confidentiality obligations at least as protective as those in this Agreement.`,
  },
  {
    title: "3. Exclusions",
    body: `This Agreement imposes no obligation with respect to information that: (a) is or becomes publicly available through no fault of the Receiving Party; (b) was already known to the Receiving Party without restriction before disclosure; (c) is independently developed by the Receiving Party without use of or reference to the Confidential Information; or (d) is rightfully received from a third party without breach of any confidentiality obligation.`,
  },
  {
    title: "4. Term",
    body: `This Agreement is effective from the Effective Date and continues until terminated by either Party on 30 days' written notice. The confidentiality obligations in this Agreement survive termination and remain in effect for three (3) years from the date of disclosure of the relevant Confidential Information, except that information constituting a trade secret under applicable law remains protected for as long as it retains trade secret status.`,
  },
  {
    title: "5. Return or Destruction of Materials",
    body: `Upon the Disclosing Party's written request, or upon termination of this Agreement, the Receiving Party shall promptly return or destroy all Confidential Information in its possession, including all copies, and shall certify such destruction in writing if requested, except for copies retained solely for legal or compliance record-keeping.`,
  },
  {
    title: "6. No Licence; No Obligation",
    body: `Nothing in this Agreement grants either Party any licence or ownership right in the other Party's Confidential Information, intellectual property, or work product. Neither Party is obligated by this Agreement to disclose any information, or to enter into any further business relationship.`,
  },
  {
    title: "7. Legally Required Disclosure",
    body: `The Receiving Party may disclose Confidential Information to the extent required by law, regulation, or a valid order of a court or governmental authority, provided that, where legally permitted, it gives the Disclosing Party prompt written notice so the Disclosing Party may seek a protective order or other appropriate remedy. Nothing in this Agreement restricts either Party's right to report suspected unlawful conduct to, or participate in an investigation by, a government agency or regulator.`,
  },
  {
    title: "8. Remedies",
    body: `Each Party acknowledges that unauthorised use or disclosure of Confidential Information may cause irreparable harm for which monetary damages alone would be inadequate. Accordingly, the Disclosing Party is entitled to seek injunctive or other equitable relief, in addition to any other remedies available at law, without the necessity of posting a bond.`,
  },
  {
    title: "9. Governing Law and Jurisdiction",
    body: `This Agreement is governed by the laws of India. The courts at New Delhi, India shall have exclusive jurisdiction over any dispute arising out of or relating to this Agreement.`,
  },
  {
    title: "10. Electronic Execution and Stamp Duty",
    body: `This Agreement was executed electronically, and such execution is valid and enforceable under Section 10A of the Information Technology Act, 2000. Electronic execution does not exempt this Agreement from any stamp duty payable under the Indian Stamp Act, 1899, or applicable state stamp legislation; each Party is responsible for ensuring any such duty is paid where required for this Agreement to be admissible as evidence.`,
  },
  {
    title: "11. Miscellaneous",
    body: `This Agreement constitutes the entire understanding between the Parties regarding its subject matter and supersedes all prior discussions on that subject. It may be amended only in writing signed by both Parties. If any provision is held unenforceable, the remaining provisions continue in full force. Neither Party may assign this Agreement without the other's prior written consent. Failure to enforce any provision is not a waiver of future enforcement.`,
  },
];

/** `signatureDataUri` is a `data:image/png;base64,...` string, present only when
 * `agreement.signature_type === "drawn"` — the caller (renderNdaAgreementToPdf
 * in render.ts) reads the stored PNG from Storage and passes it in as a data URI
 * so Puppeteer can render it with no network fetch. Nothing about the signature
 * image is read directly off `agreement` here; `signature_storage_path` is only
 * a pointer, never image data. */
export function renderNdaAgreement(
  agreement: NdaAgreementRow,
  client: { name: string },
  signatureDataUri?: string
): string {
  const clientName = agreement.client_company_snapshot || client.name;
  const purpose =
    agreement.purpose_snapshot ||
    "discuss, evaluate, or carry out a business engagement involving design, development, branding, and related creative or technical services";
  const signedDate = fmtDate(agreement.signed_at);

  const signatureBlock =
    agreement.signature_type === "drawn" && signatureDataUri
      ? `<img class="sig-image" src="${esc(signatureDataUri)}" alt="Signature of ${esc(agreement.signatory_name)}">`
      : `<div class="sig-mark">${esc(agreement.signature_text)}</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>NDA ${esc(agreement.id)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Caveat:wght@600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 794px; background: #fff; font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #333; }

  .doc-header { background: #2F48DF; padding: 24px 40px; display: flex; justify-content: space-between; align-items: center; min-height: 80px; }
  .doc-brand { font-size: 18px; font-weight: 400; color: #fff; letter-spacing: 0.01em; }
  .doc-brand-sub { font-size: 12px; color: rgba(255,255,255,0.6); margin-top: 5px; text-align: right; }

  .doc-body { padding: 32px 40px; }

  .parties { display: flex; gap: 32px; margin-bottom: 20px; }
  .parties > div { flex: 1; }
  .party-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #2F48DF; font-weight: 600; margin-bottom: 7px; }
  .party-name { font-size: 14px; font-weight: 600; color: #0A0A0A; margin-bottom: 3px; }
  .party-detail { font-size: 12px; color: #666; line-height: 1.7; }

  .section-divider { position: relative; height: 1px; background: #ebebeb; margin-bottom: 24px; }
  .section-divider span { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #fff; padding: 0 14px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #2F48DF; font-weight: 600; white-space: nowrap; }

  .doc-body p.intro { font-size: 12.5px; line-height: 1.7; margin: 0 0 14px; }

  .clause { margin-bottom: 18px; break-inside: avoid; page-break-inside: avoid; }
  .clause strong { display: block; margin-bottom: 6px; color: #2F48DF; font-size: 12.5px; font-weight: 700; }
  .clause p { font-size: 11.5px; color: #555; line-height: 1.65; }

  .callout { background: #f6f8ff; border-left: 3px solid #2F48DF; padding: 11px 15px; font-size: 12px; color: #555; margin: 16px 0 24px; border-radius: 0 4px 4px 0; line-height: 1.6; break-inside: avoid; page-break-inside: avoid; }

  .sign-grid { display: flex; gap: 32px; margin-top: 26px; padding-top: 20px; border-top: 1px solid #ebebeb; break-inside: avoid; page-break-inside: avoid; }
  .sign-col { flex: 1; }
  .sig-mark { font-family: 'Caveat', cursive; font-size: 26px; color: #0A0A0A; margin: 6px 0; }
  .sig-image { max-height: 50px; margin: 6px 0; }
</style>
</head>
<body>
<div class="doc-header">
  <div class="doc-brand">Studiobee</div>
  <div class="doc-brand-sub">Non-Disclosure Agreement<br>Signed ${esc(signedDate)}</div>
</div>
<div class="doc-body">
  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">Studiobee Private Limited</div>
      <div class="party-detail">studiobee.co.in<br>hello@studiobee.ai</div>
    </div>
    <div>
      <div class="party-label">To</div>
      <div class="party-name">${esc(clientName)}</div>
      <div class="party-detail">${esc(agreement.client_address_snapshot || "")}</div>
    </div>
  </div>
  <div class="section-divider"><span>Non-Disclosure Agreement</span></div>
  <p class="intro">This Non-Disclosure Agreement (“Agreement”) is made between <strong>Studiobee Private Limited</strong>, a company incorporated under the laws of India (“Studiobee”), and <strong>${esc(clientName)}</strong> (“Client”), together the “Parties” and each a “Party”.</p>
  <p class="intro">The Parties intend to ${esc(purpose)} (the “Purpose”), during which either Party may disclose information it considers confidential. In consideration of such disclosure, the Parties agree as follows:</p>
  ${CLAUSES.map((c) => `<div class="clause"><strong>${esc(c.title)}</strong><p>${esc(c.body)}</p></div>`).join("\n  ")}
  <div class="callout"><strong>Note on stamp duty:</strong> electronic execution does not exempt this Agreement from any stamp duty payable under the Indian Stamp Act, 1899, or applicable state stamp legislation.</div>
  <div class="sign-grid">
    <div class="sign-col">
      <div class="party-label">Studiobee</div>
      <div class="sig-mark">Nikhil Arora</div>
      <div class="party-detail">Nikhil Arora, Founder<br>Signed electronically</div>
    </div>
    <div class="sign-col">
      <div class="party-label">Client</div>
      ${signatureBlock}
      <div class="party-detail">${esc(agreement.signatory_name)}, ${esc(agreement.signatory_title)}<br>${esc(clientName)}<br>Signed electronically · ${esc(signedDate)}</div>
    </div>
  </div>
</div>
</body>
</html>`;
}
