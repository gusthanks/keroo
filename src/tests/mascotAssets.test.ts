import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import assets from '../components/keroo/mascot-assets.json';

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

describe('Shipped mascot icon assets', () => {
  it('ships the exact user-approved animation, without recreating or re-encoding it', () => {
    const approved = readFileSync(resolve(process.cwd(), 'assets/mascot/approved-idle.webp'));
    const shipped = readFileSync(resolve(process.cwd(), 'public/mascot/idle.webp'));
    expect(shipped.equals(approved)).toBe(true);
    expect(createHash('sha256').update(shipped).digest('hex')).toBe(assets.approvedAnimationSha256);
    expect(shipped.toString('ascii', 0, 4)).toBe('RIFF');
    expect(shipped.toString('ascii', 8, 12)).toBe('WEBP');
    expect(shipped.includes(Buffer.from('ANIM'))).toBe(true);
  });

  it('uses fresh cache keys for artwork, favicons and manifest icons', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const manifest = JSON.parse(readFileSync(resolve(process.cwd(), 'public/manifest.json'), 'utf8'));
    const urls: string[] = [assets.idle, assets.still, assets.rest, assets.portrait, assets.windowIcon,
      ...assets.portraitSizes.map(({ src }) => src), ...manifest.icons.map((icon: { src: string }) => icon.src)];
    for (const src of urls) {
      const url = new URL(src, 'http://keroo.local');
      expect(url.searchParams.get('v')).toBe(assets.version);
      expect(readFileSync(resolve(process.cwd(), 'public', url.pathname.slice(1))).length).toBeGreaterThan(0);
    }
    expect(html).toContain(assets.windowIcon);
    expect(html).toContain('sizes="48x48"');
    expect(html).toContain('sizes="64x64"');
    expect(html).not.toContain('image/svg+xml');
    expect(readFileSync(resolve(process.cwd(), 'public/favicon.ico'))).toEqual(
      readFileSync(resolve(process.cwd(), 'scripts/windows/keroo.ico'))
    );
  });

  it('contains valid native PNG frames for small, medium and large Windows icons', () => {
    const ico = readFileSync(resolve(process.cwd(), 'scripts/windows/keroo.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const dimensions: number[] = [];
    let nextOffset = 6 + count * 16;
    for (let index = 0; index < count; index++) {
      const entry = 6 + index * 16;
      const width = ico[entry] || 256;
      const height = ico[entry + 1] || 256;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      expect(ico.readUInt16LE(entry + 6)).toBe(32);
      expect(offset).toBe(nextOffset);
      expect(offset + length).toBeLessThanOrEqual(ico.length);
      const png = ico.subarray(offset, offset + length);
      expect(png.subarray(0, 8)).toEqual(pngSignature);
      expect(png.readUInt32BE(16)).toBe(width);
      expect(png.readUInt32BE(20)).toBe(height);
      dimensions.push(width);
      nextOffset += length;
    }
    expect(nextOffset).toBe(ico.length);
    expect(dimensions).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });

  it.each([
    ['icon-512.png', 512], ['icon-192.png', 192],
    ['apple-touch-icon.png', 180], ['favicon-32.png', 32], ['maskable-512.png', 512],
    ['favicon-48.png', 48], ['favicon-64.png', 64],
  ])('ships %s at its declared PWA dimensions', (name, dimension) => {
    const png = readFileSync(resolve(process.cwd(), 'public/icons', name));
    expect(png.subarray(0, 8)).toEqual(pngSignature);
    expect(png.readUInt32BE(16)).toBe(dimension);
    expect(png.readUInt32BE(20)).toBe(dimension);
  });
});
