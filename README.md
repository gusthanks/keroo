<div align="center">

<img src="public/icons/icon-512.png" width="120" alt="Keroo, the friendly green frog companion">

# Keroo

**Private, local-first personal finance, with a lucky frog to keep you company.**

[![CI](https://github.com/gusthanks/keroo/actions/workflows/ci.yml/badge.svg)](https://github.com/gusthanks/keroo/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8)
![Local-first](https://img.shields.io/badge/data-local--first-2ea44f)

🇺🇸 English · 🇧🇷 [Português (Brasil)](README.pt-BR.md)

</div>

## Why Keroo

Keroo is a personal finance app that lives entirely in your browser. There is no server, no account and no sign-up: your numbers are stored on your own device and never leave it.

It is built around how people in Brazil actually handle money: card purchases split into *parcelas* (installments), Pix transfers between friends, and a steady stream of bills and *boletos* to remember. None of that is Brazil-only, though. The app speaks English and Brazilian Portuguese and works in US dollars, euros or reais.

Keroo, the frog, keeps an eye on your bills and spending and reacts to them. Its mood comes from plain, deterministic rules that run on your device, not from an AI model.

## Features

**Budgeting**
- Checking, savings, cash, investment and credit card accounts, each with its own ledger, plus net worth and liquid cash on the dashboard.
- A quick-add transaction button, and a command palette on <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>K</kbd>.
- An envelope budgeting engine: a To-Be-Budgeted pool, per-category available balances, and monthly rollover that either carries overspending forward or resets it to zero. See [Status & limitations](#status--limitations) for how much of it the screens expose today.

**Cards & installments**
- Card purchases in 1x to 24x, placed on the right statement using the card's closing day and due day.
- Any leftover cent goes on the first installment, so the installments always add up to the exact purchase amount.
- Optional monthly interest (Tabela Price amortization), and a 6 to 24 month timeline of what each future statement will carry.

**Bills radar**
- Subscriptions and recurring bills, from weekly to annual, with the original due day kept intact through short months.
- Each bill moves through five states (paid, upcoming, due soon, due today, overdue), and the radar flags anything due within 3 days.
- The yearly cost of everything you subscribe to.
- Check-in prompts from Keroo: mark a bill **Paid!** (records the expense and updates the account and the category envelope in one step), **Snooze** it until tomorrow, or **Edit** the amount of a variable bill.

**Goals**
- Piggy banks (*Cofrinhos*): savings goals with a target amount and an optional target date, deposits and withdrawals, and how much to save each month to get there on time.

**Split**
- Add friends or roommates (optionally with their Pix key or phone) and split expenses 50/50. When the total has an odd cent, the person who paid absorbs it.
- Everything with a contact nets into one running balance ("you owe" or "to receive") that you can settle in one click.

**Import & rules**
- Import a CSV or OFX bank statement by pasting its text. It is parsed in the browser, with delimiters, date formats and Brazilian (`1.234,56`) vs US (`1,234.56`) number formats detected automatically.
- You get a preview first. Transactions already in the account are detected by hash and skipped, invalid rows are counted, and the rest is saved in a single transaction that also updates the account balance.
- An auto-categorization rule engine picks a category as you type the payee of a manual transaction.

**Keroo the frog**
- Five moods (thriving, calm, alert, sweating, sleepy) and ten hand-drawn SVG poses, chosen from your bills, budget and spending.
- Five local spending insights: a delivery-vs-groceries spike, a sudden jump in a category, a month where installments drop off, your annual subscription total, and money friends owe you.
- An optional roaming companion that hops around the screen. You name your frog during onboarding and can turn roaming off in Settings.

**Privacy & data**
- A 60-second, 4-step onboarding: language, currency, your frog's name, then start empty or with 1-click demo data.
- **Settings → Backup & Restore** exports every table to a JSON file and restores it atomically (details in [Your data](#your-data)).
- **Settings → App lock** asks for a password when Keroo opens and after 10 minutes without use. Only a salted hash of the password is stored.
- **A desktop shortcut on Windows** opens Keroo in its own window with a double-click (see [Desktop shortcut](#desktop-shortcut-windows)).
- Clean-slate reset, light/dark/system theme, and an installable PWA that works offline.

## Quick start

You need Node.js 22.22.2 or newer on the 22 line, or 24.15 or newer. `.nvmrc` pins Node 22, and `.npmrc` sets `engine-strict=true`, so older versions stop at install.

```bash
git clone https://github.com/gusthanks/keroo.git
cd keroo
npm ci
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm test             # Vitest, single run
npm run typecheck    # tsc --noEmit
npm run build        # type-check, then production bundle in dist/
npm run preview      # serve dist/ at http://localhost:4173
npm run test:coverage
```

## Install as an app

The service worker is only registered in production builds, so offline mode and installing do not work under `npm run dev`. To try them locally:

```bash
npm run build && npm run preview
```

Then open http://localhost:4173 and:

- **Chrome or Edge (desktop):** click the install icon at the right end of the address bar.
- **Chrome (Android):** open the menu and choose *Install app* (or *Add to Home screen*).
- **Safari (iPhone and iPad):** tap *Share* → *Add to Home Screen*. On iOS this matters for two reasons: the app opens full-screen without the Safari toolbar, and Safari may delete the stored data of websites you have not used in 7 days. Home Screen apps keep their own usage clock, so in practice their data is not cleared that way.

If you host Keroo yourself, serve it over HTTPS at the root of a domain (see [Status & limitations](#status--limitations)).

## Desktop shortcut (Windows)

To open Keroo with a double-click, without typing commands, run this once in the project folder:

```bash
npm run desktop:shortcut
```

It puts a **Keroo** icon on your desktop. When you double-click it, the launcher (`scripts/launch.mjs`):

1. builds the app into `dist/` the first time, which takes a few seconds;
2. starts a small server in the background (`scripts/serve-dist.mjs`), reachable only from this computer, on port 4173;
3. opens Keroo in its own Microsoft Edge window, without tabs or an address bar.

The server stops by itself after 10 minutes without requests. An open Keroo window keeps working, because the service worker keeps a copy of the app.

Keroo keeps its data in Edge, for the address `http://localhost:4173`. Always open it from the icon (or with `npm run app`), so it always finds the same data. If something goes wrong, the launcher writes to `keroo-launcher.log` in the system temp folder. On macOS and Linux, `npm run app` opens the default browser instead.

To get a newer version later, run `npm run app:update`. It runs `git pull`, `npm ci` and `npm run build`. The next time you open Keroo, you get the new version, and your data stays as it is.

## Your data

- Everything is stored in your browser's IndexedDB, through Dexie. Your language and theme choices are also kept in `localStorage`.
- Nothing leaves the device. Keroo has no backend, no accounts and no analytics, and it makes no network requests beyond loading its own files.
- That also means your browser holds the only copy. Clearing site data, removing the browser or changing devices erases it.
- **Settings → Backup & Restore → Export backup** saves a file named `keroo-backup-YYYY-MM-DD.json` containing all 14 tables.
- **Restore from file** checks that the file is a valid Keroo backup, shows when it was made and how many records it holds, and asks you to confirm. It then replaces all current data in a single database transaction: either everything is restored or nothing changes.
- The same card shows how much storage Keroo is using. At the end of onboarding, Keroo also asks the browser to keep its storage persistent (best effort; the browser decides).

- **Settings → App lock** sets a password that Keroo asks for when it opens and after 10 minutes without use. Only a salted PBKDF2-SHA-256 hash is stored, in this browser's `localStorage`, so it is not part of backups. The lock keeps other people who use the computer out of Keroo, but it does not encrypt the database. If you forget the password, the lock screen can erase all Keroo data, so you can start again and restore a backup.

Export a backup regularly and keep it somewhere you trust.

## Glossary for non-Brazilian readers

**Parcelas (installments).** Brazilian cards let you split one purchase into equal monthly charges, from 1x up to 24x, often with no interest. Each card has a *closing day* and a *due day*. A purchase made after the closing day goes on the next month's *fatura* (the card statement), and the due day is when that statement has to be paid. Keroo divides the amount in integer cents and puts any leftover cents on the first installment. For example, R$ 100.01 in 3x is 10001 cents ÷ 3 = 3333, remainder 2, so the installments are **R$ 33.35 + R$ 33.33 + R$ 33.33**, which adds back up to exactly R$ 100.01.

**Cofrinhos (piggy banks).** What Brazilian banks call savings goals. In Keroo they are goals you deposit into and withdraw from.

**Pix.** Brazil's instant payment system, run by the Central Bank. People send money to a *Pix key*: an e-mail address, phone number, tax ID or random key. Keroo never moves money; in Split you can save a contact's Pix key so you know where to send or request a payment.

**Boleto.** A bank slip with a barcode, widely used in Brazil for bills, rent, school fees and online shopping. In Keroo a boleto is tracked like any other recurring bill in the bills radar.

**Envelope budgeting.** Every bit of income gets a job: you assign money to category "envelopes", spending draws them down, and whatever is left (or overspent) rolls over to the next month.

**Split / IOU netting.** Instead of tracking each shared expense on its own, everything between you and one person collapses into a single net number: who owes whom, and how much.

**Jin Chan.** The money frog of Chinese folklore, usually shown with three legs and a coin in its mouth, said to bring prosperity. Keroo is an original, friendlier take on it, holding a gold coin with a square hole.

## Engineering notes

- **Integer cents only.** Every amount is stored and computed as a whole number of cents. Dexie hooks reject non-integer values on every monetary field, and divisions use explicit rounding or remainder allocation.
- **A deterministic mascot.** `evaluateKerooMood` is a pure, synchronous function with no AI, no network calls and no randomness. Tests keep it under 2 ms per evaluation.
- **100% translation parity.** `src/i18n/en-US.json` is the authoring source, and `src/i18n/pt-BR.json` must have exactly the same keys. Tests fail on a missing key or a hardcoded UI string.
- **Tests.** 23 test files with 526 tests (Vitest, jsdom, fake-indexeddb). CI runs the typecheck, the tests and the build on Node 22 and 24.

Further reading:

- [CLAUDE.md](CLAUDE.md): engineering guide, invariants and directory map
- [AGENTS.md](AGENTS.md): working rules for contributors and coding agents
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): system design, data flow, mascot engine, PWA and statement import
- [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md): the 14 IndexedDB tables and their indexes
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md): OKLCH color tokens, typography and layout
- [docs/ROADMAP.md](docs/ROADMAP.md): the six development stages

## Browser support

Keroo needs IndexedDB and Service Workers. In practice that means:

- Chrome or Edge 111+
- Firefox 113+
- Safari 15.4+ (macOS, iOS and iPadOS)

The color system relies on CSS `oklch()` without fallbacks, and new records get their ids from `crypto.randomUUID()`. Those two set the minimum above, and the production build targets the same browsers (`build.target` in `vite.config.ts`).

Open Keroo over HTTPS, or on `localhost` while developing. Browsers turn off service workers and `crypto.randomUUID()` on plain-HTTP pages, so opening the dev server from a phone at an address like `http://192.168.x.x:5173` will not fully work.

## Status & limitations

Keroo is at **v0.1.0**, and all six roadmap stages are complete. Things to know:

- **Two languages:** English (en-US, the default) and Brazilian Portuguese (pt-BR).
- **Root hosting only:** the service worker, manifest and icons use absolute `/` paths, so the build expects to be served at the root of a domain. A sub-path, such as a GitHub Pages project site (`user.github.io/keroo/`), is not supported yet.
- **No live demo or screenshots yet.** Run it locally and load the 1-click demo data to look around.
- **No cloud sync, by design.** Each browser keeps its own separate data. To move to another device, export a backup and restore it there.
- **No editing screens for envelopes or rules yet.** Both engines are implemented and tested, and the dashboard reads envelope data (created by the demo dataset and by bills paid through Keroo), but there is no screen yet to assign money to envelopes or to create and edit auto-categorization rules. Rules only take effect if they already exist, for example from a restored backup.
- **Split is 50/50 on screen.** The split engine also handles equal, percentage and exact-amount splits, but the Split view only offers 50/50 between you and one contact for now.
- **Statement import takes pasted text.** There is no file picker yet; open the CSV or OFX file and paste its contents.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first. To report a vulnerability, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

Before opening a pull request, run `npm run typecheck`, `npm test` and `npm run build`. CI runs the same checks.

## Inspired by

Keroo shares no code with these projects. They inspired its design and ideas:

- [Sure](https://github.com/we-promise/sure), the community fork of Maybe Finance: the calm, minimal look
- [Actual Budget](https://actualbudget.org/): local-first data and envelope budgeting
- [Wallos](https://github.com/ellite/Wallos): the subscription radar
- [Firefly III](https://www.firefly-iii.org/) and Oinc: piggy banks and auto-categorization rules

## License

[MIT](LICENSE) © 2026 gusthanks
