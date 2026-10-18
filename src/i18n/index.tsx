import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { SupportedLocale } from '../types';
import ptBR from './pt-BR.json';
import enUS from './en-US.json';

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

/**
 * Pure (context-free) translator for a given locale.
 *
 * Used by the provider's `t()` and by standalone components that receive an explicit
 * `locale` prop instead of reading the React context (SpeechBubble, RoamingCompanion).
 * Falls back to pt-BR when the key is missing in the requested locale, and to the key path
 * itself when it is missing everywhere. Supports `{name}` placeholders via `params`.
 */
export function translate(
  language: SupportedLocale,
  keyPath: string,
  params?: Record<string, string | number>
): string {
  const dict = dictionaries[language] || dictionaries['pt-BR'];
  const parts = keyPath.split('.');
  let current: any = dict;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      // Fallback to pt-BR if key is missing in active locale
      let fallback: any = dictionaries['pt-BR'];
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
  initialLanguage?: SupportedLocale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({
  children,
  initialLanguage = 'pt-BR',
}) => {
  const [language, setLanguageState] = useState<SupportedLocale>(() => {
    const saved = localStorage.getItem('keroo_language') as SupportedLocale;
    return saved === 'en-US' || saved === 'pt-BR' ? saved : initialLanguage;
  });

  const setLanguage = (newLang: SupportedLocale) => {
    setLanguageState(newLang);
    localStorage.setItem('keroo_language', newLang);
  };

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = useMemo(
    () =>
      (keyPath: string, params?: Record<string, string | number>): string =>
        translate(language, keyPath, params),
    [language]
  );

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
  language: 'pt-BR',
  setLanguage: () => {},
  t: (keyPath, params) => translate('pt-BR', keyPath, params),
};

/**
 * Like `useTranslation`, but never throws: outside an I18nProvider it falls back to the
 * pt-BR default. Meant for leaf UI primitives (e.g. Modal) that can be rendered standalone.
 */
export function useOptionalTranslation(): I18nContextValue {
  return useContext(I18nContext) ?? FALLBACK_CONTEXT;
}
