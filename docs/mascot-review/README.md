# Keroo - approved illustrated animation

Gustavo approved the actual raster loop on 2026-10-19 and authorized integration,
Desktop icon replacement and updating GitHub. The previous SVG interpretation was
rejected; it is not the visual authority.

## Sources and reproduction

Canonical masters, prompts and export report are in `assets/mascot/`. The app uses
the exact approved WebP loop (full color, smooth transparency, four seconds), with
open/closed-eye PNGs extracted from it. The high-resolution face portrait supplies
all platform icons. `KerooMascot.tsx` displays those assets rather than drawing art.

Normal npm install/test/build needs no Python, image API or credentials. To regenerate:

```sh
python -m pip install -r scripts/requirements-mascot.txt
npm run mascot:assets
```

The generator copies approved animation bytes, produces PNG/ICO sizes directly from
the portrait master, versions URLs and updates HTML, manifest, service-worker cache,
asset metadata and this gallery. Commit generated outputs together. Open
`/docs/mascot-review/index.html` on the development server to inspect actual shipped
art on light/dark backgrounds and the icons at native display sizes.

## Behavior

Ten historical pose identifiers map to six presentations (idle, attentive,
celebration, rest, playful and saving). They are not ten separately painted poses.
The coin is part of the complete illustration; deprecated coin-prop inputs add no
overlays. Reactions move the whole character. Static PNG is selected for reduced
motion, hidden documents, explicitly disabled animation and animation load failure.
Small slots use density-aware portraits. Keyboard play, drag-release handling,
local financial evaluation and atomic bill actions remain intact.

## Installation and verification

The Desktop shortcut icon was updated within Gustavo's explicit boundary exception.
Only IconLocation changed; target, arguments and working directory were preserved.
Its content-hashed local ICO snapshot matches the native master. Future shortcut
creation uses the same cache-avoiding approach. Snapshots are ignored install files.

The web favicon and manifest are also updated: the Edge app's taskbar icon does not
come from the shortcut alone. Reopen an already running old app window to request
the new icon. No browser profile, financial data or global icon cache was cleared.
Actual Windows taskbar appearance remains a manual check at Gustavo's display scale.

`REVIEW.md` records verification evidence and limits. `app-mobile-light.jpg` captures
the real production dashboard with isolated demo data, rather than a design mockup.
The browser capture has host DPI resampling; use canonical assets for pixel inspection.
