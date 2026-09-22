# NDA Agreements — Design Spec

> **For agentic workers:** This is a design spec, not an implementation plan. Once approved, the next step is the `superpowers:writing-plans` skill to produce a task-by-task plan under `mystudiobee/docs/superpowers/plans/`.

**Goal:** Let Studiobee staff generate a per-client NDA link from inside mystudiobee, send it to the client (email or copy/paste), have the client read and electronically sign it with no account of their own, and see signed status + an archived PDF on the client's page — the same way quotes/invoices already work.

**Context:** A standalone, self-contained NDA signing page already exists as a Claude artifact (branded to match the quote/invoice PDF system: same header bar, party blocks, clause typography, footer). This spec integrates equivalent functionality into mystudiobee itself, with real per-client tracking, instead of a link that lives outside the app and reports nothing back.

## Non-goals

- No third-party e-signature/e-stamping provider (Leegality, DocuSign, etc.) — considered and explicitly deferred; see "Future work."
- No per-client customization of the legal text. The clause text is a fixed template in code (mirrors how Terms & Conditions works in `template.ts` today) — only the party details, purpose line, and signature are per-agreement.
- No multi-signatory / multi-party workflows beyond Studiobee + one client signatory.
- No automatic reminder emails for unsigned links (staff resend manually).

## Architecture overview

A new `nda_agreements` table holds one row per generated NDA (client_id, an unguessable token, status, signatory/signature fields, and pointers to the stored PDF). A public route (`/nda/[token]`) and its API (`/api/nda/[token]`) are added to the middleware's no-session bypass list — the same mechanism `/api/cron` already uses — so an anonymous client can open and submit the page without hitting the login redirect. The token itself is the authorization boundary, matching the trust model already used for the 7-day signed Storage URLs the PDF system generates. All public-route logic reads/writes via the admin (service-role) client server-side; RLS on the table only ever grants access to authenticated `is_billing_role()` staff. On signing, the API renders a PDF through the existing Puppeteer pipeline and stores it alongside quote/invoice PDFs. Staff manage everything from a new card on the existing client detail page.

## Data model

New migration `mystudiobee/supabase/migrations/0045_nda_agreements.sql` (see "Open questions" — confirm 0045 is actually free against the live DB before writing this, given past migration-numbering drift in this repo).

```sql
create table nda_agreements (
  id                       uuid primary key default gen_random_uuid(),
  client_id                uuid not null references clients(id) on delete cascade,
  token                    uuid not null unique default gen_random_uuid(),
  status                   text not null default 'pending' check (status in ('pending','signed','voided')),
  created_by               uuid references profiles(id),
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
```

- RLS enabled; policies mirror `clients`/`documents` (`is_billing_role()` profiles may select/insert/update; no anon policy — the public flow never uses the anon key).
- `updated_at` bumped via the same trigger pattern used for `clients` (migration 0023).
- **"Expired" is derived, not stored.** Anywhere status is shown or enforced, treat a `pending` row with `expires_at < now()` as expired. No cron job needed to keep a stored value in sync.
- Snapshot columns (`client_company_snapshot` etc.) are filled in at signing time from what the client typed, independent of the live `clients` row — so the historical record reflects what was actually agreed, even if the client's stored details change later.
- Storage: signature PNGs (when drawn) go to the existing `documents` bucket under `nda-signatures/{token}.png`; generated PDFs go under `pdfs/{...}` in the same bucket, matching the existing `generate-pdf` route's path convention.

## Public route & token flow

- `src/lib/supabase/proxy.ts`: add `/nda` and `/api/nda` to a bypass list alongside `CRON_PATHS`, skipping the whole session-gate at the top of `updateSession()` — not just the redirect-skip that `PUBLIC_PATHS` gets, since there's no session to refresh for an anonymous visitor.
- `src/app/nda/[token]/page.tsx` (server component): looks up the row via `createAdminClient()` joined with the client's current `name`/`address`/`email` for the pre-sign "To" display.
  - Unknown token → 404 (no information leakage about which tokens are valid).
  - `pending` + expired → a plain "This link has expired — contact Studiobee for a new one" state.
  - `signed` → read-only view: who signed, when, and a download link for the stored PDF.
  - `pending` + not expired → renders the interactive signing page.
- The interactive page is a client component that is a direct port of the artifact's existing markup, CSS, and JS (tabs, canvas signature pad, live party-block preview, validation) — same visual design, now backed by real submission instead of `localStorage`.
- `src/app/api/nda/[token]/route.ts` (POST, public): validates token exists, not expired, not already signed. Accepts `{ signatoryName, signatoryTitle, signatoryEmail, clientCompany, clientAddress, purpose, signatureType, signatureText | signatureDataUrl }`. All string fields are escaped the same way `template.ts`'s `esc()` helper already escapes user data before it's interpolated into the PDF HTML — this table's data flows into a hand-built HTML string for Puppeteer, not JSX, so it does not get automatic escaping and must follow the existing convention explicitly.

## Staff-side UI

- New "NDA Agreements" card on `src/app/(app)/clients/[id]/client-detail-client.tsx`, placed after the existing client-info card, styled consistently (`rounded-xl border border-border bg-card p-5 shadow-card`).
- "New NDA" button → optional one-line engagement description → server action creates the row and immediately shows a copyable link, built as `` `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/nda/${token}` `` — the same pattern `src/lib/actions/team.ts` already uses for invite links.
- "Send email" button on any pending row reuses `lib/email.ts`'s existing nodemailer transport (same `isBillingRole` gate as `email-document`) to email the client's stored address with the link.
- Each row shows: status pill (Pending / Signed / Expired / Voided — Expired and Voided are both display-only derivations, the latter from an explicit staff action), created date, signed date if applicable, "Copy link," "Send/Resend," "View signed PDF" once available, and "Void" for a pending row staff want to kill early (sets `status: 'voided'`).

## Signing → PDF pipeline

On a valid POST: upload a drawn signature (if used) to Storage, write the signature/signatory/snapshot fields, set `status: 'signed'` and `signed_at`, then render a PDF via a new `renderNda` function in `src/lib/pdf/nda-template.ts` (new file, mirrors `template.ts`'s structural conventions — header bar, parties, clauses, signature blocks, footer, same brand constants and the same `esc()` helper) through the existing `launchBrowser()`/Puppeteer pipeline, and upload the result to the `documents` bucket. The client-facing page then shows a signed confirmation with a download link to their own copy.

## Error handling & edge cases

- Unknown token → 404, no data leak.
- Expired or already-signed token on POST → typed JSON error (400/409), not a silent no-op or a generic 500.
- **PDF generation failure never rolls back the signature** — the database write is the legally meaningful event. A Puppeteer failure just leaves `pdf_storage_path` null, surfaced in the staff UI as "PDF pending" with a manual "Regenerate PDF" action.
- Double-submit (e.g. a double-click): if the row is already `signed` when a second request lands, return the existing signed record rather than erroring — idempotent from the client's perspective.
- A failed drawn-signature upload surfaces an error and preserves already-entered form fields client-side so the client doesn't have to retype everything.
- Service-role key never reaches the browser — every public-route operation happens server-side via the admin client, same as `generate-pdf`/`email-document` today.

## Testing

Match the repo's existing convention: Vitest unit tests for pure logic (e.g. a `isExpired(status, expiresAt, now)`-style helper, and any pure string-building added to `nda-template.ts`, the way `costing/engine.test.ts` and `datetime.test.ts` are tested today). The signing flow, email delivery, and PDF generation itself get manual QA — there is no existing integration/e2e harness in this repo to plug into.

## Open questions / risks

- **Migration numbering:** this repo has a documented history of migration drift (a committed migration that was never applied to prod, and applied migrations that were never committed — see `project_mystudiobee_migration_drift` notes from 2026-08-31). Before creating `0045_nda_agreements.sql`, verify the live DB's actual migration state rather than trusting the highest number in the `migrations/` folder.
- Confirm the `documents` Storage bucket's existing RLS/policy setup allows the admin client to write to new `nda-signatures/` and additional `pdfs/` paths without changes (it should, since it's already service-role-only, but worth a quick check during implementation).

## Future work (explicitly out of scope now)

- Third-party e-signature/e-stamping integration (Leegality, DocuSign, etc.) for stronger legal enforceability and automated Indian stamp-duty handling.
- Automatic reminder emails for links nearing expiry.
- Per-agreement customization of clause text.
