# StudioBee — Design Guide

Complete design reference for the studiobee.co.in website. Keep this updated when making design changes.

---

## Brand Colors

```css
:root {
  --blue:       #2F48DF;   /* Primary — CTAs, accents, hero bg, work section bg */
  --blue-dark:  #1e33b8;   /* Hover state for blue elements */
  --blue-light: #4f64f0;   /* Gradient layer, subtle highlights */
  --dark:       #0A0A0A;   /* Dark sections bg, body text, footer */
  --light:      #FBFBFB;   /* Light sections bg, text on dark */
  --gray:       #E9E9E9;   /* Borders, dividers on light bg */
  --cream:      #f3e9d9;   /* Team section background */
}
```

### Usage by Section

| Section | Background | Primary Text | Accent |
|---|---|---|---|
| Hero | `#2F48DF` (+ radial gradients) | `#FBFBFB` | `rgba(255,255,255,0.82)` italic |
| Services | `#0A0A0A` | `#FBFBFB` | `#2F48DF` |
| Work | `#2F48DF` | `#FBFBFB` | `rgba(255,255,255,0.7)` |
| Stats | `#FBFBFB` | `#0A0A0A` | `#2F48DF` |
| Process | `#FBFBFB` | `#0A0A0A` | `#2F48DF` |
| Testimonials | `#0A0A0A` | `#FBFBFB` | `rgba(255,255,255,0.72)` |
| Team | `#f3e9d9` (cream) | `#2F48DF` | `rgba(47,72,223,0.5)` |
| CTA/Contact | `#2F48DF` (+ radial gradients) | `#FBFBFB` | `rgba(255,255,255,0.58)` |
| Footer | `#0A0A0A` | `rgba(255,255,255,0.35)` | `#2F48DF` |

---

## Typography

### Font Families

| Font | Usage | Import |
|---|---|---|
| **DM Sans** | Headings, UI, labels, buttons, nav | Google Fonts |
| **Kulim Park** | Body copy, subheadings, testimonial quotes | Google Fonts |

```html
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Kulim+Park:wght@300;400;600&display=swap" rel="stylesheet" />
```

`body` uses `Kulim Park` as the base font. DM Sans is applied explicitly via `.f-display` or inline `font-family`.

### Type Scale

| Role | Font | Size | Weight | Letter-spacing | Line-height |
|---|---|---|---|---|---|
| Hero H1 | DM Sans | `clamp(64px, 9.5vw, 120px)` | 600 | `-0.045em` | `0.94` |
| Hero H1 italic | DM Sans | same | 400 | `-0.045em` | `0.94` |
| Section H2 | DM Sans | `clamp(34px, 4vw, 52px)` | 600 | `-0.03em` | `1.08` |
| CTA H2 | DM Sans | `clamp(40px, 6vw, 72px)` | 600 | `-0.04em` | `1.04` |
| Section Label | DM Sans | `11px` | 600 | `0.14em` | — |
| Hero Eyebrow | DM Sans | `11px` | 600 | `0.14em` | — |
| Service Card Title | DM Sans | `21px` | 600 | `-0.025em` | — |
| Process Step Title | DM Sans | `19px` | 600 | `-0.02em` | — |
| Hero Body | Kulim Park | `19px` | 400 | — | `1.75` |
| Section Body | DM Sans | `16px` | 400 | — | `1.75` |
| Nav Links | DM Sans | `14px` | 400 | — | — |
| Stat Number | DM Sans | `clamp(48px, 5vw, 64px)` | 600 | `-0.05em` | `1` |
| Footer Col Label | DM Sans | `10px` | 700 | `0.12em` | — |
| Testimonial Quote | Kulim Park | `15px` | 400 | — | `1.72` |

All section headings (`section-h2`) have `text-transform: uppercase` via `.scramble-heading`.

---

## Spacing System

### Section Padding

**Desktop (default):**
```
.section (services/process): 100px 56px
.work-section:               72px 0 80px
.stats-section:              72px 56px
.testimonials-section:       100px 56px 120px
.team-section:               120px 56px
.cta-section:                120px 56px
footer:                      72px 56px 44px
```

**Tablet (≤ 768px) — 56px token:**
```
.section:                    56px 20px
.work-section:               48px 0 52px
.stats-section:              48px 20px
.testimonials-section:       56px 20px 64px
.team-section:               56px 20px
.cta-section:                64px 20px
footer:                      44px 20px 28px
```

**Mobile (≤ 480px):**
Same as tablet (inherits), with:
```
.process-grid:               margin-top 28px
.process-step:               28px 20px
```

### Internal Spacing (Key Gaps)

| Element | Desktop | Mobile |
|---|---|---|
| Section heading → content | `56px` (via margin-bottom on container) | `28–32px` |
| Services grid gap | `18px` | `18px` |
| Section label → H2 | `18px` | `18px` |
| Service body text → H2 | `20px` margin-top | `14px` |
| Process grid → H2 | `56px` margin-top | `32px` |
| Team grid → heading | `64px` margin-top | `32px` |
| Work header → cards | `40px` margin-bottom | `28px` |
| Stats grid gap | `40px` | `32px` |

---

## Section-by-Section Layout

### Hero
- **Background:** `#2F48DF` with 3-layer radial gradient
- **Decorative:** vertical bar grid (opacity 0–10%), grain texture overlay (body::after)
- **Wave animation:** 20 `.intro-strip` elements with `7945.png` + `7946.png`, `stripWave` keyframe (9s loop)
- **Logo inversion:** as wave passes, logo colour flips dark→light via `clip-path` wipe
- **Content:** eyebrow label (line + text) → H1 (bold + italic mix) → subtitle → 2 CTAs
- **Bottom fade:** gradient from transparent → `#FBFBFB` (220px height)
- **Entry animation:** `contentReveal` — 18px translateY + opacity, 0.8s, 0.3s delay

### Services
- **Background:** `#0A0A0A`
- **Layout:** `.services-header` (label + H2 + body stacked left) → 6-col grid (cards span 2 each)
- **Cards:** `rgba(255,255,255,0.05)` glass, `border-radius: 20px`, hover lift `-8px`
- **Card internal:** icon (44×44px, `rgba(47,72,223,0.28)` bg, 12px radius) → title → body → "Get started →" link with border-top
- **H2 max-width:** `640px` (targets ~2 lines)

### Work (Case Studies Marquee)
- **Background:** `#2F48DF`
- **Cards:** `clamp(190px, 18vw, 256px)` wide, `9:16` aspect-ratio, portrait
- **Marquee:** auto-scrolls at `0.45px/frame`, pauses on hover, triple-clone loop
- **Touch:** drag-to-scroll with snap on release (280ms ease)
- **Fade gradients:** `10vw` wide left/right, matching blue
- **Card overlay:** gradient `transparent 45% → rgba(0,0,0,0.88) 100%`

### Stats
- **Background:** `#FBFBFB`, bordered top/bottom (`#E9E9E9`)
- **Layout:** 4-col grid (→ 2-col on mobile)
- **Each stat:** blue bar (40×3px) → large number → label
- **Numbers:** `clamp(48px, 5vw, 64px)`, `#2F48DF`

### Process
- **Background:** `#FBFBFB`
- **Layout:** label + H2 → 4-col grid (→ 2-col → 1-col)
- **Grid:** `1px` gap with `#E9E9E9` background = hairline borders, `border-radius: 20px`
- **Step hover:** bg lightens to `#fff`, 3px `#2F48DF` bar slides up from bottom
- **H2 max-width:** `640px` (targets ~2 lines)

### Testimonials
- **Background:** `#0A0A0A` with blue radial glow behind cards
- **Layout:** centred header → stacked glass card fan
- **Cards:** `clamp(340px, 42vw, 540px)` wide, `310px` tall, stacked fan (−4°, +1°, +5°)
- **Glass:** `rgba(255,255,255,0.07)`, `backdrop-filter: blur(24px) saturate(160%)`, 4-layer shadow
- **Interaction:** drag front card → shuffles to back, progress dots update
- **Dots:** inactive `rgba(255,255,255,0.15)` 6×6px circle → active `rgba(255,255,255,0.8)` 20×6px pill

### Team
- **Background:** `#f3e9d9` (cream)
- **Layout:** label + H2 → 4-col photo grid (→ 2-col on tablet)
- **Cards:** `3:4` aspect ratio photos, `border-radius: 16px`
- **Hover panel:** blue gradient overlay slides up (`translateY(14px) → 0`), name/role/bio/tags

### CTA / Contact Form
- **Background:** `#2F48DF` with radial gradients (mirrored from hero)
- **Layout:** centred, `max-width: 640px`
- **Form fields:** `rgba(255,255,255,0.13)` bg, `rgba(255,255,255,0.30)` border, `10px` radius
- **Success state:** animated SVG checkmark (circle draws → checkmark draws), 5s auto-dismiss with progress bar

### Footer
- **Background:** `#0A0A0A`
- **Layout:** logo + tagline (left) + link columns (right), divider, copyright row

---

## Buttons

### `.btn-dark` (Primary CTA — on hero/blue sections)
```css
background: #0A0A0A; color: #FBFBFB;
padding: 16px 36px; border-radius: 100px;
font: 500 15px DM Sans;
box-shadow: 0 8px 32px rgba(10,10,10,0.2);
hover: scale(1.05) translateY(-1px); shadow deepens
```

### `.btn-ghost` (Secondary — hero)
```css
color: #0A0A0A; no background;
padding: 16px 24px; border-radius: 100px;
font: 400 15px DM Sans;
hover: arrow span translateX(5px) only — NOT the whole button
```

### `.nav-cta` (Nav pill)
```css
background: #0A0A0A; color: #FBFBFB;
padding: 10px 24px; border-radius: 100px;
font: 500 14px DM Sans;
hover: scale(1.04)
```

### `.btn-cta` (Form submit)
```css
background: #FBFBFB; color: #0A0A0A;
padding: 20px 52px; border-radius: 100px;
font: 500 16px DM Sans;
box-shadow: 0 8px 40px rgba(10,10,10,0.2);
hover: scale(1.05) translateY(-2px)
```

### `.btn-outline-dark` (Work section "View all")
```css
color: rgba(255,255,255,0.7); border: 1px solid rgba(255,255,255,0.18);
padding: 12px 28px; border-radius: 100px;
hover: color #fff, border opaque, scale(1.04)
```

---

## Shadows

Always layer shadows. Never use a single flat shadow.

**Card (dark surface):**
```css
box-shadow:
  0 2px 16px rgba(0,0,0,0.25),
  0 1px 3px rgba(0,0,0,0.15);
```

**Card hover:**
```css
box-shadow:
  0 28px 72px rgba(0,0,0,0.35),
  0 4px 16px rgba(255,255,255,0.04);
```

**Glass card (testimonials):**
```css
box-shadow:
  0 2px 4px rgba(0,0,0,0.35),
  0 12px 40px rgba(0,0,0,0.45),
  0 40px 80px rgba(0,0,0,0.2),
  inset 0 1px 0 rgba(255,255,255,0.09);
```

**CTA button:**
```css
box-shadow: 0 8px 40px rgba(10,10,10,0.2);
```

---

## Animations & Motion

**Rule: Only animate `transform` and `opacity`. Never `transition-all`.**

### Easing Curves

| Name | Value | Use case |
|---|---|---|
| Spring pop | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Buttons, card hover lift, team panel |
| Smooth enter | `cubic-bezier(0.25, 1, 0.5, 1)` | Hero content reveal |
| Marquee ease | `cubic-bezier(0.25, 0.46, 0.45, 0.94)` | Card image zoom, marquee snap |
| Standard ease | `cubic-bezier(0.4, 0, 0.2, 1)` | Nav clip-path wipe |
| Decelerate | `cubic-bezier(0.16, 1, 0.3, 1)` | Fast settle animations |

### Key Animations

| Animation | What | Duration |
|---|---|---|
| `contentReveal` | Hero fade-in (opacity 0→1, translateY 18px→0) | 0.8s, delay 0.3s |
| `stripWave` | Wave opacity pulse 0→1→1→0 | 9s infinite |
| Marquee auto-scroll | `0.45px/frame` RAF loop | continuous |
| Marquee snap | Eased move to nearest card | 280ms |
| Chevron scroll | Eased card-width jump | 480ms |
| Scramble heading | Text character scramble on scroll-into-view | ~800ms |
| Service card hover | translateY(-8px) | 0.4s spring |
| Process bar | height 0→3px from bottom | 0.35s spring |
| Team hover panel | opacity + translateY(14px→0) | 0.3s/0.35s |
| Glass card drag | Instant follow, spring settle | 0.45s spring |
| Success checkmark | SVG stroke-dashoffset draw | circle 0.55s, check 0.4s |

---

## Surface & Depth System

Three levels of surface elevation:

| Level | CSS | Used for |
|---|---|---|
| Base | `rgba(255,255,255,0.05)` | Service cards |
| Elevated | `rgba(255,255,255,0.07)` + backdrop-blur | Testimonial glass cards |
| Floating | `rgba(255,255,255,0.13)` | Form inputs |

Glass morphism recipe:
```css
background: rgba(255,255,255,0.07);
backdrop-filter: blur(24px) saturate(160%);
-webkit-backdrop-filter: blur(24px) saturate(160%);
border: 1px solid rgba(255,255,255,0.11);
```

---

## Grain Texture

Applied globally via `body::after` — SVG `feTurbulence` noise at 3.5% opacity, `mix-blend-mode: overlay`. Adds tactile depth without images.

```css
body::after {
  content: '';
  position: fixed; inset: 0;
  background-image: url("data:image/svg+xml,...feTurbulence baseFrequency='0.75'...");
  pointer-events: none;
  z-index: 9999;
  mix-blend-mode: overlay;
}
```

---

## Navigation

- **Position:** `fixed`, top-left, full width, `z-index: 200`
- **Default state:** transparent background, dark text/logo
- **Scrolled state (`.scrolled`):** `rgba(47,72,223,0.92)` bg + `backdrop-filter: blur(16px)`, white text
- **Logo:** dual-layer (dark + inverted white) with clip-path wipe synced to wave animation
- **Desktop padding:** `22px 56px` | **Mobile:** `14px 20px`
- **Nav links:** hidden on ≤ 480px (only logo + CTA remain)

---

## Responsive Breakpoints

| Breakpoint | Changes |
|---|---|
| `≤ 768px` | Side padding → 20px; section vertical → 56px token; services grid 2-col; stats grid 2×2; process grid 2-col; team grid 2-col |
| `≤ 480px` | Nav links hidden; services grid 1-col; process grid 1-col; contact form rows stack |

---

## Protected Assets

| File | Purpose | Rule |
|---|---|---|
| `7945.png` | Hero wave animation (blue panel) | **Must stay in project root** |
| `7946.png` | Hero wave animation (white panel) | **Must stay in project root** |
| `studiobee.png` | Logo (dark background) | Use on dark/blue sections |
| `studiobee white.png` | Logo (light background) | Use on light sections |

Both wave PNGs are referenced by CSS `background-image` in `.intro-strip`. Moving them breaks the hero animation.

---

## Do Not

- Do not use default Tailwind blue/indigo as primary colour
- Do not use `transition-all`
- Do not use flat single-layer shadows
- Do not animate the `.btn-ghost` button container — only animate the arrow `<span>` inside (wave strip duplication issue)
- Do not use `rgba(10,10,10,x)` for text on dark backgrounds — use `rgba(251,251,251,x)`
- Do not hardcode padding asymmetry — all sections use the same side padding at each breakpoint (56px desktop, 20px mobile)
