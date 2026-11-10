---
description: Preserve the illustrated Keroo mascot and validate raster art/icon integration
---

# /mascot-redesign - Illustrated Keroo

Read `CLAUDE.md` section 6, `docs/DESIGN_SYSTEM.md` section 6 and
`assets/mascot/README.md` before changing the mascot. The raster animation
replaced an earlier SVG recreation that lost the illustration's character.

1. Inspect the canonical animation and icon master in `assets/mascot/`.
   Preserve their illustrated texture, proportions and personality.
2. Keep `KerooMascotProps` and historical pose keys compatible. Render complete
   raster artwork; do not compose independent limbs, expressions or accessories.
3. Generate any genuinely new artwork with the existing master as a reference
   and show the actual visual result for review before integrating it.
4. Regenerate exports with `npm run mascot:assets` when sources change. Preserve
   static reduced-motion/hidden-document fallbacks, portrait density candidates,
   versioned URLs, native ICO frames and launcher MIME support.
5. Run `npx tsc --noEmit`, `npm test`, `npm run build` and `git diff --check`.
   Inspect the actual app in light/dark, desktop/mobile and reduced-motion modes.
6. Record source/export changes in `assets/mascot/README.md` and the CHANGELOG.
   Automated tests or a shortcut metadata check do not prove taskbar appearance.
