# Approved Keroo illustration

Gustavo approved the illustrated direction A and then explicitly approved the
animated raster preview on 2026-10-19. The previous SVG interpretation was rejected.

- `approved-idle.webp` is the exact approved four-second breathing/blinking loop,
  with full color and smooth transparency. Do not redraw or re-encode this master.
- `source-blink-frames.png` retains the image-generated open/closed-eye source art.
- `icon-master.png` is a high-resolution face portrait derived with image generation
  from the same character, without coins or other props. It is the icon source.
- `export-validation.json` records export version, animation hash and icon sizes.
- `generation-prompts.md` records the built-in image-generation prompts.

## Export

Normal `npm ci`, tests and builds use the checked-in assets; they do not need
Python, image generation or API credentials. To regenerate exports:

```sh
python -m pip install -r scripts/requirements-mascot.txt
npm run mascot:assets
```

`scripts/build-mascot.py` copies the approved animation byte for byte, extracts
static open/closed frames from that animation, and downsamples each icon directly
from its high-resolution master. It generates the typed asset manifest used by the
component, native PNG/ICO sizes, the web manifest, HTML favicon links, service-worker
precache URLs and the local review gallery. Commit regenerated outputs together.

## Rendering contract

`KerooMascot.tsx` uses a single raster image. It never assembles limbs, expressions
or accessories from SVG parts. Legacy mood/pose identifiers remain accepted by the
pure deterministic evaluator, but the renderer groups their presentation into idle,
attentive, celebration, rest, playful and saving states. Reactions move the whole
approved illustration. Rest uses its closed-eye frame. Historical toast, tongue,
cup and coin-prop identifiers do not add or invent separately drawn accessories.

The deprecated `coinProp` input remains source-compatible and has no compositing
effect. Accessible descriptions in both dictionaries reflect the current artwork.
Reduced-motion preference selects a real static PNG through `<picture>` and
disables reaction motion. Hidden documents and `animated={false}` also select PNG.
Tiny slots use portrait PNGs with explicit density candidates.

## Icons and local Windows installation

The ICO contains native 16, 24, 32, 48, 64, 128 and 256px PNG frames. The website
also advertises 32/48/64px PNG favicons and supplies a root `favicon.ico` fallback.
All art/icon URLs carry the export version so the old SVG/low-resolution favicon
is not returned under the same cache key. Full-background maskable artwork is
separate from ordinary rounded-corner icons.

The Desktop shortcut points to a content-versioned ICO snapshot inside the repo.
Snapshots are local install artifacts and ignored by Git. The app opens in Edge;
the running-window/taskbar icon is served through favicon/manifest paths, not
through the Desktop shortcut alone. Reopen an already running old app window to
let Edge request the new icon. No browser profile, financial database or global
Windows icon cache should be cleared for an artwork update.
