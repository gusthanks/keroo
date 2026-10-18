# AGENTS.md — Universal Multi-Agent Operational Protocol

This document applies to **all autonomous agents and human contributors** operating within this repository, whatever editor, assistant, or automation tool they use. It defines non-negotiable workspace constraints, engineering invariants, verification mandates, and inter-agent handoff standards.

---

## 1. Boundary Guard: Workspace Confinement

- **Root**: the repository checkout.
- **Strict Boundary**: All tool operations—including reading files, writing files, directory listings, searching, and running shell commands—MUST remain strictly inside the repository.
- **Cross-Project Prohibition**: Never read, modify, or reference any files outside the repository (other projects, home directories, other drives, or personal documents). Never import legacy personal data; every install starts from an empty database or the optional demo dataset.
- **Path Resolution**: Always resolve relative paths against the repository root.

---

## 2. Core Architectural & Financial Invariants

All agents MUST enforce the following core principles across all code changes:

1. **Integer Cents Representation ($C \in \mathbb{Z}$)**:
   - Currency is stored and computed strictly in integer cents (e.g., $1050$ represents $R\$\ 10,50$ or $\$10.50$).
   - Never use JavaScript floating-point numbers (`0.1`, `0.2`) for financial totals, balances, or transaction amounts.
   - Guard against non-integer inputs with runtime checks and explicit integer rounding (`Math.round()` / `Math.floor()`).

2. **First-Installment Remainder Allocation**:
   - For credit card installments ($1x$ to $24x$), the integer remainder $r = A \pmod N$ is allocated exclusively to the first installment:
     $$I_1 = \lfloor A / N \rfloor + r, \quad I_k = \lfloor A / N \rfloor \quad (\text{for } k \in [2, N])$$
   - $\sum_{k=1}^N I_k \equiv A$ must hold unconditionally.

3. **100% Bilingual Parity (`en-US` & `pt-BR`)**:
   - When adding or modifying any translation string, update both `src/i18n/en-US.json` (authoring source of truth) and `src/i18n/pt-BR.json`.
   - Never leave untranslated keys or placeholder stubs. Automated test suites enforce complete dictionary parity.

4. **Deterministic Keroo Pet (< 2.0ms Execution)**:
   - The mascot mood evaluator (`evaluateKerooMood`) must remain a pure, synchronous, deterministic function with zero asynchronous delays, zero cloud APIs, and zero AI overhead.
   - Interactive speech bubble actions (`[Paid!]`, `[Snooze]`, `[Edit]`; pt-BR: `Já paguei!`, `Lembrar amanhã`, `Ajustar valor`) must trigger atomic IndexedDB updates.

5. **Clean Slate Philosophy**:
   - Zero dependencies on external legacy databases or spreadsheets.
   - First-time users enter a 60-second onboarding wizard with an optional 1-click Demo Data / Clean Slate Reset toggle.

---

## 3. Mandatory Verification Protocol

Before declaring any task or milestone complete, every agent MUST execute the following verification steps:

```bash
# 1. Typecheck the entire TypeScript codebase
npx tsc --noEmit

# 2. Run the automated test suite
npm test

# 3. Build the production bundle
npm run build
```

- **Zero-Warning Tolerance**: Typecheck and test suite must pass with 100% green assertions and zero compilation errors.
- **No Cheat Rule**: Never create fake tests that always pass, never hardcode test answers in production code, and never bypass typechecks with blanket `any` or `@ts-ignore` overrides.

---

## 4. Multi-Agent Continuity & Handoff Standard

Development of Keroo is structured into 6 sequential stages tracked in `docs/ROADMAP.md`:

```
Stage 1: Multi-Agent Continuity Kit & Blueprints (Current)
Stage 2: Scaffolding, Core Types, Local DB & Onboarding
Stage 3: Financial Precision Engines & Unit Test Suites
Stage 4: Deterministic Keroo Frog Pet Engine
Stage 5: Sure-Inspired UI, Bilingual Parity & PWA
Stage 6: Dual-Track Verification, Edge Cases & Polish
```

### Handoff Rules for Any Agent:
1. **Always Check the Roadmap**: Before starting work, read `docs/ROADMAP.md` to identify the current unfinished stage (`[ ]`).
2. **Consult Blueprints**: Refer to `docs/ARCHITECTURE.md`, `docs/DATABASE_SCHEMA.md`, and `docs/DESIGN_SYSTEM.md` for architectural patterns and data models.
3. **Keep Changes Minimal and Focused**: Only modify files within the scope of the assigned stage. Avoid unrelated refactoring.
4. **Update Stage Checkboxes**: Mark tasks with `[x]` in `docs/ROADMAP.md` only after all verification commands pass cleanly.
5. **Write Handoff Summary**: Document observed changes, logic chain, caveats, and verification commands in the agent's handoff report.
