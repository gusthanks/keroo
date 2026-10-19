import type { SupportedTheme } from '../../types';

/** localStorage key holding the last theme, so screens shown before the database opens match it. */
export const THEME_STORAGE_KEY = 'keroo_theme';

/** The last theme saved in this browser (`light` when none was saved yet). */
export function readStoredTheme(): SupportedTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'system' ? saved : 'light';
  } catch {
    return 'light';
  }
}

/** Applies a theme to <html>: the `dark` class switches every color token. */
export function applyThemeClass(theme: SupportedTheme): void {
  const root = document.documentElement;
  const prefersDark =
    theme === 'system' && typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false;
  root.classList.toggle('dark', theme === 'dark' || prefersDark);
}
