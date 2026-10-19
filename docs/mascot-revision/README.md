# Raster animation revision - accepted and integrated

Gustavo rejected the SVG result because it changed the selected illustration and
combined overlapping accessories. He proposed GIF, reviewed an actual raster
breathing/blinking preview, then explicitly authorized its integration on 2026-10-19.

The exact approved loop and its source frames now live in `assets/mascot/`, along
with the high-resolution portrait icon, generation provenance and export checks.
The app ships full-color transparent animated WebP, plus true static PNG fallbacks.
The approved animation is copied byte for byte. See `assets/mascot/README.md` and
`docs/mascot-review/README.md` for reproduction, behavior and verification.

Local exploration files (original concept board, sprites, GIF previews and draft
icons) are intentionally ignored by Git. The retained `generation-prompt.md`
documents the reference-based sprite generation. The old SVG review did not prove
visual acceptance; the actual animated preview is the accepted visual authority.
