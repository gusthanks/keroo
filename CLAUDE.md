# CLAUDE.md — Authoritative Engineering Guide for Keroo

Welcome to **Keroo**. This document is the primary reference manual for any contributor or coding agent working in this repository. It establishes non-negotiable architectural invariants, development workflows, testing requirements, directory structure, and the multi-agent stage handoff protocol.

---

## 1. Vision & Core Philosophy

**Keroo** is a clean-slate, local-first, open-source personal finance web application and Progressive Web App (PWA) designed for PC and iPhone. It harmonizes:
- The minimalist craft and aesthetic of **Sure (Maybe Finance)**.
- The local-first speed, envelope budgeting, and zero-cloud privacy of **Actual Budget**.
- The subscription and recurring bill radar of **Wallos**.
- The goal-based piggy banks (*Cofrinhos*) and auto-categorization rules of **Firefly III / Oinc**.
- Native Brazilian credit card installment projections (`1x–24x`) with exact cent-remainder distribution.
- A zero-sum bilateral Split / IOU ledger.
- Full bilingual parity across Brazilian Portuguese (`pt-BR`) and American English (`en-US`).
- An interactive **100% deterministic (zero-AI, zero-cost) Keroo Fortune Frog Pet (*Jin Chan*)** running in `< 2ms` on client hardware.

---

## 2. Non-Negotiable Invariants

All agents, engineers, and contributors MUST adhere strictly to these six project invariants:

1. **Integer-Cent Monetary Arithmetic ($C \in \mathbb{Z}$)**:
   - ALL monetary amounts across the database, business logic, state machines, and API boundaries MUST be stored and computed as integer cents (e.g., $R\$\ 10,50 \implies 1050$, $\$1.00 \implies 100$, $€\ 0,01 \implies 1$).
   - **Floating-point math for money is strictly prohibited** (`0.1 + 0.2` float leakage will cause test and build rejections).
   - Divisions MUST use explicit rounding or remainder allocation: $\text{Math.round}()$ or integer floor with remainder.

2. **100% Clean Slate (Zero Legacy Data)**:
   - Keroo ships no legacy-data importer; every install starts from an empty database or the optional demo dataset. Never add code, fixtures, or tests that depend on anyone's personal financial files (the CSV/OFX statement importer only processes files the user picks at runtime).
   - The application starts with an empty database and guides the user through a 60-second onboarding wizard with an optional 1-click Demo Data / Clean Slate Reset toggle.

3. **Exact Remainder Distribution on 1st Installment**:
   - For credit card installment purchases ($1x$ to $24x$), remainder cents ($A \pmod N$) MUST be allocated exclusively to the 1st installment:
     $$I_1 = \lfloor A / N \rfloor + (A \pmod N), \quad I_k = \lfloor A / N \rfloor \quad (\text{for } 2 \le k \le N)$$
   - This ensures $\sum_{k=1}^N I_k \equiv A$ down to the exact cent without penny loss or accumulation.

4. **100% Bilingual Translation Parity (`en-US` & `pt-BR`)**:
   - Every single UI string, button label, dialogue, status badge, error message, and Keroo pet prompt must exist in both `en-US` and `pt-BR`.
   - `src/i18n/en-US.json` is the authoring source of truth; `src/i18n/pt-BR.json` must keep 100% key parity with it. The default UI language is `en-US`, with browser-locale detection selecting `pt-BR` when appropriate.
   - Automated tests verify bidirectional key equivalence. Missing keys break the build.

5. **100% Deterministic Mascot Engine (< 2.0ms, Zero AI, Zero Cloud)**:
   - The Keroo mascot mood evaluator (`evaluateKerooMood`) is a pure synchronous function with $O(1)$ complexity running in $< 2\text{ms}$ (benchmarked at $\approx 0.02\text{ms}$).
   - Zero LLM calls, zero network fetches, zero cloud dependencies for mascot behavior.

6. **Strict Workspace Confinement**:
   - All reads, writes, and commands MUST stay inside the repository root. Never touch files outside the checkout.

---

## 3. Development Commands & Tooling

| Command | Action | Notes |
|---|---|---|
| `npm install` | Install dependencies | Uses lockfile |
| `npm run dev` | Launch local development server | Serves Vite app at `http://localhost:5173` |
| `npm run build` | Compile production build | Runs `tsc && vite build` to `dist/` |
| `npm test` | Run complete automated test suite | Runs Vitest in single-run mode |
| `npx vitest run` | Execute test suite | Runs tests without watch mode |
| `npm run typecheck` | Strict TypeScript typecheck | Runs `tsc --noEmit`; must report zero errors |
| `npm run test:coverage` | Coverage (requires @vitest/coverage-v8) | Runs `vitest run --coverage` |
| `npx tsc --noEmit` | Strict TypeScript typecheck | Equivalent to `npm run typecheck` |

---

## 4. Architecture & Directory Quick-Map

Generated from `git ls-files`; keep it in sync when files are added, renamed, or deleted.

```
keroo/
├── CLAUDE.md                     # Authoritative engineering guide (this file)
├── AGENTS.md                     # Universal multi-agent operational guide
├── LICENSE                       # MIT license
├── package.json                  # npm scripts (dev, build, typecheck, test, test:coverage, app, app:update, desktop:shortcut) & dependencies
├── package-lock.json             # npm lockfile
├── index.html                    # Vite entry HTML: viewport-fit=cover, iOS web-app meta tags, light/dark theme-color pair
├── vite.config.ts                # Vite + React plugin, `@` -> src alias, browser build target, Vitest config (jsdom, src/tests/setup.ts)
├── tsconfig.json                 # Strict TypeScript config for src/ (bundler resolution, `@/*` paths)
├── tsconfig.node.json            # TypeScript config for vite.config.ts
├── tailwind.config.js            # Tailwind theme: semantic color tokens mapped to the CSS variables in src/index.css
├── postcss.config.js             # PostCSS pipeline (tailwindcss + autoprefixer)
├── .editorconfig                 # UTF-8, LF, 2-space indentation
├── .gitattributes                # LF normalization; images and fonts marked binary
├── .gitignore                    # Ignored build output, dependencies and local files
├── .nvmrc                        # Node 22
├── .npmrc                        # engine-strict=true (package.json requires Node ^22.22.2 || ^24.15.0 || >=26)
├── .claude/
│   ├── launch.json               # Dev-server launch config (`npm run dev` on port 5173)
│   └── commands/
│       ├── continue.md           # /continue: run the next unfinished roadmap stage
│       └── mascot-redesign.md    # /mascot-redesign: preserve approved raster art and validate asset integration
├── .github/
│   ├── dependabot.yml            # Weekly npm (minor/patch grouped) and GitHub Actions updates
│   └── workflows/
│       └── ci.yml                # CI on Node 22 & 24: npm ci, typecheck, vitest, build
├── docs/
│   ├── ARCHITECTURE.md           # System topology, data flow, reactive patterns
│   ├── DATABASE_SCHEMA.md        # Dexie.js 14 IndexedDB tables (12 domain entity tables + 2 singleton configuration tables), indexes, TypeScript schemas
│   ├── DESIGN_SYSTEM.md          # OKLCH tokens, typography, 1px borders, layout
│   └── ROADMAP.md                # 6 sequential stages with granular checkboxes
├── public/
│   ├── manifest.json             # PWA web app manifest (standalone; theme/background color #121417)
│   ├── sw.js                     # Service worker: network-first pages, stale-while-revalidate assets (offline cache)
│   └── icons/                    # PNG icons rendered from the mascot: favicon-32, apple-touch-icon, icon-192, icon-512, maskable-512
├── scripts/
│   ├── launch.mjs                # Desktop launcher (`npm run app`): builds if needed, starts serve-dist, opens an Edge app window
│   ├── serve-dist.mjs            # Localhost-only static server for dist/ on port 4173; exits after 10 idle minutes
│   └── windows/
│       ├── create-desktop-shortcut.ps1 # `npm run desktop:shortcut`: creates Keroo.lnk on the desktop
│       └── keroo.ico             # Shortcut icon (seven native PNG frames, 16-256px)
└── src/
    ├── main.tsx                  # Application bootstrap & mount; registers sw.js in production builds only
    ├── App.tsx                   # Top-level view router, onboarding guard, theme sync, Cmd+K, quick-add transaction modal
    ├── index.css                 # Tailwind layers, OKLCH custom properties (light & .dark), system font stack, tabular-nums, tactile buttons
    ├── types/
    │   └── index.ts              # Entity TypeScript types (Account, Transaction, AutoRule, RecurringBill, ...) + doc-name aliases
    ├── core/                     # Pure financial & mascot engines (zero UI)
    │   ├── currency.ts           # Integer cents arithmetic, formatting & parsing (BRL/USD/EUR); defaultCurrencyFor(locale)
    │   ├── dates.ts              # LOCAL-calendar date helpers (getLocalTodayISO, formatDateForLocale) — never use toISOString() for "today"
    │   ├── accountForms.ts       # Pure helpers shared by views (bill radar selection, rate parsing, cadence/status labels)
    │   ├── envelopes.ts          # Envelope budgeting, To-Be-Budgeted pool & rollover calculations
    │   ├── installments.ts       # 1x–24x card installment schedule generator (remainder on the 1st installment)
    │   ├── subscriptions.ts      # Recurring bills radar & 5-state status machine
    │   ├── split.ts              # Bilateral debt netting & 50/50 split math
    │   ├── kerooMood.ts          # 5-mood deterministic evaluator (< 2ms), mascot poses & bill check-in queue
    │   ├── kerooInsights.ts      # Statistical spending heuristics (delivery spike, etc.)
    │   ├── autoRules.ts          # Auto-categorization rule engine, payee cleaning & SHA-256 dedup hashing
    │   ├── importParser.ts       # CSV & OFX bank statement parsers
    │   ├── backup.ts             # JSON backup export / validated atomic restore of every Dexie table (`keroo-backup` v1)
    │   └── appLock.ts            # App lock: salted PBKDF2-SHA-256 password record in localStorage, idle timeout
    ├── db/                       # Local-first persistence layer
    │   ├── index.ts              # KerooDatabase (Dexie) class & the `db` instance; re-exports schema and validation
    │   ├── schema.ts             # KEROO_DB_SCHEMA_V1 table/index declarations; re-exports the entity types from src/types
    │   ├── validation.ts         # Dexie hooks rejecting non-integer cents on every monetary field
    │   ├── seed.ts               # Clean-slate category seed + bilingual demo dataset (seedCleanSlate, seedDemoData, reset/load)
    │   └── demoData.ts           # Re-exports seedDemoData / loadDemoData from seed.ts
    ├── i18n/                     # Bilingual translation engine
    │   ├── index.tsx             # I18nProvider, useTranslation, translate(), resolveInitialLocale (English-first boot)
    │   ├── en-US.json            # American English dictionary (authoring source of truth)
    │   └── pt-BR.json            # Brazilian Portuguese dictionary (100% key parity with en-US)
    ├── components/               # Sure-inspired UI components (each folder except onboarding/ has an index.ts barrel)
    │   ├── layout/               # AppLayout, Sidebar, BottomNav (with "More" sheet), Header (lock button), theme helpers
    │   ├── common/               # Button, Card, Input, Modal, Badge, ProgressBar
    │   ├── keroo/                # KerooMascot (raster), SpeechBubble, RoamingCompanion
    │   ├── lock/                 # AppLockGate (lock screen, lock now, idle auto-lock), LockScreen, AppLockCard (Settings)
    │   ├── command/              # CommandPalette (Cmd+K / Ctrl+K)
    │   └── onboarding/           # OnboardingWizard (4-step 60s setup)
    ├── views/                    # Full page views + index.ts barrel; form modals live inside their views
    │   ├── DashboardView.tsx     # Overview with live Keroo widget
    │   ├── AccountsView.tsx      # Checking/savings accounts & ledger
    │   ├── CreditCardsView.tsx   # Card statements & 1x-24x installment timeline
    │   ├── SubscriptionsView.tsx # Recurring bills radar & annual cost impact
    │   ├── PiggyBanksView.tsx    # Piggy Banks (Cofrinhos) savings goals & deposit dialog
    │   ├── SplitView.tsx         # Shared expense netting & IOU tabs
    │   └── SettingsView.tsx      # Language, currency, theme, demo reset, backup, app lock
    └── tests/                    # Vitest suites: 24 test files + setup.ts
        ├── setup.ts                            # Test setup: jest-dom matchers + fake-indexeddb (not a test file)
        ├── accountForms.test.ts                # accountForms helpers: day/percent parsing, locale labels, bills-radar selection
        ├── appLock.test.tsx                    # Password record, lock screen gate, lock now, idle auto-lock, forgot path, Settings card
        ├── autoRules.test.ts                   # Rule conditions/priority, payee cleaning, rule suggestions, SHA-256 & frequency dedup
        ├── backup.test.ts                      # Backup export/restore, atomic rollback, file validation, Settings Backup & Restore card
        ├── commonUi.test.tsx                   # Button/Card/Input/Modal/Badge/ProgressBar + navigation, palette and theme regressions
        ├── currency.test.ts                    # Integer-cent guards, arithmetic, formatting and parsing
        ├── db.test.ts                          # KerooDatabase schema, clean-slate seeding, demo data loading, cent invariants
        ├── db.stress.test.ts                   # All 14 tables round-trip, compound indexes, clean-slate reset, integer-cent hooks
        ├── envelopes.test.ts                   # YearMonth utils, available balance, activity, TBB pool, rollovers
        ├── i18n.test.ts                        # Key parity, translate()/hooks, hardcoded-string guard, every t("...") key exists
        ├── importParser.test.ts                # CSV/OFX parsing, amount/delimiter/date detection, Brazilian bank formats
        ├── installments.test.ts                # Date clamping, 1st-installment remainder, statement mapping, Tabela Price, timelines
        ├── installments.stress.test.ts         # 10,000-input cent conservation, month-end clamping 2024-2027, 24-month projections
        ├── kerooInsights.test.ts               # The five statistical spending heuristics
        ├── kerooMascot.test.tsx                # Raster rendering, sizing/ARIA, SpeechBubble actions, RoamingCompanion
        ├── kerooMascotInsights.stress.test.tsx # Raster state/fallback coverage, heuristic boundaries, speech callbacks
        ├── kerooMood.test.ts                   # 5-mood cascade, guards, < 2ms benchmark, bill check-in queue
        ├── kerooMood.stress.test.ts            # 10,000-evaluation latency benchmark, priority and zero-budget/zero-income guards
        ├── seed.empirical.test.ts              # Seed/demo datasets across locales & currencies, i18n parity, ROADMAP checkboxes
        ├── split.test.ts                       # Odd-cent payer absorption, percentage/exact splits, bilateral netting
        ├── subscriptions.test.ts               # Anchor-day preservation, cadence normalization, status machine, 3-day radar, snooze
        ├── subscriptionsSplit.stress.test.ts   # 48-cycle anchor-day drift, status boundaries, 50-transaction netting
        └── views.test.tsx                      # Every page view renders; bills radar, re-import and validation regressions
```

---

## 5. Multi-Agent Stage Handoff Protocol

Development of Keroo is split across sequential stages managed in `docs/ROADMAP.md`. When work changes hands between contributors or coding agents, or a session resumes:

1. **Read Roadmap**: Inspect `docs/ROADMAP.md` and find the first unfinished stage (`[ ]`).
2. **Review Blueprints**: Re-read the corresponding section in `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, or `docs/DESIGN_SYSTEM.md`.
3. **Execute Implementation**: Make precise, genuine edits adhering strictly to all project invariants.
4. **Mandatory Automated Verification**:
   - Run `npx tsc --noEmit` $\implies$ Must exit with 0 errors.
   - Run `npm test` $\implies$ Must pass 100% green tests.
   - Run `npm run build` $\implies$ Production bundle must compile cleanly.
5. **Update Roadmap**: Only after tests pass, check off the completed items with `[x]` in `docs/ROADMAP.md`.
6. **Trigger `/continue`**: The repository ships a `/continue` slash command (`.claude/commands/continue.md`) that runs this loop end to end. Tools without slash-command support can follow that file as a step-by-step checklist.

---

## 6. Approved Illustrated Mascot

Gustavo approved the actual raster breathing/blinking preview on 2026-10-19 after
rejecting the earlier SVG interpretation. Preserve the painted texture, proportions,
cream belly, friendly eyes and gold coin of the approved illustration. Do not redraw
it as vector geometry or compose independent accessories on top of it.

The canonical sources are `assets/mascot/approved-idle.webp` (exact approved loop),
`source-blink-frames.png` and `icon-master.png`. See `assets/mascot/README.md` for
export and installation instructions, and `docs/DESIGN_SYSTEM.md` section 6 for
the rendering contract. `KerooMascot.tsx` displays those assets through one image.
It is not the artwork master.

Ten historical pose identifiers remain compatible with the pure mood evaluator;
they map to idle, attentive, celebration, rest, playful and saving presentations.
The coin is painted into the illustration. Deprecated `coinProp` values do not
add overlays. Rest uses its closed-eye PNG. Whole-character reactions supplement
the approved loop; reduced motion and hidden documents select true static PNGs.
Tiny slots use density-aware portrait PNGs. Both dictionaries describe the current
presentation, rather than nonexistent toast, cups or tongue props.

Run `npm run mascot:assets` to regenerate exports using the optional Pillow toolchain.
Normal npm builds use checked-in assets without Python or image APIs. Native ICO
frames span 16-256px; web icon and art URLs are cache-versioned. Keep exports and
`mascot-assets.json` together. Never treat automated checks as visual acceptance.
The financial engine and atomic bill actions remain independent of rendering.
