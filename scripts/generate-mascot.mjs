/** Optional raster asset regeneration. Normal builds use the checked-in files. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.env.KEROO_PYTHON || 'python', ['scripts/build-mascot.py'], {
  cwd: root, stdio: 'inherit', windowsHide: true,
});
if (result.error) {
  console.error('Install Python and Pillow to regenerate mascot assets. See assets/mascot/README.md.');
  console.error(result.error.message);
}
process.exitCode = result.status ?? 1;
