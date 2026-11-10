"""Export the canonical raster art, platform icons and their cache-versioned URLs.

Requires Pillow (only for regeneration). The normal npm install/build uses the
checked-in assets and never invokes image generation or Python.
"""
from pathlib import Path
import hashlib
import io
import json
import re
import struct

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'assets/mascot'
PUBLIC = ROOT / 'public'
ART = PUBLIC / 'mascot'
ICONS = PUBLIC / 'icons'
for directory in (ART, ICONS):
    directory.mkdir(parents=True, exist_ok=True)

approved = (SOURCE / 'approved-idle.webp').read_bytes()
icon_bytes = (SOURCE / 'icon-master.png').read_bytes()
version = hashlib.sha256(approved + icon_bytes + Path(__file__).read_text(encoding='utf8').encode('utf8')).hexdigest()[:12]
url = lambda path: f'{path}?v={version}'
# manifest.json and sw.js resolve URLs relative to their own location, so the same
# build works at a site root or under a sub-path such as GitHub Pages.
relative = lambda path: path.lstrip('/') or './'

# Copy the canonical animation byte for byte. Never redraw or re-encode it here.
(ART / 'idle.webp').write_bytes(approved)
with Image.open(io.BytesIO(approved)) as animation:
    assert animation.is_animated and animation.info.get('loop') == 0
    still = animation.convert('RGBA').copy()
    elapsed = 0
    rest = None
    for index in range(animation.n_frames):
        animation.seek(index)
        frame = animation.convert('RGBA')
        duration = animation.info.get('duration', 0)
        if elapsed <= 2600 < elapsed + duration:
            rest = frame.copy()
        elapsed += duration
    assert elapsed == 4000 and rest is not None, 'Approved four-second blink loop required'
    assert still.size == (512, 448) and still.getpixel((0, 0))[3] == 0
still.save(ART / 'idle.png')
rest.save(ART / 'rest.png')

master = Image.open(io.BytesIO(icon_bytes)).convert('RGBA')
assert master.width == master.height and master.width >= 512
square = master.resize((512, 512), Image.Resampling.LANCZOS)
rounded = Image.new('L', master.size)
ImageDraw.Draw(rounded).rounded_rectangle((0, 0, master.width - 1, master.height - 1),
                                        radius=round(master.width * .215), fill=255)
icon = master.copy()
icon.putalpha(rounded)
sizes = [16, 24, 32, 48, 64, 128, 180, 192, 256, 512]
for size in sizes:
    icon.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / f'portrait-{size}.png')
for filename, size in [('icon-512.png', 512), ('icon-192.png', 192),
                       ('favicon-32.png', 32), ('favicon-48.png', 48), ('favicon-64.png', 64)]:
    icon.resize((size, size), Image.Resampling.LANCZOS).save(ICONS / filename)
master.resize((180, 180), Image.Resampling.LANCZOS).save(ICONS / 'apple-touch-icon.png')
maskable = Image.new('RGBA', (512, 512), square.getpixel((0, 0)))
maskable.alpha_composite(master.resize((410, 410), Image.Resampling.LANCZOS), (51, 51))
maskable.save(ICONS / 'maskable-512.png')

frames = []
ico_sizes = [16, 24, 32, 48, 64, 128, 256]
for size in ico_sizes:
    buffer = io.BytesIO()
    icon.resize((size, size), Image.Resampling.LANCZOS).save(buffer, format='PNG')
    frames.append(buffer.getvalue())
directory = bytearray(struct.pack('<HHH', 0, 1, len(frames)))
offset = 6 + 16 * len(frames)
for size, frame in zip(ico_sizes, frames):
    directory.extend(struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(frame), offset))
    offset += len(frame)
ico = bytes(directory) + b''.join(frames)
for destination in [ROOT / 'scripts/windows/keroo.ico', ICONS / 'keroo.ico', PUBLIC / 'favicon.ico']:
    destination.write_bytes(ico)

assets = {
    'version': version,
    'approvedAnimationSha256': hashlib.sha256(approved).hexdigest(),
    'idle': url('/mascot/idle.webp'),
    'still': url('/mascot/idle.png'),
    'rest': url('/mascot/rest.png'),
    'portrait': url('/icons/portrait-128.png'),
    'portraitSizes': [{'src': url(f'/icons/portrait-{size}.png'), 'width': size}
                      for size in [16, 24, 32, 48, 64, 128, 256, 512]],
    'windowIcon': url('/icons/keroo.ico'),
}
(ROOT / 'src/components/keroo/mascot-assets.json').write_text(json.dumps(assets, indent=2) + '\n', encoding='utf8', newline='\n')

manifest_path = PUBLIC / 'manifest.json'
manifest = json.loads(manifest_path.read_text(encoding='utf8'))
manifest['icons'] = [
    {'src': relative(url('/icons/icon-192.png')), 'sizes': '192x192', 'type': 'image/png', 'purpose': 'any'},
    {'src': relative(url('/icons/icon-512.png')), 'sizes': '512x512', 'type': 'image/png', 'purpose': 'any'},
    {'src': relative(url('/icons/maskable-512.png')), 'sizes': '512x512', 'type': 'image/png', 'purpose': 'maskable'},
]
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8', newline='\n')
links = '\n'.join([
    '    <!-- keroo-icons:start -->',
    f'    <link rel="icon" type="image/png" sizes="32x32" href="{url("/icons/favicon-32.png")}" />',
    f'    <link rel="icon" type="image/png" sizes="48x48" href="{url("/icons/favicon-48.png")}" />',
    f'    <link rel="icon" type="image/png" sizes="64x64" href="{url("/icons/favicon-64.png")}" />',
    f'    <link rel="icon" type="image/x-icon" sizes="16x16 24x24 32x32 48x48 64x64 128x128 256x256" href="{assets["windowIcon"]}" />',
    f'    <link rel="apple-touch-icon" href="{url("/icons/apple-touch-icon.png")}" />',
    f'    <link rel="manifest" href="{url("/manifest.json")}" />',
    '    <!-- keroo-icons:end -->',
])
html_path = ROOT / 'index.html'
html = html_path.read_text(encoding='utf8')
if '<!-- keroo-icons:start -->' in html:
    html = re.sub(r'    <!-- keroo-icons:start -->[\s\S]*?    <!-- keroo-icons:end -->', lambda _: links, html)
else:
    html = re.sub(r'^\s*<link rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\s*$', '', html, flags=re.MULTILINE)
    html = html.replace('    <meta charset="UTF-8" />', '    <meta charset="UTF-8" />\n' + links)
html_path.write_text(html, encoding='utf8', newline='\n')

sw_path = PUBLIC / 'sw.js'
sw = sw_path.read_text(encoding='utf8')
sw = re.sub(r"const CACHE_NAME = '[^']+';", f"const CACHE_NAME = 'keroo-cache-{version}';", sw)
precache = [relative(path) for path in ['/', '/index.html', url('/manifest.json'), assets['idle'], assets['still'],
                                        assets['rest'], assets['portrait'], assets['windowIcon']]]
precache += [entry['src'] for entry in manifest['icons']]
sw = re.sub(r'const PRECACHE_URLS = \[[\s\S]*?\];', lambda _: 'const PRECACHE_URLS = ' + json.dumps(precache, indent=2) + ';', sw)
sw_path.write_text(sw, encoding='utf8', newline='\n')

validation = {'version': version, 'approvedAnimationSha256': assets['approvedAnimationSha256'],
              'animationBytes': len(approved), 'animationDurationMs': elapsed,
              'canvas': list(still.size), 'icoSizes': ico_sizes}
(SOURCE / 'export-validation.json').write_text(json.dumps(validation, indent=2) + '\n', encoding='utf8', newline='\n')
print(json.dumps(validation, indent=2))
