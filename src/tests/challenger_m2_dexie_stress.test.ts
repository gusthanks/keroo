import { describe, it, expect, beforeEach } from 'vitest';
import { KerooDatabase } from '../db';
import {
  seedDemoData,
  resetToCleanSlate,
} from '../db/seed';
import type {
  Account,
  CategoryGroup,
  Category,
  MonthlyEnvelope,
  Transaction,
  AutoRule,
  InstallmentPlan,
  RecurringBill,
  SplitParty,
  SplitExpense,
  SplitSettlement,
  PiggyBank,
  KerooPetState,
  UserSettings,
} from '../types';

describe('Empirical Challenger: Dexie Database Engine & Invariants Stress Harness', () => {
  let db: KerooDatabase;

  beforeEach(async () => {
    const testDbName = `stress_test_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    db = new KerooDatabase(testDbName);
    await db.open();
  });

  // =========================================================================
  // TASK 1: Insertion and retrieval across ALL 14 Dexie tables
  // =========================================================================
  describe('Task 1: Full Coverage Insertion & Retrieval Across All 14 Tables', () => {
    it('successfully inserts and retrieves valid entities across every single table (1-14)', async () => {
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);

      // 1. accounts
      const account: Account = {
        id: 'acc_stress_1',
        name: 'Stress Checking',
        type: 'checking',
        currency: 'BRL',
        initialBalanceCents: 150000,
        currentBalanceCents: 150000,
        isArchived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.accounts.add(account);
      const retrievedAccount = await db.accounts.get('acc_stress_1');
      expect(retrievedAccount).toEqual(account);

      // 2. category_groups
      const group: CategoryGroup = {
        id: 'grp_stress_1',
        name: 'Fixed Housing',
        sortOrder: 1,
        isArchived: false,
      };
      await db.category_groups.add(group);
      const retrievedGroup = await db.category_groups.get('grp_stress_1');
      expect(retrievedGroup).toEqual(group);

      // 3. categories
      const category: Category = {
        id: 'cat_stress_1',
        groupId: 'grp_stress_1',
        name: 'Rent',
        sortOrder: 1,
        isArchived: false,
        rolloverMode: 'rollover_negative',
      };
      await db.categories.add(category);
      const retrievedCategory = await db.categories.get('cat_stress_1');
      expect(retrievedCategory).toEqual(category);

      // 4. monthly_envelopes
      const envelope: MonthlyEnvelope = {
        id: 'cat_stress_1_2026-10',
        categoryId: 'cat_stress_1',
        yearMonth: '2026-10',
        assignedCents: 200000,
        activityCents: 150000,
        availableCents: 50000,
      };
      await db.monthly_envelopes.add(envelope);
      const retrievedEnvelope = await db.monthly_envelopes.get('cat_stress_1_2026-10');
      expect(retrievedEnvelope).toEqual(envelope);

      // 5. transactions
      const transaction: Transaction = {
        id: 'tx_stress_1',
        accountId: 'acc_stress_1',
        date: '2026-10-16',
        amountCents: 150000,
        type: 'expense',
        categoryId: 'cat_stress_1',
        payee: 'Landlord',
        notes: 'Monthly rent',
        status: 'cleared',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.transactions.add(transaction);
      const retrievedTx = await db.transactions.get('tx_stress_1');
      expect(retrievedTx).toEqual(transaction);

      // 6. auto_rules
      const rule: AutoRule = {
        id: 'rule_stress_1',
        name: 'Auto categorize iFood',
        priority: 1,
        logic: 'AND',
        conditions: [
          { field: 'payee', operator: 'contains', value: 'iFood' },
        ],
        actions: [
          { field: 'categoryId', value: 'cat_delivery' },
          { field: 'status', value: 'cleared' },
        ],
        isActive: true,
      };
      await db.auto_rules.add(rule);
      const retrievedRule = await db.auto_rules.get('rule_stress_1');
      expect(retrievedRule).toEqual(rule);

      // 7. installment_plans
      const plan: InstallmentPlan = {
        id: 'inst_stress_1',
        accountId: 'acc_stress_1',
        description: 'iPhone 16 Pro 10x',
        totalAmountCents: 1000000,
        originalPrincipalCents: 1000000,
        totalInstallments: 10,
        purchaseDate: today,
        interestType: 'none',
        installments: [
          {
            index: 1,
            statementMonth: '2026-10',
            dueDate: '2026-10-25',
            amountCents: 100000,
            principalCents: 100000,
            interestCents: 0,
            isPaid: false,
          },
        ],
        createdAt: nowIso,
      };
      await db.installment_plans.add(plan);
      const retrievedPlan = await db.installment_plans.get('inst_stress_1');
      expect(retrievedPlan).toEqual(plan);

      // 8. recurring_bills
      const bill: RecurringBill = {
        id: 'bill_stress_1',
        name: 'Fiber Internet',
        amountCents: 12990,
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 10,
        startDate: '2026-01-10',
        nextDueDate: '2026-11-10',
        paymentStatus: 'UPCOMING_SAFE',
        categoryId: 'cat_stress_1',
        paymentAccountId: 'acc_stress_1',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.recurring_bills.add(bill);
      const retrievedBill = await db.recurring_bills.get('bill_stress_1');
      expect(retrievedBill).toEqual(bill);

      // 9. split_parties
      const party: SplitParty = {
        id: 'party_stress_1',
        name: 'Camila',
        relationship: 'household_partner',
        phoneOrPix: 'camila@pix.me',
        isArchived: false,
        createdAt: nowIso,
      };
      await db.split_parties.add(party);
      const retrievedParty = await db.split_parties.get('party_stress_1');
      expect(retrievedParty).toEqual(party);

      // 10. split_expenses
      const splitExpense: SplitExpense = {
        id: 'split_exp_stress_1',
        description: 'Groceries Dinner',
        totalAmountCents: 35000,
        currency: 'BRL',
        date: today,
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        shares: [
          { partyId: 'USER', shareCents: 17500, percentage: 50 },
          { partyId: 'party_stress_1', shareCents: 17500, percentage: 50 },
        ],
        createdAt: nowIso,
      };
      await db.split_expenses.add(splitExpense);
      const retrievedSplitExpense = await db.split_expenses.get('split_exp_stress_1');
      expect(retrievedSplitExpense).toEqual(splitExpense);

      // 11. split_settlements
      const settlement: SplitSettlement = {
        id: 'settle_stress_1',
        fromPartyId: 'party_stress_1',
        toPartyId: 'USER',
        amountCents: 17500,
        date: today,
        notes: 'Pix transfer settlement',
        createdAt: nowIso,
      };
      await db.split_settlements.add(settlement);
      const retrievedSettlement = await db.split_settlements.get('settle_stress_1');
      expect(retrievedSettlement).toEqual(settlement);

      // 12. piggy_banks
      const piggy: PiggyBank = {
        id: 'piggy_stress_1',
        name: 'Japan 2027',
        targetCents: 2000000,
        savedCents: 500000,
        targetDate: '2027-04-01',
        color: '#F59E0B',
        icon: 'Plane',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.piggy_banks.add(piggy);
      const retrievedPiggy = await db.piggy_banks.get('piggy_stress_1');
      expect(retrievedPiggy).toEqual(piggy);

      // 13. keroo_state
      const mascot: KerooPetState = {
        id: 'current',
        nickname: 'Keroo',
        mood: 'calm',
        lastMoodReason: 'All calm and budgeted!',
        lastInteractionDate: today,
        lastEvaluatedTimestamp: Date.now(),
      };
      await db.keroo_state.put(mascot);
      const retrievedMascot = await db.keroo_state.get('current');
      expect(retrievedMascot).toEqual(mascot);

      // 14. user_settings
      const settings: UserSettings = {
        id: 'global',
        language: 'pt-BR',
        currency: 'BRL',
        theme: 'dark',
        onboardingCompleted: true,
        petNickname: 'Keroo',
        roamingPetEnabled: true,
        rolloverModeDefault: 'rollover_negative',
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await db.user_settings.put(settings);
      const retrievedSettings = await db.user_settings.get('global');
      expect(retrievedSettings).toEqual(settings);

      // Verify all 14 tables contain exactly 1 element
      for (const table of db.tables) {
        expect(await table.count()).toBe(1);
      }
    });
  });

  // =========================================================================
  // TASK 2: Compound Indexes Verification
  // =========================================================================
  describe('Task 2: Empirical Compound Indexes Verification', () => {
    it('verifies compound index [categoryId+yearMonth] on monthly_envelopes', async () => {
      await db.monthly_envelopes.bulkAdd([
        { id: 'env_1', categoryId: 'cat_rent', yearMonth: '2026-08', assignedCents: 100000, activityCents: 100000, availableCents: 0 },
        { id: 'env_2', categoryId: 'cat_rent', yearMonth: '2026-09', assignedCents: 100000, activityCents: 100000, availableCents: 0 },
        { id: 'env_3', categoryId: 'cat_rent', yearMonth: '2026-10', assignedCents: 100000, activityCents: 100000, availableCents: 0 },
        { id: 'env_4', categoryId: 'cat_food', yearMonth: '2026-09', assignedCents: 50000, activityCents: 30000, availableCents: 20000 },
        { id: 'env_5', categoryId: 'cat_food', yearMonth: '2026-10', assignedCents: 50000, activityCents: 45000, availableCents: 5000 },
      ]);

      // Exact match query via compound index
      const exactMatch = await db.monthly_envelopes
        .where('[categoryId+yearMonth]')
        .equals(['cat_rent', '2026-09'])
        .toArray();
      expect(exactMatch).toHaveLength(1);
      expect(exactMatch[0].id).toBe('env_2');

      // Range query on same category
      const rangeMatch = await db.monthly_envelopes
        .where('[categoryId+yearMonth]')
        .between(['cat_rent', '2026-08'], ['cat_rent', '2026-10'], true, true)
        .toArray();
      expect(rangeMatch).toHaveLength(3);
      expect(rangeMatch.map((e) => e.id)).toEqual(['env_1', 'env_2', 'env_3']);

      // Non-existent compound key returns empty array
      const emptyMatch = await db.monthly_envelopes
        .where('[categoryId+yearMonth]')
        .equals(['cat_rent', '2026-12'])
        .toArray();
      expect(emptyMatch).toHaveLength(0);
    });

    it('verifies compound index [accountId+date] on transactions', async () => {
      const nowIso = new Date().toISOString();
      await db.transactions.bulkAdd([
        { id: 'tx_acc1_d10', accountId: 'acc_1', date: '2026-10-10', amountCents: 1000, type: 'expense', categoryId: null, payee: 'Store A', notes: '', status: 'cleared', createdAt: nowIso, updatedAt: nowIso },
        { id: 'tx_acc1_d15', accountId: 'acc_1', date: '2026-10-15', amountCents: 2000, type: 'expense', categoryId: null, payee: 'Store B', notes: '', status: 'cleared', createdAt: nowIso, updatedAt: nowIso },
        { id: 'tx_acc1_d20', accountId: 'acc_1', date: '2026-10-20', amountCents: 3000, type: 'expense', categoryId: null, payee: 'Store C', notes: '', status: 'cleared', createdAt: nowIso, updatedAt: nowIso },
        { id: 'tx_acc2_d15', accountId: 'acc_2', date: '2026-10-15', amountCents: 9000, type: 'expense', categoryId: null, payee: 'Store D', notes: '', status: 'cleared', createdAt: nowIso, updatedAt: nowIso },
      ]);

      // Exact match on accountId + date
      const exactAcc1D15 = await db.transactions
        .where('[accountId+date]')
        .equals(['acc_1', '2026-10-15'])
        .toArray();
      expect(exactAcc1D15).toHaveLength(1);
      expect(exactAcc1D15[0].id).toBe('tx_acc1_d15');

      // Date range query on account 1
      const rangeAcc1 = await db.transactions
        .where('[accountId+date]')
        .between(['acc_1', '2026-10-10'], ['acc_1', '2026-10-15'], true, true)
        .toArray();
      expect(rangeAcc1).toHaveLength(2);
      expect(rangeAcc1.map((t) => t.id)).toEqual(['tx_acc1_d10', 'tx_acc1_d15']);

      // Account 2 should not be contaminated
      const exactAcc2 = await db.transactions
        .where('[accountId+date]')
        .equals(['acc_2', '2026-10-15'])
        .toArray();
      expect(exactAcc2).toHaveLength(1);
      expect(exactAcc2[0].id).toBe('tx_acc2_d15');
    });

    it('verifies compound index [paymentStatus+nextDueDate] on recurring_bills', async () => {
      const nowIso = new Date().toISOString();
      await db.recurring_bills.bulkAdd([
        { id: 'bill_due_15', name: 'Bill 1', amountCents: 5000, currency: 'BRL', cadence: 'monthly', anchorDay: 15, startDate: '2026-01-15', nextDueDate: '2026-10-15', paymentStatus: 'DUE_SOON', categoryId: 'cat_1', paymentAccountId: 'acc_1', isActive: true, autoRenew: true, reminderDaysBefore: 3, createdAt: nowIso, updatedAt: nowIso },
        { id: 'bill_due_17', name: 'Bill 2', amountCents: 6000, currency: 'BRL', cadence: 'monthly', anchorDay: 17, startDate: '2026-01-17', nextDueDate: '2026-10-17', paymentStatus: 'DUE_SOON', categoryId: 'cat_1', paymentAccountId: 'acc_1', isActive: true, autoRenew: true, reminderDaysBefore: 3, createdAt: nowIso, updatedAt: nowIso },
        { id: 'bill_paid_17', name: 'Bill 3', amountCents: 7000, currency: 'BRL', cadence: 'monthly', anchorDay: 17, startDate: '2026-01-17', nextDueDate: '2026-10-17', paymentStatus: 'PAID_OK', categoryId: 'cat_1', paymentAccountId: 'acc_1', isActive: true, autoRenew: true, reminderDaysBefore: 3, createdAt: nowIso, updatedAt: nowIso },
        { id: 'bill_overdue_05', name: 'Bill 4', amountCents: 8000, currency: 'BRL', cadence: 'monthly', anchorDay: 5, startDate: '2026-01-05', nextDueDate: '2026-10-05', paymentStatus: 'OVERDUE', categoryId: 'cat_1', paymentAccountId: 'acc_1', isActive: true, autoRenew: true, reminderDaysBefore: 3, createdAt: nowIso, updatedAt: nowIso },
      ]);

      // Query DUE_SOON bills on exact date
      const dueSoon17 = await db.recurring_bills
        .where('[paymentStatus+nextDueDate]')
        .equals(['DUE_SOON', '2026-10-17'])
        .toArray();
      expect(dueSoon17).toHaveLength(1);
      expect(dueSoon17[0].id).toBe('bill_due_17');

      // Query DUE_SOON bills within date window (radar scan)
      const dueSoonWindow = await db.recurring_bills
        .where('[paymentStatus+nextDueDate]')
        .between(['DUE_SOON', '2026-10-01'], ['DUE_SOON', '2026-10-20'], true, true)
        .toArray();
      expect(dueSoonWindow).toHaveLength(2);
      expect(dueSoonWindow.map((b) => b.id)).toEqual(['bill_due_15', 'bill_due_17']);

      // PAID_OK bills on same date should not appear in DUE_SOON query
      expect(dueSoonWindow.some((b) => b.id === 'bill_paid_17')).toBe(false);
    });
  });

  // =========================================================================
  // TASK 3: Verification of resetToCleanSlate complete purge
  // =========================================================================
  describe('Task 3: Verification that resetToCleanSlate Completely Purges State', () => {
    it('completely purges all transactions, accounts, envelopes, split tabs, piggy banks, rules and restores pristine state', async () => {
      // 1. First, populate full rich demo data
      await seedDemoData(db, 'pt-BR', 'BRL', 'DirtyPet');

      // 2. Add extra custom records to tables not in demo data (e.g. auto_rules, split_settlements)
      const nowIso = new Date().toISOString();
      await db.auto_rules.add({
        id: 'rule_custom',
        name: 'Custom rule',
        priority: 1,
        logic: 'AND',
        conditions: [],
        actions: [],
        isActive: true,
      });
      await db.split_settlements.add({
        id: 'settle_custom',
        fromPartyId: 'party_camila',
        toPartyId: 'USER',
        amountCents: 50000,
        date: '2026-10-16',
        createdAt: nowIso,
      });

      // Confirm dirty state: all tables have records
      expect(await db.accounts.count()).toBeGreaterThan(0);
      expect(await db.transactions.count()).toBeGreaterThan(0);
      expect(await db.monthly_envelopes.count()).toBeGreaterThan(0);
      expect(await db.installment_plans.count()).toBeGreaterThan(0);
      expect(await db.recurring_bills.count()).toBeGreaterThan(0);
      expect(await db.split_parties.count()).toBeGreaterThan(0);
      expect(await db.split_expenses.count()).toBeGreaterThan(0);
      expect(await db.split_settlements.count()).toBeGreaterThan(0);
      expect(await db.piggy_banks.count()).toBeGreaterThan(0);
      expect(await db.auto_rules.count()).toBeGreaterThan(0);

      // 3. Execute resetToCleanSlate
      await resetToCleanSlate(db, 'en-US', 'USD', 'PristineKeroo');

      // 4. Assert 100% clean-slate invariants:
      // Zero operational financial activity
      expect(await db.accounts.count()).toBe(0);
      expect(await db.transactions.count()).toBe(0);
      expect(await db.monthly_envelopes.count()).toBe(0);
      expect(await db.installment_plans.count()).toBe(0);
      expect(await db.recurring_bills.count()).toBe(0);
      expect(await db.split_parties.count()).toBe(0);
      expect(await db.split_expenses.count()).toBe(0);
      expect(await db.split_settlements.count()).toBe(0);
      expect(await db.piggy_banks.count()).toBe(0);
      expect(await db.auto_rules.count()).toBe(0);

      // Default structure cleanly recreated
      expect(await db.category_groups.count()).toBe(6);
      expect(await db.categories.count()).toBe(24);

      // Singletons restored with clean slate parameters
      const settings = await db.user_settings.get('global');
      expect(settings).toBeDefined();
      expect(settings?.language).toBe('en-US');
      expect(settings?.currency).toBe('USD');
      expect(settings?.petNickname).toBe('PristineKeroo');

      const mascot = await db.keroo_state.get('current');
      expect(mascot).toBeDefined();
      expect(mascot?.nickname).toBe('PristineKeroo');
      expect(mascot?.mood).toBe('thriving');
    });
  });

  // =========================================================================
  // TASK 4: Integer-Cent Invariant & Fractional Cents Storage Probe (Stage 3 Defense Verified)
  // =========================================================================
  describe('Task 4: Integer-Cent Invariants & Fractional Cent Rejection Probe', () => {
    it('verifies Dexie rejects inserting fractional cents with TypeError via Stage 3 validation hooks', async () => {
      const nowIso = new Date().toISOString();

      // Attempt inserting transaction with fractional cents: 123.456 cents
      const fractionalTx: any = {
        id: 'tx_fractional_probe',
        accountId: 'acc_probe',
        date: '2026-10-16',
        amountCents: 123.456, // Non-integer fractional cents!
        type: 'expense',
        categoryId: null,
        payee: 'Fractional Store',
        notes: 'Testing runtime integrity',
        status: 'cleared',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // In Stage 3 with monetary hooks active, Dexie strictly rejects fractional cents:
      await expect(db.transactions.add(fractionalTx)).rejects.toThrow(TypeError);
    });

    it('probes account balance integrity when fractional cents are passed', async () => {
      const nowIso = new Date().toISOString();
      const fractionalAcc: any = {
        id: 'acc_frac',
        name: 'Fractional Account',
        type: 'checking',
        currency: 'BRL',
        initialBalanceCents: 100.75, // Fractional
        currentBalanceCents: 99.99,   // Fractional
        creditLimitCents: 5000.5,    // Fractional
        isArchived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await expect(db.accounts.add(fractionalAcc)).rejects.toThrow(TypeError);
    });

    it('probes envelope budget integrity when fractional cents are passed', async () => {
      const fractionalEnv: any = {
        id: 'cat_frac_2026-10',
        categoryId: 'cat_frac',
        yearMonth: '2026-10',
        assignedCents: 1000.333,
        activityCents: 500.2,
        availableCents: 500.133,
      };

      await expect(db.monthly_envelopes.add(fractionalEnv)).rejects.toThrow(TypeError);
    });

    it('probes recurring bills integrity when fractional cents are passed', async () => {
      const nowIso = new Date().toISOString();
      const fractionalBill: any = {
        id: 'bill_frac',
        name: 'Fractional Bill',
        amountCents: 49.99, // Fractional
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 15,
        startDate: '2026-10-15',
        nextDueDate: '2026-11-15',
        paymentStatus: 'PAID_OK',
        categoryId: 'cat_1',
        paymentAccountId: 'acc_1',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await expect(db.recurring_bills.add(fractionalBill)).rejects.toThrow(TypeError);
    });

    it('probes piggy banks integrity when fractional cents are passed', async () => {
      const nowIso = new Date().toISOString();
      const fractionalPiggy: any = {
        id: 'piggy_frac',
        name: 'Fractional Piggy',
        targetCents: 10000.85,
        savedCents: 2500.42,
        color: '#10B981',
        icon: 'Shield',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await expect(db.piggy_banks.add(fractionalPiggy)).rejects.toThrow(TypeError);
    });

    it('probes split expenses and shares integrity when fractional cents are passed', async () => {
      const nowIso = new Date().toISOString();
      const fractionalSplit: any = {
        id: 'split_frac',
        description: 'Fractional Split',
        totalAmountCents: 15.01, // Fractional cents
        currency: 'BRL',
        date: '2026-10-16',
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        shares: [
          { partyId: 'USER', shareCents: 7.505, percentage: 50 },
          { partyId: 'party_1', shareCents: 7.505, percentage: 50 },
        ],
        createdAt: nowIso,
      };

      await expect(db.split_expenses.add(fractionalSplit)).rejects.toThrow(TypeError);
    });
  });
});
