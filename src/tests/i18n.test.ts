import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderHook } from '@testing-library/react';
import ptBR from '../i18n/pt-BR.json';
import enUS from '../i18n/en-US.json';
import { I18nProvider, translate, useOptionalTranslation, useTranslation } from '../i18n';

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

  it('falls back to pt-BR for an unsupported language code', () => {
    expect(translate('xx-XX' as never, 'common.cancel')).toBe('Cancelar');
  });

  it('useOptionalTranslation works without a provider and defaults to pt-BR', () => {
    const { result } = renderHook(() => useOptionalTranslation());
    expect(result.current.language).toBe('pt-BR');
    expect(result.current.t('common.close')).toBe('Fechar');
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
  ...readdirSync(resolve(PROJECT_ROOT, 'src/components/common'))
    .filter((name) => name.endsWith('.tsx'))
    .sort()
    .map((name) => `src/components/common/${name}`),
];

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

describe('Hardcoded-string guard (every UI string must come from the dictionaries)', () => {
  it('scans the expected set of UI files', () => {
    expect(UI_SOURCE_FILES.length).toBeGreaterThanOrEqual(22);
    for (const file of UI_SOURCE_FILES) {
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
  });

  for (const file of UI_SOURCE_FILES) {
    it(`${file} has no hardcoded Portuguese JSX text or placeholder/title/aria-label`, () => {
      expect(findHardcodedPortuguese(readSource(file))).toEqual([]);
    });
  }

  it('has no leftover i18n-todo markers in the UI sources', () => {
    const withMarker = UI_SOURCE_FILES.filter((file) => readSource(file).includes('i18n-todo'));
    expect(withMarker).toEqual([]);
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
