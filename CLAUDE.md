# CLAUDE.md — Authoritative Engineering Guide for Keroo

Welcome to **Keroo**. This document is the primary reference manual for any Claude Code (Opus) session. It establishes non-negotiable architectural invariants, development workflows, testing requirements, directory structure, and the multi-agent stage handoff protocol.

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
   - Do NOT search for, read, reference, or attempt to import any legacy spreadsheet (e.g., `FINANCES.xlsx`).
   - The application starts with an empty database and guides the user through a 60-second onboarding wizard with an optional 1-click Demo Data / Clean Slate Reset toggle.

3. **Exact Remainder Distribution on 1st Installment**:
   - For credit card installment purchases ($1x$ to $24x$), remainder cents ($A \pmod N$) MUST be allocated exclusively to the 1st installment:
     $$I_1 = \lfloor A / N \rfloor + (A \pmod N), \quad I_k = \lfloor A / N \rfloor \quad (\text{for } 2 \le k \le N)$$
   - This ensures $\sum_{k=1}^N I_k \equiv A$ down to the exact cent without penny loss or accumulation.

4. **100% Bilingual Translation Parity (`pt-BR` & `en-US`)**:
   - Every single UI string, button label, dialogue, status badge, error message, and Keroo pet prompt must exist in both `pt-BR` and `en-US`.
   - Automated tests verify bidirectional key equivalence. Missing keys break the build.

5. **100% Deterministic Mascot Engine (< 2.0ms, Zero AI, Zero Cloud)**:
   - The Keroo mascot mood evaluator (`evaluateKerooMood`) is a pure synchronous function with $O(1)$ complexity running in $< 2\text{ms}$ (benchmarked at $\approx 0.02\text{ms}$).
   - Zero LLM calls, zero network fetches, zero cloud dependencies for mascot behavior.

6. **Strict Workspace Confinement**:
   - All reads, writes, and commands MUST target files strictly inside `O:\keroo`. Never touch external directories.

---

## 3. Development Commands & Tooling

| Command | Action | Notes |
|---|---|---|
| `npm install` | Install dependencies | Uses lockfile |
| `npm run dev` | Launch local development server | Serves Vite app at `http://localhost:5173` |
| `npm run build` | Compile production build | Runs `tsc -b` and `vite build` to `dist/` |
| `npm test` | Run complete automated test suite | Runs Vitest in single-run mode |
| `npx vitest run` | Execute test suite | Runs tests without watch mode |
| `npx vitest run --coverage` | Test suite with coverage | Verifies engine coverage |
| `npx tsc --noEmit` | Strict TypeScript typecheck | Verifies zero compiler errors |

---

## 4. Architecture & Directory Quick-Map

```
O:\keroo\
├── CLAUDE.md                     # Authoritative engineering guide (this file)
├── AGENTS.md                     # Universal multi-agent operational guide
├── .claude/
│   └── commands/
│       └── continue.md           # Instructions for /continue slash command
├── docs/
│   ├── ARCHITECTURE.md           # System topology, data flow, reactive patterns
│   ├── DATABASE_SCHEMA.md        # Dexie.js 14 IndexedDB tables (12 domain entity tables + 2 singleton configuration tables), indexes, TypeScript schemas
│   ├── DESIGN_SYSTEM.md          # OKLCH tokens, typography, 1px borders, layout
│   └── ROADMAP.md                # 6 sequential stages with granular checkboxes
├── public/
│   ├── manifest.json             # PWA web app manifest
│   ├── sw.js                     # Service worker offline caching
│   └── icons/                    # App icons (192px, 512px, maskable)
└── src/
    ├── main.tsx                  # Application bootstrap & mount
    ├── App.tsx                   # Top-level router & onboarding guard
    ├── core/                     # Pure financial & mascot engines (zero UI)
    │   ├── currency.ts           # Integer cents formatting & parsing (BRL/USD/EUR)
    │   ├── dates.ts              # LOCAL-calendar date helpers (getLocalTodayISO, formatDateForLocale) — never use toISOString() for "today"
    │   ├── accountForms.ts       # Pure helpers shared by views (bill radar selection, rate parsing, cadence/status labels)
    │   ├── envelopes.ts          # Envelope budgeting & rollover calculations
    │   ├── installments.ts       # 1x–24x card installment schedule generator
    │   ├── subscriptions.ts      # Recurring bills radar & status state machine
    │   ├── split.ts              # Bilateral debt netting & 50/50 split math
    │   ├── kerooMood.ts          # 5-mood deterministic evaluator (< 2ms)
    │   ├── kerooInsights.ts      # Statistical spending heuristics (delivery spike, etc.)
    │   ├── rules.ts              # Auto-categorization rule processor
    │   └── importParser.ts       # CSV & OFX bank statement parsers
    ├── db/                       # Local-first persistence layer
    │   ├── db.ts                 # Dexie database instance & table indexing
    │   ├── schema.ts             # TypeScript entity interfaces
    │   ├── seed.ts               # Clean-slate default category seed
    │   └── demoData.ts           # 1-click rich demo dataset generator
    ├── i18n/                     # Bilingual translation engine
    │   ├── index.ts              # Translation hook & language state
    │   ├── pt-BR.json            # Brazilian Portuguese dictionary (source of truth)
    │   └── en-US.json            # American English dictionary (100% key parity)
    ├── styles/                   # Design system tokens & Tailwind configuration
    │   ├── globals.css           # OKLCH custom properties, safe areas, fonts
    │   └── tailwind.config.js    # Tailwind theme extension
    ├── components/               # Sure-inspired UI components
    │   ├── layout/               # AppLayout, DesktopSidebar, MobileBottomNav, TopHeader
    │   ├── common/               # Button, Card, Input, Modal, Badge, ProgressBar
    │   ├── keroo/                # KerooMascot (SVG), SpeechBubble, InsightPill
    │   ├── command/              # CommandPalette (Cmd+K / Ctrl+K)
    │   ├── onboarding/           # OnboardingWizard (4-step 60s setup)
    │   └── forms/                # Transaction, Installment, PiggyBank, Bill modals
    ├── views/                    # Full page views
    │   ├── DashboardView.tsx     # Overview with live Keroo widget
    │   ├── AccountsView.tsx      # Checking/savings accounts & ledger
    │   ├── CreditCardsView.tsx   # Card statements & 1x-24x installment timeline
    │   ├── SubscriptionsView.tsx # Recurring bills radar & annual cost impact
    │   ├── PiggyBanksView.tsx    # Cofrinhos savings goals & deposit dialog
    │   ├── SplitView.tsx         # Shared expense netting & IOU tabs
    │   └── SettingsView.tsx      # Language, currency, theme, demo reset
    └── tests/                    # Automated Vitest test suites
        ├── currency.test.ts
        ├── installments.test.ts
        ├── subscriptions.test.ts
        ├── split.test.ts
        ├── kerooMood.test.ts
        ├── kerooInsights.test.ts
        └── i18n.test.ts
```

---

## 5. Multi-Agent Stage Handoff Protocol

Development of Keroo is split across sequential stages managed in `docs/ROADMAP.md`. When switching agents (e.g., between Claude Code Opus and Gemini Antigravity) or resuming a session:

1. **Read Roadmap**: Inspect `docs/ROADMAP.md` and find the first unfinished stage (`[ ]`).
2. **Review Blueprints**: Re-read the corresponding section in `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, or `docs/DESIGN_SYSTEM.md`.
3. **Execute Implementation**: Make precise, genuine edits adhering strictly to all project invariants.
4. **Mandatory Automated Verification**:
   - Run `npx tsc --noEmit` $\implies$ Must exit with 0 errors.
   - Run `npm test` $\implies$ Must pass 100% green tests.
   - Run `npm run build` $\implies$ Production bundle must compile cleanly.
5. **Update Roadmap**: Only after tests pass, check off the completed items with `[x]` in `docs/ROADMAP.md`.
6. **Trigger `/continue`**: Claude Code users can simply type `/continue` in chat to automatically execute this loop.


---

## 6. Mascot Character Redesign Kit (Claude Code Hand-off)

The visual design of the Keroo mascot is intentionally prepared for rapid visual overhaul in **Claude Code**. The complete asset references and component contracts are documented below:

### Reference Images
The 9 authoritative reference illustrations uploaded by the user are located at:
`O:\keroo\docs\mascot-references\`
- `media_1792158191527.png`: Kawaii frog sitting with gold coin in mouth (*mouth clamp*).
- `media_1792158272100.png`: Fetal pose crying with waterfall tears.
- `media_1792158279206.png`: Deflated puddle / melted blob frog.
- `media_1792158298995.png`: Slice of toast slapped on frog face.
- `media_1792158315043.png`: Peace sign ✌️ and sunglasses sipping drink.
- `media_1792158377137.png`: Sleeping frog with snot bubble.
- `media_1792158384573.png`: Cheeky tongue sticking out 😛.
- `media_1792158391200.png`: Curious head tilt with question mark.
- `media_1792158399187.png`: Multi-pose expression sheet with Jin Chan coin swallowing into piggy bank.

### Target Component Contract
Component path: `src/components/keroo/KerooMascot.tsx`
Interface:
```typescript
export type MascotCoinProp = 'none' | 'mouth_clamp' | 'flipping' | 'hugging' | 'polishing' | 'swallowing';

export interface KerooMascotProps {
  pose?: KerooPose; // 10 poses
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;
  coinProp?: MascotCoinProp;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
  style?: React.CSSProperties;
}
```

### Redesign Guidelines for Claude Code
1. Inspect the reference PNGs in `docs/mascot-references/` using your vision capabilities.
2. Note the single organic "blob" silhouette (smooth continuous bezier curve body rather than assembled geometric circles).
3. Redraw `KerooMascot.tsx` replacing the current vector SVG paths with clean, organic continuous-path SVG artwork matching the 9 reference images.
4. Keep the exact same `KerooMascotProps` interface and test attributes so all 24 mascot tests in `src/tests/kerooMascot.test.tsx` and `src/tests/challenger_m4_mascot_insights_stress.test.tsx` pass without modification!
