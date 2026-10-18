import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { KerooDatabase, MONETARY_RULES, db as appDb } from '../db';
import { seedCleanSlate, seedDemoData } from '../db/seed';
import {
  BACKUP_ERROR_CODES,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  BackupError,
  KEROO_APP_VERSION,
  backupRowCounts,
  exportBackup,
  formatStorageMegabytes,
  isBackupError,
  parseBackup,
  requestPersistentStorage,
  restoreBackup,
  serializeBackup,
  suggestBackupFilename,
  type BackupErrorCode,
  type KerooBackup,
} from '../core/backup';
import { I18nProvider } from '../i18n';
import { SettingsView } from '../views/SettingsView';
import enUS from '../i18n/en-US.json';
import type { AutoRule, SplitSettlement } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const newIsolatedDb = async (): Promise<KerooDatabase> => {
  const name = `keroo_backup_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const db = new KerooDatabase(name);
  await db.open();
  return db;
};

const EXTRA_RULE: AutoRule = {
  id: 'rule_backup_test',
  name: 'Coffee shops',
  priority: 1,
  logic: 'AND',
  conditions: [{ field: 'payee', operator: 'CONTAINS', value: 'coffee' }],
  actions: [{ field: 'categoryId', value: 'cat_coffee' }],
  isActive: true,
};

const EXTRA_SETTLEMENT: SplitSettlement = {
  id: 'settle_backup_test',
  fromPartyId: 'USER',
  toPartyId: 'party_camila',
  amountCents: 12345,
  date: '2026-10-01',
  notes: 'Pix',
  createdAt: '2026-10-01T12:00:00.000Z',
};

/** Demo data plus one auto rule and one settlement, so all 14 tables hold rows. */
const seedFullDataset = async (db: KerooDatabase) => {
  await seedDemoData(db, 'en-US', 'USD', 'Keroo');
  await db.auto_rules.add(EXTRA_RULE);
  await db.split_settlements.add(EXTRA_SETTLEMENT);
};

/** Every `*Cents` value anywhere in a row tree (root fields and nested arrays). */
function collectCents(value: unknown, path: string, out: { path: string; value: unknown }[]) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => collectCents(item, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (key.endsWith('Cents')) out.push({ path: `${path}.${key}`, value: child });
      collectCents(child, `${path}.${key}`, out);
    }
  }
  return out;
}

const expectBackupError = (fn: () => unknown, code: BackupErrorCode) => {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(BackupError);
  expect(isBackupError(caught)).toBe(true);
  expect((caught as BackupError).code).toBe(code);
};

const validBackupText = (tables: Record<string, unknown> = { accounts: [] }) =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: '2026-10-18T12:00:00.000Z',
    appVersion: '0.1.0',
    tables,
  });

const readBlobText = (blob: Blob): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(String(reader.result ?? ''));
    reader.onerror = () => rej(reader.error);
    reader.readAsText(blob);
  });

/** Replaces navigator.storage for one test; returns the restore function. */
function stubNavigatorStorage(value: unknown): () => void {
  const own = Object.getOwnPropertyDescriptor(window.navigator, 'storage');
  Object.defineProperty(window.navigator, 'storage', { value, configurable: true });
  return () => {
    if (own) Object.defineProperty(window.navigator, 'storage', own);
    else delete (window.navigator as { storage?: unknown }).storage;
  };
}

// ---------------------------------------------------------------------------
// Core: export / serialize / parse / restore
// ---------------------------------------------------------------------------

describe('core/backup — export', () => {
  let db: KerooDatabase;

  beforeEach(async () => {
    db = await newIsolatedDb();
    await seedFullDataset(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('exports every Dexie table with its exact row count and the format header', async () => {
    const now = new Date('2026-10-18T12:34:56.000Z');
    const backup = await exportBackup(db, now);

    expect(backup.format).toBe('keroo-backup');
    expect(backup.version).toBe(1);
    expect(backup.exportedAt).toBe('2026-10-18T12:34:56.000Z');
    expect(backup.appVersion).toBe(KEROO_APP_VERSION);

    const tableNames = db.tables.map((t) => t.name);
    expect(tableNames).toHaveLength(14);
    expect(Object.keys(backup.tables).sort()).toEqual([...tableNames].sort());
    for (const table of db.tables) {
      expect(backup.tables[table.name]).toHaveLength(await table.count());
      // The full dataset fills every table, so the round-trip below covers all 14.
      expect(backup.tables[table.name].length).toBeGreaterThan(0);
    }
  });

  it('keeps every monetary *Cents field an integer, before and after the JSON round trip', async () => {
    // Every field the DB hooks guard is a *Cents field, so the generic walk covers all of them.
    for (const config of Object.values(MONETARY_RULES)) {
      for (const rule of config.rootFields ?? []) expect(rule.field.endsWith('Cents')).toBe(true);
      for (const nested of config.nestedArrayFields ?? []) {
        for (const rule of nested.rules) expect(rule.field.endsWith('Cents')).toBe(true);
      }
    }

    const backup = await exportBackup(db);
    const reparsed = parseBackup(serializeBackup(backup));

    for (const snapshot of [backup, reparsed]) {
      const cents = collectCents(snapshot.tables, 'tables', []);
      expect(cents.length).toBeGreaterThan(30);
      const nonInteger = cents.filter((c) => c.value !== undefined && !Number.isInteger(c.value));
      expect(nonInteger).toEqual([]);

      // Every guarded root field shows up at least once in the export.
      for (const [tableName, config] of Object.entries(MONETARY_RULES)) {
        for (const rule of config.rootFields ?? []) {
          const rows = snapshot.tables[tableName] as Record<string, unknown>[];
          expect(rows.some((row) => Number.isInteger(row[rule.field]))).toBe(true);
        }
      }
    }
  });

  it('serializes as 2-space indented JSON that parses back to the same backup', async () => {
    const backup = await exportBackup(db);
    const text = serializeBackup(backup);
    expect(text).toBe(JSON.stringify(backup, null, 2));
    expect(text.startsWith('{\n  "format": "keroo-backup"')).toBe(true);
    expect(parseBackup(text)).toEqual(backup);
  });

  it('backupRowCounts lists every database table (0 when missing from the file)', async () => {
    const backup = await exportBackup(db);
    delete backup.tables.piggy_banks;
    const counts = backupRowCounts(db, backup);
    expect(Object.keys(counts)).toEqual(db.tables.map((t) => t.name));
    expect(counts.accounts).toBe(3);
    expect(counts.piggy_banks).toBe(0);
  });
});

describe('core/backup — restore', () => {
  let db: KerooDatabase;

  beforeEach(async () => {
    db = await newIsolatedDb();
    await seedFullDataset(db);
  });

  afterEach(async () => {
    db.close();
    await db.delete();
  });

  it('round-trips: export, wipe, restore gives back identical tables', async () => {
    const original = await exportBackup(db);
    const fromFile = parseBackup(serializeBackup(original));

    await db.transaction('rw', db.tables, async () => {
      for (const table of db.tables) await table.clear();
    });
    for (const table of db.tables) expect(await table.count()).toBe(0);

    const result = await restoreBackup(db, fromFile, { mode: 'replace' });

    expect(result.restoredTables).toEqual(db.tables.map((t) => t.name));
    expect(result.skippedTables).toEqual([]);
    for (const table of db.tables) {
      const expectedRows = original.tables[table.name];
      expect(result.rowCounts[table.name]).toBe(expectedRows.length);
      expect(await table.count()).toBe(expectedRows.length);

      // Deep-equal sample row, looked up by its primary key.
      const sample = expectedRows[0] as { id: string };
      expect(await table.get(sample.id)).toEqual(sample);
    }

    const again = await exportBackup(db);
    expect(again.tables).toEqual(original.tables);
    expect(await db.auto_rules.get(EXTRA_RULE.id)).toEqual(EXTRA_RULE);
    expect(await db.split_settlements.get(EXTRA_SETTLEMENT.id)).toEqual(EXTRA_SETTLEMENT);
  });

  it('replaces current data: rows not in the file are gone, tables missing from the file end empty', async () => {
    const source = await newIsolatedDb();
    try {
      await seedCleanSlate(source, 'pt-BR', 'BRL', 'Sapinho');
      const backup = await exportBackup(source);
      delete backup.tables.categories;

      const result = await restoreBackup(db, backup);

      expect(result.restoredTables).not.toContain('categories');
      expect(result.rowCounts.categories).toBe(0);
      expect(await db.categories.count()).toBe(0);
      expect(await db.accounts.count()).toBe(0);
      expect(await db.transactions.count()).toBe(0);
      expect(await db.auto_rules.get(EXTRA_RULE.id)).toBeUndefined();
      expect((await db.user_settings.get('global'))?.language).toBe('pt-BR');
      expect((await db.keroo_state.get('current'))?.nickname).toBe('Sapinho');
      expect(await db.category_groups.count()).toBe(backup.tables.category_groups.length);
    } finally {
      source.close();
      await source.delete();
    }
  });

  it('ignores unknown table names in the file and reports them as skipped', async () => {
    const backup = await exportBackup(db);
    const withExtra = parseBackup(
      serializeBackup({ ...backup, tables: { ...backup.tables, legacy_sheet: [{ id: 'x' }], zeta: [] } })
    );

    const result = await restoreBackup(db, withExtra);

    expect(result.skippedTables).toEqual(['legacy_sheet', 'zeta']);
    expect(result.restoredTables).not.toContain('legacy_sheet');
    expect(Object.keys(result.rowCounts)).not.toContain('legacy_sheet');
    expect(db.tables.map((t) => t.name)).not.toContain('legacy_sheet');
    expect(await db.accounts.count()).toBe(3);
  });

  describe('atomic rollback (a bad row leaves the database exactly as it was)', () => {
    let good: KerooBackup;
    let before: KerooBackup;

    beforeEach(async () => {
      good = await exportBackup(db);
      // Make the current state differ from the backup, so a partial restore would show.
      await seedCleanSlate(db, 'en-US', 'USD', 'Before');
      await db.accounts.add({
        id: 'acc_marker',
        name: 'Marker',
        type: 'checking',
        currency: 'USD',
        initialBalanceCents: 1000,
        currentBalanceCents: 1000,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      before = await exportBackup(db);
    });

    const copy = (b: KerooBackup) => parseBackup(serializeBackup(b));
    const expectUnchanged = async () => {
      const after = await exportBackup(db);
      expect(after.tables).toEqual(before.tables);
      expect(await db.accounts.get('acc_marker')).toBeDefined();
      expect((await db.keroo_state.get('current'))?.nickname).toBe('Before');
    };

    it('rolls back when a row has float cents (rejected by the monetary hooks mid-restore)', async () => {
      const bad = copy(good);
      // transactions is restored after accounts/categories/envelopes were already rewritten.
      (bad.tables.transactions[0] as Record<string, unknown>).amountCents = 10.5;
      await expect(restoreBackup(db, bad)).rejects.toThrow();
      await expectUnchanged();
    });

    it('rolls back when the last table has a row without its primary key', async () => {
      const bad = copy(good);
      delete (bad.tables.user_settings[0] as Record<string, unknown>).id;
      await expect(restoreBackup(db, bad)).rejects.toThrow();
      await expectUnchanged();
    });

    it('rolls back on duplicate primary keys inside one table', async () => {
      const bad = copy(good);
      bad.tables.categories.push({ ...(bad.tables.categories[0] as object) });
      await expect(restoreBackup(db, bad)).rejects.toThrow();
      await expectUnchanged();
    });

    it('rejects a malformed table before touching the database', async () => {
      const bad = copy(good) as unknown as { tables: Record<string, unknown> };
      bad.tables.piggy_banks = 'not-an-array';
      let caught: unknown;
      try {
        await restoreBackup(db, bad as unknown as KerooBackup);
      } catch (err) {
        caught = err;
      }
      expect(isBackupError(caught) && caught.code).toBe('MALFORMED_TABLES');
      await expectUnchanged();
    });
  });
});

describe('core/backup — parseBackup validation', () => {
  it('accepts a minimal valid file', () => {
    const parsed = parseBackup(validBackupText({ accounts: [{ id: 'a' }], keroo_state: [] }));
    expect(parsed.format).toBe('keroo-backup');
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe('2026-10-18T12:00:00.000Z');
    expect(parsed.tables).toEqual({ accounts: [{ id: 'a' }], keroo_state: [] });
  });

  it('rejects text that is not JSON with INVALID_JSON', () => {
    expectBackupError(() => parseBackup('{not json'), 'INVALID_JSON');
    expectBackupError(() => parseBackup(''), 'INVALID_JSON');
    expectBackupError(() => parseBackup('format: keroo-backup'), 'INVALID_JSON');
  });

  it('rejects other JSON documents with UNKNOWN_FORMAT', () => {
    expectBackupError(() => parseBackup('null'), 'UNKNOWN_FORMAT');
    expectBackupError(() => parseBackup('42'), 'UNKNOWN_FORMAT');
    expectBackupError(() => parseBackup('[]'), 'UNKNOWN_FORMAT');
    expectBackupError(() => parseBackup('{}'), 'UNKNOWN_FORMAT');
    expectBackupError(
      () => parseBackup(JSON.stringify({ format: 'actual-budget', version: 1, tables: {} })),
      'UNKNOWN_FORMAT'
    );
  });

  it('rejects other format versions with UNSUPPORTED_VERSION', () => {
    for (const version of [2, 0, '1', null, 1.5]) {
      expectBackupError(
        () => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version, tables: {} })),
        'UNSUPPORTED_VERSION'
      );
    }
    expectBackupError(
      () => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, tables: {} })),
      'UNSUPPORTED_VERSION'
    );
  });

  it('rejects a bad tables shape with MALFORMED_TABLES', () => {
    const base = { format: BACKUP_FORMAT, version: BACKUP_VERSION };
    expectBackupError(() => parseBackup(JSON.stringify(base)), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(JSON.stringify({ ...base, tables: [] })), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(JSON.stringify({ ...base, tables: null })), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(validBackupText({ accounts: {} })), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(validBackupText({ accounts: 'rows' })), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(validBackupText({ accounts: [1, 2] })), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(validBackupText({ accounts: [null] })), 'MALFORMED_TABLES');
    expectBackupError(() => parseBackup(validBackupText({ accounts: [[]] })), 'MALFORMED_TABLES');
  });

  it('exposes exactly the four machine codes and keeps user text out of the error', () => {
    expect([...BACKUP_ERROR_CODES].sort()).toEqual(
      ['INVALID_JSON', 'MALFORMED_TABLES', 'UNKNOWN_FORMAT', 'UNSUPPORTED_VERSION'].sort()
    );
    const err = new BackupError('INVALID_JSON');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BackupError');
    expect(err.message).toBe('[BackupError] INVALID_JSON');
  });

  it('tolerates missing exportedAt/appVersion and keeps a "__proto__" table name as inert data', () => {
    const parsed = parseBackup(
      '{"format":"keroo-backup","version":1,"tables":{"__proto__":[{"id":"p"}],"accounts":[]}}'
    );
    expect(parsed.exportedAt).toBe('');
    expect(parsed.appVersion).toBe('');
    expect(Object.getPrototypeOf(parsed.tables)).toBe(Object.prototype);
    expect(Object.keys(parsed.tables).sort()).toEqual(['__proto__', 'accounts']);
  });
});

describe('core/backup — helpers', () => {
  it('suggestBackupFilename uses the LOCAL calendar date', () => {
    expect(suggestBackupFilename(new Date(2026, 9, 18, 9, 0))).toBe('keroo-backup-2026-10-18.json');
    // 23:59 local is still the same local day (toISOString would roll over in UTC-3).
    expect(suggestBackupFilename(new Date(2026, 9, 18, 23, 59))).toBe('keroo-backup-2026-10-18.json');
    expect(suggestBackupFilename(new Date(2027, 0, 5, 0, 1))).toBe('keroo-backup-2027-01-05.json');
    expect(suggestBackupFilename()).toMatch(/^keroo-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('KEROO_APP_VERSION matches package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(KEROO_APP_VERSION).toBe(pkg.version);
  });

  it('formatStorageMegabytes shows MB with at most one decimal in the given locale', () => {
    const MB = 1024 * 1024;
    expect(formatStorageMegabytes(1.5 * MB, 'en-US')).toBe('1.5');
    expect(formatStorageMegabytes(1.5 * MB, 'pt-BR')).toBe('1,5');
    expect(formatStorageMegabytes(300 * 1024 * MB, 'en-US')).toBe('307,200');
    expect(formatStorageMegabytes(0, 'en-US')).toBe('0');
    expect(formatStorageMegabytes(Number.NaN, 'en-US')).toBe('0');
    expect(formatStorageMegabytes(-5, 'en-US')).toBe('0');
  });

  describe('requestPersistentStorage', () => {
    let restore: (() => void) | null = null;
    afterEach(() => {
      restore?.();
      restore = null;
    });

    it('resolves true when the browser grants persistence', async () => {
      const persist = vi.fn().mockResolvedValue(true);
      restore = stubNavigatorStorage({ persist });
      await expect(requestPersistentStorage()).resolves.toBe(true);
      expect(persist).toHaveBeenCalledTimes(1);
    });

    it('resolves false (never throws) when the API is missing, denied or rejecting', async () => {
      restore = stubNavigatorStorage(undefined);
      await expect(requestPersistentStorage()).resolves.toBe(false);
      restore();

      restore = stubNavigatorStorage({});
      await expect(requestPersistentStorage()).resolves.toBe(false);
      restore();

      restore = stubNavigatorStorage({ persist: vi.fn().mockResolvedValue(false) });
      await expect(requestPersistentStorage()).resolves.toBe(false);
      restore();

      restore = stubNavigatorStorage({ persist: vi.fn().mockRejectedValue(new Error('nope')) });
      await expect(requestPersistentStorage()).resolves.toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// SettingsView: Backup & Restore card
// ---------------------------------------------------------------------------

describe('SettingsView — Backup & Restore card', () => {
  const settingsEn = enUS.settings;
  let restoreStorage: (() => void) | null = null;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(async () => {
    localStorage.clear();
    await seedDemoData(appDb, 'en-US', 'USD', 'Keroo');
  });

  afterEach(() => {
    restoreStorage?.();
    restoreStorage = null;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const renderSettings = (props: Partial<React.ComponentProps<typeof SettingsView>> = {}) =>
    render(
      React.createElement(I18nProvider, {
        initialLanguage: 'en-US',
        children: React.createElement(SettingsView, { currency: 'USD', ...props }),
      })
    );

  it('renders the card with export/import buttons and the storage usage line', async () => {
    const MB = 1024 * 1024;
    restoreStorage = stubNavigatorStorage({
      estimate: vi.fn().mockResolvedValue({ usage: 1.5 * MB, quota: 2048 * MB }),
    });
    renderSettings();

    expect(await screen.findByText(settingsEn.backup_title)).toBeInTheDocument();
    expect(screen.getByText(settingsEn.backup_desc)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: settingsEn.backup_export_btn })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: settingsEn.backup_import_btn })).toBeInTheDocument();

    const input = screen.getByTestId('backup-file-input') as HTMLInputElement;
    expect(input.type).toBe('file');
    expect(input.accept).toBe('.json,application/json');

    expect(await screen.findByTestId('backup-storage-usage')).toHaveTextContent(
      'Storage used on this device: 1.5 MB of 2,048 MB available'
    );
  });

  it('hides the storage line when navigator.storage.estimate is unavailable', async () => {
    restoreStorage = stubNavigatorStorage(undefined);
    renderSettings();
    expect(await screen.findByText(settingsEn.backup_title)).toBeInTheDocument();
    expect(screen.queryByTestId('backup-storage-usage')).not.toBeInTheDocument();
  });

  it('exports a JSON download named keroo-backup-<local date>.json and revokes the URL', async () => {
    let exportedBlob: Blob | null = null;
    const create = vi.fn((blob: Blob) => {
      exportedBlob = blob;
      return 'blob:keroo-test';
    });
    const revoke = vi.fn();
    URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke;
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download);
    });

    renderSettings();
    fireEvent.click(await screen.findByTestId('backup-export-button'));

    await waitFor(() => expect(downloads).toEqual([suggestBackupFilename(new Date())]));
    expect(create).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(settingsEn.backup_exported)).toBeInTheDocument();

    expect(exportedBlob).not.toBeNull();
    const blob = exportedBlob as unknown as Blob;
    expect(blob.type).toBe('application/json');
    const parsed = parseBackup(await readBlobText(blob));
    expect(parsed.tables.accounts).toHaveLength(3);
    expect(Object.keys(parsed.tables)).toHaveLength(14);

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:keroo-test'), { timeout: 3000 });
  });

  it('imports a backup: confirm modal with row counts, atomic replace, language sync, then reload', async () => {
    // The file comes from a pt-BR database; the live one is the en-US demo.
    const source = await newIsolatedDb();
    let fileText: string;
    try {
      await seedDemoData(source, 'pt-BR', 'BRL', 'Sapo');
      await source.auto_rules.add(EXTRA_RULE);
      fileText = serializeBackup(await exportBackup(source));
    } finally {
      source.close();
      await source.delete();
    }
    await seedCleanSlate(appDb, 'en-US', 'USD', 'Keroo');
    expect(await appDb.accounts.count()).toBe(0);

    const onRestoreComplete = vi.fn();
    renderSettings({ onRestoreComplete });

    const input = (await screen.findByTestId('backup-file-input')) as HTMLInputElement;
    const file = new File([fileText], 'keroo-backup-2026-10-18.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });

    const modal = await screen.findByTestId('backup-confirm-modal');
    expect(within(modal).getByText(settingsEn.backup_confirm_desc)).toBeInTheDocument();
    expect(screen.getByText(settingsEn.backup_confirm_title)).toBeInTheDocument();
    const accountsRow = within(modal).getByTestId('backup-count-accounts');
    expect(accountsRow).toHaveTextContent(settingsEn.backup_tables.accounts);
    expect(accountsRow).toHaveTextContent('3');
    expect(within(modal).getByTestId('backup-count-auto_rules')).toHaveTextContent('1');
    expect(within(modal).getByTestId('backup-count-split_settlements')).toHaveTextContent('0');
    // Nothing is written before the user confirms.
    expect(await appDb.accounts.count()).toBe(0);

    fireEvent.click(within(modal).getByTestId('backup-confirm-button'));

    await waitFor(async () => expect(await appDb.accounts.count()).toBe(3));
    expect(await appDb.auto_rules.get(EXTRA_RULE.id)).toEqual(EXTRA_RULE);
    expect((await appDb.keroo_state.get('current'))?.nickname).toBe('Sapo');
    expect((await appDb.user_settings.get('global'))?.language).toBe('pt-BR');
    // The UI language follows the restored settings (stored per device in localStorage).
    await waitFor(() => expect(localStorage.getItem('keroo_language')).toBe('pt-BR'));
    await waitFor(() => expect(onRestoreComplete).toHaveBeenCalledTimes(1), { timeout: 4000 });
  });

  const importText = async (text: string) => {
    const input = (await screen.findByTestId('backup-file-input')) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([text], 'broken.json', { type: 'application/json' })] },
    });
  };

  it('shows a translated error per BackupError code and opens no confirm modal', async () => {
    renderSettings();

    await importText('{oops');
    expect(await screen.findByTestId('backup-error')).toHaveTextContent(
      settingsEn.backup_err_INVALID_JSON
    );

    await importText(JSON.stringify({ format: 'other', version: 1, tables: {} }));
    await waitFor(() =>
      expect(screen.getByTestId('backup-error')).toHaveTextContent(settingsEn.backup_err_UNKNOWN_FORMAT)
    );

    await importText(JSON.stringify({ format: BACKUP_FORMAT, version: 99, tables: {} }));
    await waitFor(() =>
      expect(screen.getByTestId('backup-error')).toHaveTextContent(
        settingsEn.backup_err_UNSUPPORTED_VERSION
      )
    );

    await importText(validBackupText({ accounts: 'nope' }));
    await waitFor(() =>
      expect(screen.getByTestId('backup-error')).toHaveTextContent(
        settingsEn.backup_err_MALFORMED_TABLES
      )
    );

    expect(screen.queryByTestId('backup-confirm-modal')).not.toBeInTheDocument();
    expect(await appDb.accounts.count()).toBe(3);
  });

  it('shows the GENERIC restore error, keeps the modal open and leaves data untouched when restore fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = await exportBackup(appDb);
    const bad = parseBackup(serializeBackup(before));
    (bad.tables.transactions[0] as Record<string, unknown>).amountCents = 0.5;
    const onRestoreComplete = vi.fn();
    renderSettings({ onRestoreComplete });

    await importText(serializeBackup(bad));
    const modal = await screen.findByTestId('backup-confirm-modal');
    fireEvent.click(within(modal).getByTestId('backup-confirm-button'));

    expect(await screen.findByTestId('restore-error')).toHaveTextContent(settingsEn.backup_err_GENERIC);
    expect(screen.getByTestId('backup-confirm-modal')).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalled();
    expect((await exportBackup(appDb)).tables).toEqual(before.tables);
    expect(onRestoreComplete).not.toHaveBeenCalled();
  });

  it('surfaces settings.err_generic when loading demo data fails (no longer swallowed)', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = appDb.piggy_banks.bulkAdd.bind(appDb.piggy_banks);
    (appDb.piggy_banks as unknown as { bulkAdd: unknown }).bulkAdd = () => {
      throw new Error('boom');
    };
    try {
      renderSettings();
      fireEvent.click(await screen.findByRole('button', { name: settingsEn.demo_button }));
      fireEvent.click(await screen.findByRole('button', { name: settingsEn.confirm_load }));

      expect(await screen.findByText(settingsEn.err_generic)).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(settingsEn.err_generic);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      (appDb.piggy_banks as unknown as { bulkAdd: unknown }).bulkAdd = original;
    }
  });

  it('surfaces settings.err_generic when the clean-slate reset fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const original = appDb.category_groups.add.bind(appDb.category_groups);
    (appDb.category_groups as unknown as { add: unknown }).add = () => {
      throw new Error('boom');
    };
    try {
      renderSettings();
      fireEvent.click(await screen.findByRole('button', { name: settingsEn.reset_button }));
      fireEvent.click(await screen.findByRole('button', { name: settingsEn.confirm_reset }));

      expect(await screen.findByText(settingsEn.err_generic)).toBeInTheDocument();
      expect(consoleError).toHaveBeenCalled();
      // The atomic seed rolled back: the demo accounts are still there.
      expect(await appDb.accounts.count()).toBe(3);
    } finally {
      (appDb.category_groups as unknown as { add: unknown }).add = original;
    }
  });
});
