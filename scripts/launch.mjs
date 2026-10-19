/**
 * scripts/launch.mjs
 *
 * Desktop launcher: opens Keroo in its own window, with no tabs and no address bar.
 *
 * 1. Builds the app into dist/ when there is no build yet.
 * 2. Starts scripts/serve-dist.mjs in the background, unless it is already running.
 * 3. Opens http://localhost:4173/ as a Microsoft Edge app window. Without Edge, it opens
 *    the default browser.
 *
 * Keroo keeps its data in that browser, for that address. Always open it the same way,
 * so it always finds the same data. Run it with `npm run app`, or with the desktop
 * shortcut that `npm run desktop:shortcut` creates. Problems go to keroo-launcher.log
 * in the system temp folder.
 *
 * `node scripts/launch.mjs --no-open` only starts the server and prints the address,
 * for use with another browser.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.KEROO_PORT || 4173);
const APP_URL = `http://localhost:${PORT}/`;
const HEALTH_URL = `http://localhost:${PORT}/__keroo_health`;
const LOG_FILE = join(tmpdir(), 'keroo-launcher.log');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stderr.write(line);
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // Logging must never stop the launcher.
  }
}

async function isKerooServing() {
  try {
    const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(800) });
    return res.ok && (await res.text()) === 'keroo';
  } catch {
    return false;
  }
}

function ensureBuild() {
  if (existsSync(join(ROOT, 'dist', 'index.html'))) return true;
  log('No build found in dist/. Running "npm run build" (this takes a few seconds).');
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: ROOT,
    shell: true,
    windowsHide: true,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    log(`Build failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
    return false;
  }
  return true;
}

async function ensureServer() {
  if (await isKerooServing()) return true;
  const server = spawn(process.execPath, [join(ROOT, 'scripts', 'serve-dist.mjs')], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  server.unref();
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await isKerooServing()) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  log(`The local server did not start on port ${PORT}. Is another program using it?`);
  return false;
}

function findEdge() {
  const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles, process.env.LOCALAPPDATA];
  for (const base of bases) {
    if (!base) continue;
    const candidate = join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function openWindow() {
  const detachedOptions = { detached: true, stdio: 'ignore', windowsHide: false };
  if (process.platform === 'win32') {
    const edge = findEdge();
    if (edge) {
      spawn(edge, [`--app=${APP_URL}`], detachedOptions).unref();
    } else {
      spawn('cmd', ['/c', 'start', '""', APP_URL], { ...detachedOptions, windowsHide: true }).unref();
    }
  } else if (process.platform === 'darwin') {
    spawn('open', [APP_URL], detachedOptions).unref();
  } else {
    spawn('xdg-open', [APP_URL], detachedOptions).unref();
  }
}

if (!ensureBuild()) process.exit(1);
if (!(await ensureServer())) process.exit(1);
if (process.argv.includes('--no-open')) {
  console.log(`Keroo is running at ${APP_URL}`);
} else {
  openWindow();
}
