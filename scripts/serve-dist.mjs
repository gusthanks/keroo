/**
 * scripts/serve-dist.mjs
 *
 * Small static server for the production build in dist/, used by the desktop launcher.
 *
 * - Listens on this computer only (127.0.0.1 and ::1), port 4173 by default (KEROO_PORT).
 * - Serves index.html for paths without a file extension (single-page app).
 * - Exits by itself after 10 minutes without requests. An open Keroo window keeps
 *   working, because the app runs in the browser and the service worker caches its files.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HEALTH_PATH = '/__keroo_health';

const DIST = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const PORT = Number(process.env.KEROO_PORT || 4173);
const IDLE_EXIT_MS = 10 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

let idleTimer;
function resetIdleTimer() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => process.exit(0), IDLE_EXIT_MS);
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(body);
}

async function handle(req, res) {
  resetIdleTimer();
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === HEALTH_PATH) {
    send(res, 200, 'keroo', { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, '', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(res, 400, '');
    return;
  }

  let file = resolve(DIST, `.${pathname}`);
  if (file !== DIST && !file.startsWith(DIST + sep)) {
    send(res, 403, '');
    return;
  }

  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    // Unknown asset: 404. Unknown page: hand it to the single-page app.
    if (extname(pathname)) {
      send(res, 404, '');
      return;
    }
    file = join(DIST, 'index.html');
  }

  try {
    const body = await readFile(file);
    const isHashedAsset = pathname.startsWith('/assets/');
    send(res, 200, req.method === 'HEAD' ? '' : body, {
      'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      // A fixed length (not chunked) is what browsers expect for service worker scripts.
      'Content-Length': body.length,
      'Cache-Control': isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  } catch {
    send(res, 404, '');
  }
}

function listen(host) {
  return new Promise((resolveListen, rejectListen) => {
    const server = createServer((req, res) => {
      handle(req, res).catch(() => send(res, 500, ''));
    });
    server.once('error', rejectListen);
    server.listen(PORT, host, () => resolveListen(server));
  });
}

const results = await Promise.allSettled([listen('127.0.0.1'), listen('::1')]);
if (results[0].status === 'rejected') {
  console.error(`Keroo: could not listen on 127.0.0.1:${PORT} (${results[0].reason?.code ?? results[0].reason}).`);
  process.exit(1);
}
// ::1 may be missing when IPv6 is turned off; 127.0.0.1 is enough then.
resetIdleTimer();
console.log(`Keroo: serving ${DIST} at http://localhost:${PORT}/`);
