/**
 * src/core/backup.ts
 *
 * Backup & Restore for Keroo's local-first IndexedDB (Dexie) database.
 *
 * Keroo keeps 100% of its data in the browser. Without an export, "Clear site
 * data" or switching browsers loses everything, so this module turns the whole
 * database into one portable JSON file and back.
 *
 * ## Backup file format (`keroo-backup`, version 1)
 *
 * ```json
 * {
 *   "format": "keroo-backup",            // constant magic string
 *   "version": 1,                        // format version (integer)
 *   "exportedAt": "2026-10-18T21:04:05.123Z", // instant of the export (UTC ISO 8601)
 *   "appVersion": "0.1.0",               // Keroo version that wrote the file
 *   "tables": {                          // one key per Dexie table, value = every row
 *     "accounts": [{ "id": "...", "currentBalanceCents": 123456, ... }],
 *     "transactions": [ ... ],
 *     "user_settings": [{ "id": "global", ... }]
 *     // ...every table of the database (14 in schema v1)
 *   }
 * }
 * ```
 *
 * - Rows are stored exactly as Dexie returns them (primary key included, e.g. `id`).
 * - Money stays in integer cents (`*Cents` fields); nothing is converted to floats.
 * - The table list is read from `db.tables`, so a new table is exported automatically.
 * - JSON drops `undefined` properties; Keroo rows only hold JSON-safe values
 *   (strings, integers, booleans, arrays, plain objects), so a round trip is lossless.
 *
 * ## Restore semantics (`mode: "replace"`)
 *
 * One read-write transaction over every table: each table is cleared and refilled
 * with the rows from the file (tables missing from the file end up empty). Any
 * failure (duplicate key, missing primary key, non-integer cents rejected by the
 * monetary hooks...) aborts the transaction, so the database is left untouched.
 * Table names in the file that the database does not know are ignored and reported
 * in `skippedTables`.
 *
 * This module is UI-free: errors carry a machine `code` (see {@link BackupErrorCode});
 * the view translates it.
 */

import type Dexie from 'dexie';
import type { SupportedLocale } from '../types';
import { getLocalTodayISO } from './dates';

/** Magic string identifying a Keroo backup file. */
export const BACKUP_FORMAT = 'keroo-backup' as const;

/** Current (and only supported) backup format version. */
export const BACKUP_VERSION = 1 as const;

/** Keroo version written into every backup (kept in sync with package.json by a test). */
export const KEROO_APP_VERSION = '0.1.0';

export interface KerooBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  /** Instant of the export, UTC ISO 8601. */
  exportedAt: string;
  appVersion: string;
  /** Table name -> every row of that table. */
  tables: Record<string, unknown[]>;
}

/** Machine-readable reasons a backup file is rejected. */
export type BackupErrorCode =
  | 'INVALID_JSON'
  | 'UNKNOWN_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'MALFORMED_TABLES';

/** Every {@link BackupErrorCode}; `satisfies` keeps the list exhaustive. */
export const BACKUP_ERROR_CODES = Object.keys({
  INVALID_JSON: true,
  UNKNOWN_FORMAT: true,
  UNSUPPORTED_VERSION: true,
  MALFORMED_TABLES: true,
} satisfies Record<BackupErrorCode, true>) as BackupErrorCode[];

/** Error thrown for an unreadable / incompatible backup. `code` is what the UI translates. */
export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode, detail?: string) {
    super(detail ? `[BackupError] ${code}: ${detail}` : `[BackupError] ${code}`);
    this.name = 'BackupError';
    this.code = code;
  }
}

export function isBackupError(err: unknown): err is BackupError {
  return err instanceof BackupError;
}

export interface RestoreOptions {
  /** Only "replace" exists: every current row is discarded and the file's rows written. */
  mode: 'replace';
}

export interface RestoreResult {
  /** Database tables that were present in the file and written from it. */
  restoredTables: string[];
  /** Table names found in the file that this database does not have (ignored). */
  skippedTables: string[];
  /** Rows now stored per database table (0 for tables missing from the file). */
  rowCounts: Record<string, number>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads every table into a {@link KerooBackup} inside one read-only transaction,
 * so the snapshot is consistent even if the UI writes meanwhile.
 */
export async function exportBackup(db: Dexie, now: Date = new Date()): Promise<KerooBackup> {
  const tables: Record<string, unknown[]> = {};
  await db.transaction('r', db.tables, async () => {
    for (const table of db.tables) {
      tables[table.name] = await table.toArray();
    }
  });
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    appVersion: KEROO_APP_VERSION,
    tables,
  };
}

/** Pretty-printed JSON text of a backup (2-space indentation). */
export function serializeBackup(backup: KerooBackup): string {
  return JSON.stringify(backup, null, 2);
}

/**
 * Validates an already-decoded value and returns it as a {@link KerooBackup}.
 * Checks run in order: format, version, tables shape.
 */
function validateBackup(raw: unknown): KerooBackup {
  if (!isPlainObject(raw) || raw.format !== BACKUP_FORMAT) {
    throw new BackupError('UNKNOWN_FORMAT');
  }
  if (raw.version !== BACKUP_VERSION) {
    throw new BackupError('UNSUPPORTED_VERSION', String(raw.version));
  }
  if (!isPlainObject(raw.tables)) {
    throw new BackupError('MALFORMED_TABLES', 'tables must be an object');
  }
  const entries: [string, unknown[]][] = [];
  for (const [name, rows] of Object.entries(raw.tables)) {
    if (!Array.isArray(rows)) {
      throw new BackupError('MALFORMED_TABLES', `${name} must be an array`);
    }
    if (!rows.every(isPlainObject)) {
      throw new BackupError('MALFORMED_TABLES', `${name} must only contain objects`);
    }
    entries.push([name, rows]);
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    appVersion: typeof raw.appVersion === 'string' ? raw.appVersion : '',
    // fromEntries defines own properties, so a "__proto__" table name stays inert data.
    tables: Object.fromEntries(entries),
  };
}

/**
 * Parses backup file text. Throws {@link BackupError} with code
 * INVALID_JSON, UNKNOWN_FORMAT, UNSUPPORTED_VERSION or MALFORMED_TABLES.
 */
export function parseBackup(text: string): KerooBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('INVALID_JSON');
  }
  return validateBackup(raw);
}

/** Row count per database table as it would be after restoring `backup`. */
export function backupRowCounts(db: Dexie, backup: KerooBackup): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of db.tables) {
    const rows = Object.prototype.hasOwnProperty.call(backup.tables, table.name)
      ? backup.tables[table.name]
      : undefined;
    counts[table.name] = rows?.length ?? 0;
  }
  return counts;
}

/**
 * Replaces the whole database with the backup's rows in ONE read-write transaction
 * (clear + bulkAdd per table). Any failure rolls every table back.
 */
export async function restoreBackup(
  db: Dexie,
  backup: KerooBackup,
  options: RestoreOptions = { mode: 'replace' }
): Promise<RestoreResult> {
  if (options.mode !== 'replace') {
    throw new TypeError(`[BackupError] Unsupported restore mode: ${String(options.mode)}`);
  }
  // Re-validate: the caller may hand over an object that never went through parseBackup.
  const checked = validateBackup(backup);

  const known = new Set(db.tables.map((table) => table.name));
  const skippedTables = Object.keys(checked.tables)
    .filter((name) => !known.has(name))
    .sort();
  const restoredTables: string[] = [];
  const rowCounts = backupRowCounts(db, checked);

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
      if (!Object.prototype.hasOwnProperty.call(checked.tables, table.name)) continue;
      const rows = checked.tables[table.name];
      if (rows.length > 0) {
        await table.bulkAdd(rows);
      }
      restoredTables.push(table.name);
    }
  });

  return { restoredTables, skippedTables, rowCounts };
}

/** Default download name, from the user's LOCAL calendar date: keroo-backup-YYYY-MM-DD.json. */
export function suggestBackupFilename(date: Date = new Date()): string {
  return `keroo-backup-${getLocalTodayISO(date)}.json`;
}

/** Bytes shown as megabytes (1 MB = 1024 * 1024 bytes) with at most one decimal. */
export function formatStorageMegabytes(bytes: number, locale: SupportedLocale): string {
  const safe = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    safe / (1024 * 1024)
  );
}

/**
 * Best-effort request to exempt Keroo's storage from automatic eviction.
 * Firefox may prompt; Chromium decides silently. Never throws or rejects;
 * resolves false when the API is missing or the request fails.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined') return false;
    const persisted = await navigator.storage?.persist?.();
    return persisted === true;
  } catch {
    return false;
  }
}
