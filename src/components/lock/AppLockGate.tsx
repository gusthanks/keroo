import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { db } from '../../db';
import {
  APP_LOCK_IDLE_MS,
  clearAppLock,
  readAppLock,
  type AppLockStorage,
} from '../../core/appLock';
import { LockScreen } from './LockScreen';

export interface AppLockContextValue {
  /** True when a password is set for this browser. */
  isEnabled: boolean;
  /** Shows the lock screen right away (no-op when no password is set). */
  lockNow: () => void;
  /** Re-reads the stored lock after Settings turns it on, off or changes the password. */
  refresh: () => void;
}

const AppLockContext = createContext<AppLockContextValue>({
  isEnabled: false,
  lockNow: () => {},
  refresh: () => {},
});

export const useAppLock = (): AppLockContextValue => useContext(AppLockContext);

/** Activity that keeps the app unlocked. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

/** Forgotten password: wipe every table and the lock, then start again at onboarding. */
async function eraseAllAndRestart(): Promise<void> {
  await db.delete();
  clearAppLock();
  window.location.reload();
}

export interface AppLockGateProps {
  children: React.ReactNode;
  /** Inactivity before the app locks itself. */
  idleMs?: number;
  /** Where the lock record lives (defaults to localStorage). */
  storage?: AppLockStorage | null;
  onEraseAll?: () => Promise<void>;
}

/**
 * Shows the lock screen instead of the app while a password is set and not yet typed.
 * The children are unmounted while locked, so no financial data stays on screen.
 */
export const AppLockGate: React.FC<AppLockGateProps> = ({
  children,
  idleMs = APP_LOCK_IDLE_MS,
  storage,
  onEraseAll = eraseAllAndRestart,
}) => {
  const [record, setRecord] = useState(() => readAppLock(storage));
  const [isLocked, setIsLocked] = useState(() => record !== null);
  const isEnabled = record !== null;

  const refresh = useCallback(() => setRecord(readAppLock(storage)), [storage]);
  const lockNow = useCallback(() => {
    const current = readAppLock(storage);
    setRecord(current);
    if (current) setIsLocked(true);
  }, [storage]);

  // Auto-lock after `idleMs` without activity, including time spent minimized.
  useEffect(() => {
    if (!isEnabled || isLocked) return;
    let lastActivity = Date.now();
    const markActivity = () => {
      lastActivity = Date.now();
    };
    const checkIdle = () => {
      if (Date.now() - lastActivity >= idleMs) setIsLocked(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, markActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    const timer = window.setInterval(checkIdle, Math.min(idleMs, 15_000));

    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, markActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [isEnabled, isLocked, idleMs]);

  const contextValue = useMemo(
    () => ({ isEnabled, lockNow, refresh }),
    [isEnabled, lockNow, refresh]
  );

  if (isLocked && record) {
    return <LockScreen record={record} onUnlock={() => setIsLocked(false)} onEraseAll={onEraseAll} />;
  }

  return <AppLockContext.Provider value={contextValue}>{children}</AppLockContext.Provider>;
};
