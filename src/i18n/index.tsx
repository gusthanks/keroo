import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { SupportedLocale } from '../types';
import ptBR from './pt-BR.json';
import enUS from './en-US.json';
import { db } from '../db';

export type TranslationKey = string;

export interface I18nContextValue {
  language: SupportedLocale;
  setLanguage: (lang: SupportedLocale) => void;
  t: (keyPath: string, params?: Record<string, string | number>) => string;
}

const dictionaries: Record<SupportedLocale, Record<string, any>> = {
  'pt-BR': ptBR,
  'en-US': enUS,
};

/** App-wide default locale (English-first; pt-BR is selected by preference or browser detection). */
export const DEFAULT_LOCALE: SupportedLocale = 'en-US';

/** localStorage key holding the user's explicit language choice. */
export const LANGUAGE_STORAGE_KEY = 'keroo_language';

const isSupportedLocale = (value: unknown): value is SupportedLocale =>
  value === 'en-US' || value === 'pt-BR';

function readStoredLocale(): SupportedLocale | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

function detectBrowserLocale(): SupportedLocale | null {
  try {
    if (typeof navigator === 'undefined') return null;
    return navigator.language?.toLowerCase().startsWith('pt') ? 'pt-BR' : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the language the app starts in, in priority order:
 * 1. the saved choice in localStorage (`keroo_language`), when it is a supported locale;
 * 2. an explicit `preferred` locale (e.g. the provider's `initialLanguage` prop);
 * 3. the browser language: any `pt*` tag selects pt-BR;
 * 4. en-US.
 * Every browser global is guarded, so this is safe under SSR and jsdom.
 */
export function resolveInitialLocale(preferred?: SupportedLocale): SupportedLocale {
  const stored = readStoredLocale();
  if (stored) return stored;
  if (isSupportedLocale(preferred)) return preferred;
  return detectBrowserLocale() ?? DEFAULT_LOCALE;
}

/** Best-effort mirror of the language choice into the Dexie `user_settings` singleton. */
function persistLanguageToDb(language: SupportedLocale): void {
  try {
    db.user_settings
      .update('global', { language, updatedAt: new Date().toISOString() })
      .catch(() => {});
  } catch {
    // IndexedDB unavailable (SSR / private mode): localStorage remains the source of truth.
  }
}

/**
 * Pure (context-free) translator for a given locale.
 *
 * Used by the provider's `t()` and by standalone components that receive an explicit
 * `locale` prop instead of reading the React context (SpeechBubble, RoamingCompanion).
 * Falls back to en-US when the key is missing in the requested locale, and to the key path
 * itself when it is missing everywhere. Supports `{name}` placeholders via `params`.
 */
export function translate(
  language: SupportedLocale,
  keyPath: string,
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[language] || dictionaries[DEFAULT_LOCALE];
  const parts = keyPath.split('.');
  let current: any = dict;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Fallback to the default locale (en-US) if key is missing in active locale
      let fallback: any = dictionaries[DEFAULT_LOCALE];
      for (const fbPart of parts) {
        if (fallback && typeof fallback === 'object' && fbPart in fallback) {
          fallback = fallback[fbPart];
        } else {
          fallback = undefined;
          break;
        }
      }
      current = fallback !== undefined ? fallback : keyPath;
      break;
    }
  }

  if (typeof current !== 'string') {
    return keyPath;
  }

  if (params) {
    return Object.entries(params).reduce(
      (str, [paramKey, paramValue]) => str.split(`{${paramKey}}`).join(String(paramValue)),
      current as string
    );
  }

  return current;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export interface I18nProviderProps {
  children: React.ReactNode;
  /**
   * Explicit starting locale. A saved choice in localStorage still wins; when omitted, the
   * browser language is detected (pt* -> pt-BR) and en-US is used otherwise.
   */
  initialLanguage?: SupportedLocale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, initialLanguage }) => {
  const [language, setLanguageState] = useState<SupportedLocale>(() =>
    resolveInitialLocale(initialLanguage)
  );

  const setLanguage = (newLang: SupportedLocale) => {
    setLanguageState(newLang);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
      }
    } catch {
      // Storage blocked: the in-memory state still switches the UI language.
    }
    persistLanguageToDb(newLang);
  };

  const t = useMemo(
    () =>
      (keyPath: string, params?: Record<string, string | number>): string =>
        translate(language, keyPath, params),
    [language]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    document.title = [t('app.title'), t('app.subtitle')].join(' — ');
  }, [language, t]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
    }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useTranslation(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

const FALLBACK_CONTEXT: I18nContextValue = {
  language: DEFAULT_LOCALE,
  setLanguage: () => {},
  t: (keyPath, params) => translate(DEFAULT_LOCALE, keyPath, params),
};

/**
 * Like `useTranslation`, but never throws: outside an I18nProvider it falls back to the
 * en-US default. Meant for leaf UI primitives (e.g. Modal) that can be rendered standalone.
 */
export function useOptionalTranslation(): I18nContextValue {
  return useContext(I18nContext) ?? FALLBACK_CONTEXT;
}
