import { describe, it, expect } from 'vitest';
import {
  computeAvailableBalance,
  calculateEnvelopeAvailable,
  computeToBeBudgeted,
  calculateToBeBudgeted,
  calculateCategoryActivity,
  computeMonthTransition,
  computeMonthTransitionDetailed,
  computeEnvelopeSummary,
  isValidYearMonth,
  assertValidYearMonth,
  getNextYearMonth,
  getPreviousYearMonth,
  isDateInYearMonth,
} from '../core/envelopes';
import type { MonthlyEnvelope, Transaction, Category } from '../types';

describe('Envelope Budgeting Engine (src/core/envelopes.ts)', () => {
  describe('YearMonth Utilities', () => {
    it('validates YearMonth strings correctly', () => {
      expect(isValidYearMonth('2026-10')).toBe(true);
      expect(isValidYearMonth('2026-01')).toBe(true);
      expect(isValidYearMonth('2026-12')).toBe(true);
      expect(isValidYearMonth('2026-13')).toBe(false);
      expect(isValidYearMonth('2026-00')).toBe(false);
      expect(isValidYearMonth('2026/10')).toBe(false);
      expect(isValidYearMonth('invalid')).toBe(false);

      expect(() => assertValidYearMonth('2026-10')).not.toThrow();
      expect(() => assertValidYearMonth('2026-99')).toThrow(TypeError);
    });

    it('advances YearMonth to next month correctly crossing year boundaries', () => {
      expect(getNextYearMonth('2026-10')).toBe('2026-11');
      expect(getNextYearMonth('2026-12')).toBe('2027-01');
      expect(getNextYearMonth('2025-01')).toBe('2025-02');
    });

    it('steps YearMonth back to previous month correctly crossing year boundaries', () => {
      expect(getPreviousYearMonth('2026-10')).toBe('2026-09');
      expect(getPreviousYearMonth('2026-01')).toBe('2025-12');
    });

    it('checks date inclusion in YearMonth', () => {
      expect(isDateInYearMonth('2026-10-16', '2026-10')).toBe(true);
      expect(isDateInYearMonth('2026-09-30', '2026-10')).toBe(false);
    });
  });

  describe('Envelope Available Balance Calculation', () => {
    it('computes available balance: Rollover + Assigned - Activity', () => {
      // 0 rollover + 500 assigned - 320 activity = 180 available
      expect(computeAvailableBalance(50000, 32000, 0)).toBe(18000);
      expect(calculateEnvelopeAvailable(0, 50000, 32000)).toBe(18000);

      // Overspending: 100 rollover + 200 assigned - 350 activity = -50 available
      expect(computeAvailableBalance(20000, 35000, 10000)).toBe(-5000);
    });

    it('throws on non-integer values', () => {
      expect(() => computeAvailableBalance(100.5, 50, 0)).toThrow(TypeError);
      expect(() => computeAvailableBalance(100, 50.2, 0)).toThrow(TypeError);
      expect(() => computeAvailableBalance(100, 50, 0.5)).toThrow(TypeError);
    });
  });

  describe('Category Activity Calculation', () => {
    const mockTxs: Transaction[] = [
      {
        id: 'tx_1',
        accountId: 'acc_1',
        date: '2026-10-05',
        amountCents: 5000,
        type: 'expense',
        categoryId: 'cat_groceries',
        payee: 'Supermercado',
        notes: '',
        status: 'cleared',
        createdAt: '2026-10-05T10:00:00Z',
        updatedAt: '2026-10-05T10:00:00Z',
      },
      {
        id: 'tx_2',
        accountId: 'acc_1',
        date: '2026-10-10',
        amountCents: 3500,
        type: 'cc_installment',
        categoryId: 'cat_groceries',
        payee: 'Atacado',
        notes: '',
        status: 'cleared',
        createdAt: '2026-10-10T10:00:00Z',
        updatedAt: '2026-10-10T10:00:00Z',
      },
      {
        id: 'tx_3',
        accountId: 'acc_1',
        date: '2026-10-12',
        amountCents: 1500,
        type: 'income', // Category refund/inflow
        categoryId: 'cat_groceries',
        payee: 'Supermercado Estorno',
        notes: '',
        status: 'cleared',
        createdAt: '2026-10-12T10:00:00Z',
        updatedAt: '2026-10-12T10:00:00Z',
      },
      {
        id: 'tx_4',
        accountId: 'acc_1',
        date: '2026-09-25', // Different month
        amountCents: 9000,
        type: 'expense',
        categoryId: 'cat_groceries',
        payee: 'Supermercado Setembro',
        notes: '',
        status: 'cleared',
        createdAt: '2026-09-25T10:00:00Z',
        updatedAt: '2026-09-25T10:00:00Z',
      },
      {
        id: 'tx_5',
        accountId: 'acc_1',
        date: '2026-10-15',
        amountCents: 8000,
        type: 'expense',
        categoryId: 'cat_other', // Different category
        payee: 'Livraria',
        notes: '',
        status: 'cleared',
        createdAt: '2026-10-15T10:00:00Z',
        updatedAt: '2026-10-15T10:00:00Z',
      },
    ];

    it('aggregates category expenses and subtracts category refunds in the given month', () => {
      // 5000 (expense) + 3500 (cc_installment) - 1500 (refund) = 7000
      const activity = calculateCategoryActivity('cat_groceries', '2026-10', mockTxs);
      expect(activity).toBe(7000);
    });

    it('returns 0 for categories with no transactions in the month', () => {
      const activity = calculateCategoryActivity('cat_empty', '2026-10', mockTxs);
      expect(activity).toBe(0);
    });
  });

  describe('To-Be-Budgeted (TBB) Pool Calculation', () => {
    it('computes basic TBB = Income - Assigned', () => {
      expect(computeToBeBudgeted(300000, 250000)).toBe(50000);
    });

    it('computes comprehensive TBB with prior TBB and reset-overspending deduction', () => {
      // Prior TBB: 100.000, Current Income: 300.000, Total Assigned: 350.000, Overspent Deduction: 10.000
      // 100.000 + 300.000 - 350.000 - 10.000 = 40.000
      expect(computeToBeBudgeted(300000, 350000, 100000, 10000)).toBe(40000);
    });

    it('calculates TBB from an array of MonthlyEnvelopes', () => {
      const envelopes: MonthlyEnvelope[] = [
        {
          id: 'cat1_2026-10',
          categoryId: 'cat1',
          yearMonth: '2026-10',
          assignedCents: 150000,
          activityCents: 100000,
          availableCents: 50000,
        },
        {
          id: 'cat2_2026-10',
          categoryId: 'cat2',
          yearMonth: '2026-10',
          assignedCents: 200000,
          activityCents: 180000,
          availableCents: 20000,
        },
      ];

      // Prior TBB 50000 + Income 400000 - Assigned (150000 + 200000 = 350000) = 100000
      const tbb = calculateToBeBudgeted(50000, 400000, envelopes, 0);
      expect(tbb).toBe(100000);
    });
  });

  describe('Monthly Rollover Transitions', () => {
    const currentEnvelopes: MonthlyEnvelope[] = [
      {
        id: 'cat_rent_2026-10',
        categoryId: 'cat_rent',
        yearMonth: '2026-10',
        assignedCents: 200000,
        activityCents: 180000,
        availableCents: 20000, // Positive surplus
      },
      {
        id: 'cat_food_2026-10',
        categoryId: 'cat_food',
        yearMonth: '2026-10',
        assignedCents: 100000,
        activityCents: 125000,
        availableCents: -25000, // Deficit (overspent)
      },
    ];

    it('rolls over in rollover_negative mode carrying forward deficits in envelope', () => {
      const nextEnvelopes = computeMonthTransition(
        currentEnvelopes,
        [],
        '2026-11',
        'rollover_negative'
      );

      expect(nextEnvelopes).toHaveLength(2);

      const nextRent = nextEnvelopes.find((e) => e.categoryId === 'cat_rent');
      expect(nextRent?.availableCents).toBe(20000);
      expect(nextRent?.assignedCents).toBe(0);
      expect(nextRent?.activityCents).toBe(0);
      expect(nextRent?.yearMonth).toBe('2026-11');

      const nextFood = nextEnvelopes.find((e) => e.categoryId === 'cat_food');
      expect(nextFood?.availableCents).toBe(-25000); // Deficit carried forward
    });

    it('rolls over in reset_zero mode resetting deficit to 0', () => {
      const nextEnvelopes = computeMonthTransition(
        currentEnvelopes,
        [],
        '2026-11',
        'reset_zero'
      );

      const nextFood = nextEnvelopes.find((e) => e.categoryId === 'cat_food');
      expect(nextFood?.availableCents).toBe(0); // Reset to zero

      const nextRent = nextEnvelopes.find((e) => e.categoryId === 'cat_rent');
      expect(nextRent?.availableCents).toBe(20000); // Surplus still carried forward
    });

    it('performs detailed month transition deducting reset_zero deficits from next TBB', () => {
      const categories: Category[] = [
        {
          id: 'cat_rent',
          groupId: 'grp_1',
          name: 'Aluguel',
          sortOrder: 1,
          isArchived: false,
          rolloverMode: 'rollover_negative',
        },
        {
          id: 'cat_food',
          groupId: 'grp_1',
          name: 'Alimentação',
          sortOrder: 2,
          isArchived: false,
          rolloverMode: 'reset_zero', // Will deduct from next TBB
        },
      ];

      const res = computeMonthTransitionDetailed(
        currentEnvelopes,
        [],
        '2026-11',
        categories,
        100000 // Current TBB
      );

      expect(res.nextYearMonth).toBe('2026-11');
      expect(res.overspentDeductedCents).toBe(25000);
      // Next starting TBB: 100000 - 25000 = 75000
      expect(res.toBeBudgetCents).toBe(75000);

      const nextFood = res.newEnvelopes.find((e) => e.categoryId === 'cat_food');
      expect(nextFood?.availableCents).toBe(0);

      const nextRent = res.newEnvelopes.find((e) => e.categoryId === 'cat_rent');
      expect(nextRent?.availableCents).toBe(20000);
    });
  });

  describe('Envelope Summary Helper', () => {
    it('summarizes envelope metrics, overspent count, and TBB pool', () => {
      const envelopes: MonthlyEnvelope[] = [
        {
          id: 'c1_2026-10',
          categoryId: 'c1',
          yearMonth: '2026-10',
          assignedCents: 100000,
          activityCents: 50000,
          availableCents: 50000,
        },
        {
          id: 'c2_2026-10',
          categoryId: 'c2',
          yearMonth: '2026-10',
          assignedCents: 50000,
          activityCents: 80000,
          availableCents: -30000, // Overspent
        },
      ];

      const summary = computeEnvelopeSummary(envelopes, 200000, 10000, 0);

      expect(summary.totalAssignedCents).toBe(150000);
      expect(summary.totalActivityCents).toBe(130000);
      expect(summary.totalAvailableCents).toBe(20000);
      expect(summary.overspentCount).toBe(1);
      expect(summary.totalOverspentCents).toBe(30000);
      // TBB: 10000 (prior) + 200000 (income) - 150000 (assigned) = 60000
      expect(summary.toBeBudgetCents).toBe(60000);
    });
  });
});
