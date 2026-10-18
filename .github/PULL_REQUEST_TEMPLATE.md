## Summary

<!-- What does this change, and why? A few sentences are enough. -->

## Linked issue

<!-- For example: Closes #123. Write "none" if there is no issue. -->

## How I tested it

<!-- Commands you ran, manual steps, screenshots (with demo data only, never real finances). -->

## Checklist

Tick every box that applies. If one does not apply to this PR, write "n/a" next to it. Details are in [CONTRIBUTING.md](https://github.com/gusthanks/keroo/blob/main/CONTRIBUTING.md).

- [ ] I ran `npm run typecheck` locally and it exits with 0 errors
- [ ] I ran `npm test` locally and all tests pass
- [ ] I ran `npm run build` locally and the production bundle compiles
- [ ] i18n parity: every new or changed UI string exists in both `src/i18n/en-US.json` and `src/i18n/pt-BR.json`
- [ ] Integer cents: money is never a float, and any installment remainder goes to the 1st installment
- [ ] The mascot (`evaluateKerooMood` and the insights) is still pure and deterministic, with no network or AI
- [ ] Database changes bump `this.version(n)` in `src/db/index.ts` and add an `.upgrade()` where existing rows are affected
- [ ] Docs updated if behavior changed (README, `docs/`, and [CHANGELOG.md](https://github.com/gusthanks/keroo/blob/main/CHANGELOG.md) under **[Unreleased]**)
- [ ] `docs/ROADMAP.md` updated if this completes a roadmap item
- [ ] No personal data, absolute local paths or files from outside the repository are included
