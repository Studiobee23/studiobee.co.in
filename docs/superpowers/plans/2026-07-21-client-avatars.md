# Client Avatars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client profile images across the `mystudiobee` app: a dashboard "Recent Clients" grid of circular avatar chips, upload support on the clients list and client detail page, colored-initials placeholders when no image exists, and an avatar picker in the Add/Edit Client form.

**Architecture:** One new DB column (`clients.avatar_url`) + one new public Supabase Storage bucket (`client-avatars`) with role-scoped RLS. A single reusable `ClientAvatar` presentational component (image-or-initials, optional edit affordance) is composed into four call sites. Two small pure-function modules (initials/color hashing, file validation) carry the only unit-testable logic — everything else is UI wiring verified by running the dev server, matching this codebase's existing test coverage (one `vitest` suite for pure engine logic, no component-testing framework installed).

**Tech Stack:** Next.js App Router (`mystudiobee`), Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Supabase Storage, shadcn/Radix `Avatar` primitive, Tailwind v4, `sonner` toasts, `vitest`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-client-avatars-design.md`.
- Images accepted: `image/jpeg`, `image/png`, `image/webp`, `image/gif` only, max 5MB — enforced client-side before any upload.
- No cropping UI — images render via `object-fit: cover`, centered.
- No cleanup of the previous file in Storage when an avatar is replaced (accepted tradeoff).
- Upload happens directly from the browser to Supabase Storage (no new API route); persisting the URL to `clients.avatar_url` goes through a server action (`updateClientAvatar`), same auth pattern as `upsertClient` (`requireBillingRole()`).
- Colored-initials fallback uses the app's existing chart palette (`--chart-1`…`--chart-5` in `src/app/globals.css`) — restricted to `chart-1`, `chart-2`, `chart-5` (excludes `chart-4`, too light for white text contrast, and `chart-3`, near-black and low-contrast against the dark-mode card background).
- This repo has no local Supabase CLI project link (no `supabase/config.toml`) — the migration in Task 1 must be applied directly to the project's hosted Supabase instance (SQL Editor, or `supabase db push` if you have it linked), same as migrations `0022`–`0024` before it.

---

### Task 1: Database migration — `avatar_url` column + Storage bucket + RLS

**Files:**
- Create: `mystudiobee/supabase/migrations/0025_client_avatars.sql`

**Interfaces:**
- Produces: `clients.avatar_url` (`text`, nullable) and a public Storage bucket `client-avatars`, readable by anyone, writable only by `owner`/`admin`/`manager` profiles. All later tasks depend on this column and bucket existing.

- [ ] **Step 1: Write the migration**

```sql
-- Client profile images: nullable avatar_url on clients, a public Storage
-- bucket to hold the files, and RLS restricting writes to billing-role
-- users (owner/admin/manager) — matches the requireBillingRole() check
-- already enforced by upsertClient/updateClientAvatar server actions.
-- Public read is fine: these are just client photos/logos, not sensitive.
alter table clients add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('client-avatars', 'client-avatars', true)
on conflict (id) do nothing;

create policy "Public read client avatars"
on storage.objects for select
using (bucket_id = 'client-avatars');

create policy "Billing role insert client avatars"
on storage.objects for insert
with check (
  bucket_id = 'client-avatars'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);

create policy "Billing role update client avatars"
on storage.objects for update
using (
  bucket_id = 'client-avatars'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);

create policy "Billing role delete client avatars"
on storage.objects for delete
using (
  bucket_id = 'client-avatars'
  and exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('owner', 'admin', 'manager')
  )
);
```

- [ ] **Step 2: Apply the migration to the Supabase project**

This repo has no local Supabase CLI project link, so apply it directly: open the Supabase dashboard SQL Editor for this project, paste the file contents, and run it. (If you do have the project linked locally, `supabase db push` works too.)

- [ ] **Step 3: Verify**

Run in the same SQL Editor:

```sql
select column_name from information_schema.columns where table_name = 'clients' and column_name = 'avatar_url';
select id, public from storage.buckets where id = 'client-avatars';
```

Expected: first query returns one row (`avatar_url`), second returns one row with `public = true`.

- [ ] **Step 4: Commit**

```bash
git add mystudiobee/supabase/migrations/0025_client_avatars.sql
git commit -m "feat(mystudiobee): add clients.avatar_url column and client-avatars storage bucket"
```

---

### Task 2: Initials + color-hash helpers

**Files:**
- Create: `mystudiobee/src/lib/clients/avatar-style.ts`
- Test: `mystudiobee/src/lib/clients/avatar-style.test.ts`

**Interfaces:**
- Produces: `getInitials(name: string): string`, `getAvatarColorClass(name: string): string` (returns one of `"bg-chart-1"`, `"bg-chart-2"`, `"bg-chart-5"`). Consumed by the `ClientAvatar` component in Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// mystudiobee/src/lib/clients/avatar-style.test.ts
import { describe, it, expect } from "vitest";
import { getInitials, getAvatarColorClass } from "./avatar-style";

describe("getInitials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(getInitials("Acme Corp")).toBe("AC");
  });

  it("takes the first two letters of a single word", () => {
    expect(getInitials("Acme")).toBe("AC");
  });

  it("falls back to ? for an empty or whitespace-only name", () => {
    expect(getInitials("   ")).toBe("?");
  });

  it("ignores extra whitespace between words", () => {
    expect(getInitials("  Bloom   Studio  ")).toBe("BS");
  });
});

describe("getAvatarColorClass", () => {
  const KNOWN_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-5"];

  it("always returns the same class for the same name", () => {
    expect(getAvatarColorClass("Acme Corp")).toBe(getAvatarColorClass("Acme Corp"));
  });

  it("returns one of the known chart color classes", () => {
    expect(KNOWN_CLASSES).toContain(getAvatarColorClass("Some Client"));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mystudiobee && npx vitest run src/lib/clients/avatar-style.test.ts`
Expected: FAIL — `Cannot find module './avatar-style'`

- [ ] **Step 3: Write the implementation**

```ts
// mystudiobee/src/lib/clients/avatar-style.ts
const AVATAR_COLOR_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-5"];

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getAvatarColorClass(name: string): string {
  const sum = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_CLASSES[sum % AVATAR_COLOR_CLASSES.length];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mystudiobee && npx vitest run src/lib/clients/avatar-style.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add mystudiobee/src/lib/clients/avatar-style.ts mystudiobee/src/lib/clients/avatar-style.test.ts
git commit -m "feat(mystudiobee): add client avatar initials/color-hash helpers"
```

---

### Task 3: File validation helper

**Files:**
- Create: `mystudiobee/src/lib/clients/avatar-validation.ts`
- Test: `mystudiobee/src/lib/clients/avatar-validation.test.ts`

**Interfaces:**
- Produces: `ALLOWED_AVATAR_TYPES: string[]`, `MAX_AVATAR_BYTES: number`, `validateAvatarFile(file: File): string | null` (returns an error message, or `null` if the file is valid). Consumed by `ClientAvatar` (Task 5) for immediate rejection feedback, and by nothing else — kept in its own zero-dependency module so it can be unit tested without pulling in the Next.js server-action/Supabase modules from Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// mystudiobee/src/lib/clients/avatar-validation.test.ts
import { describe, it, expect } from "vitest";
import { validateAvatarFile, MAX_AVATAR_BYTES } from "./avatar-validation";

function makeFile(sizeBytes: number, type: string, name = "avatar.png") {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("validateAvatarFile", () => {
  it("accepts a small png", () => {
    expect(validateAvatarFile(makeFile(1024, "image/png"))).toBeNull();
  });

  it("accepts jpeg, webp, and gif", () => {
    expect(validateAvatarFile(makeFile(1024, "image/jpeg"))).toBeNull();
    expect(validateAvatarFile(makeFile(1024, "image/webp"))).toBeNull();
    expect(validateAvatarFile(makeFile(1024, "image/gif"))).toBeNull();
  });

  it("rejects a non-image type", () => {
    expect(validateAvatarFile(makeFile(1024, "application/pdf"))).toMatch(/JPG|PNG|WEBP|GIF/i);
  });

  it("rejects a file over 5MB", () => {
    expect(validateAvatarFile(makeFile(MAX_AVATAR_BYTES + 1, "image/png"))).toMatch(/5MB/);
  });

  it("accepts a file exactly at the 5MB limit", () => {
    expect(validateAvatarFile(makeFile(MAX_AVATAR_BYTES, "image/png"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd mystudiobee && npx vitest run src/lib/clients/avatar-validation.test.ts`
Expected: FAIL — `Cannot find module './avatar-validation'`

- [ ] **Step 3: Write the implementation**

```ts
// mystudiobee/src/lib/clients/avatar-validation.ts
export const ALLOWED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function validateAvatarFile(file: File): string | null {
  if (!ALLOWED_AVATAR_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, WEBP, or GIF image.";
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return "Image must be 5MB or smaller.";
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mystudiobee && npx vitest run src/lib/clients/avatar-validation.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add mystudiobee/src/lib/clients/avatar-validation.ts mystudiobee/src/lib/clients/avatar-validation.test.ts
git commit -m "feat(mystudiobee): add client avatar file validation"
```

---

### Task 4: `updateClientAvatar` server action + upload helper

**Files:**
- Modify: `mystudiobee/src/lib/actions/clients.ts`
- Create: `mystudiobee/src/lib/clients/avatar-upload.ts`

**Interfaces:**
- Consumes: `ALLOWED_AVATAR_TYPES` is not needed here (upload trusts the caller already validated via Task 3); `createClient` (browser) from `@/lib/supabase/client`; `requireBillingRole`, `createClient` (server), `revalidatePath` already used in `clients.ts`.
- Produces: `updateClientAvatar(id: string, avatarUrl: string): Promise<void>` (exported from `src/lib/actions/clients.ts`), `uploadAndSetClientAvatar(clientId: string, file: File): Promise<string>` (exported from `src/lib/clients/avatar-upload.ts`, returns the new public URL). Also adds `avatar_url?: string | null` to the existing `ClientInput` type. Consumed by Tasks 6–9.

- [ ] **Step 1: Add `avatar_url` to `ClientInput` and add `updateClientAvatar`**

In `mystudiobee/src/lib/actions/clients.ts`, update the `ClientInput` type (existing lines 43-56) to add one field:

```ts
export type ClientInput = {
  id?: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
  tags?: string[];
  lead_source?: string;
  avatar_url?: string | null;
};
```

Then add this new function after `upsertClient` (existing lines 58-88):

```ts
export async function updateClientAvatar(id: string, avatarUrl: string) {
  await requireBillingRole();
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ avatar_url: avatarUrl }).eq("id", id);
  if (error) throw new Error(error.message);
  try { revalidatePath("/"); } catch { /* ignore */ }
  try { revalidatePath("/clients"); } catch { /* ignore */ }
  try { revalidatePath(`/clients/${id}`); } catch { /* ignore */ }
}
```

- [ ] **Step 2: Write the upload helper**

```ts
// mystudiobee/src/lib/clients/avatar-upload.ts
import { createClient } from "@/lib/supabase/client";
import { updateClientAvatar } from "@/lib/actions/clients";

export async function uploadAndSetClientAvatar(clientId: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${clientId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("client-avatars")
    .upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data } = supabase.storage.from("client-avatars").getPublicUrl(path);
  await updateClientAvatar(clientId, data.publicUrl);
  return data.publicUrl;
}
```

- [ ] **Step 3: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mystudiobee/src/lib/actions/clients.ts mystudiobee/src/lib/clients/avatar-upload.ts
git commit -m "feat(mystudiobee): add updateClientAvatar action and browser upload helper"
```

---

### Task 5: `ClientAvatar` component

**Files:**
- Create: `mystudiobee/src/components/clients/client-avatar.tsx`

**Interfaces:**
- Consumes: `getInitials`, `getAvatarColorClass` from `@/lib/clients/avatar-style` (Task 2); `validateAvatarFile` from `@/lib/clients/avatar-validation` (Task 3); `Avatar`, `AvatarImage`, `AvatarFallback` from `@/components/ui/avatar`; `cn` from `@/lib/utils`.
- Produces: `ClientAvatar` component, props `{ name: string; avatarUrl?: string | null; size?: "sm" | "md" | "lg"; editable?: boolean; uploading?: boolean; onFileSelected?: (file: File) => void }`. Consumed by Tasks 6–9. Sizes: `sm` = 32px (list rows), `md` = 48px (dashboard chips), `lg` = 64px (detail header, form).

- [ ] **Step 1: Write the component**

```tsx
// mystudiobee/src/components/clients/client-avatar.tsx
"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getInitials, getAvatarColorClass } from "@/lib/clients/avatar-style";
import { validateAvatarFile } from "@/lib/clients/avatar-validation";

const SIZE_CONFIG = {
  sm: { box: "h-8 w-8", text: "text-[10px]", icon: "h-3 w-3" },
  md: { box: "h-12 w-12", text: "text-sm", icon: "h-4 w-4" },
  lg: { box: "h-16 w-16", text: "text-base", icon: "h-5 w-5" },
} as const;

export function ClientAvatar({
  name,
  avatarUrl,
  size = "sm",
  editable = false,
  uploading = false,
  onFileSelected,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
  uploading?: boolean;
  onFileSelected?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { box, text, icon } = SIZE_CONFIG[size];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onFileSelected?.(file);
  }

  const avatarNode = (
    <Avatar className={box}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className={cn(box, text, "text-white", getAvatarColorClass(name))}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!editable) return avatarNode;

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        aria-label={`Change photo for ${name}`}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative rounded-full disabled:cursor-not-allowed"
      >
        {avatarNode}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
            uploading && "opacity-100"
          )}
        >
          {uploading ? (
            <Loader2 className={cn(icon, "animate-spin text-white")} />
          ) : (
            <Camera className={cn(icon, "text-white")} />
          )}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />
      {error && (
        <p className="mt-1 max-w-[6rem] text-center text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mystudiobee/src/components/clients/client-avatar.tsx
git commit -m "feat(mystudiobee): add reusable ClientAvatar component"
```

---

### Task 6: Wire into the dashboard "Recent Clients" grid

**Files:**
- Modify: `mystudiobee/src/app/(app)/page.tsx:16` (imports), `:40` (select), `:334-364` (render)

**Interfaces:**
- Consumes: `ClientAvatar` (Task 5, non-`editable`, `size="md"`).

- [ ] **Step 1: Add the import**

In `mystudiobee/src/app/(app)/page.tsx`, after line 16 (`import { DashboardHeader } from "@/components/layout/dashboard-header";`), add:

```tsx
import { ClientAvatar } from "@/components/clients/client-avatar";
```

- [ ] **Step 2: Add `avatar_url` to the recent-clients query**

Change line 40 from:

```tsx
supabase.from("clients").select("id, name, city, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
```

to:

```tsx
supabase.from("clients").select("id, name, city, avatar_url, created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(5),
```

- [ ] **Step 3: Replace the row-list with a grid of chips**

Replace the existing block (lines 344-363):

```tsx
{!recentClients?.length ? (
  <EmptyState icon={Users} text="No clients yet" />
) : (
  <div className="space-y-1">
    {recentClients.map((c) => (
      <Link
        key={c.id}
        href={`/clients/${c.id}`}
        className="flex items-center gap-3 rounded-lg p-3 transition-colors duration-100 hover:bg-muted/60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium">{c.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {c.city || "—"}
          </p>
        </div>
      </Link>
    ))}
  </div>
)}
```

with:

```tsx
{!recentClients?.length ? (
  <EmptyState icon={Users} text="No clients yet" />
) : (
  <div className="grid grid-cols-3 gap-4 sm:grid-cols-4">
    {recentClients.map((c) => (
      <Link
        key={c.id}
        href={`/clients/${c.id}`}
        className="flex flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors duration-100 hover:bg-muted/60"
      >
        <ClientAvatar name={c.name} avatarUrl={c.avatar_url} size="md" />
        <div className="min-w-0 w-full">
          <p className="truncate text-xs font-medium">{c.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{c.city || "—"}</p>
        </div>
      </Link>
    ))}
  </div>
)}
```

- [ ] **Step 4: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run: `cd mystudiobee && npm run dev`, open `http://localhost:3000/` (or the app's dashboard route) as a billing-role user.
Expected: "Recent Clients" card shows a grid of circular chips (colored initials, since no client has an image yet), each with name + city centered underneath, wrapping to a new row past 3-4 clients. Clicking a chip navigates to `/clients/[id]`.

- [ ] **Step 6: Commit**

```bash
git add "mystudiobee/src/app/(app)/page.tsx"
git commit -m "feat(mystudiobee): show client avatars in dashboard Recent Clients grid"
```

---

### Task 7: Wire into the clients list (inline upload)

**Files:**
- Modify: `mystudiobee/src/app/(app)/clients/page.tsx:20` (select)
- Modify: `mystudiobee/src/app/(app)/clients/clients-client.tsx` (full row rework)

**Interfaces:**
- Consumes: `ClientAvatar` (Task 5, `editable`, `size="sm"`), `uploadAndSetClientAvatar` (Task 4).

- [ ] **Step 1: Add `avatar_url` to the clients list query**

In `mystudiobee/src/app/(app)/clients/page.tsx`, change line 20 from:

```tsx
.select("id, name, contact_person, email, phone, city, tags")
```

to:

```tsx
.select("id, name, contact_person, email, phone, city, tags, avatar_url")
```

- [ ] **Step 2: Rewrite `clients-client.tsx`**

Replace the full file with:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientFormSheet } from "./client-form-sheet";
import { ClientAvatar } from "@/components/clients/client-avatar";
import { uploadAndSetClientAvatar } from "@/lib/clients/avatar-upload";

type Client = {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  city: string;
  tags: string[];
  avatar_url: string | null;
};

export function ClientsClient({
  clients,
  initialQuery,
  openNewOnLoad,
}: {
  clients: Client[];
  initialQuery: string;
  openNewOnLoad: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [open, setOpen] = useState(openNewOnLoad);
  const [avatars, setAvatars] = useState<Record<string, string>>({});
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(q ? `/clients?q=${encodeURIComponent(q)}` : "/clients");
  }

  async function handleAvatarUpload(clientId: string, file: File) {
    setUploadingId(clientId);
    try {
      const url = await uploadAndSetClientAvatar(clientId, file);
      setAvatars((a) => ({ ...a, [clientId]: url }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to upload image");
    } finally {
      setUploadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <form onSubmit={handleSearch} className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients…"
            className="pl-8"
          />
        </form>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Add client
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-card">
        {clients.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No clients yet.</div>
        ) : (
          <div className="divide-y divide-border">
            {clients.map((c) => (
              <div
                key={c.id}
                className="relative flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-muted/50"
              >
                <Link href={`/clients/${c.id}`} className="absolute inset-0" aria-label={c.name} />
                <div className="relative z-10">
                  <ClientAvatar
                    name={c.name}
                    avatarUrl={avatars[c.id] ?? c.avatar_url}
                    size="sm"
                    editable
                    uploading={uploadingId === c.id}
                    onFileSelected={(file) => handleAvatarUpload(c.id, file)}
                  />
                </div>
                <div className="relative z-10 min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-snug">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.contact_person || c.email || c.phone || "—"} {c.city ? `· ${c.city}` : ""}
                  </p>
                </div>
                {c.tags?.length > 0 && (
                  <div className="relative z-10 flex gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <ClientFormSheet
        open={open}
        onOpenChange={setOpen}
        onSaved={(id) => { setOpen(false); router.push(`/clients/${id}`); }}
      />
    </div>
  );
}
```

Note: the row is now a `<div>` (not `<Link>`) containing an absolutely-positioned full-cover `<Link>` for navigation, with the avatar/text/badges as `position: relative` siblings placed after it in the markup — so they paint above the link and remain independently clickable, while clicking anywhere else in the row still navigates. This avoids nesting a `<button>` (the avatar's upload trigger) inside an `<a>`, which is invalid HTML.

- [ ] **Step 3: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `cd mystudiobee && npm run dev`, open `/clients`.
Expected: each row shows a small circular avatar (colored initials) before the name. Hovering it shows a camera icon overlay. Clicking it opens a file picker (does NOT navigate). Selecting a valid image uploads it (spinner shows briefly), and the row's avatar updates to the uploaded photo without a full page reload. Selecting an oversized or non-image file shows the inline error message and does not upload. Clicking anywhere else in the row still navigates to `/clients/[id]`.

- [ ] **Step 5: Commit**

```bash
git add "mystudiobee/src/app/(app)/clients/page.tsx" "mystudiobee/src/app/(app)/clients/clients-client.tsx"
git commit -m "feat(mystudiobee): add inline avatar upload to clients list"
```

---

### Task 8: Wire into the client detail page

**Files:**
- Modify: `mystudiobee/src/app/(app)/clients/[id]/client-detail-client.tsx`

**Interfaces:**
- Consumes: `ClientAvatar` (Task 5, `editable`, `size="lg"`), `uploadAndSetClientAvatar` (Task 4), `client.avatar_url` (now typed via `ClientInput.avatar_url`, Task 4).

- [ ] **Step 1: Add imports and avatar state**

In `mystudiobee/src/app/(app)/clients/[id]/client-detail-client.tsx`, add to the imports (after line 9, `import { deleteClient } from "@/lib/actions/clients";`):

```tsx
import { ClientAvatar } from "@/components/clients/client-avatar";
import { uploadAndSetClientAvatar } from "@/lib/clients/avatar-upload";
```

After the existing state (line 36, `const [pending, startTransition] = useTransition();`), add:

```tsx
const [avatarUrl, setAvatarUrl] = useState<string | null>(client.avatar_url ?? null);
const [uploadingAvatar, setUploadingAvatar] = useState(false);

async function handleAvatarUpload(file: File) {
  setUploadingAvatar(true);
  try {
    const url = await uploadAndSetClientAvatar(client.id, file);
    setAvatarUrl(url);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Failed to upload image");
  } finally {
    setUploadingAvatar(false);
  }
}
```

- [ ] **Step 2: Rework the "Client details" card header**

Replace the existing header block (lines 69-92):

```tsx
<div className="mb-4 flex items-center justify-between">
  <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.08em]">
    Client details
  </h3>
  {!isBinned && (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setEditOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={pending}
          className="flex items-center gap-1 text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      )}
    </div>
  )}
</div>
```

with:

```tsx
<div className="mb-4 flex items-center gap-3">
  <ClientAvatar
    name={client.name}
    avatarUrl={avatarUrl}
    size="lg"
    editable={!isBinned}
    uploading={uploadingAvatar}
    onFileSelected={handleAvatarUpload}
  />
  <div className="min-w-0 flex-1">
    <p className="truncate font-heading text-base font-semibold">{client.name}</p>
    <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      Client details
    </p>
  </div>
  {!isBinned && (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setEditOpen(true)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3 w-3" /> Edit
      </button>
      {canDelete && (
        <button
          onClick={handleDelete}
          disabled={pending}
          className="flex items-center gap-1 text-xs font-medium text-destructive hover:text-destructive/80 disabled:opacity-50"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 3: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run: `cd mystudiobee && npm run dev`, open any `/clients/[id]`.
Expected: a large avatar (colored initials, or the photo uploaded from the list in Task 7 if you tested the same client) appears beside the client's name, above the "Client details" label. Hovering shows the camera overlay; clicking it and picking a valid image uploads and updates immediately with a spinner during upload. On a binned client, the avatar is not editable (no hover overlay, click does nothing).

- [ ] **Step 5: Commit**

```bash
git add "mystudiobee/src/app/(app)/clients/[id]/client-detail-client.tsx"
git commit -m "feat(mystudiobee): add avatar upload to client detail page"
```

---

### Task 9: Wire into the Add/Edit Client form

**Files:**
- Modify: `mystudiobee/src/app/(app)/clients/client-form-sheet.tsx`

**Interfaces:**
- Consumes: `ClientAvatar` (Task 5, `editable`, `size="lg"`), `uploadAndSetClientAvatar` (Task 4).

- [ ] **Step 1: Add imports and avatar file state**

In `mystudiobee/src/app/(app)/clients/client-form-sheet.tsx`, add to the imports (after line 17, `import { upsertClient, type ClientInput } from "@/lib/actions/clients";`):

```tsx
import { ClientAvatar } from "@/components/clients/client-avatar";
import { uploadAndSetClientAvatar } from "@/lib/clients/avatar-upload";
```

Add new state after line 45 (`const [customLeadSource, setCustomLeadSource] = useState(false);`):

```tsx
const [avatarFile, setAvatarFile] = useState<File | null>(null);
const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
```

- [ ] **Step 2: Reset avatar state alongside the form on open/close**

Replace the existing effect (lines 47-51):

```tsx
useEffect(() => {
  const next = client ?? { name: "" };
  setForm(next);
  setCustomLeadSource(!!next.lead_source && !LEAD_SOURCES.includes(next.lead_source));
}, [client, open]);
```

with:

```tsx
useEffect(() => {
  const next = client ?? { name: "" };
  setForm(next);
  setCustomLeadSource(!!next.lead_source && !LEAD_SOURCES.includes(next.lead_source));
  setAvatarFile(null);
  setAvatarPreviewUrl((prev) => {
    if (prev) URL.revokeObjectURL(prev);
    return null;
  });
}, [client, open]);
```

- [ ] **Step 3: Add the file-select handler and wire it into save**

Add this function after `set` (existing lines 53-55):

```tsx
function handleAvatarFileSelected(file: File) {
  setAvatarPreviewUrl((prev) => {
    if (prev) URL.revokeObjectURL(prev);
    return URL.createObjectURL(file);
  });
  setAvatarFile(file);
}
```

Replace `handleSave` (existing lines 57-70):

```tsx
async function handleSave() {
  if (!form.name) return;
  setLoading(true);
  try {
    const id = await upsertClient(form);
    if (avatarFile) {
      try {
        await uploadAndSetClientAvatar(id, avatarFile);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Client saved, but the photo failed to upload");
      }
    }
    toast.success(client?.id ? "Client updated" : "Client added");
    onOpenChange(false);
    onSaved(id);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Failed to save client");
  } finally {
    setLoading(false);
  }
}
```

- [ ] **Step 4: Add the avatar picker to the form JSX**

In the JSX, right after `</SheetHeader>` (existing line 77) and before `<div className="space-y-3 px-4">` (existing line 78), add:

```tsx
<div className="flex justify-center px-4 pt-2">
  <ClientAvatar
    name={form.name || "New Client"}
    avatarUrl={avatarPreviewUrl ?? form.avatar_url ?? null}
    size="lg"
    editable
    onFileSelected={handleAvatarFileSelected}
  />
</div>
```

- [ ] **Step 5: Typecheck**

Run: `cd mystudiobee && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run: `cd mystudiobee && npm run dev`, open `/clients`, click "Add client".
Expected: a large avatar picker appears at the top of the sheet, showing colored initials that update live as you type the name (until a photo is picked). Picking a valid image swaps in a local preview immediately (no network call yet, no spinner). Saving creates the client, then uploads the picked photo, and the new client (in the list/dashboard) shows the uploaded photo. Repeat on an existing client via "Edit" — the current photo (or initials) preloads, and swapping it updates immediately after save. Closing and reopening the sheet without saving discards the picked file.

- [ ] **Step 7: Commit**

```bash
git add "mystudiobee/src/app/(app)/clients/client-form-sheet.tsx"
git commit -m "feat(mystudiobee): add avatar picker to Add/Edit client form"
```

---

## Final Verification

- [ ] Run the full test suite: `cd mystudiobee && npm test` — expect all suites (including the 3 new avatar tests plus the pre-existing `costing/engine.test.ts`) to pass.
- [ ] Run `cd mystudiobee && npx tsc --noEmit` from a clean state — expect no errors.
- [ ] Manual end-to-end pass: create a new client with a photo → appears with photo in list, detail, and dashboard grid. Create a second client without a photo → shows colored initials consistently across all three surfaces, with a different color than the first client (unless the hash collides, which is expected/acceptable). Upload a >5MB or non-image file anywhere → rejected with inline error, nothing uploaded.
