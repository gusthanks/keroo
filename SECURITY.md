# Security Policy

Keroo is a local-first personal finance app. This page explains what that means for security, which versions get fixes, and how to report a problem privately.

## Supported versions

| Version | Supported |
|---|---|
| 0.1.x | Yes |

Keroo is pre-1.0. Security fixes go into the latest release only, so please update to the newest `0.1.x` before reporting.

## Threat model

Keroo has no server, no accounts and no cloud sync. Everything you enter lives in your browser's IndexedDB, in the browser profile on your own device. The app's code makes no API calls and sends no analytics or telemetry. The only network traffic is your browser loading Keroo's own static files from whichever host serves them (and the service worker refreshing its offline copy of those files). The mascot is fully deterministic; there are no AI or cloud services involved.

That removes a whole class of risks (server breaches, leaked accounts, third-party data sharing), and leaves these:

**Access to your device.** Keroo does not encrypt its data at rest. Anyone who can use your unlocked device or browser profile can open Keroo and read it, and a browser extension that can read site data could too. Protect the device with a lock screen, a separate OS user account and disk encryption.

**Losing your data.** This is the most likely real-world problem. Clearing site data, switching browsers or devices, a corrupted profile, or a browser evicting storage for a site you rarely open can erase everything, and there is no server copy to recover from. Keroo asks the browser for persistent storage after onboarding (best effort; browsers may decline), but the real protection is a backup: use **Settings > Backup & Restore** to export a JSON file regularly, and keep it somewhere safe. Installing Keroo as a PWA also makes eviction less likely in some browsers.

**Backup files are not encrypted.** An exported backup is plain JSON containing every account, transaction and balance. Store it as carefully as you would a bank statement, and never attach one to a public issue.

**If you host it yourself.** Serve Keroo over HTTPS (service workers and persistent storage need a secure context; `localhost` is exempt), and give it its own origin, because every app on the same origin can read the same IndexedDB. Whoever controls the host controls the code your browser runs, so treat the host as trusted.

## What counts as a vulnerability

Examples we would like to hear about:

- cross-site scripting or code execution through imported CSV/OFX statements, restored backup files, or any text field;
- a restore or import flow that can leak, corrupt or silently overwrite data outside what the user confirmed;
- a way for the app, the service worker or a dependency to send data off the device;
- a service worker or caching problem that lets stale or tampered files persist;
- a vulnerable dependency that actually affects the production bundle.

Out of scope: attacks that already require control of the user's unlocked device, browser or OS; bugs in browsers themselves; and misconfigured third-party hosting. If you are unsure, report it anyway.

## Reporting a vulnerability

Please **do not open a public issue, discussion or pull request** for a security problem.

Use GitHub's private vulnerability reporting instead: go to the repository's **Security** tab, choose **Report a vulnerability**, or open <https://github.com/gusthanks/keroo/security/advisories/new>.

Helpful details: what you found, steps to reproduce, the Keroo version and your browser and OS, and what an attacker could do with it. Please use demo data, never your real finances.

If the private reporting form is not available to you, message the maintainer [@gusthanks](https://github.com/gusthanks) on GitHub asking for a private way to share details, without including the details in the public message.

## What to expect

Keroo is maintained by volunteers, so everything here is best effort. We aim to acknowledge a report within about a week, to keep you updated while we investigate, and to credit you in the advisory and the [changelog](CHANGELOG.md) if you want that. There is no bug bounty. Please give us a reasonable chance to ship a fix before you disclose the problem publicly.

Dependencies are watched by Dependabot, which opens weekly update pull requests for npm packages and GitHub Actions.
