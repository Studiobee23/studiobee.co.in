# NDA Agreements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Studiobee staff generate a per-client NDA link from the client's page in mystudiobee, send it (email or copy/paste), have an anonymous client read and electronically sign it at `/nda/[token]`, and see signed status + an archived PDF back on the client's page.

**Architecture:** A new `nda_agreements` table (one row per generated NDA) backs a token-gated public route added to the session-gate middleware's bypass list — the same mechanism `/api/cron` already uses. The token is the sole authorization boundary; all public-route reads/writes go through the service-role admin client, never RLS. Signing triggers a Puppeteer-rendered PDF through the existing `render.ts` pipeline, stored in the same (pre-existing, un-migrated) `documents` Storage bucket the quote/invoice system already uses. Staff manage everything from a new card on the client detail page.

**Tech Stack:** Next.js App Router (16.2.9), TypeScript, Supabase (Postgres + RLS), Tailwind v4 + shadcn/ui for the staff-facing UI, plain scoped CSS for the public branded signing page (it must match the PDF brand exactly, not the app's admin theme), Puppeteer via `puppeteer-core`/`@sparticuz/chromium` (already installed), `nodemailer` (already installed), Vitest 4.1.9.

**Spec:** `mystudiobee/docs/superpowers/specs/2026-09-22-nda-agreements-design.md`

## Global Constraints

- TypeScript strict mode — no `any` unless cast via `as unknown as T`
- Server-side Supabase calls in server components/actions use `createClient()` from `@/lib/supabase/server` (RLS-enforced); the admin client (`createAdminClient()` from `@/lib/supabase/admin`, service-role, bypasses RLS) is used **only** where there is no authenticated staff session — i.e. every public `/nda/[token]` and `/api/nda/[token]` code path — matching the existing `priceLineItem` precedent in `src/lib/actions/documents.ts`
- RLS enabled on `nda_agreements`, policies restricted to `is_billing_role()` — no anon policy, ever. The public route's security comes entirely from the token being unguessable, not from RLS.
- Every server action starts with `"use server"`, gates with a local `requireBillingRole()` helper that calls `getCurrentProfile()`/`isBillingRole()` and **throws** `new Error(...)` on failure (never returns `{error}` objects) — matches `src/lib/actions/documents.ts` and `src/lib/actions/clients.ts` exactly
- Mutating actions end with `revalidatePath(...)`
- Brand colours for the public signing page: `#2F48DF` (accent/header), `#0A0A0A` (ink), `#333` (body text), `#666`/`#999` (muted), `#ebebeb` (hairline), `#f6f8ff`/`#d8dcf5` (tint) — copied from `src/lib/pdf/template.ts`'s existing CSS, not invented
- No `transition-all` anywhere
- No new npm dependencies — `zod` and `uuid` are **not** installed; use `crypto.randomUUID()`-free approaches (Postgres generates the token via `gen_random_uuid()`) and hand-rolled validation instead of adding packages
- Date/time formatting: reuse `formatDateLongIST()` / `IST_TIMEZONE` from `src/lib/datetime.ts` — don't reinvent `en-IN` formatting
- PDF template files are self-contained with no cross-imports (matches `template.ts`'s own documented convention) — `nda-template.ts` duplicates its own minimal `esc()` helper rather than importing one

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/0045_nda_agreements.sql` | Create | `nda_agreements` table, RLS, `updated_at` trigger, defensive `documents` bucket ensure |
| `src/lib/nda/types.ts` | Create | `NdaAgreementRow` type shared across actions/route/page/template |
| `src/lib/nda/status.ts` | Create | `deriveNdaStatus()` — pure, testable expiry logic |
| `src/lib/nda/status.test.ts` | Create | Vitest tests for `deriveNdaStatus()` |
| `src/lib/pdf/nda-template.ts` | Create | `renderNdaAgreement()` — self-contained branded HTML string builder |
| `src/lib/pdf/render.ts` | Modify | Add `renderNdaAgreementToPdf()` reusing the existing `launchBrowser()` |
| `src/lib/actions/nda.ts` | Create | `createNdaAgreement`, `sendNdaAgreementEmail`, `voidNdaAgreement`, `getNdaPdfDownloadUrl`, `regenerateNdaPdf` |
| `src/lib/supabase/proxy.ts` | Modify | Bypass session gate for `/nda` and `/api/nda` |
| `src/app/api/nda/[token]/route.ts` | Create | Public POST endpoint that accepts a signature |
| `src/app/nda/[token]/page.tsx` | Create | Public server page — 404 / expired / already-signed / pending states |
| `src/app/nda/[token]/nda-sign-client.tsx` | Create | Interactive branded signing UI (client component) |
| `src/app/(app)/clients/[id]/page.tsx` | Modify | Fetch `nda_agreements` rows for the client |
| `src/app/(app)/clients/[id]/nda-agreements-card.tsx` | Create | Staff card: list, "New NDA" dialog, per-row actions |
| `src/app/(app)/clients/[id]/client-detail-client.tsx` | Modify | Render the new card |

---

## Task 1: Database migration

**Files:**
- Create: `mystudiobee/supabase/migrations/0045_nda_agreements.sql`

**Interfaces:**
- Produces: `nda_agreements` table (columns below) used by every later task

- [ ] **Step 1: Write the migration**

```sql
-- mystudiobee/supabase/migrations/0045_nda_agreements.sql

create table if not exists nda_agreements (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id) on delete cascade,
  token                    uuid not null unique default gen_random_uuid(),
  status                   text not null default 'pending' check (status in ('pending','signed','voided')),
  created_by               uuid references profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  expires_at               timestamptz not null default (now() + interval '30 days'),
  sent_at                  timestamptz,
  signed_at                timestamptz,
  signatory_name           text,
  signatory_title          text,
  signatory_email          text,
  client_company_snapshot  text,
  client_address_snapshot  text,
  purpose_snapshot         text,
  signature_type           text check (signature_type in ('typed','drawn')),
  signature_text           text,
  signature_storage_path   text,
  pdf_storage_path         text
);

create index if not exists nda_agreements_client_id_idx on nda_agreements (client_id);
create index if not exists nda_agreements_token_idx on nda_agreements (token);

alter table nda_agreements enable row level security;

create policy "billing roles read nda_agreements" on nda_agreements
  for select using (is_billing_role());

create policy "billing roles write nda_agreements" on nda_agreements
  for insert with check (is_billing_role());

create policy "billing roles update nda_agreements" on nda_agreements
  for update using (is_billing_role());

-- No anon/public policy of any kind — the public /nda/[token] and
-- /api/nda/[token] routes never use the anon key. They authenticate the
-- visitor purely via the unguessable `token` column and always read/write
-- through the service-role admin client (see src/lib/supabase/admin.ts),
-- which bypasses RLS entirely. RLS here exists only to gate the staff UI.

create trigger nda_agreements_set_updated_at before update on nda_agreements
  for each row execute function set_updated_at();

-- The "documents" Storage bucket already exists in production (used by
-- /api/generate-pdf and /api/email-document for quote/invoice PDFs) but has
-- no corresponding migration anywhere in this repo — it was created by hand
-- in the Supabase dashboard at some point. This insert is a defensive no-op
-- against prod (on conflict do nothing) and brings fresh/staging databases
-- up to parity so this feature works there too. Private bucket: PDFs and
-- signature images are sensitive, never public like client-avatars.
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- No Storage RLS policies are added for the nda-signatures/ or pdfs/ paths
-- used by this feature. Every write and every signed-URL mint goes through
-- createAdminClient() (service role), which bypasses Storage RLS entirely —
-- the same "no policy, service-role only" pattern already used for
-- clock-in-selfies deletes (see 0030_clock_verification.sql).
```

- [ ] **Step 2: Apply the migration and verify**

Run this against your local/dev Supabase instance (via the Supabase SQL editor, or `supabase db push` if you use the CLI locally — follow whatever this repo's existing migrations have been applied with; there is no automated migration-runner in this repo, they're applied manually, per the spec's note on migration drift).

Verify:
```sql
select column_name, data_type from information_schema.columns where table_name = 'nda_agreements' order by ordinal_position;
select policyname from pg_policies where tablename = 'nda_agreements';
select id, public from storage.buckets where id = 'documents';
```
Expected: 19 columns matching the `create table` above, 3 policies (`billing roles read/write/update nda_agreements`), and one `documents` row with `public = false`.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/supabase/migrations/0045_nda_agreements.sql
git commit -m "feat(nda): add nda_agreements table migration"
```

---

## Task 2: NDA types + pure status logic

**Files:**
- Create: `mystudiobee/src/lib/nda/types.ts`
- Create: `mystudiobee/src/lib/nda/status.ts`
- Test: `mystudiobee/src/lib/nda/status.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `NdaAgreementRow` type, `NdaAgreementStatus` union (`"pending"|"signed"|"voided"|"expired"`), `deriveNdaStatus(row, now?)` — used by every later task that reads or displays a row

- [ ] **Step 1: Create the shared row type**

```ts
// mystudiobee/src/lib/nda/types.ts

export type NdaAgreementRow = {
  id: string;
  client_id: string;
  token: string;
  status: "pending" | "signed" | "voided";
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  sent_at: string | null;
  signed_at: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  signatory_email: string | null;
  client_company_snapshot: string | null;
  client_address_snapshot: string | null;
  purpose_snapshot: string | null;
  signature_type: "typed" | "drawn" | null;
  signature_text: string | null;
  signature_storage_path: string | null;
  pdf_storage_path: string | null;
};
```

- [ ] **Step 2: Write the failing test for `deriveNdaStatus`**

```ts
// mystudiobee/src/lib/nda/status.test.ts
import { describe, it, expect } from "vitest";
import { deriveNdaStatus } from "./status";

describe("deriveNdaStatus", () => {
  it("returns 'pending' for a pending row that hasn't expired", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "pending", expires_at: "2026-10-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("pending");
  });

  it("returns 'expired' for a pending row past its expires_at", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "pending", expires_at: "2026-09-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("expired");
  });

  it("returns 'signed' for a signed row even if expires_at is in the past", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "signed", expires_at: "2026-01-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("signed");
  });

  it("returns 'voided' for a voided row regardless of expiry", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "voided", expires_at: "2026-01-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("voided");
  });

  it("defaults `now` to the current time when omitted", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(deriveNdaStatus({ status: "pending", expires_at: future })).toBe("pending");
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd mystudiobee && npx vitest run src/lib/nda/status.test.ts`
Expected: FAIL — `Cannot find module './status'` (the file doesn't exist yet).

- [ ] **Step 4: Implement `deriveNdaStatus`**

```ts
// mystudiobee/src/lib/nda/status.ts

export type NdaAgreementStatus = "pending" | "signed" | "voided" | "expired";

/** "expired" is never stored — it's this row's `status` plus whether `expires_at`
 * has passed, computed wherever it's shown or enforced. No cron job keeps a
 * stored value in sync; a signed or voided row is never "expired". */
export function deriveNdaStatus(
  row: { status: "pending" | "signed" | "voided"; expires_at: string },
  now: Date = new Date()
): NdaAgreementStatus {
  if (row.status === "pending" && new Date(row.expires_at).getTime() < now.getTime()) {
    return "expired";
  }
  return row.status;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd mystudiobee && npx vitest run src/lib/nda/status.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 6: Commit**

```bash
git add mystudiobee/src/lib/nda/types.ts mystudiobee/src/lib/nda/status.ts mystudiobee/src/lib/nda/status.test.ts
git commit -m "feat(nda): add nda_agreements row type and expiry status logic"
```

---

## Task 3: NDA PDF template

**Files:**
- Create: `mystudiobee/src/lib/pdf/nda-template.ts`

**Interfaces:**
- Consumes: `NdaAgreementRow` from `src/lib/nda/types.ts`
- Produces: `renderNdaAgreement(agreement: NdaAgreementRow, client: { name: string }): string` — a full HTML document string, consumed by Task 4's `renderNdaAgreementToPdf`

- [ ] **Step 1: Write the template file**

This mirrors `src/lib/pdf/template.ts`'s structure (self-contained, own `esc()`, same brand CSS values) but for a single-page executed NDA rather than a multi-page quote.

```ts
// mystudiobee/src/lib/pdf/nda-template.ts
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

  .clause { margin-bottom: 18px; }
  .clause strong { display: block; margin-bottom: 6px; color: #2F48DF; font-size: 12.5px; font-weight: 700; }
  .clause p { font-size: 11.5px; color: #555; line-height: 1.65; }

  .callout { background: #f6f8ff; border-left: 3px solid #2F48DF; padding: 11px 15px; font-size: 12px; color: #555; margin: 16px 0 24px; border-radius: 0 4px 4px 0; line-height: 1.6; }

  .sign-grid { display: flex; gap: 32px; margin-top: 26px; padding-top: 20px; border-top: 1px solid #ebebeb; }
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
```

- [ ] **Step 2: Manual verification**

There is no existing test coverage for `template.ts`'s own HTML generation (it's not unit-tested in this repo), so `nda-template.ts` follows the same convention — no dedicated test file. Verify it compiles and produces sane output with a quick ad-hoc check:

Run: `cd mystudiobee && npx tsx -e "
import { renderNdaAgreement } from './src/lib/pdf/nda-template';
const html = renderNdaAgreement({
  id: 'test-id', client_id: 'c1', token: 't1', status: 'signed', created_by: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  expires_at: new Date().toISOString(), sent_at: null, signed_at: new Date().toISOString(),
  signatory_name: 'Jane Doe', signatory_title: 'COO', signatory_email: 'jane@acme.com',
  client_company_snapshot: 'Acme Inc', client_address_snapshot: 'Mumbai, India',
  purpose_snapshot: null, signature_type: 'typed', signature_text: 'Jane Doe',
  signature_storage_path: null, pdf_storage_path: null,
}, { name: 'Acme Inc' });
console.log(html.includes('Acme Inc'), html.includes('Jane Doe'), html.length > 1000);
"`
Expected: `true true true` printed, no thrown errors.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/pdf/nda-template.ts
git commit -m "feat(nda): add branded PDF template for signed NDAs"
```

---

## Task 4: PDF render pipeline

**Files:**
- Modify: `mystudiobee/src/lib/pdf/render.ts`

**Interfaces:**
- Consumes: `renderNdaAgreement` from Task 3, `createAdminClient` from `@/lib/supabase/admin`, `NdaAgreementRow` from Task 2
- Produces: `renderNdaAgreementToPdf(agreementId: string): Promise<{ pdfBuffer: Buffer; storagePath: string }>` — used by Task 7's API route and Task 5's `regenerateNdaPdf` action

- [ ] **Step 1: Add the function**

Add this to the end of `mystudiobee/src/lib/pdf/render.ts` (the file already imports `PDFDocument` from `pdf-lib`, defines `launchBrowser()`, and has `LOCAL_CHROME_PATH` in scope — reuse `launchBrowser()` directly, do not duplicate it):

```ts
// --- append to mystudiobee/src/lib/pdf/render.ts ---

import { renderNdaAgreement } from "@/lib/pdf/nda-template";
import { createAdminClient } from "@/lib/supabase/admin";

/** Renders a signed nda_agreements row to PDF and uploads it to the (pre-existing,
 * un-migrated — see migration 0045's comment) "documents" Storage bucket, same
 * bucket/path convention as quote/invoice PDFs (`pdfs/<file>.pdf`). Always reads/
 * writes via the admin client: this is called from the anonymous /api/nda/[token]
 * signing route, which has no Supabase auth session to enforce RLS against. */
export async function renderNdaAgreementToPdf(
  agreementId: string
): Promise<{ pdfBuffer: Buffer; storagePath: string }> {
  const admin = createAdminClient();

  const { data: agreement, error: agreementError } = await admin
    .from("nda_agreements")
    .select("*")
    .eq("id", agreementId)
    .single();
  if (agreementError || !agreement) throw new Error("NDA agreement not found");

  const { data: client } = await admin
    .from("clients")
    .select("name")
    .eq("id", agreement.client_id)
    .single();

  // A drawn signature is stored in Storage as a PNG (signature_storage_path),
  // never inline on the row — fetch it and inline it as a data: URI so Puppeteer
  // can render it with no network fetch of its own inside the sandboxed page.
  let signatureDataUri: string | undefined;
  if (agreement.signature_type === "drawn" && agreement.signature_storage_path) {
    const { data: sigBlob } = await admin.storage.from("documents").download(agreement.signature_storage_path);
    if (sigBlob) {
      const buf = Buffer.from(await sigBlob.arrayBuffer());
      signatureDataUri = `data:image/png;base64,${buf.toString("base64")}`;
    }
  }

  const html = renderNdaAgreement(agreement, { name: client?.name ?? "Client" }, signatureDataUri);

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = (await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    })) as Buffer;

    await browser.close();

    const storagePath = `pdfs/nda-${agreement.token}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, pdfBuffer, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await admin.from("nda_agreements").update({ pdf_storage_path: storagePath }).eq("id", agreementId);

    return { pdfBuffer, storagePath };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    throw e;
  }
}
```

- [ ] **Step 2: Manual verification**

There's no automated test harness for Puppeteer rendering in this repo (matches `template.ts`/`render.ts`'s existing untested status). Verify manually once Task 7's API route exists and can be exercised end-to-end (see Task 9's end-to-end checklist) — don't block on an isolated test here, this function has no callers until Task 7.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/pdf/render.ts mystudiobee/src/lib/pdf/nda-template.ts
git commit -m "feat(nda): render signed NDAs to PDF via existing Puppeteer pipeline"
```

---

## Task 5: Server actions

**Files:**
- Create: `mystudiobee/src/lib/actions/nda.ts`

**Interfaces:**
- Consumes: `NdaAgreementRow` (Task 2), `renderNdaAgreementToPdf` (Task 4), `getSmtpTransport`/`getSmtpFrom` (existing `src/lib/email.ts`), `requireBillingRole`-style pattern from `documents.ts`/`clients.ts`
- Produces: `createNdaAgreement`, `sendNdaAgreementEmail`, `voidNdaAgreement`, `getNdaPdfDownloadUrl`, `regenerateNdaPdf` — consumed by Task 9's staff UI

- [ ] **Step 1: Write the actions file**

```ts
// mystudiobee/src/lib/actions/nda.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentProfile, isBillingRole } from "@/lib/profile";
import { getSmtpTransport, getSmtpFrom } from "@/lib/email";
import { renderNdaAgreementToPdf } from "@/lib/pdf/render";

async function requireBillingRole() {
  const profile = await getCurrentProfile();
  if (!profile || !isBillingRole(profile.role)) throw new Error("Not authorized.");
  return profile;
}

/** Creates a new pending NDA for a client. Each call makes a fresh row — clients
 * keep a full history of every NDA ever sent to them, nothing is overwritten. */
export async function createNdaAgreement(clientId: string, purpose?: string) {
  const profile = await requireBillingRole();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nda_agreements")
    .insert({
      client_id: clientId,
      purpose_snapshot: purpose?.trim() || null,
      created_by: profile.id,
    })
    .select("id, token")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { id: data.id as string, url: `${baseUrl}/nda/${data.token}` };
}

/** Emails the signing link to the client's stored address. Requires the client
 * to already have an email on file — this doesn't accept an ad-hoc recipient
 * the way /api/email-document does, since there's no document to attach yet. */
export async function sendNdaAgreementEmail(agreementId: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data: agreement, error: fetchError } = await supabase
    .from("nda_agreements")
    .select("id, token, client_id")
    .eq("id", agreementId)
    .single();
  if (fetchError || !agreement) throw new Error("NDA agreement not found");

  const { data: client } = await supabase
    .from("clients")
    .select("name, email")
    .eq("id", agreement.client_id)
    .single();
  if (!client?.email) throw new Error("This client has no email address on file.");

  const transport = getSmtpTransport();
  if (!transport) {
    throw new Error("Email isn't configured yet — add SMTP_HOST/SMTP_USER/SMTP_PASS to the environment.");
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const link = `${baseUrl}/nda/${agreement.token}`;

  await transport.sendMail({
    from: getSmtpFrom(),
    to: client.email,
    subject: "Non-Disclosure Agreement from Studiobee",
    text: `Hi,\n\nPlease review and sign the attached Non-Disclosure Agreement at your convenience:\n\n${link}\n\nThanks,\nStudiobee`,
  });

  const { error: updateError } = await supabase
    .from("nda_agreements")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", agreementId);
  if (updateError) throw new Error(updateError.message);

  revalidatePath(`/clients/${agreement.client_id}`);
}

/** Kills a pending link early. Signed agreements can't be voided — that would
 * erase a real signature, which is the legally meaningful record. */
export async function voidNdaAgreement(agreementId: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("nda_agreements")
    .update({ status: "voided" })
    .eq("id", agreementId)
    .eq("status", "pending")
    .select("id, client_id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Only a pending NDA can be voided.");

  revalidatePath(`/clients/${data[0].client_id}`);
}

/** Mints a fresh 7-day signed URL for a signed agreement's archived PDF — the
 * same createSignedUrl pattern /api/generate-pdf uses for quote/invoice PDFs.
 * Never stores the URL itself, only the storage path, since signed URLs expire. */
export async function getNdaPdfDownloadUrl(agreementId: string): Promise<string> {
  await requireBillingRole();
  const admin = createAdminClient();

  const { data: agreement, error } = await admin
    .from("nda_agreements")
    .select("pdf_storage_path")
    .eq("id", agreementId)
    .single();
  if (error || !agreement?.pdf_storage_path) throw new Error("No PDF available for this agreement yet.");

  const { data: signed, error: signError } = await admin.storage
    .from("documents")
    .createSignedUrl(agreement.pdf_storage_path, 604800);
  if (signError) throw new Error(signError.message);

  return signed.signedUrl;
}

/** Retries PDF generation for a signed agreement whose PDF failed to render the
 * first time (see error-handling note in the spec: a Puppeteer failure never
 * rolls back the signature itself, it just leaves pdf_storage_path null). */
export async function regenerateNdaPdf(agreementId: string) {
  await requireBillingRole();
  const supabase = await createClient();

  const { data: agreement } = await supabase
    .from("nda_agreements")
    .select("status, client_id")
    .eq("id", agreementId)
    .single();
  if (!agreement || agreement.status !== "signed") {
    throw new Error("Only a signed agreement has a PDF to regenerate.");
  }

  await renderNdaAgreementToPdf(agreementId);
  revalidatePath(`/clients/${agreement.client_id}`);
}
```

- [ ] **Step 2: Manual verification**

No automated tests for this file — it's a thin wrapper over Supabase calls and the existing PDF/email pipelines, matching `documents.ts`/`clients.ts`'s own untested convention (they're exercised through the UI, not Vitest). Verified end-to-end in Task 9.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/actions/nda.ts
git commit -m "feat(nda): add staff-facing server actions for NDA lifecycle"
```

---

## Task 6: Middleware bypass

**Files:**
- Modify: `mystudiobee/src/lib/supabase/proxy.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `/nda/*` and `/api/nda/*` reachable by anonymous visitors — required by Task 7 and Task 8

- [ ] **Step 1: Add the new paths to the session-gate bypass**

In `mystudiobee/src/lib/supabase/proxy.ts`, change:

```ts
// Vercel Cron calls these with only an `Authorization: Bearer <CRON_SECRET>`
// header, never a Supabase session cookie — the session check below would
// always redirect them to /login before the route's own token check ever
// runs. These routes authenticate themselves; skip the session gate entirely.
const CRON_PATHS = ["/api/cron"];

export async function updateSession(request: NextRequest) {
  if (CRON_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }
```

to:

```ts
// Vercel Cron calls these with only an `Authorization: Bearer <CRON_SECRET>`
// header, never a Supabase session cookie — the session check below would
// always redirect them to /login before the route's own token check ever
// runs. These routes authenticate themselves; skip the session gate entirely.
//
// /nda and /api/nda are the same situation from the opposite direction: an
// anonymous *client* opens these with no Supabase session at all, ever. The
// per-agreement `token` in the URL is the entire authorization boundary (see
// migration 0045's RLS comment) — there is no session to gate on here either.
const CRON_PATHS = ["/api/cron", "/nda", "/api/nda"];

export async function updateSession(request: NextRequest) {
  if (CRON_PATHS.some((p) => request.nextUrl.pathname.startsWith(p))) {
    return NextResponse.next({ request });
  }
```

(Leave every other line in the file untouched — `PUBLIC_PATHS`, `ADMIN_ONLY_PREFIXES`, and the rest of `updateSession` are unaffected.)

- [ ] **Step 2: Verify manually**

Run the dev server (`cd mystudiobee && npm run dev`) and open `http://localhost:3000/nda/00000000-0000-0000-0000-000000000000` in an incognito/private window (no session cookie). Confirm it does **not** redirect to `/login` — it will 404 or error at this point since Task 8's page doesn't exist yet, but it must not redirect. Also confirm `http://localhost:3000/clients` (an existing protected route) still redirects to `/login` when signed out, proving the bypass didn't leak beyond `/nda`/`/api/nda`.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/lib/supabase/proxy.ts
git commit -m "feat(nda): bypass session gate for anonymous /nda routes"
```

---

## Task 7: Public signing API route

**Files:**
- Create: `mystudiobee/src/app/api/nda/[token]/route.ts`

**Interfaces:**
- Consumes: `createAdminClient` (existing), `renderNdaAgreementToPdf` (Task 4), `NdaAgreementRow` (Task 2)
- Produces: `POST /api/nda/[token]` — consumed by Task 8's client component

- [ ] **Step 1: Write the route**

```ts
// mystudiobee/src/app/api/nda/[token]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderNdaAgreementToPdf } from "@/lib/pdf/render";

type SignBody = {
  signatoryName: string;
  signatoryTitle: string;
  signatoryEmail?: string;
  clientCompany: string;
  clientAddress?: string;
  purpose?: string;
  signatureType: "typed" | "drawn";
  signatureText?: string;
  signatureDataUrl?: string;
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: agreement, error: fetchError } = await admin
    .from("nda_agreements")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  if (!agreement) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  if (agreement.status === "signed") {
    // Idempotent: a double-click or resubmit lands here — hand back the
    // existing signed record instead of erroring, so it never looks like a
    // failure to the client who already successfully signed.
    return NextResponse.json({ ok: true, alreadySigned: true });
  }

  if (agreement.status === "voided") {
    return NextResponse.json({ error: "This link has been voided. Contact Studiobee for a new one." }, { status: 409 });
  }

  if (new Date(agreement.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "This link has expired. Contact Studiobee for a new one." }, { status: 409 });
  }

  let body: SignBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const signatoryName = body.signatoryName?.trim();
  const signatoryTitle = body.signatoryTitle?.trim();
  const clientCompany = body.clientCompany?.trim();

  if (!signatoryName || !signatoryTitle || !clientCompany) {
    return NextResponse.json({ error: "Company name, your name, and title are required." }, { status: 400 });
  }
  if (body.signatureType === "typed" && !body.signatureText?.trim()) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }
  if (body.signatureType === "drawn" && !body.signatureDataUrl) {
    return NextResponse.json({ error: "Signature is required." }, { status: 400 });
  }

  let signatureStoragePath: string | null = null;
  if (body.signatureType === "drawn" && body.signatureDataUrl) {
    const base64 = body.signatureDataUrl.replace(/^data:image\/png;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    signatureStoragePath = `nda-signatures/${token}.png`;
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(signatureStoragePath, buffer, { contentType: "image/png", upsert: true });
    if (uploadError) {
      return NextResponse.json({ error: "Failed to save your signature. Please try again." }, { status: 500 });
    }
  }

  const { error: updateError } = await admin
    .from("nda_agreements")
    .update({
      status: "signed",
      signed_at: new Date().toISOString(),
      signatory_name: signatoryName,
      signatory_title: signatoryTitle,
      signatory_email: body.signatoryEmail?.trim() || null,
      client_company_snapshot: clientCompany,
      client_address_snapshot: body.clientAddress?.trim() || null,
      purpose_snapshot: body.purpose?.trim() || agreement.purpose_snapshot,
      signature_type: body.signatureType,
      signature_text: body.signatureType === "typed" ? body.signatureText!.trim() : null,
      signature_storage_path: signatureStoragePath,
    })
    .eq("id", agreement.id);

  if (updateError) {
    return NextResponse.json({ error: "Failed to save your signature. Please try again." }, { status: 500 });
  }

  // The signature write above is the legally meaningful event and has already
  // succeeded — a PDF failure here must never look like the signing failed.
  let pdfAvailable = true;
  try {
    await renderNdaAgreementToPdf(agreement.id);
  } catch {
    pdfAvailable = false;
  }

  let pdfUrl: string | null = null;
  if (pdfAvailable) {
    const { data: signed } = await admin.storage
      .from("documents")
      .createSignedUrl(`pdfs/nda-${token}.pdf`, 604800);
    pdfUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({ ok: true, pdfUrl });
}
```

- [ ] **Step 2: Manual verification**

Deferred to Task 9's end-to-end checklist — this route has no caller until Task 8's client component exists, and testing it in isolation with `curl` would require first inserting a real `nda_agreements` row by hand, which is more effort than just running the real flow once Task 8 lands.

- [ ] **Step 3: Commit**

```bash
git add "mystudiobee/src/app/api/nda/[token]/route.ts"
git commit -m "feat(nda): add public signing API endpoint"
```

---

## Task 8: Public signing page

**Files:**
- Create: `mystudiobee/src/app/nda/[token]/page.tsx`
- Create: `mystudiobee/src/app/nda/[token]/nda-sign-client.tsx`

**Interfaces:**
- Consumes: `createAdminClient`, `NdaAgreementRow` (Task 2), `deriveNdaStatus` (Task 2), `POST /api/nda/[token]` (Task 7)
- Produces: the page a client opens from their emailed/copied link

- [ ] **Step 1: Write the server page**

```tsx
// mystudiobee/src/app/nda/[token]/page.tsx
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveNdaStatus } from "@/lib/nda/status";
import { NdaSignClient } from "./nda-sign-client";

export default async function NdaSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();

  const { data: agreement } = await admin
    .from("nda_agreements")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (!agreement) {
    return (
      <NdaShell>
        <p>This link isn&rsquo;t valid. Double-check the URL, or contact Studiobee for a fresh one.</p>
      </NdaShell>
    );
  }

  const { data: client } = await admin.from("clients").select("name").eq("id", agreement.client_id).single();

  const status = deriveNdaStatus(agreement);

  if (status === "expired") {
    return (
      <NdaShell>
        <p>This link has expired. Contact Studiobee for a new one.</p>
      </NdaShell>
    );
  }

  if (status === "voided") {
    return (
      <NdaShell>
        <p>This link is no longer active. Contact Studiobee for a new one.</p>
      </NdaShell>
    );
  }

  let signedPdfUrl: string | null = null;
  if (status === "signed" && agreement.pdf_storage_path) {
    const { data: signed } = await admin.storage.from("documents").createSignedUrl(agreement.pdf_storage_path, 604800);
    signedPdfUrl = signed?.signedUrl ?? null;
  }

  return (
    <NdaSignClient
      token={token}
      clientName={client?.name ?? ""}
      purposeDefault={agreement.purpose_snapshot ?? ""}
      alreadySigned={status === "signed"}
      signedSummary={
        status === "signed"
          ? {
              name: agreement.signatory_name ?? "",
              company: agreement.client_company_snapshot ?? client?.name ?? "",
              dateStr: agreement.signed_at
                ? new Date(agreement.signed_at).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
                : "",
              pdfUrl: signedPdfUrl,
            }
          : null
      }
    />
  );
}

function NdaShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 20px", fontFamily: "DM Sans, sans-serif", textAlign: "center", color: "#333" }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Write the interactive client component**

This is a direct port of the previously-built standalone artifact's signing UI (same tabs/canvas/validation logic), now submitting to the real API instead of `localStorage`, and rendering the "already signed" state server already resolved instead of reading it back from browser storage.

```tsx
// mystudiobee/src/app/nda/[token]/nda-sign-client.tsx
"use client";

import { useEffect, useRef, useState } from "react";

type SignedSummary = {
  name: string;
  company: string;
  dateStr: string;
  pdfUrl: string | null;
};

export function NdaSignClient({
  token,
  clientName,
  purposeDefault,
  alreadySigned,
  signedSummary,
}: {
  token: string;
  clientName: string;
  purposeDefault: string;
  alreadySigned: boolean;
  signedSummary: SignedSummary | null;
}) {
  const [signed, setSigned] = useState<SignedSummary | null>(signedSummary);
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [company, setCompany] = useState(clientName);
  const [address, setAddress] = useState("");
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [email, setEmail] = useState("");
  const [purpose, setPurpose] = useState(purposeDefault);
  const [signatureText, setSignatureText] = useState("");
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function pos(e: PointerEvent) {
      const r = canvas!.getBoundingClientRect();
      return [(e.clientX - r.left) * (canvas!.width / r.width), (e.clientY - r.top) * (canvas!.height / r.height)];
    }
    function down(e: PointerEvent) {
      drawingRef.current = true;
      hasDrawnRef.current = true;
      const [x, y] = pos(e);
      ctx!.beginPath();
      ctx!.moveTo(x, y);
    }
    function move(e: PointerEvent) {
      if (!drawingRef.current) return;
      const [x, y] = pos(e);
      ctx!.lineWidth = 2.4;
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
      ctx!.strokeStyle = "#0A0A0A";
      ctx!.lineTo(x, y);
      ctx!.stroke();
    }
    function up() {
      drawingRef.current = false;
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!company.trim()) errs.push("Company name is required.");
    if (!signatoryName.trim()) errs.push("Your full name is required.");
    if (!signatoryTitle.trim()) errs.push("Your title is required.");
    if (!agree) errs.push("Please confirm you agree to the terms.");
    const signatureDataUrl = mode === "draw" && hasDrawnRef.current ? canvasRef.current?.toDataURL("image/png") : undefined;
    if (mode === "type" && !signatureText.trim()) errs.push("Please type your signature.");
    if (mode === "draw" && !signatureDataUrl) errs.push("Please draw your signature.");

    if (errs.length) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/nda/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatoryName: signatoryName.trim(),
          signatoryTitle: signatoryTitle.trim(),
          signatoryEmail: email.trim() || undefined,
          clientCompany: company.trim(),
          clientAddress: address.trim() || undefined,
          purpose: purpose.trim() || undefined,
          signatureType: mode,
          signatureText: mode === "type" ? signatureText.trim() : undefined,
          signatureDataUrl: mode === "draw" ? signatureDataUrl : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrors([json.error || "Something went wrong. Please try again."]);
        return;
      }
      setSigned({
        name: signatoryName.trim(),
        company: company.trim(),
        dateStr: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }),
        pdfUrl: json.pdfUrl ?? null,
      });
    } catch {
      setErrors(["Network error — please check your connection and try again."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="nda-root">
      <style>{`
        .nda-root { max-width: 794px; margin: 0 auto; padding: 24px 16px 60px; font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; color: #333; background: #EFEFF4; }
        .nda-sheet { background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 2px rgba(20,20,40,0.07), 0 10px 30px -14px rgba(20,20,40,0.22); }
        .nda-header { background: #2F48DF; padding: 22px 32px; color: #fff; font-size: 17px; }
        .nda-body { padding: 28px 32px; }
        .nda-field { margin-bottom: 14px; }
        .nda-field label { display: block; font-size: 11px; font-weight: 600; margin-bottom: 5px; }
        .nda-field input[type="text"], .nda-field input[type="email"] { width: 100%; font: inherit; font-size: 13px; padding: 8px 10px; border: 1px solid #d5d5dd; border-radius: 6px; }
        .nda-tabs { display: flex; gap: 5px; background: rgba(47,72,223,0.06); padding: 3px; border-radius: 8px; width: fit-content; margin-bottom: 9px; }
        .nda-tab { font: inherit; font-size: 0.8rem; font-weight: 600; border: none; background: transparent; color: #666; padding: 6px 14px; border-radius: 6px; cursor: pointer; }
        .nda-tab[data-active="true"] { background: #fff; color: #0A0A0A; }
        .nda-sig-box { border: 1px solid #e5e5ea; border-radius: 8px; padding: 12px; }
        .nda-canvas { width: 100%; height: 120px; border: 1px dashed #d5d5dd; border-radius: 8px; touch-action: none; }
        .nda-errors { background: rgba(179,38,30,0.08); color: #B3261E; border-radius: 8px; padding: 10px 14px; font-size: 0.85rem; margin-bottom: 12px; }
        .nda-agree { display: flex; gap: 9px; align-items: flex-start; margin: 14px 0; font-size: 11.5px; }
        .nda-btn { font: inherit; font-weight: 700; font-size: 0.9rem; color: #fff; background: #2F48DF; border: none; border-radius: 9px; padding: 11px 22px; cursor: pointer; }
        .nda-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>

      <div className="nda-sheet">
        <div className="nda-header">Studiobee &middot; Non-Disclosure Agreement</div>
        <div className="nda-body">
          {signed ? (
            <div>
              <p style={{ marginBottom: 12 }}>
                <strong>Signed</strong> by {signed.name} on behalf of {signed.company} on {signed.dateStr}.
              </p>
              {signed.pdfUrl && (
                <a className="nda-btn" href={signed.pdfUrl} target="_blank" rel="noreferrer" style={{ textDecoration: "none", display: "inline-block" }}>
                  Download your copy
                </a>
              )}
              {!signed.pdfUrl && <p style={{ fontSize: 12, color: "#666" }}>Your PDF copy is being prepared — check back shortly or contact Studiobee.</p>}
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {errors.length > 0 && (
                <div className="nda-errors">
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {errors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="nda-field">
                <label htmlFor="company">Company name</label>
                <input id="company" type="text" value={company} onChange={(e) => setCompany(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="signatoryName">Your full name</label>
                <input id="signatoryName" type="text" value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="signatoryTitle">Your title</label>
                <input id="signatoryTitle" type="text" value={signatoryTitle} onChange={(e) => setSignatoryTitle(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="address">Company address</label>
                <input id="address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="email">Email (to send you a copy)</label>
                <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="nda-field">
                <label htmlFor="purpose">What&rsquo;s the engagement? (optional)</label>
                <input id="purpose" type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </div>

              <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 5 }}>Signature</label>
              <div className="nda-tabs" role="tablist">
                <button type="button" className="nda-tab" data-active={mode === "type"} onClick={() => setMode("type")}>
                  Type
                </button>
                <button type="button" className="nda-tab" data-active={mode === "draw"} onClick={() => setMode("draw")}>
                  Draw
                </button>
              </div>

              {mode === "type" ? (
                <div className="nda-sig-box">
                  <input
                    type="text"
                    placeholder="Type your full name"
                    value={signatureText}
                    onChange={(e) => setSignatureText(e.target.value)}
                    style={{ border: "none", width: "100%", fontFamily: "'Caveat', cursive", fontSize: "1.6rem" }}
                  />
                </div>
              ) : (
                <div className="nda-sig-box">
                  <canvas ref={canvasRef} className="nda-canvas" width={500} height={140} />
                  <div style={{ textAlign: "right", marginTop: 6 }}>
                    <button type="button" onClick={clearCanvas} style={{ fontSize: 12, background: "none", border: "none", color: "#2F48DF", cursor: "pointer" }}>
                      Clear
                    </button>
                  </div>
                </div>
              )}

              <div className="nda-agree">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ marginTop: 3 }} />
                <label style={{ margin: 0 }}>
                  I confirm I am authorised to sign on behalf of {company || "[Client Company Name]"} and I have read and agree to the terms of this
                  Non-Disclosure Agreement.
                </label>
              </div>

              <button type="submit" className="nda-btn" disabled={submitting}>
                {submitting ? "Signing…" : "Sign agreement"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

The component above is missing the actual legal text the client is agreeing to — a bare form with no agreement text is not acceptable. Fix this now, in this same file, before moving on: add this import at the top of `nda-sign-client.tsx`, alongside the existing `useEffect, useRef, useState` import:

```ts
import { CLAUSES } from "@/lib/pdf/nda-template";
```

Then, inside the `<div className="nda-body">` block, insert the clause text immediately before the `{signed ? ( ... ) : ( <form ...> )}` conditional (i.e. as the first child of `nda-body`, always visible whether or not the client has signed yet):

```tsx
          <p style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>
            This Non-Disclosure Agreement is made between <strong>Studiobee Private Limited</strong> and{" "}
            <strong>{company || "[Client Company Name]"}</strong>. By signing below, both parties agree to the
            following terms:
          </p>
          {CLAUSES.map((c) => (
            <div key={c.title} style={{ marginBottom: 16 }}>
              <strong style={{ display: "block", marginBottom: 4, color: "#2F48DF", fontSize: 13 }}>{c.title}</strong>
              <p style={{ fontSize: 12, color: "#555", lineHeight: 1.6 }}>{c.body}</p>
            </div>
          ))}
```

- [ ] **Step 3: Manual verification**

Run `cd mystudiobee && npm run dev`, open `http://localhost:3000/nda/<a-real-token>` (create one via Task 9's UI once it exists, or insert a test row directly via SQL: `insert into nda_agreements (client_id) select id from clients limit 1 returning token;`). Confirm: the page loads without redirecting to `/login`, all 11 clauses render above the form, filling in the form and clicking "Sign agreement" shows the signed confirmation, and reloading the page (fresh server request) still shows the signed state (proving it reads from the DB, not `localStorage`).

- [ ] **Step 4: Commit**

```bash
git add "mystudiobee/src/app/nda/[token]/page.tsx" "mystudiobee/src/app/nda/[token]/nda-sign-client.tsx" mystudiobee/src/lib/pdf/nda-template.ts
git commit -m "feat(nda): add public NDA signing page"
```

---

## Task 9: Staff UI

**Files:**
- Create: `mystudiobee/src/app/(app)/clients/[id]/nda-agreements-card.tsx`
- Modify: `mystudiobee/src/app/(app)/clients/[id]/page.tsx`
- Modify: `mystudiobee/src/app/(app)/clients/[id]/client-detail-client.tsx`

**Interfaces:**
- Consumes: `createNdaAgreement`, `sendNdaAgreementEmail`, `voidNdaAgreement`, `getNdaPdfDownloadUrl`, `regenerateNdaPdf` (Task 5), `deriveNdaStatus` (Task 2), `NdaAgreementRow` (Task 2)
- Produces: the "NDA Agreements" card on the client detail page

- [ ] **Step 1: Write the card component**

```tsx
// mystudiobee/src/app/(app)/clients/[id]/nda-agreements-card.tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateLongIST } from "@/lib/datetime";
import { deriveNdaStatus, type NdaAgreementStatus } from "@/lib/nda/status";
import type { NdaAgreementRow } from "@/lib/nda/types";
import { createNdaAgreement, sendNdaAgreementEmail, voidNdaAgreement, getNdaPdfDownloadUrl, regenerateNdaPdf } from "@/lib/actions/nda";

const STATUS_VARIANT: Record<NdaAgreementStatus, "default" | "secondary" | "destructive" | "outline"> = {
  signed: "default",
  pending: "secondary",
  expired: "destructive",
  voided: "outline",
};
const STATUS_LABEL: Record<NdaAgreementStatus, string> = {
  signed: "Signed",
  pending: "Pending",
  expired: "Expired",
  voided: "Voided",
};

export function NdaAgreementsCard({ clientId, agreements }: { clientId: string; agreements: NdaAgreementRow[] }) {
  const [rows, setRows] = useState(agreements);
  const [newOpen, setNewOpen] = useState(false);
  const [purpose, setPurpose] = useState("");
  const [pending, startTransition] = useTransition();
  const [newLink, setNewLink] = useState<string | null>(null);

  function handleCreate() {
    startTransition(async () => {
      try {
        const { url } = await createNdaAgreement(clientId, purpose);
        setNewLink(url);
        toast.success("NDA created");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to create NDA");
      }
    });
  }

  function handleSend(id: string) {
    startTransition(async () => {
      try {
        await sendNdaAgreementEmail(id);
        toast.success("Emailed to client");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to send email");
      }
    });
  }

  function handleVoid(id: string) {
    if (!window.confirm("Void this NDA link? It can no longer be signed.")) return;
    startTransition(async () => {
      try {
        await voidNdaAgreement(id);
        setRows((r) => r.map((row) => (row.id === id ? { ...row, status: "voided" } : row)));
        toast.success("Voided");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to void");
      }
    });
  }

  function handleViewPdf(id: string) {
    startTransition(async () => {
      try {
        const url = await getNdaPdfDownloadUrl(id);
        window.open(url, "_blank");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "PDF not available");
      }
    });
  }

  function handleRegeneratePdf(id: string) {
    startTransition(async () => {
      try {
        await regenerateNdaPdf(id);
        toast.success("PDF regenerated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to regenerate PDF");
      }
    });
  }

  async function copyLink(token: string) {
    const baseUrl = window.location.origin;
    await navigator.clipboard.writeText(`${baseUrl}/nda/${token}`);
    toast.success("Link copied");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">NDA Agreements</h3>
        <Button size="sm" onClick={() => { setNewLink(null); setPurpose(""); setNewOpen(true); }}>
          New NDA
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No NDAs sent to this client yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => {
            const status = deriveNdaStatus(row);
            return (
              <div key={row.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
                    <span className="text-[10px] text-muted-foreground">
                      Created {formatDateLongIST(row.created_at)}
                      {row.signed_at ? ` · Signed ${formatDateLongIST(row.signed_at)}` : ""}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {status === "pending" && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => copyLink(row.token)}>
                        Copy link
                      </Button>
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => handleSend(row.id)}>
                        Send email
                      </Button>
                      <Button size="xs" variant="destructive" disabled={pending} onClick={() => handleVoid(row.id)}>
                        Void
                      </Button>
                    </>
                  )}
                  {status === "signed" && (
                    <>
                      <Button size="xs" variant="outline" disabled={pending} onClick={() => handleViewPdf(row.id)}>
                        View PDF
                      </Button>
                      {!row.pdf_storage_path && (
                        <Button size="xs" variant="outline" disabled={pending} onClick={() => handleRegeneratePdf(row.id)}>
                          Regenerate PDF
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New NDA</DialogTitle>
          </DialogHeader>
          {newLink ? (
            <div>
              <p className="mb-2 text-sm">Link created:</p>
              <Input readOnly value={newLink} onFocus={(e) => e.currentTarget.select()} />
            </div>
          ) : (
            <div>
              <Label htmlFor="purpose">Engagement description (optional)</Label>
              <Input id="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. website redesign and brand identity" />
            </div>
          )}
          <DialogFooter>
            {newLink ? (
              <Button onClick={() => { setNewOpen(false); window.location.reload(); }}>Done</Button>
            ) : (
              <Button disabled={pending} onClick={handleCreate}>
                Create
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Fetch `nda_agreements` in the server page**

In `mystudiobee/src/app/(app)/clients/[id]/page.tsx`, change the `Promise.all` fetch to add a third query and pass the result down:

```tsx
    const [{ data: client }, { data: documents }, { data: ndaAgreements }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("documents")
        .select("id, type, number, project_name, status, total, created_at")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("nda_agreements")
        .select("*")
        .eq("client_id", id)
        .order("created_at", { ascending: false }),
    ]);
```

and pass `ndaAgreements={ndaAgreements ?? []}` as a new prop to `<ClientDetailClient>`.

- [ ] **Step 3: Render the card in `client-detail-client.tsx`**

Add the import:
```tsx
import { NdaAgreementsCard } from "./nda-agreements-card";
import type { NdaAgreementRow } from "@/lib/nda/types";
```

Add `ndaAgreements` to the component's props type and destructured parameters:
```tsx
  client,
  documents,
  ndaAgreements,
  canDelete = false,
  isBinned = false,
  deletedAt,
}: {
  client: ClientRecord & { id: string };
  documents: Document[];
  ndaAgreements: NdaAgreementRow[];
  canDelete?: boolean;
  isBinned?: boolean;
  deletedAt?: string | null;
}) {
```

Render the card right after the existing "Quotes, proformas, invoices & receipts" card and before `<ClientFormSheet>`:
```tsx
        <NdaAgreementsCard clientId={client.id} agreements={ndaAgreements} />

        <ClientFormSheet
```

- [ ] **Step 4: Manual verification (full end-to-end)**

1. `cd mystudiobee && npm run dev`, sign in as a billing-role user, open a client's page.
2. Click "New NDA," optionally fill in an engagement description, click "Create" — confirm a link appears.
3. Copy the link, open it in an incognito window — confirm the branded signing page loads (not a login redirect).
4. Fill in the form, try both "Type" and "Draw" signature modes, check the agreement box, submit.
5. Confirm the signed confirmation appears with a working "Download your copy" link.
6. Back in the staff client page, refresh — confirm the row now shows "Signed" with a working "View PDF" button.
7. Create a second NDA for the same client and click "Void" — confirm it shows "Voided" and its link no longer allows signing (reopen the old link, confirm it shows the voided message).
8. Confirm `git status` shows no unintended changes to unrelated files before committing.

- [ ] **Step 5: Commit**

```bash
git add "mystudiobee/src/app/(app)/clients/[id]/nda-agreements-card.tsx" "mystudiobee/src/app/(app)/clients/[id]/page.tsx" "mystudiobee/src/app/(app)/clients/[id]/client-detail-client.tsx"
git commit -m "feat(nda): add NDA Agreements card to client detail page"
```
