# Client Avatars (Dashboard, List, Detail, Add/Edit Form) — Design Spec
**Date:** 2026-07-21

---

## Context

The `mystudiobee` dashboard's "Recent Clients" widget (`src/app/(app)/page.tsx:334-364`) and the clients list (`src/app/(app)/clients/clients-client.tsx:57-88`) currently render clients as plain text rows (name + city). Neither the `clients` table nor any UI currently supports a client image. We're adding client profile images: upload support on the clients list, client detail page, and the Add/Edit Client form, plus a redesigned "Recent Clients" dashboard widget that shows each client as a circular avatar with name/location captioned underneath.

No image-upload pattern exists anywhere in `mystudiobee` today (no Storage bucket, no upload route) — this introduces the first one, using Supabase Storage directly from the browser client.

---

## Scope

- Add a nullable `avatar_url` column to `clients`.
- Add a public Supabase Storage bucket (`client-avatars`) for the images, with RLS restricting writes to authenticated billing-role users.
- Build one reusable `ClientAvatar` component (image or colored-initials fallback) used in all four surfaces below.
- Wire avatar **upload** into: clients list (inline, hover-to-upload), client detail page, and the Add/Edit Client form.
- Wire avatar **display only** (no upload) into the dashboard "Recent Clients" widget, which is also restructured from a vertical row-list into a grid of chips (circle on top, name + city centered below).
- **Not building:** cleanup of the previous file in Storage when an avatar is replaced (accepted low-cost tradeoff, avoids added complexity/race conditions — revisit later if storage bloat becomes a real problem). No image cropping tool — images are rendered with CSS `object-fit: cover` centered, no client-side crop UI.

---

## Data Model

New migration `0025_client_avatars.sql` (additive, non-destructive, matches `0022`-`0024` convention):

```sql
alter table clients add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('client-avatars', 'client-avatars', true)
on conflict (id) do nothing;

-- Public read (avatars are displayed via public URL in the UI, no sensitive data)
create policy "Public read client avatars"
on storage.objects for select
using (bucket_id = 'client-avatars');

-- Authenticated billing-role users can upload/replace/delete
create policy "Billing role manage client avatars"
on storage.objects for insert
with check (bucket_id = 'client-avatars' and auth.role() = 'authenticated');

create policy "Billing role update client avatars"
on storage.objects for update
using (bucket_id = 'client-avatars' and auth.role() = 'authenticated');

create policy "Billing role delete client avatars"
on storage.objects for delete
using (bucket_id = 'client-avatars' and auth.role() = 'authenticated');
```

(Exact role check aligned with whatever `requireBillingRole()` already enforces at the app layer — the Storage policy is a coarse authenticated-only backstop, since fine-grained role checks happen in the server action before the client is ever allowed to reach the upload call.)

---

## `ClientAvatar` Component

New file `src/components/clients/client-avatar.tsx`, built on the existing (currently unused) shadcn `Avatar` / `AvatarImage` / `AvatarFallback` (`src/components/ui/avatar.tsx`):

- Props: `{ name: string; avatarUrl?: string | null; size?: 'sm' | 'md' | 'lg'; editable?: boolean; onUpload?: (file: File) => void }`
- Sizes: `sm` ~32px (clients list rows), `md` ~48px (dashboard chips), `lg` ~64px (client detail header).
- If `avatarUrl` is set, renders `AvatarImage` (`object-fit: cover`).
- Otherwise renders `AvatarFallback` with initials (first letter of the first two words of `name`) on a background color deterministically selected from the app's existing 5-color chart palette (`--chart-1`…`--chart-5` in `globals.css`, already the brand blue + derived tones) — hashed from the client id so a given client always gets the same color.
- When `editable`, wraps the avatar in a button with a hover overlay (camera icon, `opacity-0 group-hover:opacity-100` transition — matches the "only animate transform/opacity" rule), triggers a hidden `<input type="file" accept="image/jpeg,image/png,image/webp,image/gif">`, and calls `onUpload(file)` after client-side validation (type allowlist, 5MB max — reject with an inline error otherwise).

---

## Upload Flow

1. User picks a file via the hidden input (validated client-side: type + ≤5MB).
2. Browser Supabase client (`src/lib/supabase/client.ts`) uploads to `client-avatars/{clientId}/{crypto.randomUUID()}.{ext}`.
3. `getPublicUrl()` retrieves the public URL.
4. New server action `updateClientAvatar(clientId: string, avatarUrl: string)` added to `src/lib/actions/clients.ts` (same `requireBillingRole()` guard as `upsertClient`) updates `clients.avatar_url` and calls `revalidatePath('/')`, `revalidatePath('/clients')`, `revalidatePath('/clients/[id]', 'page')`.
5. UI updates optimistically (local state) while the action resolves; on failure, show a toast error and revert to the previous avatar.

For the **Add Client** flow specifically (client doesn't have an id until saved): the form lets the user pick a file first (shown as a live local preview, or initials from the typed name if none picked). On submit, `upsertClient` runs first to obtain/confirm the id (same as today), then if a file was picked, the upload + `updateClientAvatar` call runs immediately after. Same code path is reused for edit (file picked while editing an existing client with an id already available).

---

## Where It's Wired In

- **Dashboard "Recent Clients"** (`src/app/(app)/page.tsx:334-364`): replaces the current `space-y-1` vertical row-list with a grid (`grid grid-cols-3 sm:grid-cols-4 gap-4`, wraps to multiple rows). Each chip is the existing `<Link href="/clients/{id}">`, now containing a centered `ClientAvatar` (`md`, not `editable`) above the name and city, both centered and truncated. `EmptyState` behavior for zero clients is unchanged.
- **Clients list** (`src/app/(app)/clients/clients-client.tsx:57-88`): `ClientAvatar` (`sm`, `editable`) added as the leading element inside each existing row, before the `min-w-0 flex-1` name/city block. Since the row itself is a `<Link>`, the avatar's click handler calls `preventDefault()`/`stopPropagation()` so clicking it opens the file picker instead of navigating to the client.
- **Client detail page** (`src/app/(app)/clients/[id]/client-detail-client.tsx`, header row ~lines 68-92): `ClientAvatar` (`lg`, `editable`) added beside the client name/"Client details" heading.
- **Add/Edit Client form** (`src/app/(app)/clients/client-form-sheet.tsx`): an avatar picker added at the top of the sheet, above the `name` field — live preview of the picked file, or initials from the currently-typed name if nothing picked yet. `handleSave` sequences `upsertClient` then (if a file was picked) upload + `updateClientAvatar`, as described above.

---

## Error Handling

- Invalid file type or size >5MB: rejected client-side before any network call, inline error text near the avatar.
- Upload failure (network/Storage error): toast error, avatar state reverts to the previous value (or initials fallback if there was none).
- `updateClientAvatar` failure after a successful Storage upload: toast error; the uploaded file remains orphaned in Storage (acceptable — same tradeoff as the no-cleanup-on-replace scope cut above).

---

## Out of Scope / Explicit Cuts

- No deletion of the previous avatar file from Storage when replaced.
- No image cropping/editing UI — `object-fit: cover` handles framing.
- No avatar support on the dashboard widget beyond display (upload only via list/detail/form).
- No bulk avatar import/export.
