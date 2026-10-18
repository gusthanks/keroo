# Design System Specification — Keroo

This document defines the visual design system, OKLCH semantic color palette, typography hierarchy, concentric geometry, layout architecture, and Kawaii Doodle Frog mascot styling for **Keroo**.

---

## 1. Craft Philosophy: Sure-Inspired Minimalism

Keroo’s visual design is inspired by the refined, restrained aesthetic of **Sure (Maybe Finance)**, combined with the playful warmth of the **Keroo Fortune Frog**:
- **Subtle 1px Structural Borders**: Boundaries between cards, headers, and navigation bars use crisp, low-contrast 1px borders (`var(--border-subtle)`). Heavy drop shadows and faux 3D gradients are avoided.
- **Intentional Negative Space**: Generous whitespace around numerical metrics and tables allows complex financial data to breathe.
- **Perceptually Uniform Color (OKLCH)**: All colors are defined in the OKLCH color space, guaranteeing uniform lightness, precise contrast compliance across Light and Dark themes, and elimination of hue drift.
- **Physical Tactility**: Interactive elements provide instant physical feedback via scale depression (`active:scale-[0.98]`).

---

## 2. OKLCH Semantic Color Palette

OKLCH coordinates represent: Lightness ($L \in [0, 1]$), Chroma ($C \in [0, 0.4]$), and Hue ($H \in [0°, 360°]$).

```css
/* =========================================================
   LIGHT THEME (Default)
   ========================================================= */
:root {
  /* Surfaces */
  --surface-canvas: oklch(0.985 0.002 90);        /* Clean off-white canvas */
  --surface-card: oklch(1.000 0.000 0);           /* Pure white elevated cards */
  --surface-muted: oklch(0.965 0.004 90);         /* Table headers, inactive tracks */
  --surface-hover: oklch(0.935 0.006 90);         /* Hover and pressed states */
  --surface-overlay: oklch(0.20 0.01 240 / 0.40); /* Modal backdrop with blur */

  /* Structural 1px Borders */
  --border-subtle: oklch(0.900 0.005 90);         /* Structural 1px card/divider border */
  --border-strong: oklch(0.820 0.008 90);         /* Focused inputs, active tabs */

  /* Typography & Foreground */
  --text-primary: oklch(0.200 0.010 240);         /* High contrast body, headers, numbers */
  --text-secondary: oklch(0.480 0.015 240);       /* Subtitles, table labels, notes */
  --text-muted: oklch(0.660 0.010 240);           /* Placeholders, disabled states */
  --text-inverse: oklch(0.985 0.002 90);          /* Text on solid dark/primary buttons */

  /* Brand Accent: Jade / Lime Green (Mascot Hue ~135°-155°) */
  --color-brand: oklch(0.620 0.180 142);          /* Primary brand buttons & active toggles */
  --color-brand-hover: oklch(0.560 0.190 142);    /* Darker green hover state */
  --color-brand-subtle: oklch(0.950 0.045 142);   /* Light green tinted badge/container */
  --color-brand-border: oklch(0.830 0.090 142);   /* Subtle green accent border */
  --color-brand-text: oklch(0.360 0.130 142);     /* High-contrast accessible green text */

  /* Secondary Accent: Jin Chan Fortune Gold Coin (Hue ~85°) */
  --color-coin: oklch(0.760 0.160 85);            /* Gold coin body & shining highlights */
  --color-coin-subtle: oklch(0.960 0.040 85);     /* Gold tint for piggy bank cards */
  --color-coin-text: oklch(0.460 0.130 85);       /* Legible gold coin accent text */

  /* Functional Status Indicators */
  --color-danger: oklch(0.580 0.200 25);          /* Expenses, overdue bills, deficits */
  --color-danger-subtle: oklch(0.960 0.040 25);
  --color-warning: oklch(0.680 0.160 65);         /* Due soon, budget alert, caution */
  --color-warning-subtle: oklch(0.960 0.040 65);
  --color-info: oklch(0.580 0.150 245);           /* Transfers, neutral recurring bills */
  --color-info-subtle: oklch(0.950 0.035 245);
  --color-success: oklch(0.580 0.170 145);        /* Income, paid bills, settled IOUs */
  --color-success-subtle: oklch(0.950 0.040 145);
}

/* =========================================================
   DARK THEME (.dark class on <html>)
   ========================================================= */
.dark {
  /* Surfaces */
  --surface-canvas: oklch(0.140 0.006 240);       /* Deep slate dark canvas */
  --surface-card: oklch(0.180 0.008 240);         /* Elevated dark card surface */
  --surface-muted: oklch(0.220 0.010 240);        /* Muted containers, table headers */
  --surface-hover: oklch(0.260 0.012 240);        /* Hovered card/button state */
  --surface-overlay: oklch(0.06 0.01 240 / 0.70); /* Dark modal backdrop */

  /* Structural 1px Borders */
  --border-subtle: oklch(0.270 0.010 240);       /* 1px subtle dark border */
  --border-strong: oklch(0.380 0.012 240);       /* Strong active borders */

  /* Typography & Foreground */
  --text-primary: oklch(0.960 0.005 240);         /* Bright neutral white */
  --text-secondary: oklch(0.720 0.012 240);       /* Secondary descriptions */
  --text-muted: oklch(0.500 0.012 240);           /* Placeholders and disabled text */
  --text-inverse: oklch(0.140 0.006 240);         /* Dark text on light buttons */

  /* Brand Accent: Jade / Lime Green (Dark Tuned) */
  --color-brand: oklch(0.740 0.170 142);          /* Bright luminous green accent */
  --color-brand-hover: oklch(0.800 0.160 142);
  --color-brand-subtle: oklch(0.230 0.060 142);   /* Dark green container tint */
  --color-brand-border: oklch(0.380 0.100 142);
  --color-brand-text: oklch(0.880 0.130 142);

  /* Secondary Accent: Fortune Gold Coin (Dark Tuned) */
  --color-coin: oklch(0.820 0.150 85);
  --color-coin-subtle: oklch(0.240 0.060 85);
  --color-coin-text: oklch(0.920 0.120 85);

  /* Functional Status Indicators */
  --color-danger: oklch(0.700 0.190 25);
  --color-danger-subtle: oklch(0.240 0.060 25);
  --color-warning: oklch(0.780 0.150 65);
  --color-warning-subtle: oklch(0.250 0.060 65);
  --color-info: oklch(0.720 0.140 245);
  --color-info-subtle: oklch(0.230 0.050 245);
  --color-success: oklch(0.740 0.170 145);
  --color-success-subtle: oklch(0.230 0.060 145);
}
```

### Contrast & Accessibility (WCAG AAA / APCA)
- **Primary Text on Canvas**:
  - Light mode: `oklch(0.200)` on `oklch(0.985)` $\implies$ Contrast ratio $> 11:1$ (WCAG AAA, APCA $|Lc| \ge 95$).
  - Dark mode: `oklch(0.960)` on `oklch(0.140)` $\implies$ Contrast ratio $> 12:1$ (WCAG AAA, APCA $|Lc| \ge 95$).
- **Brand Text on Brand Subtle**:
  - Light mode: `oklch(0.360)` on `oklch(0.950)` $\implies$ Contrast ratio $> 5.5:1$ (WCAG AA).
  - Dark mode: `oklch(0.880)` on `oklch(0.230)` $\implies$ Contrast ratio $> 6:1$ (WCAG AA).

---

## 3. Typography Hierarchy & Financial Formatting

### 3.1 Font Stack
Keroo utilizes system sans-serif fonts to eliminate web font download latencies and provide instant zero-layout-shift rendering:
```css
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
```

### 3.2 Mandatory Tabular Numerals (`tabular-nums`)
Financial figures, currency amounts, percentages, installment indices (`3/10`), dates, and countdowns MUST use tabular numerals:
```css
/* Global CSS */
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```
**Why this is mandatory**: Proportional figures cause numbers with digits like `1` to be narrower than `8`. Without `tabular-nums`, live updates, card lists, and transaction columns oscillate horizontally, destroying alignment.

### 3.3 16px Mobile Input Floor Rule
- **Rule**: All `<input>`, `<select>`, and `<textarea>` elements on mobile viewports MUST have `font-size: 16px` (`text-base`).
- **Tailwind class**: `text-base sm:text-sm`.
- **Reason**: iOS Safari automatically zooms in the viewport when an input with `font-size < 16px` receives focus, breaking fixed navigation bars and header positioning.

### 3.4 Typographic Scale
| Level | Tailwind Classes | Size / Weight | Usage |
|---|---|---|---|
| **Display / KPI** | `text-3xl font-semibold tracking-tight tabular-nums` | 30px / 600 | Top dashboard net worth, account balance summary |
| **Section / H2** | `text-xl font-medium tracking-tight` | 20px / 500 | Screen titles, card group headers |
| **Card Title / H3** | `text-base font-medium text-primary` | 16px / 500 | Account name, subscription title, modal headings |
| **Body / Ledger** | `text-sm font-normal text-secondary leading-relaxed` | 14px / 400 | Transaction descriptions, notes, speech bubble copy |
| **Meta / Badges** | `text-xs font-medium text-muted uppercase tracking-wider tabular-nums` | 12px / 500 | Due dates, cadence pills, installment counters |

---

## 4. Concentric Geometry & Structural Radii

To maintain geometric harmony, nested containers follow the concentric radius formula:
$$R_{\text{outer}} = R_{\text{inner}} + \text{Padding}$$

- **Outermost Containers (Cards, Modals)**: `rounded-2xl` ($16\text{px}$) with `p-4` or `p-5` ($16\text{px}-20\text{px}$ padding).
- **Nested Interactive Elements (Inputs, Buttons, List Items)**: `rounded-xl` ($10\text{px}-12\text{px}$).
- **Small Badges, Status Pills & Tags**: `rounded-lg` ($6\text{px}-8\text{px}$).
- **Avatars & Floating Action Buttons**: `rounded-full`.

### Tactile Feedback
Interactive buttons and cards feature a spring-like micro-scale depression on active press:
```css
.btn-tactile {
  transition: transform 100ms cubic-bezier(0.16, 1, 0.3, 1), background-color 150ms ease;
}
.btn-tactile:active {
  transform: scale(0.97);
}
```

---

## 5. Responsive Layout Architecture

### 5.1 Desktop Viewport (`≥ 1024px`)
- **Fixed Left Sidebar**:
  - Width: `260px` (or collapsed to `72px` icon view).
  - Contains the Keroo logo, an Add Transaction button, the main navigation links (Dashboard, Accounts, Cards & Installments, Subscriptions & Bills, Piggy Banks, Split & IOUs, Settings), and Language/Theme toggles at the bottom.
- **Main Viewport Area**:
  - Container: `max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8` (with extra bottom padding on mobile to clear the bottom bar).
  - Layout Grid: 3-column summary cards, 2-column core dashboard (Left: Keroo mascot speech bubble & upcoming bills; Right: Account balances & quick actions).

### 5.2 Mobile Viewport (`< 768px`)
- **Desktop Sidebar**: Hidden (`hidden md:flex`).
- **Sticky Top Bar** (`Header.tsx`):
  - Height: `64px` (`h-16`).
  - Displays the current section title, a search button that opens the `Cmd+K` command palette, and a theme toggle; the Keroo mini status (mood badge) appears from the `sm` breakpoint up.
- **Bottom Navigation Bar**:
  - Fixed position: `fixed bottom-0 left-0 right-0 z-50`.
  - Background: `var(--surface-card)` with `1px` top border `var(--border-subtle)` and backdrop blur.
  - Height: `64px + env(safe-area-inset-bottom)`.
  - Safe Area Padding: `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))` ensuring clearance from the iPhone Home Indicator bar.
  - 5 Primary Navigation Tabs (minimum 48px touch targets). Keroo switches views by ID (`ViewId`) rather than URL routes; labels below are en-US with the pt-BR UI label in parentheses:
    1. **Dashboard** (pt-BR: Painel), view `dashboard`.
    2. **Accounts** (pt-BR: Contas), view `accounts`.
    3. **+** Floating quick-add button that opens the new-transaction modal.
    4. **Subscriptions & Bills** (pt-BR: Assinaturas & Boletos), view `subscriptions`.
    5. **More** (pt-BR: Mais): opens a sheet with Cards & Installments, Piggy Banks, Split & IOUs, and Settings.

---

## 6. Keroo Mascot Visual Styling & Roaming Companion System

### 6.1 "Kawaii Doodle Frog" Visual Style
The authoritative spec is the Mascot Style Guide in `CLAUDE.md` section 6; the values below mirror `src/components/keroo/KerooMascot.tsx`.
- **Aesthetic**: Flat, sticker-style vector doodle mascot drawn as inline SVG.
- **Body Geometry & Color**:
  - Silhouette: ONE continuous Bézier blob body whose top edge forms the two eye bumps.
  - Body fill: flat lime green `#86E63C`; no gradients, no shading, no belly patch.
  - Outline: thick, uniform near-black strokes (`#1F1F1F`, `stroke-linecap: round`, `stroke-linejoin: round`).
  - Eyes: tiny bead-dot eyes with no eye whites (short thick arcs when happy or sleepy); pink blush dots (`#F4899A`) on playful poses.

### 6.2 Jin Chan Golden Fortune Coin (Core Interactive Prop)
The golden coin is Keroo's constant companion and interactive prop:
- Base color: gold `#FFD700` with a darker `#C88A00` edge and a square hole in the center.
- **Prop Interactions**:
  - **Mouth Clamp**: Clamps the coin firmly in his mouth like the traditional Jin Chan frog.
  - **Coin Flip**: Flips the coin in the air with a sparkle particle when walking or hopping.
  - **Hug & Polish**: Embraces the coin with both arms or rubs it with a soft cloth during `THRIVING` state.
  - **Coin Swallowing (Open Mouth `👄 / 🟡`)**: Drops a coin into his huge open mouth whenever the user logs a deposit to a Piggy Bank (*Cofrinho*).

### 6.3 Dramatic & Comedic Reactive Poses
Keroo expresses financial events with rich, humorous reactions:
1. **Waterfall Tears / Fetal Pose (`SWEATING` Extreme)**:
   - Trigger: Multiple overdue bills or severe budget overruns.
   - Pose: Curled up in a fetal position with a blue depression aura and comic waterfall tears streaming down.
2. **Melted Frog Blob**:
   - Trigger: Liquidity deficit or extreme monthly expenses.
   - Pose: Deflated green puddle flattened against the card surface.
3. **Toast on Face**:
   - Trigger: Delivery vs Grocery spending ratio spike alert.
   - Pose: Wide eyes with a slice of toast slapped directly across his face.
4. **Peace Sign (`✌️`) & Dab (`THRIVING`)**:
   - Trigger: User clicks `[✅ Paid!]` (pt-BR UI label: `Já paguei!`), pays off credit card debt, or saves $> 20\%$.
   - Pose: Dynamic double-finger peace pose with sparkle stars bobbing around.
5. **Leaning & Sipping Juice/Coffee (`CALM`)**:
   - Trigger: All bills paid, budget healthy.
   - Pose: Lounging against the edge of a dashboard card with sunglasses sipping from a tiny coconut/juice cup.
6. **Curious Head-Tilt (`?`) (`ALERT`)**:
   - Trigger: Bill due today or 3-day advance notice.
   - Pose: Inquisitive 15° head tilt with an amber question mark bubble.
7. **Sleeping with Snot Bubble (`SLEEPY`)**:
   - Trigger: Inactive for $\ge 5$ days or late night.
   - Pose: Curled up asleep atop his golden coin with an animated inflating/deflating translucent snot bubble.
8. **Cheeky Face (`😛`)**:
   - Trigger: User taps/clicks Keroo directly.
   - Pose: Pokes tongue out playfully with a wink.

### 6.4 Roaming Companion Layer
- **Layering**: High z-index floating layer (`pointer-events-auto` on the pet, `pointer-events-none` on overlay backdrop).
- **Perching**: Snaps dynamically to card header borders across the dashboard.
- **Drag-and-Drop**: Users can drag Keroo with cursor or touch; on release, a physics spring settles Keroo onto the nearest card edge.
- **Toggle Setting**: Can be disabled at any time via `user_settings.roamingPetEnabled` (Settings $\to$ "Roaming Companion Pet"; pt-BR UI label: "Pet que passeia pelo app"), from the pet's own "Disable roaming" button, or with the command palette.
