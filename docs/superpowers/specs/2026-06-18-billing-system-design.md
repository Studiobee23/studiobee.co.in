# StudioBee Billing System — Design Spec
**Date:** 2026-06-18

---

## Context

StudioBee needs an internal billing system to replace manual quote/invoice creation. The system lives entirely inside the admin panel (`billing.html`), with no client login. The studio creates documents, generates branded PDFs, and delivers them to clients via email or WhatsApp.

---

## Scope

- **Documents:** Quote → Invoice → Receipt (full lifecycle, one-click conversion)
- **Client CRM-lite:** Save clients, pick from dropdown, view per-client history
- **PDF template:** Branded Option B — blue header with white logo, DM Sans body, dark footer with bank details
- **Delivery:** Email draft + send from admin; WhatsApp via `wa.me` deep link
- **Storage:** Supabase (PostgreSQL)
- **Auto-numbering:** SB-Q-001, SB-I-001, SB-R-001 (per document type, globally incrementing)
- **Tax:** GST toggle per document — CGST+SGST (intra-state) or IGST (inter-state); configurable rate
- **Auth:** Same `X-Admin-Key` header used by existing `/save-config` and `/analytics` endpoints

---

## Architecture

### New file: `billing.html`
Standalone admin page served at `http://localhost:3000/billing.html`. Same auth pattern as `config.html` (reads `window.__ADMIN_KEY__` injected by serve.mjs).

**Tabs:**
1. **Clients** — add/edit clients, view document count per client
2. **Quotes** — list, create, convert to invoice
3. **Invoices** — list, create, mark paid, convert to receipt
4. **Receipts** — list, view only

---

## Data Model (Supabase)

### `clients`
| column | type | notes |
|---|---|---|
| id | uuid PK | auto |
| name | text | company or individual name |
| contact_person | text | |
| email | text | |
| phone | text | for WhatsApp |
| gstin | text | nullable |
| address | text | |
| city | text | |
| state | text | for CGST/SGST vs IGST determination |
| created_at | timestamptz | |

### `documents`
| column | type | notes |
|---|---|---|
| id | uuid PK | auto |
| type | text | `quote` / `invoice` / `receipt` |
| number | text | e.g. `SB-Q-001` |
| client_id | uuid FK → clients | |
| status | text | quote: `draft/sent/approved/rejected`; invoice: `draft/sent/paid`; receipt: `issued` |
| line_items | jsonb | array of `{description, detail, qty, rate, amount}` |
| subtotal | numeric | |
| gst_enabled | boolean | |
| gst_type | text | `cgst_sgst` or `igst` |
| gst_rate | numeric | default 18 |
| gst_amount | numeric | |
| discount | numeric | flat amount, default 0 |
| total | numeric | |
| notes | text | shown on PDF |
| validity_days | int | for quotes, default 15 |
| project_name | text | |
| converted_from | uuid FK → documents | nullable, tracks lineage |
| created_at | timestamptz | |

### `document_series`
| column | type | notes |
|---|---|---|
| type | text PK | `quote`, `invoice`, `receipt` |
| last_number | int | incremented atomically on insert |

---

## API Endpoints (added to serve.mjs)

All require `X-Admin-Key` header.

| method | path | action |
|---|---|---|
| GET | `/api/clients` | list all clients |
| POST | `/api/clients` | create client |
| PUT | `/api/clients/:id` | update client |
| GET | `/api/documents` | list documents (filter by `?type=`, `?client_id=`) |
| POST | `/api/documents` | create document (auto-assigns number) |
| PUT | `/api/documents/:id` | update document |
| POST | `/api/documents/:id/convert` | convert quote→invoice or invoice→receipt |
| POST | `/api/send-email` | send document email with PDF attachment |
| POST | `/generate-pdf` | render document to PDF, return binary |

---

## PDF Generation

**Approach:** Server-side via Puppeteer (already installed for `screenshot.mjs`).

Flow:
1. Admin clicks "Download PDF" or "Send"
2. `billing.html` POSTs document data to `/generate-pdf`
3. serve.mjs renders the branded HTML template in a headless Puppeteer page
4. Returns PDF buffer as `application/pdf`
5. Browser triggers download, OR the send-email endpoint attaches it

**Template:** matches the locked-in Option B design from `pdf-preview.html` — blue header, white logo (`/studiobee white.png`), DM Sans, dark footer.

Document type label ("Quote" / "Invoice" / "Receipt") swaps in the header. Number, date, validity, parties, line items, GST rows, totals, notes all populated from data.

---

## Email Flow

- Admin clicks "Send via Email" on any document
- Modal opens with pre-filled subject + body (editable)
- Subject default: `StudioBee Quote SB-Q-001 — [Project Name]`
- Body default: short template with greeting, quote summary, call to action
- PDF auto-attached on send
- Uses existing nodemailer setup in serve.mjs (SMTP from `smtp-config.json`)
- New endpoint: `POST /api/send-email` — accepts `{documentId, to, subject, body}`

---

## WhatsApp Flow

- "Send via WhatsApp" button generates a `wa.me` deep link
- Pre-filled message: `"Hi [contact], please find your StudioBee quote SB-Q-001 for [Project]. View/download: [PDF link]"`
- PDF link = a served static URL from `/media/` after the PDF is saved server-side
- Opens WhatsApp Web or app on click — no API required

---

## Document Lifecycle

```
Quote (draft) → Quote (sent) → Quote (approved)
                                      ↓
                               Invoice (draft) → Invoice (sent) → Invoice (paid)
                                                                        ↓
                                                                  Receipt (issued)
```

One-click "Convert to Invoice" on an approved quote creates a new invoice pre-filled with the same line items, linked via `converted_from`.

---

## Verification

1. Start server: `node serve.mjs`
2. Open `http://localhost:3000/billing.html` — admin key prompt appears
3. Create a client → appears in clients tab
4. Create a quote for that client → number auto-assigned (SB-Q-001)
5. Download PDF → branded PDF opens with correct data
6. Convert quote → invoice → receipt
7. Send email → client receives email with PDF attachment
8. WhatsApp button → opens wa.me with pre-filled message
