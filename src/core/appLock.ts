/**
 * src/core/appLock.ts
 *
 * Local app lock: an optional password that Keroo asks for before it shows any data.
 *
 * - Only a salted PBKDF2-SHA-256 hash is stored, never the password itself.
 * - The record lives in this browser's localStorage. It is not part of backups, so a
 *   restore never changes the password, and each browser has its own lock.
 * - This gates the interface. It does not encrypt the IndexedDB data: someone with
 *   access to the computer's user account and the browser's developer tools can still
 *   read it.
 */

export const APP_LOCK_STORAGE_KEY = 'keroo_app_lock';

/** Shortest password the lock accepts. */
export const APP_LOCK_MIN_LENGTH = 4;

/** PBKDF2-SHA-256 work factor (OWASP 2023 recommendation). */
export const APP_LOCK_DEFAULT_ITERATIONS = 600_000;

/** Keroo locks itself after this long without a click, tap or key press. */
export const APP_LOCK_IDLE_MS = 10 * 60 * 1000;

const SALT_BYTES = 16;
const HASH_BITS = 256;

export interface AppLockRecord {
  version: 1;
  algorithm: 'PBKDF2-SHA-256';
  iterations: number;
  /** Base64 salt. */
  salt: string;
  /** Base64 derived key. */
  hash: string;
}

/** The subset of the Web Storage API the lock needs (lets tests pass a fake). */
export type AppLockStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Browsers only expose Web Crypto on HTTPS pages and on localhost.
    throw new Error('APP_LOCK_CRYPTO_UNAVAILABLE');
  }
  return subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = getSubtle();
  const key = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

/** Compares two byte arrays without stopping at the first difference. */
function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** True when the password is long enough to be used as the app lock. */
export function isValidAppLockPassword(password: string): boolean {
  return password.length >= APP_LOCK_MIN_LENGTH;
}

/** Hashes a new password into a storable lock record. */
export async function createAppLockRecord(
  password: string,
  iterations: number = APP_LOCK_DEFAULT_ITERATIONS
): Promise<AppLockRecord> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveHash(password, salt, iterations);
  return {
    version: 1,
    algorithm: 'PBKDF2-SHA-256',
    iterations,
    salt: toBase64(salt),
    hash: toBase64(hash),
  };
}

/** Checks a typed password against a stored lock record. */
export async function verifyAppLockPassword(record: AppLockRecord, password: string): Promise<boolean> {
  const expected = fromBase64(record.hash);
  const actual = await deriveHash(password, fromBase64(record.salt), record.iterations);
  return equalBytes(actual, expected);
}

function isAppLockRecord(value: unknown): value is AppLockRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    r.version === 1 &&
    r.algorithm === 'PBKDF2-SHA-256' &&
    typeof r.iterations === 'number' &&
    Number.isInteger(r.iterations) &&
    r.iterations > 0 &&
    typeof r.salt === 'string' &&
    r.salt.length > 0 &&
    typeof r.hash === 'string' &&
    r.hash.length > 0
  );
}

function defaultStorage(): AppLockStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Reads the stored lock record, or null when the lock is off (or the record is unreadable). */
export function readAppLock(storage: AppLockStorage | null = defaultStorage()): AppLockRecord | null {
  if (!storage) return null;
  const raw = storage.getItem(APP_LOCK_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isAppLockRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Stores a lock record, which turns the lock on. */
export function writeAppLock(record: AppLockRecord, storage: AppLockStorage | null = defaultStorage()): void {
  storage?.setItem(APP_LOCK_STORAGE_KEY, JSON.stringify(record));
}

/** Removes the lock record, which turns the lock off. */
export function clearAppLock(storage: AppLockStorage | null = defaultStorage()): void {
  storage?.removeItem(APP_LOCK_STORAGE_KEY);
}
