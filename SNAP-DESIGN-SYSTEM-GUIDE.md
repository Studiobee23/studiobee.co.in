# SNAP Design System — Portable Build Guide

> **Audience:** an AI agent (or developer) building a *new, separate* app that
> should look and feel like SNAP.
> **Goal:** copy this file into the new repo and you have everything needed to
> reproduce SNAP's UI/UX from a blank Next.js project — exact tokens, fonts,
> the app shell, and copy-paste component recipes.
>
> This is **self-contained**. It does not reference SNAP's internal file paths
> or modules. Everything below is extracted verbatim from the production SNAP
> codebase (Next.js 15 + Tailwind v4 + shadcn/ui new-york).

---

## 0. The North Star (read first)

SNAP looks like a **calm, dense, professional operations console** — not a
marketing site, not a generic SaaS template. The feel comes from a handful of
deliberate choices. If you internalize these five, everything else follows:

1. **Deep-purple chrome, white workspace.** A dark gradient sidebar (`#3A1D51`)
   frames a soft off-white canvas (`#F7F6F9`) full of crisp white cards. The
   color almost never appears in the content area — it lives in the chrome.
2. **Inverted type weight.** *Larger text is lighter; smaller text is heavier.*
   Big numbers are `font-semibold`, never bold. Tiny labels are `font-semibold
   uppercase` with wide tracking. This single rule is the strongest part of the
   signature.
3. **Two fonts, clear jobs.** Inter for body/UI, Manrope for headings and
   numbers. Headings are small uppercase eyebrows, not big H1s.
4. **One card, one shadow, one radius.** Every surface is a
   `rounded-xl border bg-card shadow-card`. The shadow is a custom, barely-there
   purple-neutral — **never** Tailwind's default `shadow-md/lg`.
5. **Restraint over decoration.** Motion is a 0.3s fade-up on mount and a
   shadow lift on hover. Status is communicated by small colored dots and pills,
   never by loud fills. Density is high but breathable (`space-y-8`, `p-5`).

Everything in this document exists to serve those five ideas.

---

## 1. Stack & dependencies

The new app should use the same stack for a 1:1 result:

```
Framework:   Next.js 15 (App Router)
Styling:     Tailwind CSS v4 (the @import "tailwindcss" / @theme syntax)
Components:  shadcn/ui — "new-york" style
Icons:       lucide-react
Variants:    class-variance-authority (cva)
Slots:       radix-ui (Slot for asChild)
Fonts:       next/font/google — Inter + Manrope
Merge util:  clsx + tailwind-merge (the `cn()` helper)
Toasts:      sonner
```

Install:

```bash
npm i class-variance-authority clsx tailwind-merge lucide-react sonner radix-ui
# then scaffold shadcn (new-york) and add: button card input badge dialog
# dropdown-menu select tabs tooltip sheet skeleton separator sidebar sonner
npx shadcn@latest init      # choose: new-york, CSS variables: yes
```

The one helper every component depends on:

```ts
// lib/utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`components.json` (shadcn config) — the SNAP settings:

```json
{
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": { "css": "app/globals.css", "baseColor": "neutral", "cssVariables": true },
  "aliases": { "components": "@/components", "utils": "@/lib/utils", "ui": "@/components/ui" }
}
```

---

## 2. Design tokens (`globals.css`) — copy verbatim

This is the heart of the system. Drop this into `app/globals.css`. It defines
the Tailwind v4 `@theme` mapping plus the light and dark token sets. **Every
color in the app reads from these variables — components never hardcode hex.**

```css
@import "tailwindcss";
@import "tw-animate-css";          /* optional: shadcn animation keyframes */

@custom-variant dark (&:is(.dark *));

/* ── Map CSS variables → Tailwind color/utility names ───────────────── */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-inter, var(--font-manrope));
  --font-heading: var(--font-manrope);

  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  /* Sidebar gets its own token family so chrome can differ from content */
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  /* Chart palette (purple + orange family) */
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  /* Radius scale — everything keys off one base */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
}

/* ── LIGHT theme (default) ──────────────────────────────────────────── */
:root {
  --radius: 0.625rem;            /* 10px base radius */
  --background: #f7f6f9;         /* warm purple-gray canvas */
  --foreground: #1e1529;         /* near-black purple ink */
  --card: #ffffff;
  --card-foreground: #1e1529;
  --popover: #ffffff;
  --popover-foreground: #1e1529;
  --primary: #3a1d51;            /* deep purple — brand */
  --primary-foreground: #ffffff;
  --secondary: #f0edf4;
  --secondary-foreground: #1e1529;
  --muted: #f0edf4;             /* light purple — chips, icon wells */
  --muted-foreground: #6b5f7b;   /* muted purple-gray text */
  --accent: #ff864a;            /* warm orange — CTAs, active marker */
  --accent-foreground: #ffffff;
  --destructive: #e5484d;
  --border: #e8e4ee;            /* purple-tinted hairline */
  --input: #e8e4ee;
  --ring: #5b2d80;              /* focus ring */
  --chart-1: #ff864a;
  --chart-2: #6b5f7b;
  --chart-3: #3a1d51;
  --chart-4: #b0a4be;
  --chart-5: #e07a50;
  --sidebar: #3a1d51;           /* matches primary */
  --sidebar-foreground: #f0edf3;
  --sidebar-primary: #ff864a;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #4e2a6e;
  --sidebar-accent-foreground: #f4f3f6;
  --sidebar-border: rgba(255, 255, 255, 0.1);
  --sidebar-ring: #ff864a;
}

/* ── DARK theme (.dark on <html>) ───────────────────────────────────── */
.dark {
  --background: #110d1a;
  --foreground: #f0edf3;
  --card: #1c1528;
  --card-foreground: #f0edf3;
  --popover: #1c1528;
  --popover-foreground: #f0edf3;
  --primary: #9b6fca;
  --primary-foreground: #ffffff;
  --secondary: #251d34;
  --secondary-foreground: #f0edf3;
  --muted: #251d34;
  --muted-foreground: #9b8fb0;
  --accent: #ff864a;
  --accent-foreground: #ffffff;
  --destructive: #e5484d;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.1);
  --ring: #9b6fca;
  --sidebar: #110d1a;
  --sidebar-foreground: #f0edf3;
  --sidebar-primary: #ff864a;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #251d34;
  --sidebar-accent-foreground: #f0edf3;
  --sidebar-border: rgba(255, 255, 255, 0.06);
  --sidebar-ring: #ff864a;
}

/* ── Base layer ─────────────────────────────────────────────────────── */
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "cv02", "cv03", "cv04", "cv11"; /* Inter alternates */
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  /* Custom focus ring — a 2px gap then a 1.5px ring in --ring */
  :focus-visible {
    outline: none !important;
    box-shadow: 0 0 0 2px var(--background), 0 0 0 3.5px var(--ring) !important;
    border-radius: inherit;
  }
  ::selection { background: rgba(91, 45, 128, 0.18); color: inherit; }
}

/* Lock viewport so the shell never page-scrolls (PWA feel) */
html, body { height: 100%; overscroll-behavior: none; }
```

### To re-skin for a different brand

Change **only** the `:root` (and `.dark`) values. Pick your own `--primary`,
`--accent`, `--background`, and the matching `--sidebar` family. Every component
updates instantly because they all read semantic tokens. This is exactly how
SNAP supports per-tenant white-label themes — a CSS-variable swap, zero
component edits.

---

## 3. Shadows, animation & gradient utilities

These are SNAP's custom utilities. Add them to `globals.css`. **Use
`shadow-card` everywhere instead of Tailwind's defaults** — it's what makes
surfaces feel like SNAP rather than Bootstrap.

```css
@layer utilities {
  /* The ONE card shadow — barely-there, two-layer */
  .shadow-card {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 0, 0, 0.03);
  }
  .shadow-card-hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04);
  }
  .shadow-elevated {        /* dialogs, popovers */
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  /* Heading font helper (Manrope) */
  .font-heading {
    font-family: var(--font-manrope), ui-sans-serif, system-ui, sans-serif;
  }

  /* Page enter — fade + 6px rise, on the page content wrapper */
  .animate-in-page { animation: page-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) both; }

  /* Staggered children — put on a grid/list; children fade up in sequence */
  .stagger-children > * { animation: fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both; }
  .stagger-children > *:nth-child(1) { animation-delay: 0.02s; }
  .stagger-children > *:nth-child(2) { animation-delay: 0.04s; }
  .stagger-children > *:nth-child(3) { animation-delay: 0.06s; }
  .stagger-children > *:nth-child(4) { animation-delay: 0.08s; }
  .stagger-children > *:nth-child(5) { animation-delay: 0.10s; }
  .stagger-children > *:nth-child(6) { animation-delay: 0.12s; }
  .stagger-children > *:nth-child(7) { animation-delay: 0.14s; }
  .stagger-children > *:nth-child(8) { animation-delay: 0.16s; }

  /* Hover lift — shadow + border only, NO transform (calm) */
  .hover-lift { transition: box-shadow 0.2s ease, border-color 0.2s ease; }
  .hover-lift:hover {
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  /* The signature sidebar gradient (light wash at top → solid at bottom) */
  .bg-gradient-purple {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--sidebar), white 18%) 0%,
      color-mix(in srgb, var(--sidebar), white 6%) 40%,
      var(--sidebar) 100%
    ) !important;
  }

  /* Full-bleed gradient for auth / login pages */
  .bg-gradient-auth {
    background: linear-gradient(160deg, #7b4aaf 0%, #5b2d80 30%, #3a1d51 65%, #2a1540 100%) !important;
  }
}

@keyframes page-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Thin custom scrollbars (optional but part of the look):

```css
* { scrollbar-width: thin; scrollbar-color: rgba(107, 95, 123, 0.18) transparent; }
*::-webkit-scrollbar { width: 5px; height: 5px; }
*::-webkit-scrollbar-thumb { background: rgba(107, 95, 123, 0.18); border-radius: 100px; }
*::-webkit-scrollbar-thumb:hover { background: rgba(107, 95, 123, 0.35); }
```

---

## 4. Fonts

Two Google fonts via `next/font`, wired in the root layout. Inter is the
default body font; Manrope is `--font-heading`.

```tsx
// app/layout.tsx
import { Manrope, Inter } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}
```

### The typography rule (most important single rule)

> **Larger text = lighter weight. Smaller text = heavier weight.**
> **NEVER** use `font-bold` on anything larger than `text-sm`.
> **NEVER** combine `font-bold` with `font-heading`.

| Role | Classes |
| --- | --- |
| Page / section eyebrow | `text-[11px] font-semibold font-heading uppercase tracking-[0.08em]` |
| Big number / KPI | `text-2xl font-semibold font-heading tracking-tight` |
| Card / stat label | `text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground` |
| List item title | `text-xs font-medium` |
| Body text | `text-sm` (font-normal) |
| Muted / secondary | `text-xs text-muted-foreground` |
| Button text | `text-sm font-medium` (or `text-[13px]` on `sm` buttons) |
| Group nav label | `text-[9px] font-semibold uppercase tracking-[0.14em]` |

The tiny `10/11px` labels with wide `tracking` + the `2xl semibold` numbers are
the typographic fingerprint. Use them liberally.

> Mobile readability: SNAP bumps the smallest hardcoded sizes up ~1–2px under
> `@media (max-width: 640px)` (`text-[10px]`→11px, `text-xs`→13px). Optional but
> recommended — include the media block from `globals.css` if your app is used
> on phones.

---

## 5. Color usage rules

```
✅ bg-primary  text-primary-foreground         deep purple chrome / primary CTA
✅ bg-accent   text-white                       orange — the ONE high-emphasis CTA color
✅ bg-background                                 the app canvas (off-white)
✅ bg-card                                       every surface (white)
✅ border-border                                 every hairline
✅ bg-muted    text-muted-foreground            icon wells, chips, hover states
✅ text-destructive / bg-destructive            errors, delete

❌ bg-[#3A1D51]                  never hardcode hex — use the token
❌ bg-slate-100 / text-gray-500  never use Tailwind grays for chrome — use muted/border
❌ shadow-md / shadow-lg         never — use shadow-card
```

**The one sanctioned exception:** *status* colors (emerald/amber/red/blue) are
intentionally **not** themed — green means "good" in every theme. They appear
only as small dots and pale pills (see §10), never as large fills.

---

## 6. The app shell (sidebar + header + content)

This is the structural skeleton every authenticated page lives inside. It uses
shadcn's `Sidebar` primitives (`SidebarProvider` / `Sidebar` / `SidebarInset`).

```tsx
// app/(app)/layout.tsx
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
```

Lock the shell to the viewport so only the content scrolls (native-app feel) —
add to `globals.css`:

```css
[data-slot="sidebar-wrapper"] { height: 100svh; overflow: hidden; }
[data-slot="sidebar-inset"]   { padding-bottom: env(safe-area-inset-bottom, 0px); }
/* Apply the gradient to the rendered sidebar surface */
[data-slot="sidebar-inner"] {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--sidebar), white 18%) 0%,
    color-mix(in srgb, var(--sidebar), white 6%) 40%,
    var(--sidebar) 100%) !important;
}
```

### 6a. The sidebar

A dark, gradient, grouped nav. Items are grouped under tiny uppercase labels
("Work", "Money", "People"). The active item gets an **orange left marker bar**,
a faint white background, and an orange icon. Everything else is low-opacity
white that brightens on hover.

```tsx
// components/layout/app-sidebar.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CheckSquare, FolderOpen, Package, Receipt,
  Users, Settings, LogOut,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";

type NavEntry = { title: string; href: string; icon: React.ComponentType<{ className?: string }> };

const mainNav: NavEntry[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Tasks", href: "/tasks", icon: CheckSquare },
];
const workNav: NavEntry[] = [
  { title: "Projects", href: "/projects", icon: FolderOpen },
  { title: "Equipment", href: "/equipment", icon: Package },
];
const moneyNav: NavEntry[] = [{ title: "Expenses", href: "/expenses", icon: Receipt }];
const peopleNav: NavEntry[] = [{ title: "Contacts", href: "/contacts", icon: Users }];
const adminNav: NavEntry[] = [{ title: "Settings", href: "/settings", icon: Settings }];

const GROUP_LABEL_CLASS =
  "mb-0 mt-1 px-3 h-4 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/30 leading-none";

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavItem({ item, active }: { item: NavEntry; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <Link
          href={item.href}
          onClick={() => { if (isMobile) setOpenMobile(false); }}
          className={`group/nav relative flex items-center gap-2.5 rounded-md px-3 py-[3px] font-heading text-[13px] tracking-[0.04em] transition-all duration-150 ${
            active
              ? "!bg-white/12 !text-white font-medium"
              : "!text-white/55 font-normal hover:!text-white/85 hover:!bg-white/6"
          }`}
        >
          {active && (
            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-accent" />
          )}
          <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-accent" : ""}`} />
          <span>{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

function Group({ label, items, pathname }: { label?: string; items: NavEntry[]; pathname: string }) {
  if (items.length === 0) return null;
  return (
    <SidebarGroup className={label ? "mt-1" : undefined}>
      {label && <SidebarGroupLabel className={GROUP_LABEL_CLASS}>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu className="space-y-0">
          {items.map((item) => (
            <NavItem key={item.href} item={item} active={isNavActive(pathname, item.href)} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <Sidebar className="bg-gradient-purple">
      <SidebarHeader className="border-b border-white/8 px-5 py-2.5">
        <Link href="/dashboard" className="inline-flex">
          {/* Your wordmark/logo here, in white */}
          <span className="font-heading text-lg font-semibold tracking-tight text-white">SNAP</span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3 py-1.5">
        <Group items={mainNav} pathname={pathname} />
        <Group label="Work" items={workNav} pathname={pathname} />
        <Group label="Money" items={moneyNav} pathname={pathname} />
        <Group label="People" items={peopleNav} pathname={pathname} />
        <Group items={adminNav} pathname={pathname} />
      </SidebarContent>

      <SidebarFooter className="border-t border-white/8 px-3 py-1.5">
        <div className="flex w-full items-center gap-3 rounded-lg px-2 py-0.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold text-white/75">U</div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate text-white/85 leading-tight">User Name</p>
            <p className="text-[10px] text-white/30 truncate leading-tight">user@email.com</p>
          </div>
          <button className="rounded-md p-1.5 transition-colors hover:bg-white/10" title="Sign out">
            <LogOut className="h-3.5 w-3.5 text-white/20 transition-colors hover:text-white/60" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
```

Sidebar detail rules:
- Text is `font-heading` (Manrope), `text-[13px]`, `tracking-[0.04em]`.
- Inactive items live at **`text-white/55`**; hover → `white/85` + `bg-white/6`.
- Active = `bg-white/12` + `text-white` + **orange left bar** + **orange icon**.
- Group labels are `text-[9px]` `white/30` with very wide tracking.
- Header (logo) and footer (user) are separated by `border-white/8` hairlines.

### 6b. The page header

A 56px (`h-14`) sticky bar on white, with a sidebar toggle, a breadcrumb-style
title (small uppercase Manrope), and right-aligned actions.

```tsx
// components/layout/dashboard-header.tsx
"use client";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export function DashboardHeader({ title, children }: { title?: string; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 sm:gap-3 border-b border-border bg-card px-3 sm:px-5">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors" />
      <Separator orientation="vertical" className="mr-0.5 sm:mr-1 !h-4 bg-border" />

      {title && (
        <h1 className="font-heading text-xs font-semibold uppercase tracking-[0.08em] text-foreground truncate min-w-0 shrink">
          {title}
        </h1>
      )}

      {/* Right-aligned actions (notifications, switcher, etc.) */}
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5 shrink-0">{children}</div>
    </header>
  );
}
```

### 6c. The page body wrapper

Every page is: a `DashboardHeader`, then a single scroll container, then a
centered max-width column with vertical rhythm. Memorize this — it's used on
**every** page.

```tsx
export default function SomePage() {
  return (
    <>
      <DashboardHeader title="Tasks" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="animate-in-page mx-auto max-w-6xl space-y-8">
          {/* page content */}
        </div>
      </div>
    </>
  );
}
```

- Scroll container: `flex-1 overflow-y-auto p-4 sm:p-6`
- Content column: `mx-auto max-w-6xl space-y-8` (dashboards use `max-w-7xl`)
- Mount animation: `animate-in-page` on the content column

---

## 7. Core UI components (shadcn, SNAP-tuned)

These are the shadcn primitives with SNAP's exact variant tuning. The important
customizations vs. stock shadcn: `rounded-lg` buttons, an extra **`accent`**
(orange) button variant, `xs` button size, and `rounded-full` badges.

### Button

```tsx
// components/ui/button.tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline: "border bg-card hover:bg-muted hover:border-border",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-accent text-white hover:bg-accent/90 focus-visible:ring-accent/30", // ← the orange CTA
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[13px] has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 rounded-lg px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({ className, variant, size, asChild = false, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
export { Button, buttonVariants };
```

Usage: `default` (purple) for primary actions, **`accent` (orange) for the one
hero CTA per screen**, `outline`/`ghost` for secondary, `link` for inline.

### Card

```tsx
// components/ui/card.tsx — note the baseline: rounded-xl border bg-card shadow-card
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-card", className)}
      {...props}
    />
  );
}
// CardHeader (px-6, gap-1.5), CardTitle (<h3> leading-none font-medium),
// CardDescription (text-sm text-muted-foreground), CardContent (px-6),
// CardFooter (flex items-center px-6) — standard shadcn new-york.
```

> In practice SNAP builds most surfaces as **raw divs** with the card recipe
> (`rounded-xl border border-border bg-card p-5 shadow-card`) rather than the
> `<Card>` component, because it controls padding per use. Both are fine; the
> recipe is the source of truth (see §8).

### Input

```tsx
// components/ui/input.tsx
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}
```

### Badge

```tsx
// components/ui/badge.tsx — rounded-FULL pill, text-xs font-medium
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-white",
        outline: "border-border text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
```

---

## 8. Layout recipes (copy these exactly)

These are the patterns that make new pages indistinguishable from existing ones.

### Stat cards (responsive grid)

```tsx
<div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
  <div className="rounded-xl border border-border bg-card p-4 shadow-card">
    <div className="flex items-center justify-between">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Today's Tasks
      </p>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <CheckSquare className="h-4 w-4" />
      </div>
    </div>
    <p className="mt-2 text-2xl font-semibold font-heading tracking-tight">42</p>
    <p className="mt-1 text-xs text-muted-foreground">assigned to you</p>
  </div>
  {/* …repeat */}
</div>
```

### Content card with header + "View all" link

```tsx
<div className="rounded-xl border border-border bg-card p-5 shadow-card">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-[11px] font-semibold font-heading uppercase tracking-[0.08em]">
      My Tasks
    </h3>
    <Link href="/tasks"
      className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
      View all <ArrowRight className="h-3 w-3" />
    </Link>
  </div>
  {/* content */}
</div>
```

### Clickable list row (the workhorse)

```tsx
<Link href={`/item/${id}`}
  className="group flex items-center gap-3 rounded-lg p-3 transition-all hover:bg-muted/60">
  <div className="h-2 w-2 rounded-full bg-emerald-300" />        {/* status dot */}
  <div className="min-w-0 flex-1">
    <p className="text-xs font-medium truncate">{title}</p>
    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
  </div>
  {/* arrow slides in on hover */}
  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/0 -translate-x-2 transition-all group-hover:text-muted-foreground group-hover:translate-x-0" />
</Link>
```

### Quick-action card (icon left, chevron right)

```tsx
<Link href="/action"
  className="hover-lift group flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card">
  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
    <Icon className="h-4.5 w-4.5" />
  </div>
  <div className="min-w-0 flex-1">
    <p className="text-[10px] font-semibold uppercase tracking-[0.06em]">{label}</p>
    <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
  </div>
  <ChevronRight className="h-4 w-4 text-muted-foreground/0 transition-all group-hover:text-muted-foreground group-hover:translate-x-0.5" />
</Link>
```

### Empty state

```tsx
<div className="flex flex-col items-center gap-3 rounded-xl py-10 text-center">
  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
    <Icon className="h-5 w-5 text-muted-foreground/50" />
  </div>
  <p className="text-sm text-muted-foreground">No items yet</p>
  <Link href="/create" className="text-xs font-medium text-primary hover:underline">
    Create your first item
  </Link>
</div>
```

A denser inline variant (used inside cards) uses a **dashed** border:

```tsx
<div className="rounded-lg border border-dashed border-border py-6 text-center">
  <CheckSquare className="h-5 w-5 mx-auto text-muted-foreground/50" />
  <p className="mt-2 text-xs text-muted-foreground">You're all caught up.</p>
</div>
```

### Loading skeleton

```tsx
{isLoading ? (
  <div className="space-y-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <Skeleton key={i} className="h-12 w-full rounded-lg" />
    ))}
  </div>
) : ( /* … */ )}
```

Always show skeletons matching the shape of the content (stat-card skeletons for
stat grids, row skeletons for lists). Never a full-page spinner.

---

## 9. Icons

```
Library:           lucide-react (only)
In cards / stats:  h-4 w-4
In list rows:      h-3.5 w-3.5
Icon well:         rounded-lg bg-muted text-muted-foreground, h-8 w-8 or h-10 w-10
```

Icons are almost always `text-muted-foreground` inside a muted well, **except**
when they signal status (e.g. a red `AlertTriangle` for overdue) or the active
nav item (orange).

---

## 10. Status colors (dots + pills)

The single source of truth for "what does this state look like." Dots for
compact rows; pale 50/600 pills for emphasis. Define once and reuse:

```ts
// lib/status-colors.ts
export const STATUS_COLORS: Record<string, string> = {
  active: "bg-emerald-300",  pending: "bg-amber-300",  overdue: "bg-red-300",
  completed: "bg-gray-400",  cancelled: "bg-gray-300",
  high: "bg-red-300",        medium: "bg-amber-300",   low: "bg-blue-300",
};

// Pale pill classes — the canonical 50/600 (+ dark 950/400) pattern.
// NEVER use the 100-scale fills; they're too heavy for this system.
export const PRIORITY_BADGE_COLORS: Record<string, string> = {
  high:   "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  medium: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
  low:    "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
};
```

Status pill markup:

```tsx
<span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
  Active
</span>
```

Status dot:

```tsx
<div className={`h-2 w-2 rounded-full ${STATUS_COLORS[status]}`} />
```

Rules: dots use the **300** scale (or **500** when the dot is tiny, ≤1.5px).
Pills use **50 bg / 600 text**. These hues are fixed across themes.

---

## 11. The dashboard composition pattern (optional but recommended)

SNAP's dashboard isn't one big page — it's a **registry of self-contained
cards** assembled per role. Each card owns its own data fetch, skeleton, and
empty state, so the page is just an orchestrator. This scales cleanly as you add
modules.

```tsx
// app/(app)/dashboard/page.tsx (simplified)
export default function DashboardPage() {
  return (
    <>
      <DashboardHeader title="Dashboard" />
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 animate-in-page">
        <div className="mx-auto max-w-7xl space-y-4 sm:space-y-5">
          <GreetingCard />
          <QuickActionsCard />
          {/* 2/3 + 1/3 split below the full-width cards */}
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 min-w-0 space-y-4 sm:space-y-5">
              <MyTasksCard />
              <RecentActivityCard />
            </div>
            <div className="min-w-0 space-y-4 sm:space-y-5">
              <PipelineCard />
              <MonthlySpendCard />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

The `min-w-0` on grid columns is load-bearing: without it, a long un-wrapping
title inflates the track past the viewport on mobile instead of truncating.

A real card (note the self-contained loading / empty / data states):

```tsx
export function MyTasksCard() {
  const query = useTasks(); // your data hook
  const tasks = query.data ?? [];
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold font-heading uppercase tracking-[0.08em]">My Tasks</h3>
        <Link href="/tasks" className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {query.isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : tasks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center">
          <CheckSquare className="h-5 w-5 mx-auto text-muted-foreground/50" />
          <p className="mt-2 text-xs text-muted-foreground">You're all caught up.</p>
        </div>
      ) : (
        <div className="space-y-1">{tasks.map((t) => (/* list row from §8 */))}</div>
      )}
    </div>
  );
}
```

---

## 12. New-page checklist

When building any new page, verify:

```
1.  ✅ DashboardHeader at top with a short uppercase title
2.  ✅ Body = flex-1 overflow-y-auto p-4 sm:p-6  >  mx-auto max-w-6xl space-y-8
3.  ✅ animate-in-page on the content column
4.  ✅ Stat grid (if any): gap-4 sm:grid-cols-2 lg:grid-cols-4, 2xl numbers, 10px labels
5.  ✅ Every surface: rounded-xl border border-border bg-card shadow-card
6.  ✅ Section eyebrows: text-[11px] font-semibold font-heading uppercase tracking-[0.08em]
7.  ✅ List rows: rounded-lg p-3 hover:bg-muted/60 + sliding ChevronRight
8.  ✅ Empty states: centered icon well + text + action link (dashed border inside cards)
9.  ✅ Loading: shape-matched Skeletons, never a full-page spinner
10. ✅ stagger-children on grids/lists for the entrance cascade
11. ✅ All colors from semantic tokens — zero hardcoded hex, zero Tailwind grays for chrome
12. ✅ Big text never font-bold; tiny labels font-semibold uppercase tracking-wide
13. ✅ One accent (orange) CTA per screen, max
14. ✅ shadow-card only (never shadow-md/lg)
```

---

## 13. Anti-patterns (don't do these)

| ❌ Don't | ✅ Do |
| --- | --- |
| `font-bold` on a heading or number | `font-semibold font-heading` |
| `shadow-md` / `shadow-lg` | `shadow-card` |
| `bg-[#3A1D51]`, `text-gray-500`, `border-gray-200` | `bg-primary`, `text-muted-foreground`, `border-border` |
| Big colored fills for status (`bg-red-500` banners) | small dots + pale `50/600` pills |
| A full-page spinner | shape-matched skeletons |
| `rounded` / `rounded-md` cards | `rounded-xl` cards, `rounded-lg` rows/buttons |
| Multiple bright CTAs competing | one `accent` button, rest `outline`/`ghost` |
| Big transform on hover (scale/translate-y) | `hover-lift` (shadow only) |
| H1/H2 page titles | small uppercase Manrope eyebrows |

---

## 14. Quick-reference cheat sheet

```
CANVAS         bg-background           #F7F6F9
SURFACE        bg-card                 #FFFFFF
HAIRLINE       border-border           #E8E4EE
PRIMARY        bg-primary              #3A1D51 (deep purple)
CTA            bg-accent / variant=accent  #FF864A (orange)
MUTED WELL     bg-muted text-muted-foreground   #F0EDF4 / #6B5F7B
SIDEBAR        bg-gradient-purple (gradient of #3A1D51)

RADIUS         cards rounded-xl · rows/buttons rounded-lg · pills rounded-full
SHADOW         shadow-card (only)
FONT           body Inter (font-sans) · headings/numbers Manrope (font-heading)
MOTION         animate-in-page (mount) · stagger-children (lists) · hover-lift (cards)

EYEBROW        text-[11px] font-semibold font-heading uppercase tracking-[0.08em]
KPI NUMBER     text-2xl font-semibold font-heading tracking-tight
STAT LABEL     text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground
ROW TITLE      text-xs font-medium
PAGE BODY      flex-1 overflow-y-auto p-4 sm:p-6 > mx-auto max-w-6xl space-y-8
```

---

*Extracted from the production SNAP codebase (Next.js 15 · Tailwind v4 ·
shadcn/ui new-york · Inter + Manrope). Re-skin by editing only the `:root`
token block in §2 — every component reads semantic tokens, so a new brand is a
CSS-variable swap, not a component rewrite.*
