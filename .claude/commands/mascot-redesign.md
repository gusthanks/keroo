---
description: Redesign Keroo Mascot SVG artwork from scratch using the 9 reference images in docs/mascot-references/
---

# /mascot-redesign — Keroo Frog Mascot Visual Overhaul

When the user runs `/mascot-redesign` in Claude Code, execute this autonomous workflow to redraw the Keroo mascot:

## 1. Inspect Reference Images
Examine the 9 reference PNG images located in `docs/mascot-references/`:
- `media_1792158191527.png` through `media_1792158399187.png`.
- Observe the organic "blob" silhouette: smooth, continuous curves, chubby pear-shaped body, soft rounded limbs, expressive eyes with reflection shine dots, and the gold Jin Chan coin.

## 2. Redraw `src/components/keroo/KerooMascot.tsx`
Replace the SVG path definitions in `src/components/keroo/KerooMascot.tsx` with organic, hand-crafted vector shapes:
- Preserve the exact `KerooMascotProps` interface.
- Implement all 10 poses:
  1. `default_sitting`
  2. `waterfall_tears`
  3. `melted_blob`
  4. `toast_face`
  5. `peace_dab`
  6. `sipping_drink`
  7. `sleeping_bubble`
  8. `cheeky_tongue`
  9. `coin_swallowing`
  10. `curious_head_tilt`
- Implement all coin props:
  - `none`, `mouth_clamp`, `flipping`, `hugging`, `polishing`, `swallowing`.

## 3. Automated Verification
Verify that the redesign compiles and passes all test assertions:
```bash
npx tsc --noEmit
npm test
npm run build
```
Ensure all 24 mascot tests in `src/tests/kerooMascot.test.tsx` and `src/tests/challenger_m4_mascot_insights_stress.test.tsx` pass cleanly.
