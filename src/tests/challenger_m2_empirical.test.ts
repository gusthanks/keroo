import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { KerooDatabase, KEROO_DB_SCHEMA_V1 } from '../db';
import {
  seedCleanSlate,
  seedDemoData,
  resetToCleanSlate,
  loadDemoData,
  CLEAN_SLATE_SEED_CATEGORIES,
} from '../db/seed';
import ptBR from '../i18n/pt-BR.json';
import enUS from '../i18n/en-US.json';
import type { SupportedLocale, SupportedCurrency } from '../types';

function extractAllJsonKeys(obj: Record<string, any>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(extractAllJsonKeys(value, fullPath));
    } else {
      keys.push(fullPath);
    }
  }
  return keys.sort();
}

describe('Challenger M2 Empirical Validation Suite', () => {
  let db: KerooDatabase;

  beforeEach(async () => {
    const dbName = `challenger_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    db = new KerooDatabase(dbName);
    await db.open();
  });

  it('validates KEROO_DB_SCHEMA_V1 table count and clean slate category definitions', () => {
    expect(Object.keys(KEROO_DB_SCHEMA_V1)).toHaveLength(14);
    expect(CLEAN_SLATE_SEED_CATEGORIES).toHaveLength(6);
  });

  // =========================================================================
  // 1. Error-Free Dataset Loading (Clean-Slate & Demo Across Variations)
  // =========================================================================
  describe('Dataset Loading Without Errors', () => {
    it('loads clean-slate dataset without throwing errors across all supported locales & currencies', async () => {
      const locales: SupportedLocale[] = ['pt-BR', 'en-US'];
      const currencies: SupportedCurrency[] = ['BRL', 'USD', 'EUR'];

      for (const lang of locales) {
        for (const curr of currencies) {
          await expect(seedCleanSlate(db, lang, curr, `Pet_${lang}_${curr}`)).resolves.not.toThrow();

          // Verify user settings matches input parameters
          const settings = await db.user_settings.get('global');
          expect(settings).toBeDefined();
          expect(settings?.language).toBe(lang);
          expect(settings?.currency).toBe(curr);
          expect(settings?.onboardingCompleted).toBe(true);
          expect(settings?.petNickname).toBe(`Pet_${lang}_${curr}`);

          // Verify clean slate invariant: 0 accounts, 0 transactions
          expect(await db.accounts.count()).toBe(0);
          expect(await db.transactions.count()).toBe(0);
          expect(await db.installment_plans.count()).toBe(0);
          expect(await db.recurring_bills.count()).toBe(0);
          expect(await db.piggy_banks.count()).toBe(0);
          expect(await db.split_expenses.count()).toBe(0);
          expect(await db.split_parties.count()).toBe(0);
        }
      }
    });

    it('loads demo dataset without throwing errors across all supported locales & currencies', async () => {
      const locales: SupportedLocale[] = ['pt-BR', 'en-US'];
      const currencies: SupportedCurrency[] = ['BRL', 'USD', 'EUR'];

      for (const lang of locales) {
        for (const curr of currencies) {
          await expect(seedDemoData(db, lang, curr, `Demo_${lang}_${curr}`)).resolves.not.toThrow();

          const settings = await db.user_settings.get('global');
          expect(settings?.language).toBe(lang);
          expect(settings?.currency).toBe(curr);
          expect(settings?.petNickname).toBe(`Demo_${lang}_${curr}`);

          // Verify presence of records
          expect(await db.accounts.count()).toBe(3);
          expect(await db.installment_plans.count()).toBe(1);
          expect(await db.recurring_bills.count()).toBe(3);
          expect(await db.piggy_banks.count()).toBe(2);
          expect(await db.split_parties.count()).toBe(1);
          expect(await db.split_expenses.count()).toBe(1);
        }
      }
    });

    it('handles edge-case pet nicknames (whitespace, empty string, symbols) during clean slate and demo loading', async () => {
      // Empty string should fallback to 'Keroo'
      await seedCleanSlate(db, 'pt-BR', 'BRL', '');
      let mascot = await db.keroo_state.get('current');
      expect(mascot?.nickname).toBe('Keroo');

      // Whitespace string should fallback to 'Keroo'
      await seedDemoData(db, 'en-US', 'USD', '   ');
      mascot = await db.keroo_state.get('current');
      expect(mascot?.nickname).toBe('Keroo');

      // Unicode emojis and accents
      await seedCleanSlate(db, 'pt-BR', 'BRL', '🐸 Sapo Cururu #1!');
      mascot = await db.keroo_state.get('current');
      expect(mascot?.nickname).toBe('🐸 Sapo Cururu #1!');
    });

    it('supports rapid toggle between demo data and clean slate without key collision or corruption', async () => {
      for (let i = 0; i < 4; i++) {
        await loadDemoData(db, 'pt-BR', 'BRL', 'ToggleTest');
        expect(await db.accounts.count()).toBe(3);
        expect(await db.recurring_bills.count()).toBe(3);

        await resetToCleanSlate(db, 'pt-BR', 'BRL', 'ToggleTest');
        expect(await db.accounts.count()).toBe(0);
        expect(await db.recurring_bills.count()).toBe(0);
        expect(await db.categories.count()).toBe(24);
      }
    });
  });

  // =========================================================================
  // 2. Demo Data Entity & Invariant Verification
  // =========================================================================
  describe('Demo Data Entity Completeness & Invariant Verification', () => {
    beforeEach(async () => {
      await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo');
    });

    it('verifies accounts: contains checking, savings, and credit card accounts', async () => {
      const accounts = await db.accounts.toArray();
      expect(accounts.length).toBe(3);

      const checking = accounts.find((a) => a.type === 'checking');
      expect(checking).toBeDefined();
      expect(checking?.id).toBe('acc_nubank_conta');
      expect(checking?.name).toBe('Nubank Conta');
      // Demo ledger is self-consistent: 30000 + 600000 (salary) - 45000 (groceries)
      // - 240000 (rent) = 345000, so initial and current balances differ on purpose.
      expect(checking?.initialBalanceCents).toBe(30000);
      expect(checking?.currentBalanceCents).toBe(345000);
      expect(Number.isInteger(checking?.initialBalanceCents)).toBe(true);

      const savings = accounts.find((a) => a.type === 'savings');
      expect(savings).toBeDefined();
      expect(savings?.id).toBe('acc_itau_reserva');
      expect(savings?.name).toBe('Itaú Reserva');
      expect(savings?.initialBalanceCents).toBe(800000);
      expect(Number.isInteger(savings?.initialBalanceCents)).toBe(true);
    });

    it('verifies credit cards: has closingDay, dueDay, creditLimitCents, and linked payment account', async () => {
      const accounts = await db.accounts.toArray();
      const creditCard = accounts.find((a) => a.type === 'credit_card');

      expect(creditCard).toBeDefined();
      expect(creditCard?.id).toBe('acc_nubank_ultravioleta');
      expect(creditCard?.name).toBe('Nubank Ultravioleta');

      // Closing and due day must be valid days of month
      expect(creditCard?.closingDay).toBe(20);
      expect(creditCard?.dueDay).toBe(27);
      expect(creditCard?.closingDay).toBeGreaterThanOrEqual(1);
      expect(creditCard?.closingDay).toBeLessThanOrEqual(31);
      expect(creditCard?.dueDay).toBeGreaterThanOrEqual(1);
      expect(creditCard?.dueDay).toBeLessThanOrEqual(31);

      // Financial limits & links
      expect(creditCard?.creditLimitCents).toBe(1500000); // R$ 15.000,00
      expect(Number.isInteger(creditCard?.creditLimitCents)).toBe(true);
      expect(creditCard?.linkedPaymentAccountId).toBe('acc_nubank_conta');
    });

    it('verifies installment plans: exact cent-remainder conservation and valid statement months', async () => {
      const plans = await db.installment_plans.toArray();
      expect(plans.length).toBeGreaterThanOrEqual(1);

      const dellPlan = plans.find((p) => p.id === 'inst_dell_notebook');
      expect(dellPlan).toBeDefined();
      expect(dellPlan?.description).toBe('Notebook Dell Inspiron');
      expect(dellPlan?.accountId).toBe('acc_nubank_ultravioleta');
      expect(dellPlan?.totalAmountCents).toBe(240000); // R$ 2.400,00
      expect(dellPlan?.totalInstallments).toBe(3);

      expect(dellPlan?.installments).toHaveLength(3);

      // Conservation invariant: sum of installment amountCents === totalAmountCents
      const totalSum = dellPlan!.installments.reduce((sum, item) => sum + item.amountCents, 0);
      expect(totalSum).toBe(dellPlan!.totalAmountCents);

      // Verify each installment item structure
      dellPlan!.installments.forEach((inst, idx) => {
        expect(inst.index).toBe(idx + 1);
        expect(Number.isInteger(inst.amountCents)).toBe(true);
        expect(inst.amountCents).toBeGreaterThan(0);
        expect(inst.statementMonth).toMatch(/^\d{4}-\d{2}$/);
        expect(inst.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof inst.isPaid).toBe('boolean');
      });
    });

    it('verifies recurring subscriptions: cadence, anchorDay, amounts, and paymentStatus states', async () => {
      const bills = await db.recurring_bills.toArray();
      expect(bills.length).toBe(3);

      const netflix = bills.find((b) => b.id === 'bill_netflix');
      expect(netflix).toBeDefined();
      expect(netflix?.name).toBe('Netflix Premium');
      expect(netflix?.amountCents).toBe(5590);
      expect(netflix?.cadence).toBe('monthly');
      expect(netflix?.anchorDay).toBe(15);
      expect(netflix?.paymentStatus).toBe('PAID_OK');

      const spotify = bills.find((b) => b.id === 'bill_spotify');
      expect(spotify).toBeDefined();
      expect(spotify?.name).toBe('Spotify Family');
      expect(spotify?.amountCents).toBe(3490);
      expect(spotify?.cadence).toBe('monthly');
      // The anchor day must agree with the seeded due date (today + 2 days).
      expect(spotify?.anchorDay).toBe(Number(spotify!.nextDueDate.slice(8, 10)));
      expect(spotify?.paymentStatus).toBe('DUE_SOON');

      const internet = bills.find((b) => b.id === 'bill_internet_fibra');
      expect(internet).toBeDefined();
      expect(internet?.amountCents).toBe(12990);
      expect(internet?.cadence).toBe('monthly');
      expect(internet?.anchorDay).toBe(5);
      expect(internet?.paymentStatus).toBe('UPCOMING_SAFE');

      // Verify valid anchor days and positive integer cents across all bills
      for (const bill of bills) {
        expect(bill.anchorDay).toBeGreaterThanOrEqual(1);
        expect(bill.anchorDay).toBeLessThanOrEqual(31);
        expect(Number.isInteger(bill.amountCents)).toBe(true);
        expect(bill.amountCents).toBeGreaterThan(0);
        expect(bill.isActive).toBe(true);
      }
    });

    it('verifies split parties and split expenses: shares sum to totalAmountCents and partner relationship', async () => {
      const parties = await db.split_parties.toArray();
      expect(parties.length).toBeGreaterThanOrEqual(1);

      const camila = parties.find((p) => p.id === 'party_camila');
      expect(camila).toBeDefined();
      expect(camila?.name).toContain('Camila');
      expect(camila?.relationship).toBe('household_partner');
      expect(camila?.phoneOrPix).toBe('camila@pix.me');

      const expenses = await db.split_expenses.toArray();
      expect(expenses.length).toBeGreaterThanOrEqual(1);

      const rentSplit = expenses.find((e) => e.id === 'split_exp_aluguel');
      expect(rentSplit).toBeDefined();
      expect(rentSplit?.totalAmountCents).toBe(240000);
      expect(rentSplit?.paidByPartyId).toBe('USER');
      expect(rentSplit?.splitMethod).toBe('equal_50_50');
      expect(rentSplit?.shares).toHaveLength(2);

      // Split conservation: sum(shares) === totalAmountCents
      const totalShares = rentSplit!.shares.reduce((acc, s) => acc + s.shareCents, 0);
      expect(totalShares).toBe(rentSplit!.totalAmountCents);
    });

    it('verifies piggy banks (cofrinhos): targetCents, savedCents, and valid progress values', async () => {
      const piggies = await db.piggy_banks.toArray();
      expect(piggies.length).toBe(2);

      const emergency = piggies.find((p) => p.id === 'piggy_reserva');
      expect(emergency).toBeDefined();
      expect(emergency?.targetCents).toBe(1500000);
      expect(emergency?.savedCents).toBe(800000);
      expect(Number.isInteger(emergency?.targetCents)).toBe(true);
      expect(Number.isInteger(emergency?.savedCents)).toBe(true);

      const japan = piggies.find((p) => p.id === 'piggy_viagem_japao');
      expect(japan).toBeDefined();
      expect(japan?.targetCents).toBe(2000000);
      expect(japan?.savedCents).toBe(450000);
      expect(japan?.targetDate).toBe('2027-04-01');

      for (const p of piggies) {
        expect(p.targetCents).toBeGreaterThan(0);
        expect(p.savedCents).toBeGreaterThanOrEqual(0);
        expect(p.savedCents).toBeLessThanOrEqual(p.targetCents);
      }
    });

    it('verifies mascot state reacting to upcoming demo bills with alert mood', async () => {
      const mascot = await db.keroo_state.get('current');
      expect(mascot).toBeDefined();
      expect(mascot?.nickname).toBe('Keroo');
      expect(mascot?.mood).toBe('alert');
      expect(mascot?.lastMoodReason).toContain('Spotify Family');
    });
  });

  // =========================================================================
  // 3. 100% Bidirectional Translation Key Parity
  // =========================================================================
  describe('100% Bidirectional Translation Parity (pt-BR and en-US)', () => {
    const ptKeys = extractAllJsonKeys(ptBR);
    const enKeys = extractAllJsonKeys(enUS);

    it('has zero missing keys in en-US when compared to pt-BR', () => {
      const missingInEn = ptKeys.filter((key) => !enKeys.includes(key));
      expect(missingInEn).toEqual([]);
      expect(missingInEn.length).toBe(0);
    });

    it('has zero missing keys in pt-BR when compared to en-US', () => {
      const missingInPt = enKeys.filter((key) => !ptKeys.includes(key));
      expect(missingInPt).toEqual([]);
      expect(missingInPt.length).toBe(0);
    });

    it('verifies identical key counts and identical sorted key arrays', () => {
      expect(ptKeys.length).toBe(enKeys.length);
      expect(ptKeys).toEqual(enKeys);
    });

    it('verifies every single translation value is a non-empty string in both dictionaries', () => {
      for (const key of ptKeys) {
        const parts = key.split('.');
        let ptNode: any = ptBR;
        let enNode: any = enUS;

        for (const p of parts) {
          ptNode = ptNode[p];
          enNode = enNode[p];
        }

        expect(typeof ptNode).toBe('string');
        expect(ptNode.trim().length).toBeGreaterThan(0);

        expect(typeof enNode).toBe('string');
        expect(enNode.trim().length).toBeGreaterThan(0);
      }
    });
  });

  // =========================================================================
  // 4. Verification of docs/ROADMAP.md State
  // =========================================================================
  describe('docs/ROADMAP.md Stage Checkbox State Verification', () => {
    const roadmapPath = path.resolve(__dirname, '../../docs/ROADMAP.md');
    const roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');

    // Split roadmap by stages
    const stageSections = roadmapContent.split(/## Stage /);

    function getCheckboxesForStage(stageNum: number): { checked: number; unchecked: number } {
      const section = stageSections.find((s) => s.startsWith(`${stageNum}:`));
      if (!section) {
        throw new Error(`Stage ${stageNum} section not found in docs/ROADMAP.md`);
      }
      const checkedMatches = section.match(/- \[x\]/g) || [];
      const uncheckedMatches = section.match(/- \[ \]/g) || [];
      return {
        checked: checkedMatches.length,
        unchecked: uncheckedMatches.length,
      };
    }

    it('verifies Stage 1 has all checkboxes checked [x] and zero unchecked [ ]', () => {
      const counts = getCheckboxesForStage(1);
      expect(counts.checked).toBe(7);
      expect(counts.unchecked).toBe(0);
    });

    it('verifies Stage 2 has all checkboxes checked [x] and zero unchecked [ ]', () => {
      const counts = getCheckboxesForStage(2);
      expect(counts.checked).toBe(7);
      expect(counts.unchecked).toBe(0);
    });

    it('verifies Stage 3 has all checkboxes checked [x] and zero unchecked [ ]', () => {
      const counts = getCheckboxesForStage(3);
      expect(counts.checked).toBe(9);
      expect(counts.unchecked).toBe(0);
    });

    it('verifies Stage 4 has all checkboxes checked [x] and zero unchecked [ ]', () => {
      const counts = getCheckboxesForStage(4);
      expect(counts.checked).toBe(6);
      expect(counts.unchecked).toBe(0);
    });

    it('verifies Stage 5 has all checkboxes checked [x] and zero unchecked [ ]', () => {
      const counts = getCheckboxesForStage(5);
      expect(counts.checked).toBe(13);
      expect(counts.unchecked).toBe(0);
    });

    it('verifies Stage 6 has all 10 checkboxes checked [x] and zero unchecked [ ]', () => {
      // Stage 6 (verification & polish) was completed on 2026-10-18.
      const counts = getCheckboxesForStage(6);
      expect(counts.checked).toBe(10);
      expect(counts.unchecked).toBe(0);
    });
  });
});
