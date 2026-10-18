# Development Roadmap — Keroo

This roadmap outlines the sequential, self-contained development stages for **Keroo**. Any contributor or autonomous coding agent can read this document to identify the next incomplete task, implement it, run the required verification suite, and advance the project.

---

## Stage 1: Multi-Agent Continuity Kit & Authoritative Blueprints

Establish foundational project architecture, multi-agent operational rules, design specifications, and database schemas prior to writing application code.

- [x] Create root `CLAUDE.md` defining project architecture, strict invariants (integer cents, zero legacy spreadsheet reference, bilingual parity, sub-2ms deterministic pet), build/test commands, and the `/continue` protocol.
- [x] Create root `AGENTS.md` defining universal cross-agent boundaries, workspace confinement (the repository root), verification mandates, and handoff protocols.
- [x] Create `.claude/commands/continue.md` enabling zero-context-loss stage resumption through the `/continue` slash command.
- [x] Create `docs/ARCHITECTURE.md` specifying system topology, component dependency tree, local-first reactive data flow with Dexie.js (`useLiveQuery`), offline PWA configuration, sub-2ms deterministic pet engine, and CSV/OFX statement parser.
- [x] Create `docs/DATABASE_SCHEMA.md` specifying Dexie.js v1 schema for 14 IndexedDB tables (12 domain entity tables + 2 singleton configuration tables), compound indexes, TypeScript entity interfaces, integrity constraints, clean-slate seed categories, and rich demo dataset.
- [x] Create `docs/DESIGN_SYSTEM.md` specifying Sure-inspired craft principles, full OKLCH semantic palette (Light & Dark), typography hierarchy with mandatory `tabular-nums` and 16px mobile input floor, concentric radii geometry, adaptive layout specs, and Kawaii Doodle Frog mascot visual style with roaming companion engine.
- [x] Create `docs/ROADMAP.md` tracking sequential development stages with granular checkboxes.

---

## Stage 2: Scaffolding, Core Types, Local DB & Onboarding

Scaffold the React + TypeScript + Tailwind CSS project, establish the Dexie.js database, implement the 60-second onboarding wizard, and configure testing infrastructure.

- [x] Initialize project scaffolding using Vite with React 18/19 and TypeScript inside the repository root.
- [x] Configure Tailwind CSS with custom OKLCH semantic color variables (`surface`, `border`, `brand`, `coin`, `danger`, `warning`, `info`, `success`) and `tabular-nums`.
- [x] Implement `src/db/index.ts` and `src/db/schema.ts` defining the Dexie `KerooDatabase` class with 14 IndexedDB tables (12 domain entity tables + 2 singleton configuration tables) and compound indexes.
- [x] Implement clean-slate category seed generator (`src/db/seed.ts`) and rich demo dataset generator (`src/db/demoData.ts`).
- [x] Implement bilingual i18n dictionary system (`src/i18n/index.tsx`, `src/i18n/pt-BR.json`, `src/i18n/en-US.json`) with initial 100% key parity.
- [x] Build 4-step 60-second Clean-Slate Onboarding Wizard (`src/components/onboarding/OnboardingWizard.tsx`) covering Language (`pt-BR`/`en-US`), Base Currency (`BRL`/`USD`/`EUR`), Pet Nickname, and Demo Data / Clean Slate toggle.
- [x] Configure Vitest testing framework and write initial verification tests for database initialization and seed data loading.

---

## Stage 3: Core Financial Precision Engines & Unit Test Suites

Implement the pure, deterministic business logic engines for integer-cent currency formatting, credit card installment projections, recurring bill radars, split ledger netting, and bank statement import.

- [x] Implement `src/core/currency.ts` providing integer cents arithmetic, locale-aware formatters (`formatCurrencyCents`), and robust input parsers (`parseCurrencyInputToCents`) for BRL, USD, and EUR.
- [x] Implement `src/core/envelopes.ts` calculating monthly zero-based envelope budgeting, To-Be-Budgeted (TBB) pool, and configurable rollovers (`rollover_negative` vs `reset_zero`).
- [x] Implement `src/core/installments.ts` calculating Brazilian credit card statement projections (`1x–24x`), statement month mapping based on closing day and due day, and exact cent-remainder allocation to the 1st installment ($I_1 = \lfloor A/N \rfloor + (A \pmod N)$).
- [x] Implement optional installment interest (Tabela Price compound interest) and upfront surcharge fee calculators in `src/core/installments.ts`.
- [x] Implement `src/core/subscriptions.ts` providing anchor-day preservation across leap years and month ends, cadence normalization (weekly to annual), and 5-state status machine (`PAID_OK`, `UPCOMING_SAFE`, `DUE_SOON`, `DUE_TODAY`, `OVERDUE`).
- [x] Implement `src/core/split.ts` calculating zero-sum bilateral debt netting between parties, 50/50 utility splits with odd-cent absorption by payer, and running IOU settlements.
- [x] Implement `src/core/autoRules.ts` deterministic auto-categorization and payee normalization engine.
- [x] Implement `src/core/importParser.ts` for CSV (auto-delimiter and date detection) and OFX 1.0/2.0 statement parsing with hash-based deduplication.
- [x] Write exhaustive unit test suites achieving 100% green tests:
  - `tests/currency.test.ts`
  - `tests/installments.test.ts` (verifying cent conservation $\sum I_k \equiv A$ for all $N \in [1, 24]$)
  - `tests/subscriptions.test.ts` (verifying anchor day preservation and 3-day radar window)
  - `tests/split.test.ts` (verifying bilateral netting invariance)
  - `tests/importParser.test.ts` (verifying OFX and CSV ingestion)

---

## Stage 4: Deterministic Keroo Frog Pet Engine

Implement the zero-AI, sub-2ms deterministic mood state machine, interactive speech bubble check-in controller, statistical spending heuristics, and mascot companion mechanics.

- [x] Implement `src/core/kerooMood.ts` evaluating the 5-state mood cascade (`THRIVING`, `CALM`, `ALERT`, `SWEATING`, `SLEEPY`) synchronously in $< 2\text{ms}$ with zero AI and zero external calls.
- [x] Implement proactive bill queue prioritizer ranking overdue bills, bills due today, and bills due within 3 days.
- [x] Implement interactive speech bubble controller with 1-click actions:
  - `[Paid!]` (pt-BR: `Já paguei!`): atomically marks bill paid, inserts transaction, debits account, updates envelope, and recalculates mood.
  - `[Snooze]` (pt-BR: `Lembrar amanhã`): snoozes reminder by 24h and advances queue.
  - `[Edit]` (pt-BR: `Ajustar valor`): expands inline integer-cent input before payment.
- [x] Implement statistical spending heuristics in `src/core/kerooInsights.ts`:
  - Delivery vs. Grocery Ratio Spike Heuristic (alerting when takeout $\ge 60\%$ of groceries).
  - 3-Month Moving Average Category Surge Heuristic (detecting $> 35\%$ spikes).
  - Credit Card Installment Relief Month Celebration (detecting drop in monthly obligations).
  - Annualized Subscription Cost Summary.
  - Bilateral Split Net Receivables Alert ($\ge R\$\ 50,00$).
- [x] Implement Mascot Art & Charismatic Reactive Poses:
  - Kawaii Doodle Frog vector geometry (`#8CE93A` / `#7ED321`, organic 2.5px rounded stroke, bead eyes). *(Superseded by the Stage 6 redraw: flat `#86E63C` fill and `#1F1F1F` outline; see CLAUDE.md section 6.)*
  - Jin Chan Golden Fortune Coin prop interaction mechanics (mouth clamp, flipping, hugging, polishing, swallowing into piggy banks).
  - Dramatic & comedic poses: fetal pose waterfall tears, melted frog blob, toast on face, peace sign `✌️` & dab, leaning sipping juice, sleeping with snot bubble, cheeky face `😛`.
- [x] Write comprehensive unit tests in `tests/kerooMood.test.ts` and `tests/kerooInsights.test.ts` verifying all state transitions, benchmark latencies ($< 2\text{ms}$), and speech trigger rules.

---

## Stage 5: Sure-Inspired UI, Bilingual Parity, Roaming Pet & PWA

Build all application views, responsive navigation, Piggy Banks (*Cofrinhos*), Command Palette (`Cmd+K`), roaming mascot companion, and PWA configuration.

- [x] Implement complete bilingual i18n dictionaries (`src/i18n/pt-BR.json` and `src/i18n/en-US.json`) with 100% key parity and automated parity test (`tests/i18n.test.ts`).
- [x] Build responsive layout architecture (`src/components/layout/`):
  - Desktop 260px fixed / 72px collapsible left sidebar.
  - Mobile bottom navigation bar with 48px touch targets and safe area insets (`padding-bottom: max(0.75rem, env(safe-area-inset-bottom))`).
  - Top header with Keroo mini status widget and quick search trigger.
- [x] Build Sure-inspired UI library (`src/components/common/`): `Button`, `Card`, `Input`, `Modal`, `Badge`, `ProgressBar`.
- [x] Build Dashboard View (`src/views/DashboardView.tsx`) with live Keroo widget, speech bubble check-in queue, KPI cards, and upcoming bills radar.
- [x] Build Roaming Mascot Companion Layer ("Roaming Companion Pet"; pt-BR UI label: "Pet que passeia pelo app"):
  - Screen hopping and card perching atop dashboard cards.
  - Drag-and-drop interactive physics with spring docking.
  - Persistent user toggle in Settings (`user_settings.roamingPetEnabled`).
  - Coin swallowing animation on piggy bank deposit.
- [x] Build Accounts & Transactions Ledger View (`src/views/AccountsView.tsx`) with category badges, cleared status toggles, and new transaction modal.
- [x] Build Credit Cards & Installment Timeline View (`src/views/CreditCardsView.tsx`) with closing/due date indicators and 6-24 month projection graph.
- [x] Build Subscriptions & Recurring Bills View (`src/views/SubscriptionsView.tsx`) with cadence badges, payment status pills, and annual commitment card.
- [x] Build Piggy Banks (*Cofrinhos*) View (`src/views/PiggyBanksView.tsx`) with visual progress bars, monthly pacing calculation, and 1-click deposit/withdraw modal.
- [x] Build Split / IOU Ledger View (`src/views/SplitView.tsx`) with contact list, bilateral net balances, and settlement logging.
- [x] Build `Cmd+K` / `Ctrl+K` Global Command Palette (`src/components/command/CommandPalette.tsx`) with keyboard navigation for quick transactions, view navigation, and settings toggling.
- [x] Build Settings View (`src/views/SettingsView.tsx`) with language selector, base currency selector, theme toggle (Light/Dark/System), roaming pet toggle, and Demo Data / Clean Slate reset button.
- [x] Configure Progressive Web App (PWA):
  - `public/manifest.json` with standalone mode, icons, and theme colors.
  - `public/sw.js` with Stale-While-Revalidate asset caching.
  - `index.html` with viewport-fit=cover and iOS apple-mobile-web-app meta tags.

---

## Stage 6: Dual-Track Verification, Edge Cases & Polish

Perform automated test verification, build pipeline checks, edge-case hardening, and local serving verification.

- [x] Execute `npx tsc --noEmit` and confirm 0 TypeScript compiler errors. *(2026-10-18: 0 errors)*
- [x] Execute `npm test` and confirm 100% green test assertions across all test suites. *(2026-10-18: 21 files, 447 tests green)*
- [x] Execute `npm run build` and confirm production bundle compiles cleanly. *(2026-10-18: built in 27s; only a chunk-size warning)*
- [x] Verify clean-slate onboarding flow from first launch through language/currency selection to clean dashboard. *(Fixed: first launch was stuck on "Loading..." (pt-BR: "Carregando...") because a missing `user_settings` row was treated as "still loading".)*
- [x] Verify 1-click Demo Data toggle populates complete realistic dataset (cards, bills, piggy banks, split tab, pet state). *(Demo seed is now atomic and ledger-consistent: card balance = open installment debt, posted 1st installment, anchor day = due day.)*
- [x] Verify 1-click Clean Slate Reset cleanly wipes the database back to clean-slate onboarding. *(Reset keeps the user's theme/roaming preference and returns to an empty dashboard with seed categories.)*
- [x] Verify responsive layout across Desktop (≥ 1024px), Tablet (768px-1023px), and Mobile (< 768px with safe-area insets). *(Mobile bottom nav gained a "More" (pt-BR: "Mais") sheet so Cards & Installments (pt-BR: "Cartões & Parcelas"), Piggy Banks (pt-BR: "Cofrinhos") and Split & IOUs (pt-BR: "Divisão & Amigos") are reachable on phones.)*
- [x] Verify Light and Dark mode appearance, APCA / WCAG contrast compliance, and instant theme switching. *(Fixed: the header/sidebar toggle wrote a PointerEvent to IndexedDB. Contrast relies on the OKLCH tokens in `docs/DESIGN_SYSTEM.md`; not instrument-measured.)*
- [x] Verify bilingual translation parity with zero missing keys in both `pt-BR` and `en-US`. *(445 keys per language; `tests/i18n.test.ts` now also scans views for hardcoded Portuguese.)*
- [x] Confirm local serving on `http://localhost:5173`.

### Stage 6 — 2026-10-18 review notes
- Mascot redrawn from scratch (`src/components/keroo/KerooMascot.tsx`): single-blob sticker art inspired by the kawaii doodle-frog sticker style (see CLAUDE.md section 6); PWA icons in `public/icons/` generated from it.
- Core fixes: bill payment transaction now has an id and updates the month envelope; piggy-bank withdrawals cannot exceed the saved balance; statement import dedupes per account and parses `D`/`C` suffixes; all "today" values use `src/core/dates.ts` (local calendar, not UTC); installment flat surcharge keeps interest ≥ 0; `PAID_OK` is cycle-aware.
- Known follow-ups (not blocking): the mascot `toast_face` and `peace_dab` poses could be polished further. *(Since resolved: installment and piggy-bank ledger notes are written with `t()` and `importParser` warnings carry codes the view translates. The bill-payment note is passed in already translated by the dashboard (`dashboard.bill_payment_note`).)*
