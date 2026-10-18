# System Architecture Blueprint — Keroo

This document defines the authoritative system topology, component dependency tree, local-first reactive data flow, state management strategy, offline Progressive Web App (PWA) configuration, and deterministic Keroo Pet engine architecture for **Keroo**.

---

## 1. System Overview & Technology Stack

Keroo is engineered as a zero-cloud, privacy-first, client-side web application and PWA. All user data, configuration, financial ledgers, and mascot states reside exclusively within the user's browser via IndexedDB.

```
+-----------------------------------------------------------------------------------+
|                                  Client Browser / PWA                             |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                     Presentation Layer (React 19 + Tailwind CSS)            |  |
|  |  Sure-Inspired UI  •  OKLCH Tokens  •  Tabular Numerals  •  Mascot Vector    |  |
|  +-----------------------------------------------------------------------------+  |
|                                         ▲                                         |
|                                         │ useLiveQuery / Context                  |
|                                         ▼                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                   Core Business Engines (Pure Functions, Zero UI)           |  |
|  |  • Currency Math (Cents)           • Credit Card Installments (1x-24x)       |  |
|  |  • Envelope Budgeting & TBB        • Subscriptions & Recurring Bills Radar   |  |
|  |  • Bilateral Split / IOU Netting   • Keroo Mood Machine (< 2ms synchronous)  |  |
|  |  • Statistical Spending Heuristics • CSV / OFX Ingestion & Deduplication     |  |
|  +-----------------------------------------------------------------------------+  |
|                                         ▲                                         |
|                                         │ Read / Atomic Commit                    |
|                                         ▼                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                   Local-First Persistence Layer (Dexie.js)                  |  |
|  |  14 IndexedDB Tables (12 Entity + 2 Singleton) • Compound Indexes • ACID    |  |
|  +-----------------------------------------------------------------------------+  |
|                                         ▲                                         |
|                                         │ Offline Asset Cache                     |
|                                         ▼                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                         Progressive Web App Shell                           |  |
|  |  Service Worker (Stale-While-Revalidate)  •  Web App Manifest  •  iOS Insets |  |
|  +-----------------------------------------------------------------------------+  |
|                                                                                   |
|               Zero Remote Server  •  Zero Cloud Storage  •  Zero AI APIs          |
+-----------------------------------------------------------------------------------+
```

### Core Technology Stack
- **Runtime & Build**: Vite + React 19 + TypeScript (Strict Mode).
- **Styling & Tokens**: Tailwind CSS configured with custom OKLCH semantic design tokens (`jade`, `coin`, `surface`, `border`, `status`), standard system sans-serif font stack, and mandatory `tabular-nums` formatting for all monetary values.
- **Local Database**: IndexedDB (14 IndexedDB tables: 12 domain entity tables + 2 singleton configuration tables) wrapped by **Dexie.js** with `dexie-react-hooks` (`useLiveQuery`) providing observable, reactive database subscriptions.
- **Icons**: Lucide React for consistent, lightweight vector iconography.
- **Testing Framework**: Vitest with unit test coverage across all pure math, financial, installment, bill status, split netting, and pet state engines.

---

## 2. Component Dependency Tree & Code Organization

The codebase enforces strict separation of concerns: **UI components never perform financial calculations directly**; they delegate all arithmetic, state transitions, and validation to pure, deterministic engine functions located in `src/core/`.

```
src/
├── main.tsx
├── App.tsx
│
├── core/                               <-- Pure Deterministic Engines (Zero React, Zero DOM)
│   ├── currency.ts                     <-- Integer cents arithmetic & formatters (BRL, USD, EUR)
│   ├── envelopes.ts                    <-- Zero-based budgeting, TBB pool, rollover mechanics
│   ├── installments.ts                 <-- 1x–24x schedule, closing/due day projection, remainder
│   ├── subscriptions.ts                <-- Recurring bill cadence, 3-day radar, status machine
│   ├── split.ts                        <-- Bilateral debt netting, 50/50 split math, running tabs
│   ├── kerooMood.ts                    <-- 5-mood deterministic state machine (< 2ms)
│   ├── kerooInsights.ts                <-- Spending surge, delivery spike, installment relief
│   ├── rules.ts                        <-- Auto-categorization & payee normalization engine
│   └── importParser.ts                 <-- CSV & OFX 1.0/2.0 SGML/XML parser & deduplication
│
├── db/                                 <-- Persistence Layer
│   ├── db.ts                           <-- Dexie database class (KerooDatabase) & versioning
│   ├── schema.ts                       <-- TypeScript entity interfaces & compound index types
│   ├── seed.ts                         <-- Clean-slate default category seed definitions
│   └── demoData.ts                     <-- 1-click realistic demo dataset
│
├── i18n/                               <-- Bilingual Translation Engine
│   ├── index.ts                        <-- Language context provider & useTranslation hook
│   ├── pt-BR.json                      <-- Brazilian Portuguese dictionary (source of truth)
│   └── en-US.json                      <-- American English dictionary (100% key parity)
│
├── styles/                             <-- Visual Design System
│   ├── globals.css                     <-- OKLCH CSS variables, safe-area insets, font rules
│   └── tailwind.config.js              <-- Semantic token mappings
│
├── components/                         <-- UI Components
│   ├── layout/
│   │   ├── AppLayout.tsx               <-- Responsive viewport wrapper (Sidebar vs Bottom Bar)
│   │   ├── DesktopSidebar.tsx          <-- 260px fixed / 72px collapsible left navigation
│   │   ├── MobileBottomNav.tsx         <-- 64px mobile bottom nav with safe-area padding
│   │   └── TopHeader.tsx               <-- Sticky header with Keroo mini-status & Cmd+K trigger
│   ├── common/
│   │   ├── Button.tsx                  <-- Press-scale tactile button with OKLCH variants
│   │   ├── Card.tsx                    <-- 1px border container with concentric rounded-2xl
│   │   ├── Input.tsx                   <-- 16px mobile font-size floor & tabular-nums
│   │   ├── Modal.tsx                   <-- Accessible dialog with backdrop blur & focus trap
│   │   ├── Badge.tsx                   <-- Semantic status chip (Paid, Overdue, Due Soon)
│   │   └── ProgressBar.tsx             <-- Concentric goal progress bar
│   ├── keroo/
│   │   ├── KerooMascot.tsx             <-- Vector SVG Jin Chan mascot with 5 animated moods
│   │   ├── SpeechBubble.tsx            <-- Interactive check-in bubble with 1-click actions
│   │   └── InsightPill.tsx             <-- Statistical celebration or warning chip
│   ├── command/
│   │   └── CommandPalette.tsx          <-- Cmd+K / Ctrl+K quick search & action modal
│   ├── onboarding/
│   │   └── OnboardingWizard.tsx        <-- 4-step 60-second clean-slate setup modal
│   └── forms/
│       ├── TransactionFormModal.tsx    <-- Income, expense, and transfer modal
│       ├── InstallmentFormModal.tsx    <-- 1x–24x card purchase logger
│       ├── PiggyBankModal.tsx          <-- Savings goal deposit & edit modal
│       └── BillFormModal.tsx           <-- Recurring bill & subscription modal
│
└── views/                              <-- Primary Route Screens
    ├── DashboardView.tsx               <-- Overview with live Keroo widget & upcoming bills
    ├── AccountsView.tsx                <-- Multi-account balances & transaction ledger
    ├── CreditCardsView.tsx             <-- Card statements & 6-24 month installment timeline
    ├── SubscriptionsView.tsx           <-- Recurring bills radar & annualized cost impact
    ├── PiggyBanksView.tsx              <-- Cofrinhos visual savings progress & deposit dialogs
    ├── SplitView.tsx                   <-- Bilateral utility netting & shared IOU tabs
    └── SettingsView.tsx                <-- Language, currency, theme, clean-slate/demo toggle
```

---

## 3. Local-First Data Flow & State Management

### 3.1 The Dexie Reactive Cycle (`useLiveQuery`)
Keroo follows a strictly unidirectional, reactive local data flow:
1. **User Action**: The user performs an action in the UI (e.g. logging an expense, clicking `[✅ Já paguei!]`, or depositing into a Piggy Bank).
2. **Core Engine Validation**: The input is validated and transformed using pure functions in `src/core/` (e.g., verifying integer cents, calculating remainder distribution).
3. **Atomic Commit**: An ACID transaction writes the update to IndexedDB via Dexie.js.
4. **Observable Broadcast**: Dexie's internal change observation system detects table mutations and synchronously notifies active `useLiveQuery` hooks.
5. **UI Re-render**: Components bound to `useLiveQuery` re-render with updated data. Zero manual cache invalidation or Redux boilerplate is required.

```
[ User Interaction ]
        │
        ▼
[ Pure Engine Validation ] ─── (Throws on non-integer cents or invalid state)
        │
        ▼
[ Dexie.js Transaction ]   ─── (Atomic commit to IndexedDB)
        │
        ▼
[ Dexie Live Query Hook ]  ─── (Automatic observer notification)
        │
        ▼
[ UI Component Update ]    ─── (Synchronous DOM render)
```

### 3.2 Ephemeral UI State (React Context)
While persistent application data lives in IndexedDB, lightweight ephemeral UI state is held in React Context:
- **`I18nContext`**: Current active locale (`pt-BR` or `en-US`), active currency symbol, and the `t(key, params)` translation function.
- **`ThemeContext`**: Active visual mode (`light` or `dark`), managing the `.dark` class on the root `<html>` element.
- **`CommandPaletteContext`**: Global visibility toggle for the `Cmd+K` / `Ctrl+K` modal.

---

## 4. Deterministic Keroo Pet Engine Architecture

The Keroo Pet Assistant is a zero-AI, 100% deterministic financial mascot. It evaluates user financial posture in $< 2\text{ms}$ and provides empathetic feedback, proactive bill check-ins, and statistical spending insights.

### 4.1 Evaluation Pipeline & Sub-2ms Latency
To eliminate database query overhead inside the evaluation loop, the engine operates on a pre-aggregated data vector (`KerooMetrics`):

```typescript
export interface KerooMetrics {
  lastInteractionDays: number;
  overdueBillsCount: number;
  overdueBillsTotalCents: number;
  upcomingBills3DaysCount: number;
  overspentEnvelopesCount: number;
  totalOverspentCents: number;
  monthExpensesCents: number;
  monthBudgetCents: number;
  monthIncomeCents: number;
  liquidCashCents: number;
  committedBillsNext30DaysCents: number;
}
```

The mood is computed through a strictly ordered, non-overlapping priority cascade where critical financial distress strictly preempts inactivity:

```
Priority 1: Critical Financial Tension Gate  ==> SWEATING
Priority 2: Inactivity Gate (>= 5 days)     ==> SLEEPY
Priority 3: Imminent Obligations & Caution  ==> ALERT
Priority 4: Prosperity & Thriving Surplus   ==> THRIVING
Priority 5: Default Equilibrium             ==> CALM
```

#### Detailed Gate Predicates

1. **Gate 1 — Critical Financial Tension Gate (`SWEATING`)**:
   Triggered if ANY acute financial emergency exists:
   - Overdue bills: `metrics.overdueBillsCount > 0`
   - Severe envelope overspending: `metrics.overspentEnvelopesCount >= 2`
   - Budget breach: `metrics.monthBudgetCents > 0 && metrics.monthExpensesCents > metrics.monthBudgetCents`
   - Liquidity shortfall: `metrics.liquidCashCents < 0 || metrics.liquidCashCents < metrics.committedBillsNext30DaysCents`
   *(Outcome: Fetal pose, depression aura, waterfall tears, or melted frog blob).*

2. **Gate 2 — Inactivity Gate (`SLEEPY`)**:
   Evaluated only when Gate 1 is false (no critical emergencies):
   - Inactivity duration: `metrics.lastInteractionDays >= 5`
   *(Outcome: Curled up asleep atop golden coin with inflating/deflating translucent snot bubble).*

3. **Gate 3 — Imminent Obligations & Caution Gate (`ALERT`)**:
   Triggered if obligations or mild warnings require attention:
   - Imminent bills: `metrics.upcomingBills3DaysCount > 0`
   - Single envelope overspent: `metrics.overspentEnvelopesCount === 1`
   - Spending warning ($\ge 80\%$ of budget): `metrics.monthBudgetCents > 0 && (metrics.monthExpensesCents * 10 >= metrics.monthBudgetCents * 8)`
   - Mild inactivity check-in: `metrics.lastInteractionDays >= 3`
   *(Outcome: Curious head-tilt with '?' icon, checking upcoming commitments).*

4. **Gate 4 — Prosperity & Thriving Surplus Gate (`THRIVING`)**:
   Triggered when all criteria for financial health are met:
   - Zero overdue bills: `metrics.overdueBillsCount === 0`
   - Zero overspent envelopes: `metrics.overspentEnvelopesCount === 0`
   - Zero bills due in $\le 3$ days: `metrics.upcomingBills3DaysCount === 0`
   - Qualified savings rate ($\ge 20\%$): `metrics.monthIncomeCents > 0 && (metrics.monthIncomeCents - metrics.monthExpensesCents) * 5 >= metrics.monthIncomeCents`
   - Healthy budget pace ($< 80\%$): `metrics.monthBudgetCents === 0 || (metrics.monthExpensesCents * 10 < metrics.monthBudgetCents * 8)`
   *(Outcome: Peace sign ✌️, celebratory dab, vigorous coin polishing).*

5. **Gate 5 — Default Equilibrium (`CALM`)**:
   Default state when neither distress, warning, dormancy, nor extraordinary surplus applies.
   *(Outcome: Leaning against card borders, relaxed posture, sipping coffee/juice).*

#### Reference Pure Function Implementation

```typescript
export type KerooMood = 'thriving' | 'calm' | 'alert' | 'sweating' | 'sleepy';

export function evaluateKerooMood(metrics: KerooMetrics): KerooMood {
  // 1. Critical Financial Tension Gate (Priority 1)
  const isBudgetBreach =
    metrics.monthBudgetCents > 0 &&
    metrics.monthExpensesCents > metrics.monthBudgetCents;

  const isLiquidityShortfall =
    metrics.liquidCashCents < 0 ||
    metrics.liquidCashCents < metrics.committedBillsNext30DaysCents;

  if (
    metrics.overdueBillsCount > 0 ||
    metrics.overspentEnvelopesCount >= 2 ||
    isBudgetBreach ||
    isLiquidityShortfall
  ) {
    return 'sweating';
  }

  // 2. Inactivity Gate (Priority 2)
  if (metrics.lastInteractionDays >= 5) {
    return 'sleepy';
  }

  // 3. Imminent Obligations & Caution Gate (Priority 3)
  const isBudgetWarning =
    metrics.monthBudgetCents > 0 &&
    metrics.monthExpensesCents * 10 >= metrics.monthBudgetCents * 8;

  if (
    metrics.upcomingBills3DaysCount > 0 ||
    metrics.overspentEnvelopesCount === 1 ||
    isBudgetWarning ||
    metrics.lastInteractionDays >= 3
  ) {
    return 'alert';
  }

  // 4. Prosperity & Thriving Surplus Gate (Priority 4)
  const isSavingsRateQualified =
    metrics.monthIncomeCents > 0 &&
    (metrics.monthIncomeCents - metrics.monthExpensesCents) * 5 >=
      metrics.monthIncomeCents;

  const isBudgetSafe =
    metrics.monthBudgetCents === 0 ||
    metrics.monthExpensesCents * 10 < metrics.monthBudgetCents * 8;

  if (
    metrics.overdueBillsCount === 0 &&
    metrics.overspentEnvelopesCount === 0 &&
    metrics.upcomingBills3DaysCount === 0 &&
    isSavingsRateQualified &&
    isBudgetSafe
  ) {
    return 'thriving';
  }

  // 5. Default Equilibrium (Priority 5)
  return 'calm';
}
```

#### Recurring Bills Day Delta ($\Delta$) Mapping

For any subscription with $\Delta = \text{diffInCalendarDays}(\text{nextDueDate}, \text{currentDate})$:
- $\text{isPaidInCurrentCycle} \implies$ `'PAID_OK'`
- $\Delta < 0 \implies$ `'OVERDUE'` (increments `overdueBillsCount`)
- $\Delta = 0 \implies$ `'DUE_TODAY'` (increments `upcomingBills3DaysCount`)
- $1 \le \Delta \le 3 \implies$ `'DUE_SOON'` (increments `upcomingBills3DaysCount`)
- $\Delta > 3 \implies$ `'UPCOMING_SAFE'`

**Complexity & Benchmark**: Exactly 8 comparisons with $O(1)$ time complexity and $O(1)$ space complexity. Benchmarked average execution time: $0.02\text{ms}$, well within the $< 2.0\text{ms}$ ceiling.

### 4.2 Interactive Speech Bubble & Atomic Ledger Updates
When bills are pending, Keroo's speech bubble becomes an interactive action trigger. Clicking an action executes an atomic Dexie transaction:

- **`[✅ Já paguei!]` / `[Paid!]`**:
  1. Marks `recurring_bills` status as `'PAID'` with `lastPaymentDate = today`.
  2. Inserts a new `Transaction` record (`type: 'expense'`) into `transactions`.
  3. Deducts `amountCents` from the designated payment account balance.
  4. Increments envelope `activityCents` for the category.
  5. Plays a golden coin flip animation and triggers instant mood re-evaluation (e.g. from `SWEATING` to `CALM`).
- **`[⏰ Lembrar amanhã]` / `[Snooze]`**:
  - Updates `snoozedUntilDate = today + 1 day`. Advances the queue to the next pending bill.
- **`[✏️ Ajustar valor]` / `[Edit amount]`**:
  - Expands an inline numeric input to adjust variable bills before committing payment.

### 4.3 Statistical Spending Heuristics (Deterministic Local Rules)
Five local heuristics run in-memory across local transactions:
1. **Delivery vs Grocery Ratio**: Alerts when takeout spending in the last 30 days is $\ge 60\%$ of grocery spending and $\ge R\$\ 150,00$.
2. **3-Month Moving Average Surge**: Detects when category spending is $\ge 35\%$ above historical baseline and $\ge R\$\ 100,00$ higher.
3. **Credit Card Installment Relief Month**: Detects when next month's installment obligations decrease by $\ge R\$\ 50,00$ or drop to zero, triggering a celebration.
4. **Annualized Subscription Cost**: Normalizes all active subscriptions to annual impact, displaying total annual commitment.
5. **Bilateral Split Net Receivables**: Reminds the user when net receivables from friends or roommates exceed $R\$\ 50,00$.

### 4.4 Kawaii Doodle Frog Mascot & Roaming Companion Engine ("Pet que passeia pelo app")

In addition to the static dashboard speech bubble and insight pills, Keroo features an interactive roaming companion engine:

#### A. Visual Style: "Kawaii Doodle Frog"
- **Art Direction**: Expressive, hand-drawn vector doodle aesthetic with a vibrant lime green body (`#8CE93A` / `#7ED321` or OKLCH `oklch(0.78 0.22 135)`), thick organic rounded black strokes (`stroke-width: 2.5px`), and shiny black bead eyes with white reflection dots.
- **Jin Chan Golden Fortune Coin (Core Interactive Prop)**:
  - Keroo interacts continuously with his oversized embossed golden coin (`oklch(0.82 0.18 85)`):
    - Clamping it in his mouth like the traditional Jin Chan frog.
    - Flipping and tossing the coin as he hops between cards.
    - Hugging the coin lovingly when savings goals grow.
    - Polishing it vigorously during `THRIVING` mood states.
    - Swallowing coins with an exaggerated open mouth (`👄 / 🟡`) whenever deposits are made to Piggy Banks (*Cofrinhos*).
- **Dramatic & Comedic Reactive Personality Poses**:
  - **Fetal Pose with Depression Aura / Waterfall Tears**: When budgets are severely blown or bills are overdue (`SWEATING` extreme).
  - **Melted Frog Blob**: Collapses into a flat green puddle when overwhelmed by multiple overdue items.
  - **Toast on Face**: Humorous facepalm pose with toast slapped on forehead when delivery/takeout spending spikes over groceries.
  - **Peace Sign (`✌️`) & Dab**: Celebratory victory poses when bills are marked paid or installment debt drops.
  - **Leaning & Sipping Juice/Coffee**: Cool, relaxed pose leaning against card borders when finances are in `CALM` or `THRIVING` equilibrium.
  - **Curious Head-Tilt (`?`)**: Tilts head with a question bubble on pending check-ins ("Você já pagou?").
  - **Sleeping with Snot Bubble**: Curled up napping atop the coin with an inflating/deflating translucent snot bubble when `SLEEPY` or idle.
  - **Cheeky Face (`😛`)**: Pokes tongue out playfully on random clicks or idle state.

#### B. Roaming Companion Mechanics
- **Card Perching & Screen Hopping**: Keroo hops across the layout and perches atop active UI elements (such as an overdue bill card, an empty budget envelope, or the Piggy Bank header).
- **Drag-and-Drop Interactive Physics**: The user can pick up and drag Keroo across the viewport. Upon release, a spring animation snaps Keroo to the nearest card border or screen edge dock.
- **On/Off Toggle**: Configurable via `user_settings.roamingPetEnabled`. Users who prefer a completely static interface can disable roaming with a single click in Settings or via Keroo's context menu.
- **Micro-Animations & Sprite States**: Built with SVG/CSS/Framer Motion. Includes idle eye blinking, gentle breathing bob, hop trajectories, resting nap on card corners, and confetti celebrations.
- **Performance & Battery Isolation**: Uses hardware-accelerated CSS transforms (`translate3d`), limits frame loops to active movement, and automatically suspends animations via `document.hidden` when the tab or PWA is backgrounded.

---

## 5. Offline PWA Strategy & iPhone Architecture

Keroo is designed to run seamlessly as an installed app on iOS (iPhone) and desktop browsers:

### 5.1 Service Worker & Cache Strategy
- **Service Worker (`public/sw.js`)**: Implements a **Stale-While-Revalidate** caching strategy for all local application assets (HTML, JavaScript bundles, CSS stylesheets, fonts, and SVG mascot assets).
- **Network Independence**: The app shell loads instantly from cache even when the device is completely offline or in Airplane Mode. All ledger modifications write immediately to local IndexedDB.

### 5.2 Web App Manifest (`public/manifest.json`)
Configures standalone display, portrait orientation, theme colors (`#10b981` in light mode, `#121417` in dark mode), and icons (192px, 512px, and maskable).

### 5.3 iOS Safari Safe Area Adaptation
To ensure an ergonomic native feel on iPhone devices with the Home Indicator bar:
- Viewport configuration: `viewport-fit=cover, maximum-scale=1.0, user-scalable=no`.
- Mobile bottom navigation uses `padding-bottom: max(0.75rem, env(safe-area-inset-bottom))` to prevent overlap with the system indicator.
- Minimum 48px touch target hit areas for all interactive buttons.
- Form inputs enforce `text-base` (16px) font size on mobile viewports to prevent iOS Safari auto-zoom behavior.

---

## 6. Bank Statement Ingestion Pipeline (CSV & OFX)

Keroo includes a local-first ingestion pipeline to import bank statements without sending financial data over the network:

1. **Parser Layer (`src/core/importParser.ts`)**:
   - **OFX 1.0/2.0**: Extracts `<STMTTRN>` records, parsing dates, amounts (converted to integer cents), memos, and `<FITID>`.
   - **CSV**: Automatically detects delimiters (`,`, `;`, `\t`), date formats (`DD/MM/YYYY`, `YYYY-MM-DD`), and number formats (Brazilian `1.234,56` vs US `1,234.56`).
2. **Deterministic Deduplication**:
   - Computes a composite hash: $\text{hash}(\text{accountId} + \text{date} + \text{cents} + (\text{fitid} \lor \text{payee}))$.
   - Flags existing transactions as `DUPLICATE` and unchecks them by default in the preview.
3. **Auto-Categorization Rules**:
   - Matches payee and description against user-defined `AutoRule` criteria to pre-fill categories.
4. **Staging & Review Modal**:
   - Displays a table where users can review items, adjust categories, and commit all selected records in a single atomic Dexie transaction.
