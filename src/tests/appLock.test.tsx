/**
 * src/tests/appLock.test.tsx
 *
 * App lock: the PBKDF2 password record, the lock screen gate (unlock, lock now,
 * idle auto-lock, forgotten password), the Settings card and the header button.
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  APP_LOCK_MIN_LENGTH,
  APP_LOCK_STORAGE_KEY,
  clearAppLock,
  createAppLockRecord,
  isValidAppLockPassword,
  readAppLock,
  verifyAppLockPassword,
  writeAppLock,
  type AppLockStorage,
} from '../core/appLock';
import { AppLockCard, AppLockGate, useAppLock } from '../components/lock';
import { Header } from '../components/layout/Header';
import { I18nProvider } from '../i18n';
import { SettingsView } from '../views/SettingsView';
import enUS from '../i18n/en-US.json';
import { seedCleanSlate } from '../db/seed';
import { db as appDb } from '../db';

/** Low work factor so the suite stays fast; production uses APP_LOCK_DEFAULT_ITERATIONS. */
const FAST = 1_000;
const lockEn = enUS.lock;
const settingsEn = enUS.settings;

function memoryStorage(): AppLockStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const withI18n = (children: React.ReactNode) => (
  <I18nProvider initialLanguage="en-US">{children}</I18nProvider>
);

/** A child that shows "secret" and exposes the lock context through buttons. */
const SecretContent: React.FC = () => {
  const { isEnabled, lockNow } = useAppLock();
  return (
    <div>
      <p data-testid="secret">secret balance</p>
      <p data-testid="lock-enabled">{String(isEnabled)}</p>
      <button type="button" onClick={lockNow}>
        lock-from-child
      </button>
    </div>
  );
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Password record
// ---------------------------------------------------------------------------

describe('appLock core: password record', () => {
  it('stores only a salted PBKDF2-SHA-256 hash, never the password', async () => {
    const record = await createAppLockRecord('frog-1234', FAST);
    expect(record).toMatchObject({ version: 1, algorithm: 'PBKDF2-SHA-256', iterations: FAST });
    expect(atob(record.salt)).toHaveLength(16);
    expect(atob(record.hash)).toHaveLength(32);
    expect(JSON.stringify(record)).not.toContain('frog-1234');
  });

  it('accepts the right password and rejects any other', async () => {
    const record = await createAppLockRecord('frog-1234', FAST);
    expect(await verifyAppLockPassword(record, 'frog-1234')).toBe(true);
    expect(await verifyAppLockPassword(record, 'frog-1235')).toBe(false);
    expect(await verifyAppLockPassword(record, '')).toBe(false);
    expect(await verifyAppLockPassword(record, 'FROG-1234')).toBe(false);
  });

  it('uses a new random salt every time, so equal passwords give different hashes', async () => {
    const a = await createAppLockRecord('same-pass', FAST);
    const b = await createAppLockRecord('same-pass', FAST);
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('treats composed and decomposed accents as the same password', async () => {
    const record = await createAppLockRecord('maçã', FAST);
    expect(await verifyAppLockPassword(record, 'maçã')).toBe(true);
  });

  it(`requires at least ${APP_LOCK_MIN_LENGTH} characters`, () => {
    expect(isValidAppLockPassword('abc')).toBe(false);
    expect(isValidAppLockPassword('abcd')).toBe(true);
  });

  it('fails clearly when the browser has no Web Crypto (plain-HTTP pages)', async () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a });
    await expect(createAppLockRecord('frog-1234', FAST)).rejects.toThrow('APP_LOCK_CRYPTO_UNAVAILABLE');
  });
});

describe('appLock core: storage', () => {
  it('writes, reads and clears the record under its own key', async () => {
    const storage = memoryStorage();
    expect(readAppLock(storage)).toBeNull();
    const record = await createAppLockRecord('frog-1234', FAST);
    writeAppLock(record, storage);
    expect(storage.data.has(APP_LOCK_STORAGE_KEY)).toBe(true);
    expect(readAppLock(storage)).toEqual(record);
    clearAppLock(storage);
    expect(readAppLock(storage)).toBeNull();
  });

  it('ignores a corrupt or foreign value instead of locking the user out', () => {
    const storage = memoryStorage();
    storage.setItem(APP_LOCK_STORAGE_KEY, '{not json');
    expect(readAppLock(storage)).toBeNull();
    storage.setItem(APP_LOCK_STORAGE_KEY, JSON.stringify({ version: 2, hash: 'x' }));
    expect(readAppLock(storage)).toBeNull();
  });

  it('uses localStorage by default', async () => {
    writeAppLock(await createAppLockRecord('frog-1234', FAST));
    expect(localStorage.getItem(APP_LOCK_STORAGE_KEY)).not.toBeNull();
    expect(readAppLock()).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Gate and lock screen
// ---------------------------------------------------------------------------

describe('AppLockGate and LockScreen', () => {
  it('shows the app right away when no password is set', () => {
    render(withI18n(<AppLockGate><SecretContent /></AppLockGate>));
    expect(screen.getByTestId('secret')).toBeInTheDocument();
    expect(screen.getByTestId('lock-enabled')).toHaveTextContent('false');
    expect(screen.queryByTestId('lock-screen')).not.toBeInTheDocument();
  });

  it('hides the app behind the lock screen until the right password is typed', async () => {
    writeAppLock(await createAppLockRecord('frog-1234', FAST));
    render(withI18n(<AppLockGate><SecretContent /></AppLockGate>));

    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
    expect(screen.getByText(lockEn.title)).toBeInTheDocument();
    expect(screen.queryByTestId('secret')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    expect(await screen.findByText(lockEn.wrong_password)).toBeInTheDocument();
    expect(screen.queryByTestId('secret')).not.toBeInTheDocument();
    expect(screen.getByTestId('lock-password-input')).toHaveValue('');

    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'frog-1234' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    expect(await screen.findByTestId('secret')).toBeInTheDocument();
    expect(screen.getByTestId('lock-enabled')).toHaveTextContent('true');
  });

  it('locks again when the app asks to lock now', async () => {
    writeAppLock(await createAppLockRecord('frog-1234', FAST));
    render(withI18n(<AppLockGate><SecretContent /></AppLockGate>));
    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'frog-1234' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    await screen.findByTestId('secret');

    fireEvent.click(screen.getByText('lock-from-child'));
    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('secret')).not.toBeInTheDocument();
  });

  it('locks by itself after the idle time without activity', async () => {
    writeAppLock(await createAppLockRecord('frog-1234', FAST));
    render(withI18n(<AppLockGate idleMs={60}><SecretContent /></AppLockGate>));
    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'frog-1234' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    await screen.findByTestId('secret');

    expect(await screen.findByTestId('lock-screen', {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByTestId('secret')).not.toBeInTheDocument();
  });

  it('never auto-locks when no password is set', async () => {
    render(withI18n(<AppLockGate idleMs={20}><SecretContent /></AppLockGate>));
    await new Promise((r) => setTimeout(r, 120));
    expect(screen.getByTestId('secret')).toBeInTheDocument();
  });

  it('offers to erase everything when the password is forgotten', async () => {
    writeAppLock(await createAppLockRecord('frog-1234', FAST));
    const onEraseAll = vi.fn().mockResolvedValue(undefined);
    render(withI18n(<AppLockGate onEraseAll={onEraseAll}><SecretContent /></AppLockGate>));

    fireEvent.click(screen.getByTestId('lock-forgot-link'));
    expect(screen.getByTestId('lock-forgot-panel')).toBeInTheDocument();
    expect(screen.getByText(lockEn.forgot_desc)).toBeInTheDocument();

    // Cancel goes back to the password form without erasing anything.
    fireEvent.click(screen.getByRole('button', { name: enUS.common.cancel }));
    expect(screen.getByTestId('lock-password-input')).toBeInTheDocument();
    expect(onEraseAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('lock-forgot-link'));
    fireEvent.click(screen.getByTestId('lock-erase-button'));
    await waitFor(() => expect(onEraseAll).toHaveBeenCalledTimes(1));
  });

  it('shows an error when erasing fails', async () => {
    writeAppLock(await createAppLockRecord('frog-1234', FAST));
    const onEraseAll = vi.fn().mockRejectedValue(new Error('blocked'));
    render(withI18n(<AppLockGate onEraseAll={onEraseAll}><SecretContent /></AppLockGate>));
    fireEvent.click(screen.getByTestId('lock-forgot-link'));
    fireEvent.click(screen.getByTestId('lock-erase-button'));
    expect(await screen.findByText(lockEn.erase_error)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Settings card
// ---------------------------------------------------------------------------

describe('AppLockCard (Settings)', () => {
  const renderCard = () =>
    render(withI18n(
      <AppLockGate>
        <AppLockCard iterations={FAST} />
        <SecretContent />
      </AppLockGate>
    ));

  const typeNewPassword = (next: string, confirm = next) => {
    fireEvent.change(screen.getByTestId('lock-new-input'), { target: { value: next } });
    fireEvent.change(screen.getByTestId('lock-confirm-input'), { target: { value: confirm } });
  };

  it('turns the lock on only with a long enough, repeated password', async () => {
    renderCard();
    expect(screen.getByText(settingsEn.lock_status_off)).toBeInTheDocument();

    typeNewPassword('abc');
    fireEvent.click(screen.getByTestId('lock-enable-button'));
    expect(screen.getByTestId('lock-error')).toHaveTextContent(`Use at least ${APP_LOCK_MIN_LENGTH} characters.`);

    typeNewPassword('frog-1234', 'frog-9999');
    fireEvent.click(screen.getByTestId('lock-enable-button'));
    expect(screen.getByTestId('lock-error')).toHaveTextContent(settingsEn.lock_err_mismatch);
    expect(readAppLock()).toBeNull();

    typeNewPassword('frog-1234');
    fireEvent.click(screen.getByTestId('lock-enable-button'));
    expect(await screen.findByTestId('lock-message')).toHaveTextContent(settingsEn.lock_enabled_msg);
    expect(screen.getByText(settingsEn.lock_status_on)).toBeInTheDocument();
    expect(screen.getByTestId('lock-enabled')).toHaveTextContent('true');

    const record = readAppLock();
    expect(record).not.toBeNull();
    expect(await verifyAppLockPassword(record!, 'frog-1234')).toBe(true);
  });

  it('changes the password only after the current one is confirmed', async () => {
    writeAppLock(await createAppLockRecord('old-pass', FAST));
    renderCard();
    // The gate starts locked; unlock first.
    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'old-pass' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    await screen.findByTestId('settings-lock-card');

    fireEvent.click(screen.getByTestId('lock-change-button'));
    fireEvent.change(screen.getByTestId('lock-current-input'), { target: { value: 'not-it' } });
    typeNewPassword('new-pass');
    fireEvent.click(screen.getByTestId('lock-save-button'));
    expect(await screen.findByTestId('lock-error')).toHaveTextContent(settingsEn.lock_err_wrong);
    expect(await verifyAppLockPassword(readAppLock()!, 'old-pass')).toBe(true);

    fireEvent.change(screen.getByTestId('lock-current-input'), { target: { value: 'old-pass' } });
    fireEvent.click(screen.getByTestId('lock-save-button'));
    expect(await screen.findByTestId('lock-message')).toHaveTextContent(settingsEn.lock_changed_msg);
    const record = readAppLock()!;
    expect(await verifyAppLockPassword(record, 'new-pass')).toBe(true);
    expect(await verifyAppLockPassword(record, 'old-pass')).toBe(false);
  });

  it('turns the lock off with the current password', async () => {
    writeAppLock(await createAppLockRecord('old-pass', FAST));
    renderCard();
    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'old-pass' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    await screen.findByTestId('settings-lock-card');

    fireEvent.click(screen.getByTestId('lock-disable-button'));
    fireEvent.change(screen.getByTestId('lock-current-input'), { target: { value: 'old-pass' } });
    fireEvent.click(screen.getByTestId('lock-disable-confirm-button'));
    expect(await screen.findByTestId('lock-message')).toHaveTextContent(settingsEn.lock_disabled_msg);
    expect(readAppLock()).toBeNull();
    expect(screen.getByText(settingsEn.lock_status_off)).toBeInTheDocument();
    expect(screen.getByTestId('lock-enabled')).toHaveTextContent('false');
  });

  it('locks the app from the "Lock now" button', async () => {
    writeAppLock(await createAppLockRecord('old-pass', FAST));
    renderCard();
    fireEvent.change(screen.getByTestId('lock-password-input'), { target: { value: 'old-pass' } });
    fireEvent.click(screen.getByTestId('lock-unlock-button'));
    await screen.findByTestId('settings-lock-card');

    fireEvent.click(screen.getByTestId('lock-now-button'));
    expect(screen.getByTestId('lock-screen')).toBeInTheDocument();
  });

  it('is part of the Settings view', async () => {
    await seedCleanSlate(appDb, 'en-US', 'USD', 'Keroo');
    render(withI18n(<SettingsView currency="USD" />));
    expect(await screen.findByTestId('settings-lock-card')).toBeInTheDocument();
    expect(screen.getByText(settingsEn.lock_title)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Header button
// ---------------------------------------------------------------------------

describe('Header lock button', () => {
  it('shows only when the app lock is on, and locks on click', () => {
    const { rerender } = render(withI18n(<Header title="Dashboard" />));
    expect(screen.queryByTestId('header-lock-button')).not.toBeInTheDocument();

    const onLock = vi.fn();
    rerender(withI18n(<Header title="Dashboard" onLock={onLock} />));
    const button = screen.getByTestId('header-lock-button');
    expect(button).toHaveAttribute('aria-label', lockEn.button_title);
    fireEvent.click(button);
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});
