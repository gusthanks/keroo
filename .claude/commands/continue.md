---
description: Read docs/ROADMAP.md, identify the first unfinished development stage, and execute it seamlessly.
---

# /continue — Seamless Multi-Agent Roadmap Runner

When `/continue` is invoked (or a contributor asks an agent to "continue the roadmap"), follow this autonomous execution protocol to advance Keroo to the next milestone without context loss:

## 1. Scan the Roadmap
1. Open and inspect `docs/ROADMAP.md`.
2. Locate the earliest development stage (`Stage 1` through `Stage 6`) containing unchecked tasks (`- [ ]`).
3. Verify that all preceding stages are marked complete (`- [x]`). If an earlier stage is incomplete, resume from that unfinished stage first.

## 2. Load Context & Blueprints
1. Read `CLAUDE.md` and `AGENTS.md` for project invariants and operational guidelines.
2. Read the relevant architectural documentation in `docs/`:
   - `docs/ARCHITECTURE.md`: Component dependency tree, reactive Dexie hooks, data flow, state machine.
   - `docs/DATABASE_SCHEMA.md`: Dexie.js table schemas, compound indexes, TypeScript entity definitions, seed data.
   - `docs/DESIGN_SYSTEM.md`: OKLCH color tokens, typography, 16px mobile input floor, concentric radii, layout specs.
3. Read the source files and tests the target stage touches before editing them; the code and its tests are the detailed specification.

## 3. Implement the Target Stage
1. Follow the **Minimal Change Principle**: Implement only the components, engines, or views required by the current stage.
2. Respect all **Non-Negotiable Invariants**:
   - **Integer Cents**: All monetary values stored and computed as integer cents ($C \in \mathbb{Z}$). Zero floating-point math.
   - **Clean Slate**: No legacy-data import; every install starts from an empty database or the optional demo dataset.
   - **1st Installment Remainder**: Allocate $A \pmod N$ remainder cents exclusively to the first installment.
   - **Bilingual Parity**: Provide 100% synchronized keys in both `en-US` (authoring source of truth) and `pt-BR`.
   - **Deterministic Keroo Pet**: Sub-2ms synchronous evaluation, zero cloud/AI calls, atomic IndexedDB check-in actions.
   - **Workspace Boundary**: Strictly stay inside the repository root.

## 4. Mandatory Automated Verification
Execute the verification suite to ensure zero regressions:
```bash
# 1. Typecheck the TypeScript codebase
npx tsc --noEmit

# 2. Run all unit and integration tests
npm test

# 3. Compile production build
npm run build
```
- If any test fails or type error arises, resolve the issue immediately before proceeding.

## 5. Update Roadmap & Report Progress
1. Update `docs/ROADMAP.md`: Change completed `- [ ]` checkboxes to `- [x]`.
2. Output a structured progress report to the user:
   - **Stage Completed**: Name and number of the completed stage.
   - **Files Created / Modified**: List of affected files with brief summaries.
   - **Verification Results**: Test count, typecheck status, and build status.
   - **Next Stage**: Summary of what will be tackled on the next `/continue` invocation.
