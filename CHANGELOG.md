# Changelog

All notable changes to Keroo are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- CI uses `actions/checkout@v7` and `actions/setup-node@v7`. The workflow inputs did not change.

## [0.1.0] - 2026-10-18

First public release. The interface is English-first: Keroo starts in `en-US`, switches to `pt-BR` automatically when the browser language is Portuguese, and keeps the two dictionaries at 100% key parity.

### Added

- **Local-first by design.** All data lives in the browser's IndexedDB (Dexie, 14 tables). There is no server, no account and no network calls from the app.
- **Onboarding in about a minute.** A four-step wizard covers language, base currency (USD, EUR or BRL), the mascot's nickname, and a choice between a clean slate and 1-click demo data.
- **Dashboard** with the live Keroo widget, KPI cards, the month's income and expenses, an upcoming-bills radar and spending insights.
- **Accounts and transaction ledger** for checking, savings, credit card, cash and investment accounts, with a form for new transactions.
- **Envelope budgeting engine** with a To-Be-Budgeted pool and two rollover modes (`rollover_negative` and `reset_zero`). The dashboard shows the month's target and how many envelopes are overspent. There is no screen for assigning envelope amounts yet.
- **Credit card installments, 1x to 24x**, with the remainder cent allocated to the first installment so the parts always add up to the exact total. Includes statement-month mapping from closing and due days, optional Tabela Price compound interest, and a projection timeline over 6 to 24 months.
- **Subscriptions and recurring bills radar.** Seven cadences from weekly to annual, due-day anchoring that survives short months and leap years, a five-state status (`PAID_OK`, `UPCOMING_SAFE`, `DUE_SOON`, `DUE_TODAY`, `OVERDUE`) and an annual cost summary.
- **Bill check-in prompts** from the mascot with one-click Paid, Snooze and Edit amount. Marking a bill paid records the payment, debits the account and updates the month's envelope in a single atomic write.
- **Piggy banks (Cofrinhos)** savings goals with progress bars, monthly pacing, and deposits and withdrawals (a withdrawal cannot exceed the saved balance).
- **Split and IOU ledger.** Contacts, 50/50 expense splits with the odd cent absorbed by the payer, zero-sum bilateral netting and settlement logging.
- **Statement import** from CSV (delimiter and date format detected automatically) and OFX 1.0/2.0, with per-account duplicate detection and translated warnings for rows that could not be parsed.
- **Auto-categorization and payee-normalization rules engine**, applied as you type a payee in the transaction forms. There is no rule editor in the UI yet, so rules only take effect if they already exist, for example from a restored backup.
- **Keroo, a Jin Chan lucky frog mascot.** A pure, deterministic mood engine (`THRIVING`, `CALM`, `ALERT`, `SWEATING`, `SLEEPY`) that evaluates in under 2 ms with no AI and no network, ten illustrated poses, golden-coin interactions, and rule-based insights such as takeout versus groceries, category surges, installment relief and annual subscription cost. An optional roaming companion can wander the app.
- **Backup and restore** in Settings: export every table to a single JSON file, and restore it with an all-or-nothing replace that leaves your data untouched if anything is wrong with the file. Keroo also asks the browser for persistent storage after onboarding and shows how much storage it uses.
- **Command palette** with `Ctrl+K` / `Cmd+K` for quick navigation and actions.
- **Settings** for language, base currency, light/dark/system theme, the roaming companion, and demo data or clean-slate reset.
- **Installable PWA** with a web app manifest, an offline service worker and iOS safe-area support. Responsive layout with a sidebar on desktop and a bottom navigation bar on phones.
- **Languages and currencies.** `en-US` and `pt-BR` at full parity; the default currency follows the language (BRL for `pt-BR`, USD otherwise) and can be changed to USD, EUR or BRL at any time.
- **Quality gates.** An automated suite of 22 Vitest files, typechecking, and a GitHub Actions workflow that runs typecheck, tests and build on Node 22 and 24, plus weekly Dependabot updates.
- **Project files.** MIT license, contributing guide, code of conduct, security policy, issue forms and a pull request template.

### Known limitations

- Only `en-US` and `pt-BR` are available. Adding a language needs more than a dictionary; see [CONTRIBUTING.md](CONTRIBUTING.md#adding-a-language).
- The build assumes it is served from a domain root. Hosting under a sub-path, such as a GitHub Pages project site, is not supported yet.
- There is no live demo or screenshots yet.
- There is no cloud sync, by design. Use Backup and restore to move data between browsers and devices.

[Unreleased]: https://github.com/gusthanks/keroo/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gusthanks/keroo/releases/tag/v0.1.0
