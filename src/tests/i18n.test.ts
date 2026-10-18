/// <reference types="node" />
import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, renderHook, waitFor } from '@testing-library/react';
import ptBR from '../i18n/pt-BR.json';
import enUS from '../i18n/en-US.json';
import {
  I18nProvider,
  resolveInitialLocale,
  translate,
  useOptionalTranslation,
  useTranslation,
} from '../i18n';
import { db, KEROO_DB_SCHEMA_V1 } from '../db';
import { BACKUP_ERROR_CODES } from '../core/backup';
import type { ImportWarningCode } from '../core/importParser';
import type { KerooPose } from '../core/kerooMood';

function getAllKeys(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(getAllKeys(value, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys.sort();
}

function lookup(dict: Record<string, any>, keyPath: string): unknown {
  return keyPath
    .split('.')
    .reduce<any>((cur, part) => (cur && typeof cur === 'object' ? cur[part] : undefined), dict);
}

/** Every import warning code; `satisfies` makes tsc fail when the parser gains a new code. */
const IMPORT_WARNING_CODES = {
  INVALID_DATE: true,
  INVALID_AMOUNT: true,
  MISSING_PAYEE: true,
  UNRECOGNIZED_DELIMITER: true,
  UNKNOWN_HEADER: true,
  INCOMPLETE_ROW: true,
  SKIPPED_PREAMBLE_ROW: true,
  ZERO_AMOUNT: true,
  UNPARSED_TAGS: true,
  AMBIGUOUS_DATE_FORMAT: true,
  AMBIGUOUS_AMOUNT: true,
} satisfies Record<ImportWarningCode, true>;

/** Every mascot pose; `satisfies` makes tsc fail when a pose is added without an aria label. */
const KEROO_POSES = {
  default_sitting: true,
  waterfall_tears: true,
  melted_blob: true,
  toast_face: true,
  peace_dab: true,
  sipping_drink: true,
  sleeping_bubble: true,
  cheeky_tongue: true,
  coin_swallowing: true,
  curious_head_tilt: true,
} satisfies Record<KerooPose, true>;

describe('Bilingual i18n Key Parity (pt-BR and en-US)', () => {
  const ptKeys = getAllKeys(ptBR);
  const enKeys = getAllKeys(enUS);

  it('guarantees 100% key parity with zero missing keys in en-US', () => {
    const missingInEn = ptKeys.filter((key) => !enKeys.includes(key));
    expect(missingInEn).toEqual([]);
  });

  it('guarantees 100% key parity with zero missing keys in pt-BR', () => {
    const missingInPt = enKeys.filter((key) => !ptKeys.includes(key));
    expect(missingInPt).toEqual([]);
  });

  it('verifies non-empty string values for all keys across both dictionaries', () => {
    for (const key of ptKeys) {
      const parts = key.split('.');
      let ptVal: any = ptBR;
      let enVal: any = enUS;

      for (const p of parts) {
        ptVal = ptVal[p];
        enVal = enVal[p];
      }

      expect(typeof ptVal).toBe('string');
      expect(ptVal.trim().length).toBeGreaterThan(0);

      expect(typeof enVal).toBe('string');
      expect(enVal.trim().length).toBeGreaterThan(0);
    }
  });

  it('uses the same {placeholders} in both languages for every key', () => {
    const tokens = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const mismatches = getAllKeys(ptBR).filter((key) => {
      const pt = lookup(ptBR, key) as string;
      const en = lookup(enUS, key) as string;
      return JSON.stringify(tokens(pt)) !== JSON.stringify(tokens(en));
    });
    expect(mismatches).toEqual([]);
  });
});

describe('translate() and the i18n hooks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns the text of the requested language', () => {
    expect(translate('pt-BR', 'common.save')).toBe('Salvar');
    expect(translate('en-US', 'common.save')).toBe('Save');
  });

  it('replaces {name} placeholders (including repeated and non-string values)', () => {
    expect(translate('en-US', 'split.balance_with', { name: 'Camila' })).toBe('Balance with Camila');
    expect(translate('pt-BR', 'split.balance_with', { name: 'Camila' })).toBe('Balanço com Camila');
    expect(translate('en-US', 'accounts.accounts_count', { count: 3 })).toBe('3 accounts registered');
  });

  it('inserts replacement values literally (no regex "$&" expansion)', () => {
    expect(translate('en-US', 'split.balance_with', { name: '$& $1' })).toBe('Balance with $& $1');
  });

  it('leaves unknown placeholders untouched and returns the key path for unknown keys', () => {
    expect(translate('en-US', 'split.balance_with')).toBe('Balance with {name}');
    expect(translate('en-US', 'does.not.exist')).toBe('does.not.exist');
    expect(translate('en-US', 'split')).toBe('split'); // a namespace is not a string
  });

  it('falls back to en-US for an unsupported language code', () => {
    expect(translate('xx-XX' as never, 'common.cancel')).toBe('Cancel');
  });

  it('useOptionalTranslation works without a provider and defaults to en-US', () => {
    const { result } = renderHook(() => useOptionalTranslation());
    expect(result.current.language).toBe('en-US');
    expect(result.current.t('common.close')).toBe('Close');
  });

  it('I18nProvider defaults to en-US (jsdom navigator.language) and sets <html lang> and the title', () => {
    expect(navigator.language).toBe('en-US');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(I18nProvider, { children });
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.language).toBe('en-US');
    expect(result.current.t('common.save')).toBe('Save');
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.title).toBe(`${enUS.app.title} — ${enUS.app.subtitle}`);
  });

  it('I18nProvider starts in pt-BR when localStorage keroo_language is "pt-BR"', () => {
    localStorage.setItem('keroo_language', 'pt-BR');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(I18nProvider, { children });
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.language).toBe('pt-BR');
    expect(result.current.t('common.save')).toBe('Salvar');
    expect(document.documentElement.lang).toBe('pt-BR');
    expect(document.title).toBe(`${ptBR.app.title} — ${ptBR.app.subtitle}`);
  });

  it('ignores an unsupported value saved in localStorage', () => {
    localStorage.setItem('keroo_language', 'fr-FR');
    expect(resolveInitialLocale()).toBe('en-US');
    expect(resolveInitialLocale('pt-BR')).toBe('pt-BR');
  });

  it('I18nProvider starts in pt-BR when the browser language is Portuguese', () => {
    const own = Object.getOwnPropertyDescriptor(window.navigator, 'language');
    Object.defineProperty(window.navigator, 'language', { value: 'pt-BR', configurable: true });
    try {
      expect(resolveInitialLocale()).toBe('pt-BR');
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(I18nProvider, { children });
      const { result } = renderHook(() => useTranslation(), { wrapper });
      expect(result.current.language).toBe('pt-BR');
      expect(result.current.t('common.close')).toBe('Fechar');
    } finally {
      if (own) {
        Object.defineProperty(window.navigator, 'language', own);
      } else {
        delete (window.navigator as { language?: string }).language;
      }
    }
    expect(navigator.language).toBe('en-US');
  });

  it('a saved localStorage choice beats both initialLanguage and the browser language', () => {
    localStorage.setItem('keroo_language', 'en-US');
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(I18nProvider, { initialLanguage: 'pt-BR', children });
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.language).toBe('en-US');
  });

  it('setLanguage persists the choice to localStorage and to the Dexie user_settings row', async () => {
    const now = new Date().toISOString();
    await db.user_settings.put({
      id: 'global',
      language: 'en-US',
      currency: 'USD',
      theme: 'system',
      onboardingCompleted: true,
      petNickname: 'Keroo',
      roamingPetEnabled: true,
      rolloverModeDefault: 'rollover_negative',
      createdAt: now,
      updatedAt: now,
    });
    try {
      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(I18nProvider, { children });
      const { result } = renderHook(() => useTranslation(), { wrapper });
      expect(result.current.language).toBe('en-US');

      act(() => result.current.setLanguage('pt-BR'));

      expect(result.current.language).toBe('pt-BR');
      expect(localStorage.getItem('keroo_language')).toBe('pt-BR');
      await waitFor(async () => {
        expect((await db.user_settings.get('global'))?.language).toBe('pt-BR');
      });
    } finally {
      await db.user_settings.clear();
    }
  });

  it('I18nProvider exposes t() bound to the active language with interpolation', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(I18nProvider, { initialLanguage: 'en-US', children });
    const { result } = renderHook(() => useTranslation(), { wrapper });
    expect(result.current.language).toBe('en-US');
    expect(result.current.t('quick_add.title')).toBe('Quick New Transaction');
    expect(result.current.t('onboarding.pet_promise', { name: 'Froggo' })).toContain('"Froggo"');
  });
});

// ---------------------------------------------------------------------------
// Hardcoded-string guard
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(__dirname, '..', '..');

/** Every UI source file that must take its text from the dictionaries. */
const UI_SOURCE_FILES: string[] = [
  'src/views/AccountsView.tsx',
  'src/views/CreditCardsView.tsx',
  'src/views/SubscriptionsView.tsx',
  'src/views/DashboardView.tsx',
  'src/views/PiggyBanksView.tsx',
  'src/views/SplitView.tsx',
  'src/views/SettingsView.tsx',
  'src/App.tsx',
  'src/components/onboarding/OnboardingWizard.tsx',
  'src/components/command/CommandPalette.tsx',
  'src/components/layout/Header.tsx',
  'src/components/layout/Sidebar.tsx',
  'src/components/layout/BottomNav.tsx',
  'src/components/layout/AppLayout.tsx',
  'src/components/keroo/SpeechBubble.tsx',
  'src/components/keroo/RoamingCompanion.tsx',
  'src/components/keroo/KerooMascot.tsx',
  ...readdirSync(resolve(PROJECT_ROOT, 'src/components/common'))
    .filter((name) => name.endsWith('.tsx'))
    .sort()
    .map((name) => `src/components/common/${name}`),
];

/**
 * Locale-free engine modules: they produce data (codes, params, cents), never user-facing
 * Portuguese text. kerooInsights.ts / kerooMood.ts carry bilingual pet copy by design and
 * autoRules.ts matches Portuguese bank-statement keywords, so they are not listed.
 */
const LOCALE_FREE_CORE_FILES: string[] = [
  'src/core/accountForms.ts',
  'src/core/backup.ts',
  'src/core/currency.ts',
  'src/core/dates.ts',
  'src/core/envelopes.ts',
  'src/core/importParser.ts',
  'src/core/installments.ts',
  'src/core/split.ts',
  'src/core/subscriptions.ts',
];

/**
 * Everything the hardcoded-Portuguese guard scans: UI files get the JSX text/attribute scan,
 * engine modules (plain .ts, where `<`/`>` are code) get the string-literal scan instead.
 */
const GUARDED_SOURCE_FILES: string[] = [...UI_SOURCE_FILES, ...LOCALE_FREE_CORE_FILES];

const readSource = (file: string) => readFileSync(resolve(PROJECT_ROOT, file), 'utf8');

/** Portuguese accented letters (Latin-1 letters only, no multiplication/division signs). */
const ACCENTED = /[À-ÖØ-öø-ÿ]/;
/** Common Portuguese UI words that must never appear as bare literals. */
const PT_UI_WORDS =
  /\b(?:Salvar|Cancelar|Fechar|Novo|Nova|Adicionar|Excluir|Conta|Valor|Categoria|Carregando)\b/;

const isSuspicious = (text: string) => ACCENTED.test(text) || PT_UI_WORDS.test(text);

/** Drops block comments (incl. JSX `{/* ... *\/}`), whole-line `//` comments and trailing ` // ...`. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

/** Removes everything inside `t( ... )` / `translate( ... )` calls (balanced parentheses). */
function stripTranslationCalls(source: string): string {
  const callStart = /(?<![\w$.])(?:t|translate)\(/g;
  let out = '';
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = callStart.exec(source)) !== null) {
    let i = match.index + match[0].length;
    let depth = 1;
    while (i < source.length && depth > 0) {
      const c = source[i];
      if (c === '"' || c === "'" || c === '`') {
        i++;
        while (i < source.length && source[i] !== c) {
          if (source[i] === '\\') i++;
          i++;
        }
      } else if (c === '(') {
        depth++;
      } else if (c === ')') {
        depth--;
      }
      i++;
    }
    out += source.slice(last, match.index);
    last = i;
    callStart.lastIndex = i;
  }
  return out + source.slice(last);
}

/** Blanks `<`/`>` that belong to code (arrows, comparisons, TS generics) so only JSX tags remain. */
function neutraliseCodeAngles(source: string): string {
  let s = source.replace(/=>|>=|<=/g, ' ');
  // Comparison operators are surrounded by spaces on the same line; a multi-line tag's closing
  // `>` is followed by a line break, so it is kept.
  s = s.replace(/(?<=[ \t])[<>](?=[ \t])/g, ' ');
  // TypeScript generics are glued to an identifier: `useState<string>`, `React.FC<Props>`.
  // A closing JSX tag (`</b>`) starts with `</`, so it is excluded.
  const generic = /(?<=[\w$\])])<(?!\/)[^<>]*>/g;
  for (;;) {
    const next = s.replace(generic, ' ');
    if (next === s) break;
    s = next;
  }
  return s;
}

const TEXT_ATTRIBUTE =
  /\b(?:placeholder|title|aria-label|label|subtitle|helperText|alt)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:'([^']*)'|"([^"]*)"|`([^`]*)`)\s*\})/g;

/**
 * Simple regex scan: returns every JSX text node and placeholder/title/aria-label-style attribute
 * value that contains a Portuguese accented letter or a common Portuguese UI word.
 * Comments and anything inside `t( ... )` are ignored.
 */
function findHardcodedPortuguese(source: string): string[] {
  const code = neutraliseCodeAngles(stripTranslationCalls(stripComments(source)));
  const offenders: string[] = [];

  for (const m of code.matchAll(/>([^<>]*)</g)) {
    let text = m[1];
    // `{expression}` containers are not literal text.
    for (;;) {
      const next = text.replace(/\{[^{}]*\}/g, ' ');
      if (next === text) break;
      text = next;
    }
    if (isSuspicious(text)) offenders.push(text.trim().replace(/\s+/g, ' '));
  }

  for (const m of code.matchAll(TEXT_ATTRIBUTE)) {
    const value = m.slice(1).find((g) => g !== undefined) ?? '';
    if (isSuspicious(value)) offenders.push(value);
  }

  return offenders;
}

/**
 * For non-JSX engine modules: every quoted / template string literal (outside comments) that
 * contains a Portuguese accented letter or a common Portuguese UI word. Literals holding regex
 * metacharacters (e.g. the '(D[EÉ]BITO|DEBIT)' token source) are matching patterns, not text.
 */
function findPortugueseStringLiterals(source: string): string[] {
  const code = stripComments(source);
  const offenders: string[] = [];
  const literal = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  for (const m of code.matchAll(literal)) {
    const text = (m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, ' ');
    if (/[[\]|^\\]/.test(text)) continue;
    if (isSuspicious(text)) offenders.push(text);
  }
  return offenders;
}

/** Bare English UI words that must come from `common.*` keys instead of JSX literals. */
const BARE_ENGLISH_LABEL = /^(?:Save|Cancel|Close|Delete|Loading)(?:\.\.\.|…)?$/;

/** JSX text nodes that are exactly one of the bare English words above. */
function findBareEnglishLabels(source: string): string[] {
  const code = neutraliseCodeAngles(stripTranslationCalls(stripComments(source)));
  const offenders: string[] = [];
  for (const m of code.matchAll(/>([^<>]*)</g)) {
    let text = m[1];
    for (;;) {
      const next = text.replace(/\{[^{}]*\}/g, ' ');
      if (next === text) break;
      text = next;
    }
    const trimmed = text.trim().replace(/\s+/g, ' ');
    if (BARE_ENGLISH_LABEL.test(trimmed)) offenders.push(trimmed);
  }
  return offenders;
}

/** Every .tsx file under the given source folders (recursive, sorted, repo-relative). */
function listTsxFiles(...dirs: string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(resolve(PROJECT_ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith('.tsx')) out.push(rel);
    }
  };
  dirs.forEach(walk);
  return out.sort();
}

describe('Hardcoded-string guard (every UI string must come from the dictionaries)', () => {
  it('scans the expected set of UI files', () => {
    expect(UI_SOURCE_FILES.length).toBeGreaterThanOrEqual(22);
    expect(LOCALE_FREE_CORE_FILES).toContain('src/core/importParser.ts');
    for (const file of GUARDED_SOURCE_FILES) {
      expect(readSource(file).length).toBeGreaterThan(0);
    }
  });

  describe('scanner self-check', () => {
    it('flags literal Portuguese JSX text and attributes', () => {
      expect(findHardcodedPortuguese('<button>Salvar</button>')).toEqual(['Salvar']);
      expect(findHardcodedPortuguese('<p>\n  Nenhuma transação\n</p>')).toEqual(['Nenhuma transação']);
      expect(findHardcodedPortuguese('<Button>\n  Cancelar\n</Button>')).toEqual(['Cancelar']);
      expect(findHardcodedPortuguese('<input placeholder="Ex: Almoço" />')).toEqual(['Ex: Almoço']);
      expect(findHardcodedPortuguese("<b aria-label='Fechar menu' />")).toEqual(['Fechar menu']);
      expect(findHardcodedPortuguese('<Card title={`Conta ${n}`} />')).toEqual(['Conta ${n}']);
      expect(findHardcodedPortuguese('<span>Total: {x} Valor</span>')).toEqual(['Total: Valor']);
    });

    it('ignores translated text, comments, code and technical strings', () => {
      expect(findHardcodedPortuguese("<button>{t('common.save')}</button>")).toEqual([]);
      expect(findHardcodedPortuguese("<input placeholder={t('x.y', { name: 'Conta' })} />")).toEqual([]);
      expect(findHardcodedPortuguese('{/* Botão de salvar */}\n<div className="a" />')).toEqual([]);
      expect(findHardcodedPortuguese('// Salvar a conta\nconst a = 1;')).toEqual([]);
      expect(findHardcodedPortuguese('const a = 1; // Conta nova\n<i />')).toEqual([]);
      expect(findHardcodedPortuguese("const [v, setV] = useState<string>('Conta');\n<i />")).toEqual([]);
      expect(findHardcodedPortuguese("if (a > b) { note = 'Aporte (depósito)'; }\n<i />")).toEqual([]);
      expect(findHardcodedPortuguese('const f = (x: number) => x >= 1 ? "Conta" : "";\n<i />')).toEqual([]);
      expect(findHardcodedPortuguese('<span data-testid="valor-total">{value}</span>')).toEqual([]);
      expect(findHardcodedPortuguese('<span>Keroo</span>')).toEqual([]);
    });

    it('does not mistake "Contas"/"Novos" (different words) for the listed whole words', () => {
      expect(findHardcodedPortuguese('<span>Contabil Novos Valores</span>')).toEqual([]);
    });

    it('flags Portuguese string literals in engine code, but not comments or pattern sources', () => {
      expect(findPortugueseStringLiterals("const m = 'Data inválida';")).toEqual(['Data inválida']);
      expect(findPortugueseStringLiterals('payee = "Transação sem descrição";')).toEqual([
        'Transação sem descrição',
      ]);
      expect(findPortugueseStringLiterals('const n = `Parcela ${i} - Valor`;')).toEqual(['Parcela   - Valor']);
      expect(findPortugueseStringLiterals("const m = 'Invalid date'; // Data inválida")).toEqual([]);
      expect(findPortugueseStringLiterals("const DC = '(D[EÉ]BITO|DEBIT)';")).toEqual([]);
      expect(findPortugueseStringLiterals("const s = decimalHint ?? '—';")).toEqual([]);
    });

    it('flags bare English Save/Cancel/Close/Delete/Loading JSX text only', () => {
      expect(findBareEnglishLabels('<button>Save</button>')).toEqual(['Save']);
      expect(findBareEnglishLabels('<Button>\n  Cancel\n</Button>')).toEqual(['Cancel']);
      expect(findBareEnglishLabels('<span>Loading...</span>')).toEqual(['Loading...']);
      expect(findBareEnglishLabels("<button>{t('common.save')}</button>")).toEqual([]);
      expect(findBareEnglishLabels('<p>Save money every month</p>')).toEqual([]);
      expect(findBareEnglishLabels('{/* Close */}\n<i />')).toEqual([]);
    });
  });

  for (const file of UI_SOURCE_FILES) {
    it(`${file} has no hardcoded Portuguese JSX text or placeholder/title/aria-label`, () => {
      expect(findHardcodedPortuguese(readSource(file))).toEqual([]);
    });
  }

  for (const file of LOCALE_FREE_CORE_FILES) {
    it(`${file} has no Portuguese string literals (it must stay locale-free)`, () => {
      expect(findPortugueseStringLiterals(readSource(file))).toEqual([]);
    });
  }

  it('has no leftover i18n-todo markers in the guarded sources', () => {
    const withMarker = GUARDED_SOURCE_FILES.filter((file) => readSource(file).includes('i18n-todo'));
    expect(withMarker).toEqual([]);
  });

  it('no view or component hardcodes Save/Cancel/Close/Delete/Loading as JSX text', () => {
    const files = listTsxFiles('src/views', 'src/components');
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap((file) =>
      findBareEnglishLabels(readSource(file)).map((text) => `${file}: ${text}`)
    );
    expect(offenders).toEqual([]);
  });
});

describe('Translation keys used by the UI exist in both languages', () => {
  const STATIC_KEY =
    /(?<![\w$.])(?:t|translate)\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)?(['"])([\w.]+)\1|labelKey:\s*(['"])([\w.]+)\3/g;

  const usedKeys = new Set<string>();
  for (const file of UI_SOURCE_FILES) {
    for (const m of stripComments(readSource(file)).matchAll(STATIC_KEY)) {
      usedKeys.add(m[2] ?? m[4]);
    }
  }

  const family = (prefix: string, names: string[], separator = '.') =>
    names.map((name) => `${prefix}${separator}${name}`);

  // Keys built at runtime (`t(`prefix.${value}`)`) cannot be found statically, so list them.
  const dynamicKeys = [
    ...family('accounts.type', ['checking', 'savings', 'credit_card', 'investment', 'cash']),
    ...family('common.tx_type', ['expense', 'income', 'transfer', 'cc_installment', 'split_share']),
    ...family('settings.currency_names', ['BRL', 'USD', 'EUR']),
    ...family('subscriptions.status', ['paid_ok', 'upcoming_safe', 'due_soon', 'due_today', 'overdue']),
    ...family('subscriptions.cadence', [
      'weekly',
      'biweekly',
      'monthly',
      'bimonthly',
      'quarterly',
      'semi_annually',
      'annually',
    ]),
    ...family('pet', ['thriving', 'calm', 'alert', 'sweating', 'sleepy'].map((m) => `mood_${m}`)),
    // AccountsView: t(`accounts.import_warn.${warning.code}`) with a GENERIC fallback.
    ...family('accounts.import_warn', [...Object.keys(IMPORT_WARNING_CODES), 'GENERIC']),
    // KerooMascot: t(`pet.aria.${pose}`).
    ...family('pet.aria', Object.keys(KEROO_POSES)),
    // SettingsView: t(`settings.backup_err_${code}`) with a GENERIC fallback.
    ...family('settings.backup_err', [...BACKUP_ERROR_CODES, 'GENERIC'], '_'),
    // SettingsView restore modal: t(`settings.backup_tables.${table}`) for every Dexie table.
    ...family('settings.backup_tables', Object.keys(KEROO_DB_SCHEMA_V1)),
  ];

  it('finds a healthy number of static keys in the sources', () => {
    expect(usedKeys.size).toBeGreaterThan(200);
  });

  it('every statically referenced key resolves to a string in pt-BR and en-US', () => {
    const missing = [...usedKeys, ...dynamicKeys].filter(
      (key) => typeof lookup(ptBR, key) !== 'string' || typeof lookup(enUS, key) !== 'string'
    );
    expect(missing).toEqual([]);
  });
});
