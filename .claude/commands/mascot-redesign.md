---
description: Redesign the Keroo mascot SVG artwork from scratch using the Mascot Style Guide in CLAUDE.md section 6
---

# /mascot-redesign — Keroo Frog Mascot Visual Overhaul

When `/mascot-redesign` is invoked, execute this autonomous workflow to redraw the Keroo mascot:

## 1. Review the Style Guide
Read the **Mascot Style Guide** in `CLAUDE.md` section 6 and open `public/icons/icon-512.png` as the canonical render:
- Keep the organic "blob" silhouette: one smooth, continuous Bézier body (chubby and pear-shaped) whose top edge forms two "m"-shaped eye bumps, soft rounded limbs, and tiny bead-dot eyes.
- Keep the palette and line work: flat lime `#86E63C` fill, thick uniform near-black outline, pink blush dots on playful poses, and the gold Jin Chan coin with a square hole.
- All artwork is original SVG authored in this repository; do not trace or embed third-party illustrations.

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
- Keep the `pose-*` and `coin-*` `data-testid` hooks unchanged.

## 3. Automated Verification
Verify that the redesign compiles and passes all test assertions:
```bash
npx tsc --noEmit
npm test
npm run build
```
Ensure all 24 mascot tests in `src/tests/kerooMascot.test.tsx` and `src/tests/challenger_m4_mascot_insights_stress.test.tsx` pass cleanly.
