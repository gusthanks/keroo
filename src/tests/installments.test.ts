import { describe, it, expect } from 'vitest';
import {
  isLeapYear,
  getDaysInMonth,
  clampDayToMonth,
  formatYearMonth,
  formatISODate,
  parseISODate,
  parseYearMonth,
  addMonths,
  getStatementMonthForPurchase,
  getStatementDueDate,
  allocateInstallmentCents,
  calculateTabelaPrice,
  calculateFlatSurcharge,
  createInstallmentPlan,
  projectInstallmentTimeline,
  getInstallmentObligationForMonth,
} from '../core/installments';
import type { InstallmentPlan } from '../types';

describe('Credit Card Installment Engine (src/core/installments.ts)', () => {
  describe('Month-End Date Clamping & Leap Year Utilities', () => {
    it('identifies leap years accurately', () => {
      expect(isLeapYear(2020)).toBe(true);
      expect(isLeapYear(2024)).toBe(true);
      expect(isLeapYear(2028)).toBe(true);
      expect(isLeapYear(2000)).toBe(true); // divisible by 400

      expect(isLeapYear(2021)).toBe(false);
      expect(isLeapYear(2022)).toBe(false);
      expect(isLeapYear(2023)).toBe(false);
      expect(isLeapYear(2025)).toBe(false);
      expect(isLeapYear(2026)).toBe(false);
      expect(isLeapYear(1900)).toBe(false); // century not div by 400

      expect(() => isLeapYear(2024.5)).toThrow(TypeError);
    });

    it('returns exact days in month for all 12 months including February leap/non-leap', () => {
      // 31-day months: Jan(1), Mar(3), May(5), Jul(7), Aug(8), Oct(10), Dec(12)
      expect(getDaysInMonth(2026, 1)).toBe(31);
      expect(getDaysInMonth(2026, 3)).toBe(31);
      expect(getDaysInMonth(2026, 5)).toBe(31);
      expect(getDaysInMonth(2026, 7)).toBe(31);
      expect(getDaysInMonth(2026, 8)).toBe(31);
      expect(getDaysInMonth(2026, 10)).toBe(31);
      expect(getDaysInMonth(2026, 12)).toBe(31);

      // 30-day months: Apr(4), Jun(6), Sep(9), Nov(11)
      expect(getDaysInMonth(2026, 4)).toBe(30);
      expect(getDaysInMonth(2026, 6)).toBe(30);
      expect(getDaysInMonth(2026, 9)).toBe(30);
      expect(getDaysInMonth(2026, 11)).toBe(30);

      // February: 28 in non-leap, 29 in leap
      expect(getDaysInMonth(2025, 2)).toBe(28);
      expect(getDaysInMonth(2026, 2)).toBe(28);
      expect(getDaysInMonth(2027, 2)).toBe(28);
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(getDaysInMonth(2028, 2)).toBe(29);

      expect(() => getDaysInMonth(2026, 0)).toThrow(RangeError);
      expect(() => getDaysInMonth(2026, 13)).toThrow(RangeError);
    });

    it('clamps target day D to min(D, daysInMonth(Y, M)) (Invariant 5)', () => {
      // Day 31 clamped in 30-day month (April)
      expect(clampDayToMonth(2026, 4, 31)).toBe(30);
      expect(clampDayToMonth(2026, 4, 30)).toBe(30);
      expect(clampDayToMonth(2026, 4, 15)).toBe(15);

      // Day 31 clamped in February non-leap (2026) -> 28
      expect(clampDayToMonth(2026, 2, 31)).toBe(28);
      expect(clampDayToMonth(2026, 2, 30)).toBe(28);
      expect(clampDayToMonth(2026, 2, 29)).toBe(28);
      expect(clampDayToMonth(2026, 2, 28)).toBe(28);

      // Day 31 clamped in February leap (2024) -> 29
      expect(clampDayToMonth(2024, 2, 31)).toBe(29);
      expect(clampDayToMonth(2024, 2, 30)).toBe(29);
      expect(clampDayToMonth(2024, 2, 29)).toBe(29);
      expect(clampDayToMonth(2024, 2, 28)).toBe(28);

      // 31-day month: preserved
      expect(clampDayToMonth(2026, 1, 31)).toBe(31);
      expect(clampDayToMonth(2026, 3, 31)).toBe(31);
    });

    it('formats and parses ISO dates and YearMonths with zero distortion', () => {
      expect(formatISODate(2026, 2, 31)).toBe('2026-02-28');
      expect(formatISODate(2024, 2, 31)).toBe('2024-02-29');
      expect(formatISODate(2026, 10, 16)).toBe('2026-10-16');

      expect(formatYearMonth(2026, 5)).toBe('2026-05');
      expect(formatYearMonth(2026, 12)).toBe('2026-12');

      expect(parseISODate('2026-10-16')).toEqual({ year: 2026, month: 10, day: 16 });
      expect(parseYearMonth('2026-10')).toEqual({ year: 2026, month: 10 });

      expect(addMonths(2026, 10, 1)).toEqual({ year: 2026, month: 11 });
      expect(addMonths(2026, 10, 3)).toEqual({ year: 2027, month: 1 });
      expect(addMonths(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
      expect(addMonths(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    });
  });

  describe('First-Installment Cent Remainder Allocation (Invariant 2)', () => {
    it('allocates remainder strictly to 1st installment: R$ 100,00 in 3x = 3334, 3333, 3333', () => {
      const parts = allocateInstallmentCents(10000, 3);
      expect(parts).toEqual([3334, 3333, 3333]);
      const sum = parts.reduce((a, b) => a + b, 0);
      expect(sum).toBe(10000);
    });

    it('allocates remainder strictly to 1st installment: R$ 10,00 in 7x', () => {
      // 1000 / 7 = 142 remainder 6 -> 142 + 6 = 148 on 1st, 142 on remaining 6
      const parts = allocateInstallmentCents(1000, 7);
      expect(parts).toHaveLength(7);
      expect(parts[0]).toBe(148);
      for (let i = 1; i < 7; i++) {
        expect(parts[i]).toBe(142);
      }
      const sum = parts.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1000);
    });

    it('allocates remainder strictly to 1st installment: 1 cent in 10x', () => {
      // 1 / 10 = 0 remainder 1 -> 1 on 1st, 0 on remaining 9
      const parts = allocateInstallmentCents(1, 10);
      expect(parts).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const sum = parts.reduce((a, b) => a + b, 0);
      expect(sum).toBe(1);
    });

    it('conserves exact total sum sum(I_k) === A for all N in [1, 24] with various odd amounts', () => {
      const testAmounts = [1, 2, 7, 10, 99, 100, 333, 1000, 10000, 10001, 240000, 999999];

      for (const amount of testAmounts) {
        for (let N = 1; N <= 24; N++) {
          const parts = allocateInstallmentCents(amount, N);
          expect(parts).toHaveLength(N);

          const sum = parts.reduce((a, b) => a + b, 0);
          expect(sum).toBe(amount);

          // Invariant 2 checks
          const base = Math.floor(amount / N);
          const remainder = amount % N;
          expect(parts[0]).toBe(base + remainder);
          for (let k = 1; k < N; k++) {
            expect(parts[k]).toBe(base);
          }
        }
      }
    });

    it('handles 1x (single installment) cleanly with zero remainder', () => {
      const parts = allocateInstallmentCents(5000, 1);
      expect(parts).toEqual([5000]);
    });

    it('handles 0 cents input cleanly', () => {
      const parts = allocateInstallmentCents(0, 5);
      expect(parts).toEqual([0, 0, 0, 0, 0]);
    });

    it('throws RangeError on invalid N (< 1 or > 24)', () => {
      expect(() => allocateInstallmentCents(1000, 0)).toThrow(RangeError);
      expect(() => allocateInstallmentCents(1000, 25)).toThrow(RangeError);
      expect(() => allocateInstallmentCents(1000, 3.5)).toThrow(RangeError);
    });
  });

  describe('Statement Mapping & Closing Day Cutoffs', () => {
    it('lands on current month bill if purchase date <= closing day', () => {
      // Closing day 20: purchase on Oct 16 <= 20 -> Oct bill ('2026-10')
      expect(getStatementMonthForPurchase('2026-10-16', 20)).toBe('2026-10');
      // Purchase exactly on closing day 20 -> Oct bill ('2026-10')
      expect(getStatementMonthForPurchase('2026-10-20', 20)).toBe('2026-10');
      // Purchase on day 1 -> Oct bill ('2026-10')
      expect(getStatementMonthForPurchase('2026-10-01', 20)).toBe('2026-10');
    });

    it('lands on next month bill if purchase date > closing day', () => {
      // Closing day 20: purchase on Oct 21 > 20 -> Nov bill ('2026-11')
      expect(getStatementMonthForPurchase('2026-10-21', 20)).toBe('2026-11');
      // Purchase on Oct 31 > 20 -> Nov bill ('2026-11')
      expect(getStatementMonthForPurchase('2026-10-31', 20)).toBe('2026-11');
    });

    it('advances year boundary when December purchase is made after closing day', () => {
      // Closing day 15: purchase on Dec 20 > 15 -> Jan of next year ('2027-01')
      expect(getStatementMonthForPurchase('2026-12-20', 15)).toBe('2027-01');
      // Purchase on Dec 10 <= 15 -> Dec bill ('2026-12')
      expect(getStatementMonthForPurchase('2026-12-10', 15)).toBe('2026-12');
    });

    it('clamps closing day for February and 30-day months', () => {
      // Closing day 31 in April (30 days): clamped to 30. Purchase on Apr 30 <= 30 -> Apr bill
      expect(getStatementMonthForPurchase('2026-04-30', 31)).toBe('2026-04');

      // Closing day 31 in Feb 2026 (28 days): clamped to 28. Purchase on Feb 28 <= 28 -> Feb bill
      expect(getStatementMonthForPurchase('2026-02-28', 31)).toBe('2026-02');
    });

    it('calculates statement due date with proper month placement and clamping', () => {
      // dueDay (27) >= closingDay (20): same month
      expect(getStatementDueDate('2026-10', 20, 27)).toBe('2026-10-27');

      // dueDay (5) < closingDay (25): next month
      expect(getStatementDueDate('2026-10', 25, 5)).toBe('2026-11-05');

      // dueDay (31) clamped in February
      expect(getStatementDueDate('2026-02', 10, 31)).toBe('2026-02-28');
      expect(getStatementDueDate('2024-02', 10, 31)).toBe('2024-02-29');

      // Year boundary for dueDay < closingDay in December
      expect(getStatementDueDate('2026-12', 25, 5)).toBe('2027-01-05');
    });
  });

  describe('Tabela Price Compound Interest & Surcharge Calculations', () => {
    it('calculates exact Tabela Price amortization with zero balance at end', () => {
      // R$ 1.000,00 (100000 cents) at 1.99% per month for 3 installments
      const schedule = calculateTabelaPrice(100000, 0.0199, 3);
      expect(schedule.items).toHaveLength(3);
      expect(schedule.totalPrincipalCents).toBe(100000);

      // Verify each installment amount = principal + interest
      let accumulatedPrincipal = 0;
      let accumulatedInterest = 0;
      for (const item of schedule.items) {
        expect(item.amountCents).toBe(item.principalCents + item.interestCents);
        accumulatedPrincipal += item.principalCents;
        accumulatedInterest += item.interestCents;
      }

      expect(accumulatedPrincipal).toBe(100000);
      expect(accumulatedInterest).toBe(schedule.totalInterestCents);
      expect(schedule.totalAmountCents).toBe(100000 + accumulatedInterest);
      // Final remaining principal is 0
      expect(schedule.items[2].remainingPrincipalCents).toBe(0);
    });

    it('handles zero interest rate cleanly in calculateTabelaPrice', () => {
      const schedule = calculateTabelaPrice(10000, 0, 3);
      expect(schedule.totalAmountCents).toBe(10000);
      expect(schedule.totalInterestCents).toBe(0);
      expect(schedule.items[0].amountCents).toBe(3334);
      expect(schedule.items[1].amountCents).toBe(3333);
      expect(schedule.items[2].amountCents).toBe(3333);
    });

    it('calculates flat percentage surcharge fees', () => {
      // 5% surcharge on R$ 100,00 (10000 cents) = 500 cents -> total 10500 cents
      const result = calculateFlatSurcharge(10000, { percent: 5 });
      expect(result.surchargeCents).toBe(500);
      expect(result.totalAmountCents).toBe(10500);
    });

    it('calculates fixed fee surcharge', () => {
      const result = calculateFlatSurcharge(10000, { fixedFeeCents: 350 });
      expect(result.surchargeCents).toBe(350);
      expect(result.totalAmountCents).toBe(10350);
    });

    it('calculates combined percent and fixed fee surcharge', () => {
      const result = calculateFlatSurcharge(10000, { percent: 5, fixedFeeCents: 200 });
      expect(result.surchargeCents).toBe(700);
      expect(result.totalAmountCents).toBe(10700);
    });
  });

  describe('Full Installment Plan Generator & Timeline Projections', () => {
    it('creates a clean 3x installment plan with closing day cutoff and remainder allocation', () => {
      const plan = createInstallmentPlan({
        id: 'plan_test_notebook',
        accountId: 'acc_nubank_card',
        description: 'Notebook Dell Inspiron',
        principalCents: 240001, // R$ 2.400,01 -> 1 cent remainder
        totalInstallments: 3,
        purchaseDate: '2026-10-16', // <= closingDay 20 -> starts 2026-10
        closingDay: 20,
        dueDay: 27,
      });

      expect(plan.id).toBe('plan_test_notebook');
      expect(plan.totalAmountCents).toBe(240001);
      expect(plan.originalPrincipalCents).toBe(240001);
      expect(plan.totalInstallments).toBe(3);
      expect(plan.installments).toHaveLength(3);

      // Remainder cent on 1st installment
      expect(plan.installments[0].amountCents).toBe(80001);
      expect(plan.installments[0].statementMonth).toBe('2026-10');
      expect(plan.installments[0].dueDate).toBe('2026-10-27');
      expect(plan.installments[0].index).toBe(1);

      expect(plan.installments[1].amountCents).toBe(80000);
      expect(plan.installments[1].statementMonth).toBe('2026-11');
      expect(plan.installments[1].dueDate).toBe('2026-11-27');
      expect(plan.installments[1].index).toBe(2);

      expect(plan.installments[2].amountCents).toBe(80000);
      expect(plan.installments[2].statementMonth).toBe('2026-12');
      expect(plan.installments[2].dueDate).toBe('2026-12-27');
      expect(plan.installments[2].index).toBe(3);

      const totalSum = plan.installments.reduce((sum, inst) => sum + inst.amountCents, 0);
      expect(totalSum).toBe(240001);
    });

    it('creates an installment plan with compound interest (Tabela Price)', () => {
      const plan = createInstallmentPlan({
        accountId: 'acc_card',
        description: 'Smartphone 12x Financiado',
        principalCents: 120000, // R$ 1.200,00
        totalInstallments: 12,
        purchaseDate: '2026-10-25', // > closingDay 20 -> starts 2026-11
        closingDay: 20,
        dueDay: 27,
        interestType: 'compound_monthly',
        monthlyInterestRate: 0.02, // 2% / mo
      });

      expect(plan.interestType).toBe('compound_monthly');
      expect(plan.interestRateMonthly).toBe(0.02);
      expect(plan.installments).toHaveLength(12);
      expect(plan.installments[0].statementMonth).toBe('2026-11');

      // Verify total conservation
      const sumAmounts = plan.installments.reduce((acc, i) => acc + i.amountCents, 0);
      expect(sumAmounts).toBe(plan.totalAmountCents);
      expect(plan.totalAmountCents).toBeGreaterThan(120000);
    });

    it('creates an installment plan with flat surcharge', () => {
      const plan = createInstallmentPlan({
        accountId: 'acc_card',
        description: 'Furniture with 10% fee',
        principalCents: 100000,
        totalInstallments: 5,
        purchaseDate: '2026-10-10',
        closingDay: 20,
        dueDay: 27,
        interestType: 'flat_surcharge',
        surchargePercent: 10,
      });

      expect(plan.totalAmountCents).toBe(110000);
      expect(plan.installments).toHaveLength(5);
      const sum = plan.installments.reduce((a, b) => a + b.amountCents, 0);
      expect(sum).toBe(110000);
      expect(plan.installments[0].amountCents).toBe(22000);
    });

    it('projects a 24-month visual timeline accurately across multiple plans', () => {
      const planA: InstallmentPlan = createInstallmentPlan({
        id: 'plan_A',
        accountId: 'acc_card',
        description: 'Plan A (3x)',
        principalCents: 30000,
        totalInstallments: 3,
        purchaseDate: '2026-10-15',
        closingDay: 20,
        dueDay: 27,
      });

      const planB: InstallmentPlan = createInstallmentPlan({
        id: 'plan_B',
        accountId: 'acc_card',
        description: 'Plan B (6x)',
        principalCents: 60000,
        totalInstallments: 6,
        purchaseDate: '2026-11-10',
        closingDay: 20,
        dueDay: 27,
      });

      const timeline = projectInstallmentTimeline([planA, planB], '2026-10', 12);
      expect(timeline).toHaveLength(12);

      // Month 0: 2026-10 has only Plan A index 1 (10000 cents)
      expect(timeline[0].yearMonth).toBe('2026-10');
      expect(timeline[0].totalAmountCents).toBe(10000);
      expect(timeline[0].activeInstallmentsCount).toBe(1);

      // Month 1: 2026-11 has Plan A index 2 (10000) + Plan B index 1 (10000) = 20000
      expect(timeline[1].yearMonth).toBe('2026-11');
      expect(timeline[1].totalAmountCents).toBe(20000);
      expect(timeline[1].activeInstallmentsCount).toBe(2);

      // Month 2: 2026-12 has Plan A index 3 (10000) + Plan B index 2 (10000) = 20000
      expect(timeline[2].yearMonth).toBe('2026-12');
      expect(timeline[2].totalAmountCents).toBe(20000);

      // Month 3: 2027-01 has only Plan B index 3 (10000) (Plan A finished!)
      expect(timeline[3].yearMonth).toBe('2027-01');
      expect(timeline[3].totalAmountCents).toBe(10000);
      expect(timeline[3].activeInstallmentsCount).toBe(1);

      // Verify getInstallmentObligationForMonth
      expect(getInstallmentObligationForMonth([planA, planB], '2026-11')).toBe(20000);
      expect(getInstallmentObligationForMonth([planA, planB], '2027-01')).toBe(10000);
      expect(getInstallmentObligationForMonth([planA, planB], '2027-10')).toBe(0);
    });
  });
  describe('Regression: flat surcharge split & strict date parsing', () => {
    it('never produces negative interest per installment and keeps exact sums', () => {
      // Old code: interest_1 = 10 - 18 = -8 cents.
      const plan = createInstallmentPlan({
        accountId: 'acc_card',
        description: 'Tiny fee',
        principalCents: 99,
        totalInstallments: 10,
        purchaseDate: '2026-10-10',
        closingDay: 20,
        dueDay: 27,
        interestType: 'flat_surcharge',
        surchargeFeeCents: 1,
      });
      const sumAmount = plan.installments.reduce((a, b) => a + b.amountCents, 0);
      const sumInterest = plan.installments.reduce((a, b) => a + b.interestCents, 0);
      const sumPrincipal = plan.installments.reduce((a, b) => a + b.principalCents, 0);
      expect(sumAmount).toBe(plan.totalAmountCents);
      expect(sumInterest).toBe(1);
      expect(sumPrincipal).toBe(99);
      for (const it of plan.installments) {
        expect(it.interestCents).toBeGreaterThanOrEqual(0);
        expect(it.principalCents).toBeGreaterThanOrEqual(0);
        expect(it.principalCents + it.interestCents).toBe(it.amountCents);
      }
    });

    it('keeps exact sums with a percentage surcharge and remainders on the 1st installment', () => {
      const plan = createInstallmentPlan({
        accountId: 'acc_card',
        description: 'Odd fee',
        principalCents: 100001,
        totalInstallments: 7,
        purchaseDate: '2026-10-10',
        closingDay: 20,
        dueDay: 27,
        interestType: 'flat_surcharge',
        surchargePercent: 3,
      });
      const surcharge = plan.totalAmountCents - 100001;
      expect(plan.installments.reduce((a, b) => a + b.interestCents, 0)).toBe(surcharge);
      expect(plan.installments.reduce((a, b) => a + b.amountCents, 0)).toBe(plan.totalAmountCents);
      expect(plan.installments.every((i) => i.interestCents >= 0)).toBe(true);
    });

    it('parseISODate rejects impossible months and days with RangeError', () => {
      expect(() => parseISODate('2026-13-01')).toThrow(RangeError);
      expect(() => parseISODate('2026-00-10')).toThrow(RangeError);
      expect(() => parseISODate('2026-02-30')).toThrow(RangeError);
      expect(() => parseISODate('2026-04-31')).toThrow(RangeError);
      expect(parseISODate('2028-02-29')).toEqual({ year: 2028, month: 2, day: 29 });
    });
  });
});
