import { describe, it, expect } from 'vitest';
import {
  applyAutoRules,
  suggestRuleFromTransaction,
  cleanPayeeName,
  computeImportHash,
  computeImportHashSync,
  buildCanonicalTransactionString,
  filterDuplicateTransactions,
  computeDedupHashSync,
  normalizeText,
  evaluateCondition,
  evaluateRuleMatches,
  type AutoRule,
  type DraftTransaction,
} from '../core/autoRules';
import type { Transaction } from '../types';

describe('Auto-Categorization Rules & Deduplication Engine (src/core/autoRules.ts)', () => {
  describe('Text Normalization & Diacritic Stripping', () => {
    it('normalizes accents, diacritics, whitespace, and case', () => {
      expect(normalizeText('  Itaú Unibanco  ')).toBe('itau unibanco');
      expect(normalizeText('PÃO DE AÇÚCAR')).toBe('pao de acucar');
      expect(normalizeText('Café & Padaria')).toBe('cafe & padaria');
      expect(normalizeText('')).toBe('');
    });
  });

  describe('Condition Evaluation Engine', () => {
    const sampleTx: DraftTransaction = {
      date: '2026-10-16',
      amountCents: 4500,
      payee: 'Restaurante São José',
      notes: 'Almoço de sexta-feira',
    };

    it('evaluates CONTAINS operator with accent and case insensitivity', () => {
      expect(
        evaluateCondition(sampleTx, {
          field: 'payee',
          operator: 'CONTAINS',
          value: 'sao jose',
        })
      ).toBe(true);

      expect(
        evaluateCondition(sampleTx, {
          field: 'notes',
          operator: 'contains',
          value: 'ALMOCO',
        })
      ).toBe(true);
    });

    it('evaluates EQUALS operator for string and numeric fields', () => {
      expect(
        evaluateCondition(sampleTx, {
          field: 'payee',
          operator: 'EQUALS',
          value: 'restaurante sao jose',
        })
      ).toBe(true);

      expect(
        evaluateCondition(sampleTx, {
          field: 'amount',
          operator: 'EQUALS',
          value: 4500,
        })
      ).toBe(true);

      expect(
        evaluateCondition(sampleTx, {
          field: 'amount',
          operator: 'equals',
          value: 5000,
        })
      ).toBe(false);
    });

    it('evaluates GREATER_THAN and LESS_THAN operators', () => {
      expect(
        evaluateCondition(sampleTx, {
          field: 'amountCents',
          operator: 'GREATER_THAN',
          value: 4000,
        })
      ).toBe(true);

      expect(
        evaluateCondition(sampleTx, {
          field: 'amountCents',
          operator: 'LESS_THAN',
          value: 5000,
        })
      ).toBe(true);

      expect(
        evaluateCondition(sampleTx, {
          field: 'amountCents',
          operator: 'GREATER_THAN',
          value: 4500,
        })
      ).toBe(false);
    });

    it('evaluates STARTS_WITH and ENDS_WITH operators', () => {
      expect(
        evaluateCondition(sampleTx, {
          field: 'payee',
          operator: 'STARTS_WITH',
          value: 'restaurante',
        })
      ).toBe(true);

      expect(
        evaluateCondition(sampleTx, {
          field: 'payee',
          operator: 'ENDS_WITH',
          value: 'jose',
        })
      ).toBe(true);
    });

    it('evaluates REGEX operator safely', () => {
      expect(
        evaluateCondition(sampleTx, {
          field: 'payee',
          operator: 'REGEX',
          value: '^restaurante.*jose$',
        })
      ).toBe(true);

      // Malformed regex returns false instead of throwing
      expect(
        evaluateCondition(sampleTx, {
          field: 'payee',
          operator: 'REGEX',
          value: '[invalid',
        })
      ).toBe(false);
    });

    it('evaluates AND and OR multi-condition logic', () => {
      const ruleAnd: AutoRule = {
        id: 'r1',
        name: 'Restaurante caro',
        priority: 1,
        logic: 'AND',
        conditions: [
          { field: 'payee', operator: 'CONTAINS', value: 'sao jose' },
          { field: 'amount', operator: 'GREATER_THAN', value: 4000 },
        ],
        actions: [],
        isActive: true,
      };

      const ruleOr: AutoRule = {
        id: 'r2',
        name: 'Ou comida ou barato',
        priority: 1,
        logic: 'OR',
        conditions: [
          { field: 'payee', operator: 'CONTAINS', value: 'padaria' },
          { field: 'amount', operator: 'LESS_THAN', value: 5000 },
        ],
        actions: [],
        isActive: true,
      };

      expect(evaluateRuleMatches(sampleTx, ruleAnd)).toBe(true);
      expect(evaluateRuleMatches(sampleTx, ruleOr)).toBe(true);
    });
  });

  describe('Priority Evaluation Engine (applyAutoRules)', () => {
    const baseTx: DraftTransaction = {
      date: '2026-10-16',
      amountCents: 3500,
      payee: 'UBER *TRIP 1234',
      categoryId: null,
    };

    const rules: AutoRule[] = [
      {
        id: 'rule_p2',
        name: 'Generic Transport',
        priority: 2,
        logic: 'AND',
        conditions: [{ field: 'payee', operator: 'CONTAINS', value: 'uber' }],
        actions: [
          { field: 'categoryId', value: 'cat_transport_generic' },
          { field: 'tags', value: ['commute'] },
        ],
        isActive: true,
      },
      {
        id: 'rule_p1',
        name: 'Specific Uber Normalization',
        priority: 1, // Higher priority!
        logic: 'AND',
        conditions: [{ field: 'payee', operator: 'STARTS_WITH', value: 'uber' }],
        actions: [
          { field: 'payee', value: 'Uber' },
          { field: 'categoryId', value: 'cat_uber_rides' },
        ],
        isActive: true,
      },
      {
        id: 'rule_inactive',
        name: 'Inactive Rule',
        priority: 0,
        logic: 'AND',
        conditions: [{ field: 'payee', operator: 'CONTAINS', value: 'uber' }],
        actions: [{ field: 'payee', value: 'NEVER_APPLIED' }],
        isActive: false,
      },
    ];

    it('executes active rules in ascending priority order (1 executes first)', () => {
      // In first_match_stop mode, rule_p1 runs and stops
      const res = applyAutoRules(baseTx, rules, 'first_match_stop');
      expect(res.payee).toBe('Uber');
      expect(res.categoryId).toBe('cat_uber_rides');
      expect(res.appliedRules).toEqual(['rule_p1']);
      expect(res.tags).toEqual([]);
    });

    it('composes multiple rules in all_composed mode', () => {
      // In all_composed mode, rule_p1 runs (sets category and payee), then rule_p2 runs (overwrites category, appends tag)
      const res = applyAutoRules(baseTx, rules, 'all_composed');
      expect(res.payee).toBe('Uber');
      expect(res.categoryId).toBe('cat_transport_generic'); // Overwritten by rule_p2
      expect(res.tags).toContain('commute');
      expect(res.appliedRules).toEqual(['rule_p1', 'rule_p2']);
    });

    it('preserves existing category when preserveExistingCategory option is true', () => {
      const txWithCat: DraftTransaction = {
        ...baseTx,
        categoryId: 'cat_user_locked',
      };

      const res = applyAutoRules(txWithCat, rules, {
        preserveExistingCategory: true,
      });

      expect(res.categoryId).toBe('cat_user_locked'); // Preserved!
      expect(res.payee).toBe('Uber'); // Payee still normalized
    });

    it('ignores inactive rules completely', () => {
      const res = applyAutoRules(baseTx, rules, 'first_match_stop');
      expect(res.payee).not.toBe('NEVER_APPLIED');
      expect(res.appliedRules).not.toContain('rule_inactive');
    });
  });

  describe('Rule Suggestion Heuristic & Payee Cleaning', () => {
    it('cleans Brazilian bank statement prefixes, gateways, and terminal codes', () => {
      expect(cleanPayeeName('PAG*PadariaEstrela 01/03 SAO PAULO')).toBe('PadariaEstrela');
      expect(cleanPayeeName('COMPRA CARTAO - IFOOD *RESTAURANTE')).toBe('IFOOD RESTAURANTE');
      expect(cleanPayeeName('PIX TRANSF CAMILA 12345')).toBe('CAMILA');
      expect(cleanPayeeName('PAGTO*PostoShell SP')).toBe('PostoShell');
      expect(cleanPayeeName('UBER *TRIP 98214 HELP.UBER.COM')).toBe('UBER TRIP');
      expect(cleanPayeeName('')).toBe('');
    });

    it('strips TED/DOC/TBI only as whole tokens (regression)', () => {
      expect(cleanPayeeName('TED JOAO SILVA')).toBe('JOAO SILVA');
      expect(cleanPayeeName('DOC MARIA')).toBe('MARIA');
      expect(cleanPayeeName('DOCERIA DA ANA')).toBe('DOCERIA DA ANA');
      expect(cleanPayeeName('TEDESCO MATERIAIS')).toBe('TEDESCO MATERIAIS');
      expect(cleanPayeeName('TBIRA LANCHES')).toBe('TBIRA LANCHES');
    });

    it('keeps the merchant label when stripping domains (regression)', () => {
      expect(cleanPayeeName('AMAZON.COM.BR')).toBe('AMAZON');
      expect(cleanPayeeName('NETFLIX.COM')).toBe('NETFLIX');
      expect(cleanPayeeName('UBER *TRIP 98214 HELP.UBER.COM')).toBe('UBER TRIP');
    });

    it('suggested CONTAINS rule always matches the original payee (round-trip regression)', () => {
      const payees = [
        'PAG*MercadinhoDaVila 01/01',
        'COMPRA CARTAO - IFOOD *RESTAURANTE',
        'AMAZON.COM.BR',
        'UBER *TRIP 98214 HELP.UBER.COM',
        'PADARIA 123456 ESTRELA',
        'Açougue São João SP',
        'TED JOAO SILVA',
      ];
      for (const payee of payees) {
        const tx: DraftTransaction = { date: '2026-10-16', amountCents: 1000, payee, categoryId: 'cat_x' };
        const rule = suggestRuleFromTransaction(tx);
        expect(String(rule.conditions[0].value).trim().length).toBeGreaterThan(0);
        expect(evaluateCondition(tx, rule.conditions[0])).toBe(true);
      }
    });
  });

  describe('Condition evaluation edge cases', () => {
    const tx: DraftTransaction = { date: '2026-10-16', amountCents: 1000, payee: 'Padaria Estrela' };

    it('empty or whitespace condition values never match CONTAINS/STARTS_WITH/ENDS_WITH (regression)', () => {
      for (const operator of ['CONTAINS', 'STARTS_WITH', 'ENDS_WITH'] as const) {
        expect(evaluateCondition(tx, { field: 'payee', operator, value: '' })).toBe(false);
        expect(evaluateCondition(tx, { field: 'payee', operator, value: '   ' })).toBe(false);
        expect(evaluateCondition(tx, { field: 'payee', operator, value: '***' })).toBe(false);
      }
    });

    it('normalizes punctuation and accents identically on both sides', () => {
      expect(evaluateCondition({ ...tx, payee: 'PAG*Padaria-Estrela 01/01' }, { field: 'payee', operator: 'CONTAINS', value: 'padaria estrela' })).toBe(true);
      expect(evaluateCondition({ ...tx, payee: 'Açougue São João' }, { field: 'payee', operator: 'STARTS_WITH', value: 'ACOUGUE SAO' })).toBe(true);
    });

    it('generates DraftAutoRule from a transaction', () => {
      const tx: Transaction = {
        id: 'tx_1',
        accountId: 'acc_1',
        date: '2026-10-16',
        amountCents: 4500,
        type: 'expense',
        categoryId: 'cat_groceries',
        payee: 'PAG*MercadinhoDaVila 01/01',
        notes: '',
        status: 'cleared',
        createdAt: '2026-10-16T12:00:00Z',
        updatedAt: '2026-10-16T12:00:00Z',
      };

      const suggestion = suggestRuleFromTransaction(tx);

      expect(suggestion.name).toBe('Auto: MercadinhoDaVila');
      expect(suggestion.isActive).toBe(true);
      expect(suggestion.conditions).toHaveLength(1);
      expect(suggestion.conditions[0]).toEqual({
        field: 'payee',
        operator: 'CONTAINS',
        value: 'MercadinhoDaVila',
      });

      // Actions: category + payee normalization
      expect(suggestion.actions).toContainEqual({
        field: 'categoryId',
        value: 'cat_groceries',
      });
      expect(suggestion.actions).toContainEqual({
        field: 'payee',
        value: 'MercadinhoDaVila',
      });
    });
  });

  describe('Deterministic SHA-256 Deduplication Hashing', () => {
    it('builds canonical string representation accurately', () => {
      const canonical = buildCanonicalTransactionString(
        '2026-10-16T15:30:00Z',
        1250,
        '  UBER   *TRIP  ',
        'Sao Paulo'
      );
      expect(canonical).toBe('2026-10-16|1250|uber *trip|sao paulo');
    });

    it('produces identical 64-char lowercase hex digest between sync and async implementations', async () => {
      const date = '2026-10-16';
      const amount = 1050;
      const payee = 'Uber *Trip';
      const memo = 'Viagem';

      const syncHash = computeImportHashSync(date, amount, payee, memo);
      const asyncHash = await computeImportHash(date, amount, payee, memo);

      expect(syncHash).toHaveLength(64);
      expect(syncHash).toMatch(/^[0-9a-f]{64}$/);
      expect(syncHash).toBe(asyncHash);
    });

    it('generates consistent hashes for equivalent transactions across runs', () => {
      const hash1 = computeImportHashSync('2026-10-16', 5000, 'Padaria');
      const hash2 = computeImportHashSync('2026-10-16', 5000, 'padaria  ');
      expect(hash1).toBe(hash2);
    });
  });

  describe('Frequency-Tracking Transaction Deduplication', () => {
    const existingTransactions: Transaction[] = [
      {
        id: 'tx_existing_1',
        accountId: 'acc_1',
        date: '2026-10-16',
        amountCents: 1500, // Coffee 1
        type: 'expense',
        categoryId: 'cat_food',
        payee: 'Café do Ponto',
        notes: '',
        status: 'cleared',
        fitid: 'FIT_COFFEE_1',
        createdAt: '2026-10-16T09:00:00Z',
        updatedAt: '2026-10-16T09:00:00Z',
      },
      {
        id: 'tx_existing_2',
        accountId: 'acc_1',
        date: '2026-10-16',
        amountCents: 3500, // Lunch without FITID
        type: 'expense',
        categoryId: 'cat_food',
        payee: 'Restaurante Bom Sabor',
        notes: '',
        status: 'cleared',
        createdAt: '2026-10-16T12:00:00Z',
        updatedAt: '2026-10-16T12:00:00Z',
      },
    ];

    it('detects duplicate by FITID with highest precision', () => {
      const incoming: DraftTransaction[] = [
        {
          accountId: 'acc_1',
          type: 'expense',
          source: 'ofx',
          date: '2026-10-16',
          amountCents: 1500,
          payee: 'Café do Ponto Alterado', // Payee changed, but FITID matches
          fitid: 'FIT_COFFEE_1',
        },
      ];

      const res = filterDuplicateTransactions(incoming, existingTransactions);
      expect(res.duplicatesCount).toBe(1);
      expect(res.unique).toHaveLength(0);
      expect(res.duplicates).toHaveLength(1);
    });

    it('correctly handles same-day multi-purchases frequency tracking (retains legitimate 2nd purchase)', () => {
      // In existing transactions: exactly ONE purchase of R$ 35,00 at Restaurante Bom Sabor
      // In imported statement: TWO purchases of R$ 35,00 at Restaurante Bom Sabor
      const incoming: DraftTransaction[] = [
        {
          accountId: 'acc_1',
          type: 'expense',
          date: '2026-10-16',
          amountCents: 3500,
          payee: 'Restaurante Bom Sabor',
        },
        {
          accountId: 'acc_1',
          type: 'expense',
          date: '2026-10-16',
          amountCents: 3500,
          payee: 'Restaurante Bom Sabor',
        },
      ];

      const res = filterDuplicateTransactions(incoming, existingTransactions);

      // The 1st incoming purchase matches the 1 existing occurrence -> duplicate
      // The 2nd incoming purchase exceeds existing occurrences -> UNIQUE!
      expect(res.duplicatesCount).toBe(1);
      expect(res.unique).toHaveLength(1);
      expect(res.duplicates).toHaveLength(1);
    });

    it('scopes FITID per account: same FITID in another account is NOT a duplicate (regression)', () => {
      const incoming: DraftTransaction[] = [
        {
          accountId: 'acc_2',
          type: 'expense',
          source: 'ofx',
          date: '2026-10-16',
          amountCents: 1500,
          payee: 'Outra Loja',
          fitid: 'FIT_COFFEE_1',
        },
      ];
      const res = filterDuplicateTransactions(incoming, existingTransactions);
      expect(res.duplicatesCount).toBe(0);
      expect(res.unique).toHaveLength(1);
    });

    it('does not trust FITID for CSV drafts; CSV relies on the composite hash (regression)', () => {
      const incoming: DraftTransaction[] = [
        {
          accountId: 'acc_1',
          type: 'expense',
          source: 'csv',
          date: '2026-10-17',
          amountCents: 9900,
          payee: 'Compra totalmente diferente',
          fitid: 'FIT_COFFEE_1',
        },
      ];
      const res = filterDuplicateTransactions(incoming, existingTransactions);
      expect(res.duplicatesCount).toBe(0);
      expect(res.unique).toHaveLength(1);
    });

    it('hashes both sides with one scheme including accountId and type (ignores stored parser hashes)', () => {
      const existingWithForeignHash: Transaction[] = [
        { ...existingTransactions[1], importHash: 'fnv_parser_hash_0001' },
      ];
      const sameContent: DraftTransaction = {
        accountId: 'acc_1',
        type: 'expense',
        date: '2026-10-16',
        amountCents: 3500,
        payee: 'Restaurante Bom Sabor',
        importHash: 'some_other_parser_hash',
      };
      expect(filterDuplicateTransactions([sameContent], existingWithForeignHash).duplicatesCount).toBe(1);
      // Same content in another account or with another type is not a duplicate
      expect(
        filterDuplicateTransactions([{ ...sameContent, accountId: 'acc_2' }], existingWithForeignHash).duplicatesCount
      ).toBe(0);
      expect(
        filterDuplicateTransactions([{ ...sameContent, type: 'income' }], existingWithForeignHash).duplicatesCount
      ).toBe(0);
      expect(computeDedupHashSync(sameContent)).toBe(computeDedupHashSync(existingTransactions[1]));
    });

    it('returns empty result on empty input', () => {
      const res = filterDuplicateTransactions([], existingTransactions);
      expect(res.unique).toEqual([]);
      expect(res.duplicatesCount).toBe(0);
    });
  });
});
