# Contributing to Keroo

Thanks for taking the time to help. Keroo is a small, volunteer-run project: a local-first personal finance app that keeps all data in your browser. Bug reports, translations, documentation fixes and code are all welcome.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are licensed under the [MIT License](LICENSE), like the rest of the project.

For an overview of what Keroo is, see the [README](README.md). For how the code fits together, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Ways to help

- **Report a bug** using the bug report form on the [issue tracker](https://github.com/gusthanks/keroo/issues/new/choose). Please never paste real financial data; see the checklist in the form.
- **Suggest a feature** with the feature request form. Describe the problem first, then your idea.
- **Ask a question or float an idea** in [GitHub Discussions](https://github.com/gusthanks/keroo/discussions).
- **Fix a typo or improve the docs.** Small pull requests are very welcome.
- **Improve a translation** or [add a language](#adding-a-language).
- **Write code.** For anything bigger than a small fix, please open an issue or discussion first so we can agree on the approach before you invest time.

Security problems should not go to the public tracker. See [SECURITY.md](SECURITY.md).

## Development setup

You need **Node.js 20 or newer** and npm 10. The repo pins Node 22 in `.nvmrc`, and `.npmrc` sets `engine-strict=true`, so npm refuses to install on an unsupported Node version.

```bash
git clone https://github.com/gusthanks/keroo.git
cd keroo
npm ci          # installs exactly what package-lock.json says
npm run dev     # Vite dev server at http://localhost:5173
```

Use npm only. `package-lock.json` is the single lockfile, and `yarn.lock` and `pnpm-lock.yaml` are git-ignored.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server at `http://localhost:5173` |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm test` | Runs the whole Vitest suite once (`vitest run`) |
| `npm run test:watch` | Vitest in watch mode while you work |
| `npm run test:coverage` | Test run with V8 coverage |
| `npm run build` | `tsc && vite build`, output in `dist/` |
| `npm run preview` | Serves the production build locally |

The service worker is only registered in production builds, so the dev server never serves cached modules. To try the installable PWA and offline behavior, run `npm run build && npm run preview`.

Files use LF line endings, UTF-8 and two-space indentation. `.editorconfig` and `.gitattributes` take care of this in most editors.

## The three gates before a pull request

Run all three locally. They must pass before you open a PR, and CI runs them on Node 20 and 22 (see `.github/workflows/ci.yml`).

```bash
npm run typecheck   # same as `npx tsc --noEmit`: must exit with 0 errors
npm test            # must pass 100% green
npm run build       # the production bundle must compile cleanly
```

Vite currently prints a chunk-size warning during the build. That is known and is not a failure; errors are.

Please don't make the gates pass by cheating: no blanket `any` or `@ts-ignore` to silence the compiler, and no tests that always pass or hard-coded answers in production code.

## Project invariants (PR checklist)

These rules protect users' data and the things that make Keroo what it is. A change that breaks one will not be merged, even if the gates are green. [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) describe the same rules for AI coding agents, and they apply to human contributors too.

- [ ] **Integer cents only.** Every monetary amount is stored and computed as an integer number of cents (`R$ 10,50` is `1050`). Never use floating-point numbers for money. When you divide, round explicitly (`Math.round`) or use integer floor plus an allocated remainder. The database also rejects non-integer cents in monetary fields (`src/db/validation.ts`).
- [ ] **Remainder on the first installment.** For card purchases split into `N` installments (1x to 24x) of `A` cents, the remainder goes to installment 1 only: `I1 = floor(A / N) + (A mod N)` and `Ik = floor(A / N)` for `k >= 2`. The installments must always sum to exactly `A`.
- [ ] **Both languages, every time.** Every new UI string needs a key in `src/i18n/en-US.json` (the authoring source) **and** in `src/i18n/pt-BR.json`, with the same `{placeholders}`. Tests check key parity, non-empty values, matching placeholders, and that views contain no hard-coded user-facing text, so use `t()` rather than literals.
- [ ] **The mascot stays deterministic.** `evaluateKerooMood` and the insight heuristics are pure, synchronous functions with no network calls, no AI and no cloud dependency, and the mood evaluation stays well under its 2 ms budget (checked in `src/tests/kerooMood.test.ts`).
- [ ] **Core engines stay UI-free.** Code in `src/core/` does not import React or touch the DOM. Views call the engines; they do not do money math themselves.
- [ ] **Dates use the local calendar.** For "today" use `getLocalTodayISO()` from `src/core/dates.ts`, never `new Date().toISOString()`, which is UTC and can be off by a day.
- [ ] **Nothing outside the repository.** Do not commit absolute local paths, personal data, or files from outside the checkout. Keroo starts from an empty database (or the optional demo data); it never imports anyone's private spreadsheets.
- [ ] **No network calls in the app.** Keroo has no server. Please do not add analytics, telemetry or remote APIs.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/): `type(optional scope): short imperative summary`, in lowercase.

| Type | Use it for |
|---|---|
| `feat` | A new user-visible capability |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or fixing tests |
| `chore` | Tooling, config, dependencies, housekeeping |
| `ci` | GitHub Actions and Dependabot |

Examples from the history:

```text
feat(settings): backup export/restore and persistent storage request
fix(i18n): localize the recurring bill payment note
ci: add GitHub Actions workflow and Dependabot
```

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep the change focused. Unrelated refactors make review harder; send them separately.
3. Add or update tests for the behavior you changed.
4. Run the [three gates](#the-three-gates-before-a-pull-request).
5. Update the docs if behavior changed: `README.md`, the files under `docs/`, and a line under **[Unreleased]** in [CHANGELOG.md](CHANGELOG.md) for anything users will notice.
6. If your work completes an item in [docs/ROADMAP.md](docs/ROADMAP.md), tick it there, but only after the gates pass.
7. Open the PR and fill in the template. Link the issue it closes, if any.

## Adding a language

Keroo ships `en-US` (the default, with browser-language detection) and `pt-BR`. Adding a third language is possible, but it touches more than the dictionary. Here is the full list of places, using `es-ES` as the example.

**1. The dictionary.** Copy `src/i18n/en-US.json` to `src/i18n/es-ES.json` and translate every value. Keep all keys and all `{placeholders}` exactly as they are. At runtime `translate()` falls back to `en-US` for a missing key, but the tests require full parity.

**2. The type.** Add the tag to the `SupportedLocale` union in `src/types/index.ts` (currently `'pt-BR' | 'en-US'`). Because `dictionaries` is a `Record<SupportedLocale, ...>`, TypeScript will point you at places that must be updated.

**3. The i18n module, `src/i18n/index.tsx`.**

- Import the new JSON file and add it to the `dictionaries` map.
- Extend `isSupportedLocale`, which hard-codes the two current values (it validates what is read back from `localStorage`).
- Teach `detectBrowserLocale` the new tag. `resolveInitialLocale` calls it after the saved choice and the `initialLanguage` prop, and today it only maps browser languages starting with `pt` to `pt-BR`.

**4. The language pickers.** Each of these assumes exactly two languages today.

- `src/views/SettingsView.tsx`: the language buttons (add a third, plus new `settings.lang_*_name` keys in both dictionaries), and the guard that applies the language stored in a restored backup, which only accepts `pt-BR` and `en-US`.
- `src/components/onboarding/OnboardingWizard.tsx`: the language buttons, and the currency order that depends on `language === 'pt-BR'`.
- `src/components/layout/Sidebar.tsx` and the `onToggleLanguage` handler in `src/App.tsx` (used by the command palette): both flip between two values and need a cycle or a picker for three.

**5. The parity test.** In `src/tests/i18n.test.ts`, the parity block compares only `pt-BR` and `en-US`. Import the new dictionary and add the same assertions (no missing keys either way, non-empty strings, identical placeholders), plus a case for `resolveInitialLocale`.

**6. The engines that return Pt/En string pairs.** This is the part that currently limits a third language. These modules keep both languages' text in code instead of in the dictionaries, and their consumers pick one with a two-way check.

- `src/core/kerooMood.ts`: `reasonPt` / `reasonEn` on each mood evaluation, and `promptTextPt` / `promptTextEn` on bill check-in prompts. `SpeechBubble.tsx` chooses between them with `locale === 'en-US'`.
- `src/core/kerooInsights.ts`: `titlePt` / `titleEn` and `messagePt` / `messageEn` on every insight, with amounts formatted for `pt-BR` and `en-US`. `DashboardView.tsx` chooses with `language === 'pt-BR'`.
- `src/core/accountForms.ts`: `CADENCE_LABELS` and `BILL_STATUS_LABELS` (`labelPt` / `labelEn`), read through `getCadenceLabel`.

Two related spots use the same two-way pattern: the default category names and demo data in `src/db/seed.ts` (`group` / `groupEn`, `categories` / `categoriesEn`, `isEn`), and `defaultCurrencyFor` in `src/core/currency.ts` (`pt-BR` gives `BRL`, anything else gives `USD`).

Until these are refactored, any locale other than `pt-BR` falls into the English branch in all of them. A new language would show English in mood reasons, bill prompts, insights, cadence and status labels and default category names, while the rest of the UI is translated. The cleanest fix is the one already used for ledger notes and import warnings: have the engine return a dictionary key (or a code) plus parameters, and let the view render it with `t()`. If you want to take this on, please open an issue first so we can agree on the design.

## Database migrations

Real users have live data in their browsers' IndexedDB, so the schema cannot change casually. The database class is in `src/db/index.ts` (Dexie), and the tables and indexes are declared in `src/db/schema.ts` (`KEROO_DB_SCHEMA_V1`).

- **Any schema change must bump the version.** Never edit an existing `this.version(n)` block. Add a new one, `this.version(n + 1).stores({ ... })`, listing the tables that changed, and keep the earlier versions in place so Dexie can upgrade older databases.
- **Add an `.upgrade()` callback** when the change affects rows that already exist (renamed or reshaped fields, new required values, re-derived data), so existing users keep their data and new code never meets rows it does not understand.
- **Money stays in integer cents** during migrations too. Do not convert through floats.
- **Test it.** Open a database at the old version, run the upgrade, and check the rows.
- **Update the surrounding pieces.** Update `docs/DATABASE_SCHEMA.md`. If you add a table, add a `settings.backup_tables.<table>` label to both dictionaries, since the restore dialog lists rows per table. The backup export reads its table list from `db.tables`, so a new table is exported automatically. Bump `BACKUP_VERSION` in `src/core/backup.ts` only if the backup file format itself changes.
- Note the change in [CHANGELOG.md](CHANGELOG.md).

## Why `package.json` says `private: true`

Keroo is an application deployed as static files, not a library published to npm. `"private": true` documents that and prevents an accidental `npm publish`. It does not affect the open-source license: the code is MIT licensed.

## Questions

Ask in [GitHub Discussions](https://github.com/gusthanks/keroo/discussions), or open an [issue](https://github.com/gusthanks/keroo/issues) if it is about a specific bug or feature. Maintainers are volunteers, so replies may take a few days.
