import { describe, it, expect, beforeEach } from 'vitest';
import { KerooDatabase, KEROO_DB_SCHEMA_V1 } from '../db';
import {
  seedCleanSlate,
  seedDemoData,
  resetToCleanSlate,
  loadDemoData,
  CLEAN_SLATE_SEED_CATEGORIES,
} from '../db/seed';
import { addDaysISO, getLocalTodayISO } from '../core/dates';
import type { Cents } from '../types';

describe('KerooDatabase Architecture & Schema (Stage 2)', () => {
  let db: KerooDatabase;

  beforeEach(async () => {
    // Generate isolated in-memory DB per test
    const testDbName = `keroo_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    db = new KerooDatabase(testDbName);
    await db.open();
  });

  it('instantiates KerooDatabase with exactly 14 IndexedDB tables matching KEROO_DB_SCHEMA_V1', () => {
    const tableNames = db.tables.map((t) => t.name);

    expect(tableNames).toHaveLength(14);
    expect(tableNames).toContain('accounts');
    expect(tableNames).toContain('category_groups');
    expect(tableNames).toContain('categories');
    expect(tableNames).toContain('monthly_envelopes');
    expect(tableNames).toContain('transactions');
    expect(tableNames).toContain('auto_rules');
    expect(tableNames).toContain('installment_plans');
    expect(tableNames).toContain('recurring_bills');
    expect(tableNames).toContain('split_parties');
    expect(tableNames).toContain('split_expenses');
    expect(tableNames).toContain('split_settlements');
    expect(tableNames).toContain('piggy_banks');
    expect(tableNames).toContain('keroo_state');
    expect(tableNames).toContain('user_settings');

    // Verify schema matches declaration exactly
    const schemaKeys = Object.keys(KEROO_DB_SCHEMA_V1);
    expect(schemaKeys).toHaveLength(14);
    for (const key of schemaKeys) {
      expect(tableNames).toContain(key);
    }
  });

  describe('Clean-Slate Seeding', () => {
    it('seeds clean-slate database in pt-BR with default groups, categories, and singleton states', async () => {
      await seedCleanSlate(db, 'pt-BR', 'BRL', 'Keroo');

      // Verify category groups
      const groups = await db.category_groups.toArray();
      expect(groups).toHaveLength(CLEAN_SLATE_SEED_CATEGORIES.length);
      expect(groups[0].name).toBe('Moradia & Contas Fixas');

      // Verify categories
      const totalExpectedCategories = CLEAN_SLATE_SEED_CATEGORIES.reduce(
        (sum, g) => sum + g.categories.length,
        0
      );
      const categories = await db.categories.toArray();
      expect(categories).toHaveLength(totalExpectedCategories);
      expect(categories[0].name).toBe('Aluguel / Condomínio');
      expect(categories[0].rolloverMode).toBe('rollover_negative');

      // Verify singleton user settings
      const settings = await db.user_settings.get('global');
      expect(settings).toBeDefined();
      expect(settings?.language).toBe('pt-BR');
      expect(settings?.currency).toBe('BRL');
      expect(settings?.onboardingCompleted).toBe(true);
      expect(settings?.petNickname).toBe('Keroo');
      expect(settings?.roamingPetEnabled).toBe(true);

      // Verify singleton mascot companion state
      const mascot = await db.keroo_state.get('current');
      expect(mascot).toBeDefined();
      expect(mascot?.nickname).toBe('Keroo');
      expect(mascot?.mood).toBe('thriving');
      expect(mascot?.lastMoodReason).toContain('jornada financeira');

      // Verify zero financial activity in clean-slate
      expect(await db.accounts.count()).toBe(0);
      expect(await db.transactions.count()).toBe(0);
      expect(await db.installment_plans.count()).toBe(0);
      expect(await db.recurring_bills.count()).toBe(0);
      expect(await db.piggy_banks.count()).toBe(0);
      expect(await db.split_expenses.count()).toBe(0);
    });

    it('seeds clean-slate database in en-US with English groups and categories', async () => {
      await seedCleanSlate(db, 'en-US', 'USD', 'Froggo');

      const groups = await db.category_groups.toArray();
      expect(groups[0].name).toBe('Housing & Fixed Bills');

      const categories = await db.categories.toArray();
      expect(categories[0].name).toBe('Rent / Mortgage');

      const settings = await db.user_settings.get('global');
      expect(settings?.language).toBe('en-US');
      expect(settings?.currency).toBe('USD');
      expect(settings?.petNickname).toBe('Froggo');

      const mascot = await db.keroo_state.get('current');
      expect(mascot?.nickname).toBe('Froggo');
      expect(mascot?.mood).toBe('thriving');
      expect(mascot?.lastMoodReason).toContain('financial journey');
    });

    it('resetToCleanSlate clears any preexisting data and re-seeds cleanly', async () => {
      // First put dummy data
      await db.accounts.add({
        id: 'acc_dummy',
        name: 'Old Account',
        type: 'checking',
        currency: 'BRL',
        initialBalanceCents: 10000,
        currentBalanceCents: 10000,
        isArchived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(await db.accounts.count()).toBe(1);

      await resetToCleanSlate(db, 'pt-BR', 'BRL', 'Keroo');

      // Accounts must be wiped clean
      expect(await db.accounts.count()).toBe(0);
      const groups = await db.category_groups.count();
      expect(groups).toBe(CLEAN_SLATE_SEED_CATEGORIES.length);
    });
  });

  describe('Rich Demo Data Loading', () => {
    it('populates complete realistic demo dataset matching DATABASE_SCHEMA.md Section 6', async () => {
      await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo');

      // 1. Accounts Verification
      const accounts = await db.accounts.toArray();
      expect(accounts).toHaveLength(3);

      const checking = accounts.find((a) => a.id === 'acc_nubank_conta');
      expect(checking).toBeDefined();
      expect(checking?.name).toBe('Nubank Conta');
      expect(checking?.type).toBe('checking');
      // Initial R$ 300,00 + salary - groceries - rent = R$ 3.450,00 (self-consistent ledger)
      expect(checking?.initialBalanceCents).toBe(30000);
      expect(checking?.currentBalanceCents).toBe(345000);

      const credit = accounts.find((a) => a.id === 'acc_nubank_ultravioleta');
      expect(credit).toBeDefined();
      expect(credit?.name).toBe('Nubank Ultravioleta');
      expect(credit?.type).toBe('credit_card');
      expect(credit?.creditLimitCents).toBe(1500000); // R$ 15.000,00
      expect(credit?.closingDay).toBe(20);
      expect(credit?.dueDay).toBe(27);

      const savings = accounts.find((a) => a.id === 'acc_itau_reserva');
      expect(savings).toBeDefined();
      expect(savings?.name).toBe('Itaú Reserva');
      expect(savings?.type).toBe('savings');
      expect(savings?.initialBalanceCents).toBe(800000); // R$ 8.000,00

      // 2. Installments Verification: Notebook Dell 3x of R$ 800,00
      const plans = await db.installment_plans.toArray();
      expect(plans).toHaveLength(1);
      const dellPlan = plans[0];
      expect(dellPlan.description).toBe('Notebook Dell Inspiron');
      expect(dellPlan.totalAmountCents).toBe(240000); // R$ 2.400,00
      expect(dellPlan.totalInstallments).toBe(3);
      expect(dellPlan.installments).toHaveLength(3);
      expect(dellPlan.installments[0].amountCents).toBe(80000);
      expect(dellPlan.installments[1].amountCents).toBe(80000);
      expect(dellPlan.installments[2].amountCents).toBe(80000);

      // Verify installment sum invariant
      const sumInstallments = dellPlan.installments.reduce(
        (sum, item) => sum + item.amountCents,
        0
      );
      expect(sumInstallments).toBe(dellPlan.totalAmountCents);

      // 3. Recurring Subscriptions Radar Verification
      const bills = await db.recurring_bills.toArray();
      expect(bills).toHaveLength(3);

      const netflix = bills.find((b) => b.name === 'Netflix Premium');
      expect(netflix?.amountCents).toBe(5590); // R$ 55,90
      expect(netflix?.paymentStatus).toBe('PAID_OK');
      expect(netflix?.anchorDay).toBe(15);

      const spotify = bills.find((b) => b.name === 'Spotify Family');
      expect(spotify?.amountCents).toBe(3490); // R$ 34,90
      expect(spotify?.paymentStatus).toBe('DUE_SOON');
      // Regression: anchorDay must match the day of nextDueDate (today + 2)
      expect(spotify?.anchorDay).toBe(Number(spotify!.nextDueDate.slice(8, 10)));

      const internet = bills.find((b) => b.name === 'Internet Fibra Claro');
      expect(internet?.amountCents).toBe(12990); // R$ 129,90
      expect(internet?.paymentStatus).toBe('UPCOMING_SAFE');
      expect(internet?.anchorDay).toBe(5);

      // 4. Piggy Banks (Cofrinhos) Verification
      const piggyBanks = await db.piggy_banks.toArray();
      expect(piggyBanks).toHaveLength(2);

      const emergency = piggyBanks.find((p) => p.id === 'piggy_reserva');
      expect(emergency?.targetCents).toBe(1500000); // R$ 15.000,00
      expect(emergency?.savedCents).toBe(800000); // R$ 8.000,00

      const japan = piggyBanks.find((p) => p.id === 'piggy_viagem_japao');
      expect(japan?.targetCents).toBe(2000000); // R$ 20.000,00
      expect(japan?.savedCents).toBe(450000); // R$ 4.500,00

      // 5. Split / IOU Ledger Verification
      const parties = await db.split_parties.toArray();
      expect(parties).toHaveLength(1);
      expect(parties[0].name).toBe('Camila (Parceira)');
      expect(parties[0].relationship).toBe('household_partner');

      const splitExpenses = await db.split_expenses.toArray();
      expect(splitExpenses).toHaveLength(1);
      const rentSplit = splitExpenses[0];
      expect(rentSplit.totalAmountCents).toBe(240000); // R$ 2.400,00
      expect(rentSplit.splitMethod).toBe('equal_50_50');
      expect(rentSplit.shares).toHaveLength(2);
      expect(rentSplit.shares[0].shareCents).toBe(120000);
      expect(rentSplit.shares[1].shareCents).toBe(120000);

      // Verify split conservation invariant
      const sumShares = rentSplit.shares.reduce((sum, s) => sum + s.shareCents, 0);
      expect(sumShares).toBe(rentSplit.totalAmountCents);

      // 6. Transactions & Envelopes Verification
      expect(await db.transactions.count()).toBe(4);
      expect(await db.monthly_envelopes.count()).toBe(3);

      // 7. Mascot State Verification: Alert due to Spotify bill
      const mascot = await db.keroo_state.get('current');
      expect(mascot?.mood).toBe('alert');
      expect(mascot?.lastMoodReason).toContain('Spotify Family');
    });

    it('regression: demo accounts are consistent with their transactions and installment debt', async () => {
      await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo');
      const accounts = await db.accounts.toArray();
      const txs = await db.transactions.toArray();
      const today = getLocalTodayISO();

      // No demo movement is dated in the future
      for (const tx of txs) {
        expect(tx.date <= today).toBe(true);
      }

      // Checking: initial + signed movements === current
      const checking = accounts.find((a) => a.id === 'acc_nubank_conta')!;
      const delta = txs
        .filter((tx) => tx.accountId === checking.id)
        .reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amountCents : -tx.amountCents), 0);
      expect(checking.initialBalanceCents + delta).toBe(checking.currentBalanceCents);

      // Credit card: balance === -(open installment debt)
      const card = accounts.find((a) => a.id === 'acc_nubank_ultravioleta')!;
      const plans = await db.installment_plans.where('accountId').equals(card.id).toArray();
      const openDebt = plans.reduce(
        (sum, plan) =>
          sum + plan.installments.filter((i) => !i.isPaid).reduce((s2, i) => s2 + i.amountCents, 0),
        0
      );
      expect(openDebt).toBe(240000);
      expect(card.currentBalanceCents).toBe(-openDebt);

      // Posted 1st installment exists and is linked to its plan
      const posted = txs.filter((tx) => tx.type === 'cc_installment');
      expect(posted).toHaveLength(1);
      expect(posted[0].accountId).toBe(card.id);
      expect(posted[0].installmentPlanId).toBe('inst_dell_notebook');
      expect(posted[0].installmentIndex).toBe(1);
      expect(posted[0].amountCents).toBe(plans[0].installments[0].amountCents);

      // Spotify due in exactly 2 local days
      const spotify = await db.recurring_bills.get('bill_spotify');
      expect(spotify?.nextDueDate).toBe(addDaysISO(today, 2));

      const settings = await db.user_settings.get('global');
      expect(settings?.onboardingCompleted).toBe(true);
    });

    it('regression: preserve keeps the theme and roaming pet across reset and demo load', async () => {
      await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo', { theme: 'dark', roamingPetEnabled: false });
      let settings = await db.user_settings.get('global');
      expect(settings?.theme).toBe('dark');
      expect(settings?.roamingPetEnabled).toBe(false);

      await seedCleanSlate(db, 'pt-BR', 'BRL', 'Keroo', { theme: 'light' });
      settings = await db.user_settings.get('global');
      expect(settings?.theme).toBe('light');
      expect(settings?.roamingPetEnabled).toBe(true);

      // Without preserve the defaults are used
      await seedCleanSlate(db);
      settings = await db.user_settings.get('global');
      expect(settings?.theme).toBe('system');
    });

    it('regression: seedDemoData is atomic (a failing demo insert leaves the previous data intact)', async () => {
      await seedCleanSlate(db, 'pt-BR', 'BRL', 'Before');
      // Pre-existing user row that must survive a failed demo load
      await db.accounts.add({
        id: 'acc_user',
        name: 'User Account',
        type: 'checking',
        currency: 'BRL',
        initialBalanceCents: 1000,
        currentBalanceCents: 1000,
        isArchived: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
      const origBulkAdd = db.piggy_banks.bulkAdd.bind(db.piggy_banks);
      (db.piggy_banks as unknown as { bulkAdd: unknown }).bulkAdd = () => {
        throw new Error('boom');
      };
      await expect(seedDemoData(db)).rejects.toThrow('boom');
      (db.piggy_banks as unknown as { bulkAdd: unknown }).bulkAdd = origBulkAdd;

      expect(await db.accounts.get('acc_user')).toBeDefined();
      expect(await db.accounts.count()).toBe(1);
      expect((await db.keroo_state.get('current'))?.nickname).toBe('Before');
    });

    it('loadDemoData replaces current data and sets demo state', async () => {
      await seedCleanSlate(db);
      expect(await db.accounts.count()).toBe(0);

      await loadDemoData(db, 'en-US', 'USD', 'Keroo');
      expect(await db.accounts.count()).toBe(3);

      const checking = await db.accounts.get('acc_nubank_conta');
      expect(checking?.name).toBe('Chase Checking');
    });
  });

  describe('Integer Cents Financial Invariants', () => {
    it('enforces all monetary fields to be exact integers with zero floating point drift', async () => {
      await seedDemoData(db);

      // Check all accounts
      const accounts = await db.accounts.toArray();
      for (const acc of accounts) {
        expect(Number.isInteger(acc.initialBalanceCents)).toBe(true);
        expect(Number.isInteger(acc.currentBalanceCents)).toBe(true);
        if (acc.creditLimitCents !== undefined) {
          expect(Number.isInteger(acc.creditLimitCents)).toBe(true);
        }
      }

      // Check all transactions
      const txs = await db.transactions.toArray();
      for (const tx of txs) {
        expect(Number.isInteger(tx.amountCents)).toBe(true);
        expect(tx.amountCents).toBeGreaterThan(0);
      }

      // Check all recurring bills
      const bills = await db.recurring_bills.toArray();
      for (const bill of bills) {
        expect(Number.isInteger(bill.amountCents)).toBe(true);
        expect(bill.amountCents).toBeGreaterThan(0);
      }

      // Check all piggy banks
      const piggies = await db.piggy_banks.toArray();
      for (const p of piggies) {
        expect(Number.isInteger(p.targetCents)).toBe(true);
        expect(Number.isInteger(p.savedCents)).toBe(true);
        expect(p.targetCents).toBeGreaterThanOrEqual(0);
        expect(p.savedCents).toBeGreaterThanOrEqual(0);
      }
    });

    it('demonstrates exact 1st-installment remainder allocation invariant: sum(I_k) === A', () => {
      // Test function matching the invariant formula in DATABASE_SCHEMA.md
      const calculateInstallments = (
        totalAmountCents: Cents,
        n: number
      ): Cents[] => {
        const quotient = Math.floor(totalAmountCents / n);
        const remainder = totalAmountCents % n;
        const schedule: Cents[] = [];

        for (let k = 0; k < n; k++) {
          if (k === 0) {
            schedule.push(quotient + remainder);
          } else {
            schedule.push(quotient);
          }
        }
        return schedule;
      };

      // Test R$ 100,00 (10000 cents) divided into 3 installments
      const sched3 = calculateInstallments(10000, 3);
      expect(sched3).toEqual([3334, 3333, 3333]);
      expect(sched3.reduce((a, b) => a + b, 0)).toBe(10000);

      // Test R$ 1.000,00 (100000 cents) across all N from 1 to 24
      for (let N = 1; N <= 24; N++) {
        const sched = calculateInstallments(100000, N);
        expect(sched).toHaveLength(N);
        const total = sched.reduce((acc, val) => acc + val, 0);
        expect(total).toBe(100000);
        for (const item of sched) {
          expect(Number.isInteger(item)).toBe(true);
        }
      }
    });

    it('demonstrates bilateral split odd-cent payer absorption invariant', () => {
      const splitBilateral5050 = (totalCents: Cents) => {
        const remainder = totalCents % 2;
        const half = Math.floor(totalCents / 2);
        return {
          payerShare: half + remainder,
          counterpartShare: half,
        };
      };

      // Odd cent total: R$ 15,01 (1501 cents)
      const res = splitBilateral5050(1501);
      expect(res.payerShare).toBe(751); // Payer absorbs the extra penny
      expect(res.counterpartShare).toBe(750);
      expect(res.payerShare + res.counterpartShare).toBe(1501);
    });
  });
});
