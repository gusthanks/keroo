---
description: Preserve the approved illustrated Keroo mascot and validate raster art/icon integration
---

# /mascot-redesign - Approved illustrated Keroo

Read `CLAUDE.md` section 6, `docs/DESIGN_SYSTEM.md` section 6 and
`assets/mascot/README.md` before changing the mascot. Gustavo rejected the SVG
recreation and explicitly approved the raster animation on 2026-10-19.

1. Inspect the canonical approved animation and icon master in `assets/mascot/`.
   Preserve their illustrated texture, proportions and personality.
2. Keep `KerooMascotProps` and historical pose keys compatible. Render complete
   raster artwork; do not compose independent limbs, expressions or accessories.
3. Generate any genuinely new artwork with the approved master as a reference
   and show the actual visual result for review before integrating it.
4. Regenerate exports with `npm run mascot:assets` when sources change. Preserve
   static reduced-motion/hidden-document fallbacks, portrait density candidates,
   versioned URLs, native ICO frames and launcher MIME support.
5. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `git diff --check`.
   Inspect the actual app in light/dark, desktop/mobile and reduced-motion modes.
6. Record source/export verification and visual limits in `docs/mascot-review/`.
   Automated tests or a shortcut metadata check do not prove taskbar appearance.
