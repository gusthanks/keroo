/**
 * src/tests/installments.stress.test.ts
 *
 * Stress tests for the credit card installment engine (src/core/installments.ts):
 * 1. Cent conservation over 10,000 seeded-random inputs plus edge cases:
 *    sum(I_k) === A, with the remainder on the 1st installment.
 * 2. Month-end closing-day clamping from 2024 (leap year) through 2027.
 * 3. Statement closing cutoff mapping and due-date computation.
 * 4. Tabela Price (French amortization) and flat surcharge in exact integer cents.
 * 5. 24-month timeline projection with concurrent overlapping plans.
 */

import { describe, it, expect } from 'vitest';
import {
  isLeapYear,
  getDaysInMonth,
  clampDayToMonth,
  getStatementMonthForPurchase,
  getStatementDueDate,
  allocateInstallmentCents,
  calculateTabelaPrice,
  calculateFlatSurcharge,
  createInstallmentPlan,
  projectInstallmentTimeline,
  getInstallmentObligationForMonth,
} from '../core/installments';

describe('Installments engine stress tests', () => {
  // =========================================================================
  // 1. Cent Conservation: 10,000 Random Combinations + Edge Cases
  // =========================================================================
  describe('Cent Conservation Invariant (10,000 Random + Edge Cases)', () => {
    it('strictly conserves total cents: sum(I_k) === A and all I_k in Z across 10,000 random inputs', () => {
      // Deterministic PRNG (Linear Congruential Generator) for reproducible fuzzing
      let seed = 133742069;
      function nextRandom(): number {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      const TOTAL_RUNS = 10000;
      let failureCount = 0;

      for (let run = 0; run < TOTAL_RUNS; run++) {
        // Total amount A between 1 cent (R$ 0,01) and 10,000,000 cents (R$ 100.000,00)
        const totalAmountCents = Math.floor(nextRandom() * 10000000) + 1;
        // Total installments N between 1 and 24
        const totalInstallments = Math.floor(nextRandom() * 24) + 1;

        const schedule = allocateInstallmentCents(totalAmountCents, totalInstallments);

        // Verification 1: Length === N
        if (schedule.length !== totalInstallments) {
          failureCount++;
          break;
        }

        // Verification 2: All installments are integers
        let sum = 0;
        let allIntegers = true;
        for (let i = 0; i < schedule.length; i++) {
          const inst = schedule[i];
          if (!Number.isInteger(inst)) {
            allIntegers = false;
          }
          sum += inst;
        }

        if (!allIntegers) {
          failureCount++;
          break;
        }

        // Verification 3: Exact cent conservation sum(I_k) === A
        if (sum !== totalAmountCents) {
          failureCount++;
          break;
        }

        // Verification 4: Invariant 2 (First-installment remainder allocation)
        const baseCents = Math.floor(totalAmountCents / totalInstallments);
        const remainder = totalAmountCents % totalInstallments;
        const expectedFirst = baseCents + remainder;

        if (schedule[0] !== expectedFirst) {
          failureCount++;
          break;
        }

        // Verification 5: Tail installments are all identical to baseCents
        for (let k = 1; k < totalInstallments; k++) {
          if (schedule[k] !== baseCents) {
            failureCount++;
            break;
          }
        }

        // Verification 6: First installment absorbs remainder (I_1 >= I_k)
        if (totalInstallments > 1 && schedule[0] < schedule[1]) {
          failureCount++;
          break;
        }
      }

      expect(failureCount).toBe(0);
    });

    it('verifies deterministic edge cases for cent remainder absorption', () => {
      // Case 1: A = 1 cent across 1 to 24 installments
      for (let n = 1; n <= 24; n++) {
        const schedule = allocateInstallmentCents(1, n);
        expect(schedule[0]).toBe(1);
        for (let k = 1; k < n; k++) {
          expect(schedule[k]).toBe(0);
        }
        const sum = schedule.reduce((acc, v) => acc + v, 0);
        expect(sum).toBe(1);
      }

      // Case 2: A = N - 1 (remainder is N - 1, base is 0)
      for (let n = 2; n <= 24; n++) {
        const schedule = allocateInstallmentCents(n - 1, n);
        expect(schedule[0]).toBe(n - 1);
        for (let k = 1; k < n; k++) {
          expect(schedule[k]).toBe(0);
        }
        const sum = schedule.reduce((acc, v) => acc + v, 0);
        expect(sum).toBe(n - 1);
      }

      // Case 3: A = N (remainder is 0, each installment gets exactly 1)
      for (let n = 1; n <= 24; n++) {
        const schedule = allocateInstallmentCents(n, n);
        for (let k = 0; k < n; k++) {
          expect(schedule[k]).toBe(1);
        }
        const sum = schedule.reduce((acc, v) => acc + v, 0);
        expect(sum).toBe(n);
      }

      // Case 4: A = N + 1 (remainder is 1, first gets 2, others get 1)
      for (let n = 2; n <= 24; n++) {
        const schedule = allocateInstallmentCents(n + 1, n);
        expect(schedule[0]).toBe(2);
        for (let k = 1; k < n; k++) {
          expect(schedule[k]).toBe(1);
        }
        const sum = schedule.reduce((acc, v) => acc + v, 0);
        expect(sum).toBe(n + 1);
      }

      // Case 5: Classic R$ 100,00 split into 3 installments (34, 33, 33)
      const r100_3x = allocateInstallmentCents(10000, 3);
      expect(r100_3x).toEqual([3334, 3333, 3333]);
      expect(r100_3x[0] + r100_3x[1] + r100_3x[2]).toBe(10000);

      // Case 6: R$ 100,00 split into 6 installments (10000 / 6 = 1666 rem 4 -> 1670, 1666, 1666, 1666, 1666, 1666)
      const r100_6x = allocateInstallmentCents(10000, 6);
      expect(r100_6x).toEqual([1670, 1666, 1666, 1666, 1666, 1666]);
      expect(r100_6x.reduce((a, b) => a + b, 0)).toBe(10000);

      // Case 7: Maximum tested amount R$ 100.000,00 (10,000,000 cents) across all 24 installments
      for (let n = 1; n <= 24; n++) {
        const maxSchedule = allocateInstallmentCents(10000000, n);
        const sum = maxSchedule.reduce((a, b) => a + b, 0);
        expect(sum).toBe(10000000);
      }
    });

    it('rejects invalid installment counts and negative cents', () => {
      expect(() => allocateInstallmentCents(1000, 0)).toThrow(RangeError);
      expect(() => allocateInstallmentCents(1000, 25)).toThrow(RangeError);
      expect(() => allocateInstallmentCents(1000, 2.5)).toThrow(RangeError);
      expect(() => allocateInstallmentCents(-100, 3)).toThrow();
    });
  });

  // =========================================================================
  // 2. Month-End Date Clamping (4 Consecutive Years 2024-2027)
  // =========================================================================
  describe('Month-End Date Clamping Invariant (2024 Leap Year to 2027 Non-Leap)', () => {
    it('verifies February closing day 31 clamps to exactly 29 in 2024 and 28 in 2025/2026/2027', () => {
      // 2024 is a leap year (366 days, Feb has 29 days)
      expect(isLeapYear(2024)).toBe(true);
      expect(getDaysInMonth(2024, 2)).toBe(29);
      expect(clampDayToMonth(2024, 2, 31)).toBe(29);
      expect(clampDayToMonth(2024, 2, 30)).toBe(29);
      expect(clampDayToMonth(2024, 2, 29)).toBe(29);
      expect(clampDayToMonth(2024, 2, 28)).toBe(28);

      // 2025 is a non-leap year (365 days, Feb has 28 days)
      expect(isLeapYear(2025)).toBe(false);
      expect(getDaysInMonth(2025, 2)).toBe(28);
      expect(clampDayToMonth(2025, 2, 31)).toBe(28);
      expect(clampDayToMonth(2025, 2, 30)).toBe(28);
      expect(clampDayToMonth(2025, 2, 29)).toBe(28);
      expect(clampDayToMonth(2025, 2, 28)).toBe(28);

      // 2026 is a non-leap year (365 days, Feb has 28 days)
      expect(isLeapYear(2026)).toBe(false);
      expect(getDaysInMonth(2026, 2)).toBe(28);
      expect(clampDayToMonth(2026, 2, 31)).toBe(28);
      expect(clampDayToMonth(2026, 2, 30)).toBe(28);
      expect(clampDayToMonth(2026, 2, 29)).toBe(28);
      expect(clampDayToMonth(2026, 2, 28)).toBe(28);

      // 2027 is a non-leap year (365 days, Feb has 28 days)
      expect(isLeapYear(2027)).toBe(false);
      expect(getDaysInMonth(2027, 2)).toBe(28);
      expect(clampDayToMonth(2027, 2, 31)).toBe(28);
      expect(clampDayToMonth(2027, 2, 30)).toBe(28);
      expect(clampDayToMonth(2027, 2, 29)).toBe(28);
      expect(clampDayToMonth(2027, 2, 28)).toBe(28);
    });

    it('verifies closing day 31 across all 48 months of 2024-2027 yields exact month length', () => {
      const years = [2024, 2025, 2026, 2027];
      const thirtyDayMonths = [4, 6, 9, 11];
      const thirtyOneDayMonths = [1, 3, 5, 7, 8, 10, 12];

      for (const y of years) {
        for (let m = 1; m <= 12; m++) {
          const clamped = clampDayToMonth(y, m, 31);
          if (m === 2) {
            expect(clamped).toBe(y === 2024 ? 29 : 28);
          } else if (thirtyDayMonths.includes(m)) {
            expect(clamped).toBe(30);
          } else if (thirtyOneDayMonths.includes(m)) {
            expect(clamped).toBe(31);
          }
        }
      }
    });

    it('verifies days 1 through 28 are never clamped across all 48 months', () => {
      for (const y of [2024, 2025, 2026, 2027]) {
        for (let m = 1; m <= 12; m++) {
          for (let d = 1; d <= 28; d++) {
            expect(clampDayToMonth(y, m, d)).toBe(d);
          }
        }
      }
    });
  });

  // =========================================================================
  // 3. Statement Closing Cutoff Mapping
  // =========================================================================
  describe('Statement Closing Cutoff Mapping Invariant', () => {
    it('verifies purchase on closing day vs 1 day after maps to consecutive statement billing cycles', () => {
      // Test closing day 15 across 12 months of 2026
      for (let m = 1; m <= 12; m++) {
        const monthStr = String(m).padStart(2, '0');
        const purchaseOnClosing = `2026-${monthStr}-15`;
        const purchaseAfterClosing = `2026-${monthStr}-16`;

        const statementSame = getStatementMonthForPurchase(purchaseOnClosing, 15);
        const statementNext = getStatementMonthForPurchase(purchaseAfterClosing, 15);

        expect(statementSame).toBe(`2026-${monthStr}`);

        const expectedNextMonth = m === 12 ? '2027-01' : `2026-${String(m + 1).padStart(2, '0')}`;
        expect(statementNext).toBe(expectedNextMonth);
      }
    });

    it('verifies February leap year (2024) cutoff mapping for closing day 31', () => {
      // In Feb 2024, closing day 31 clamps to 29.
      // Purchase on Feb 29 (closing day) -> '2024-02'
      const billFeb29 = getStatementMonthForPurchase('2024-02-29', 31);
      expect(billFeb29).toBe('2024-02');

      // Purchase 1 day later (Mar 01) -> '2024-03'
      const billMar01 = getStatementMonthForPurchase('2024-03-01', 31);
      expect(billMar01).toBe('2024-03');
    });

    it('verifies February non-leap year (2026) cutoff mapping for closing day 31', () => {
      // In Feb 2026, closing day 31 clamps to 28.
      // Purchase on Feb 28 (closing day) -> '2026-02'
      const billFeb28 = getStatementMonthForPurchase('2026-02-28', 31);
      expect(billFeb28).toBe('2026-02');

      // Purchase 1 day later (Mar 01) -> '2026-03'
      const billMar01 = getStatementMonthForPurchase('2026-03-01', 31);
      expect(billMar01).toBe('2026-03');
    });

    it('verifies 30-day month (April) cutoff mapping for closing day 31', () => {
      // In April 2026, closing day 31 clamps to 30.
      // Purchase on Apr 30 (closing day) -> '2026-04'
      const billApr30 = getStatementMonthForPurchase('2026-04-30', 31);
      expect(billApr30).toBe('2026-04');

      // Purchase on May 01 -> '2026-05'
      const billMay01 = getStatementMonthForPurchase('2026-05-01', 31);
      expect(billMay01).toBe('2026-05');
    });

    it('verifies year-end rollover cutoff mapping (Dec 31 vs Jan 01)', () => {
      // Purchase on Dec 31 with closingDay 31 -> '2026-12'
      expect(getStatementMonthForPurchase('2026-12-31', 31)).toBe('2026-12');
      // Purchase on Jan 01 with closingDay 31 -> '2027-01'
      expect(getStatementMonthForPurchase('2027-01-01', 31)).toBe('2027-01');

      // Purchase on Dec 16 with closingDay 15 -> rolls to '2027-01'
      expect(getStatementMonthForPurchase('2026-12-16', 15)).toBe('2027-01');
    });

    it('computes due dates correctly when dueDay < closingDay vs dueDay >= closingDay', () => {
      // Card A: closingDay = 25, dueDay = 5 (dueDay < closingDay -> due in following month)
      const dueNextMonth = getStatementDueDate('2026-03', 25, 5);
      expect(dueNextMonth).toBe('2026-04-05');

      // Card B: closingDay = 10, dueDay = 20 (dueDay >= closingDay -> due in same month)
      const dueSameMonth = getStatementDueDate('2026-03', 10, 20);
      expect(dueSameMonth).toBe('2026-03-20');

      // Card C: closingDay = 20, dueDay = 31 (dueDay >= closingDay -> same month, clamped in April to 30)
      const dueClamped = getStatementDueDate('2026-04', 20, 31);
      expect(dueClamped).toBe('2026-04-30');

      // Card D: closingDay = 25, dueDay = 31 (dueDay >= closingDay -> same month, clamped in April to 30)
      const dueSameClamped = getStatementDueDate('2026-04', 25, 31);
      expect(dueSameClamped).toBe('2026-04-30');

      // Card E: closingDay = 31, dueDay = 5 in January (dueDay < closingDay -> next month: Feb 05)
      const dueFeb = getStatementDueDate('2026-01', 31, 5);
      expect(dueFeb).toBe('2026-02-05');

      // Card F: closingDay = 31, dueDay = 29 in January (dueDay < closingDay -> next month: Feb)
      // Non-leap 2026: Feb 29 clamps to Feb 28
      const dueFebNonLeap = getStatementDueDate('2026-01', 31, 29);
      expect(dueFebNonLeap).toBe('2026-02-28');

      // Leap 2024: Feb 29 stays Feb 29
      const dueFebLeap = getStatementDueDate('2024-01', 31, 29);
      expect(dueFebLeap).toBe('2024-02-29');
    });
  });

  // =========================================================================
  // 4. Tabela Price Compound Interest Engine Precision
  // =========================================================================
  describe('Tabela Price French Amortization Invariant', () => {
    it('verifies compound monthly interest always yields exact integer cents with principal payoff conservation', () => {
      const testCases = [
        { principal: 100000, rate: 0.0199, installments: 12 }, // R$ 1.000, 1.99%/mo, 12x
        { principal: 250000, rate: 0.0249, installments: 24 }, // R$ 2.500, 2.49%/mo, 24x
        { principal: 50000, rate: 0.035, installments: 6 },    // R$ 500, 3.5%/mo, 6x
        { principal: 1000000, rate: 0.0099, installments: 18 }, // R$ 10.000, 0.99%/mo, 18x
        { principal: 1500, rate: 0.05, installments: 3 },      // R$ 15, 5%/mo, 3x (small amount)
        { principal: 100, rate: 0.02, installments: 2 },       // R$ 1, 2%/mo, 2x (extreme small)
        { principal: 5000000, rate: 0.015, installments: 24 }, // R$ 50.000, 1.5%/mo, 24x
      ];

      for (const tc of testCases) {
        const schedule = calculateTabelaPrice(tc.principal, tc.rate, tc.installments);

        // 1. Total principal strictly conserved
        expect(schedule.totalPrincipalCents).toBe(tc.principal);

        let sumPrincipal = 0;
        let sumInterest = 0;
        let sumAmount = 0;

        for (const item of schedule.items) {
          // 2. All parts are integers
          expect(Number.isInteger(item.amountCents)).toBe(true);
          expect(Number.isInteger(item.principalCents)).toBe(true);
          expect(Number.isInteger(item.interestCents)).toBe(true);
          expect(Number.isInteger(item.remainingPrincipalCents)).toBe(true);

          // 3. Amount === Principal + Interest
          expect(item.amountCents).toBe(item.principalCents + item.interestCents);

          sumPrincipal += item.principalCents;
          sumInterest += item.interestCents;
          sumAmount += item.amountCents;
        }

        // 4. Sum of principal components strictly equals original principal
        expect(sumPrincipal).toBe(tc.principal);

        // 5. Total amount strictly equals sum of amounts and principal + total interest
        expect(schedule.totalAmountCents).toBe(sumAmount);
        expect(schedule.totalAmountCents).toBe(tc.principal + schedule.totalInterestCents);
        expect(schedule.totalInterestCents).toBe(sumInterest);

        // 6. Remaining principal on last installment is exactly 0
        const lastItem = schedule.items[schedule.items.length - 1];
        expect(lastItem.remainingPrincipalCents).toBe(0);
      }
    });

    it('stress tests 1,000 randomized Tabela Price parameter sets', () => {
      let seed = 987654321;
      function nextRandom(): number {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      }

      const rates = [0, 0.005, 0.01, 0.0199, 0.025, 0.0389, 0.05, 0.08, 0.15];

      for (let i = 0; i < 1000; i++) {
        const principal = Math.floor(nextRandom() * 5000000) + 100; // 100 to 5,000,000 cents
        const installments = Math.floor(nextRandom() * 24) + 1;    // 1 to 24
        const rate = rates[Math.floor(nextRandom() * rates.length)];

        const schedule = calculateTabelaPrice(principal, rate, installments);

        // All items length === installments
        expect(schedule.items.length).toBe(installments);

        let sumP = 0;
        let sumI = 0;
        for (const item of schedule.items) {
          sumP += item.principalCents;
          sumI += item.interestCents;
          expect(item.amountCents).toBe(item.principalCents + item.interestCents);
        }

        expect(sumP).toBe(principal);
        expect(schedule.totalPrincipalCents).toBe(principal);
        expect(schedule.totalInterestCents).toBe(sumI);
        expect(schedule.totalAmountCents).toBe(principal + sumI);
        expect(schedule.items[installments - 1].remainingPrincipalCents).toBe(0);
      }
    });

    it('handles zero interest rate as an exact pass-through to allocateInstallmentCents', () => {
      const schedule = calculateTabelaPrice(10000, 0, 3);
      expect(schedule.totalAmountCents).toBe(10000);
      expect(schedule.totalInterestCents).toBe(0);
      expect(schedule.totalPrincipalCents).toBe(10000);
      expect(schedule.items.map((i) => i.amountCents)).toEqual([3334, 3333, 3333]);
      expect(schedule.items.every((i) => i.interestCents === 0)).toBe(true);
    });

    it('calculates flat surcharge fees correctly with integer rounding', () => {
      // 5% surcharge on R$ 1.000,00 (100000 cents) = 5000 cents surcharge -> 105000 total
      const res5 = calculateFlatSurcharge(100000, { percent: 5 });
      expect(res5.surchargeCents).toBe(5000);
      expect(res5.totalAmountCents).toBe(105000);

      // Fixed fee of R$ 15,00 (1500 cents)
      const resFixed = calculateFlatSurcharge(100000, { fixedFeeCents: 1500 });
      expect(resFixed.surchargeCents).toBe(1500);
      expect(resFixed.totalAmountCents).toBe(101500);

      // Both percent and fixed fee
      const resBoth = calculateFlatSurcharge(100000, { percent: 5, fixedFeeCents: 1500 });
      expect(resBoth.surchargeCents).toBe(6500);
      expect(resBoth.totalAmountCents).toBe(106500);
    });
  });

  // =========================================================================
  // 5. 24-Month Visual Timeline Projections
  // =========================================================================
  describe('24-Month Timeline Multi-Plan Projections', () => {
    it('accurately projects concurrent overlapping plans across 24 consecutive months', () => {
      // Plan 1: 3x, R$ 300,00, purchase 2026-01-10 (closing 15, due 25) -> lands on '2026-01', '2026-02', '2026-03'
      const plan1 = createInstallmentPlan({
        id: 'plan_1',
        accountId: 'acc_nubank',
        description: 'Supermarket 3x',
        principalCents: 30000,
        totalInstallments: 3,
        purchaseDate: '2026-01-10',
        closingDay: 15,
        dueDay: 25,
      });

      // Plan 2: 6x, R$ 600,00, purchase 2026-02-16 (after closing 15) -> lands on '2026-03' to '2026-08'
      const plan2 = createInstallmentPlan({
        id: 'plan_2',
        accountId: 'acc_nubank',
        description: 'Smartphone 6x',
        principalCents: 60000,
        totalInstallments: 6,
        purchaseDate: '2026-02-16',
        closingDay: 15,
        dueDay: 25,
      });

      // Plan 3: 12x with 1.99% interest, R$ 1.200,00, purchase 2026-01-01 -> lands on '2026-01' to '2026-12'
      const plan3 = createInstallmentPlan({
        id: 'plan_3',
        accountId: 'acc_nubank',
        description: 'Laptop 12x with interest',
        principalCents: 120000,
        totalInstallments: 12,
        purchaseDate: '2026-01-01',
        closingDay: 15,
        dueDay: 25,
        interestType: 'compound_monthly',
        monthlyInterestRate: 0.0199,
      });

      // Plan 4: 24x, R$ 2.400,00, purchase 2026-01-01 -> lands on '2026-01' to '2027-12'
      const plan4 = createInstallmentPlan({
        id: 'plan_4',
        accountId: 'acc_nubank',
        description: 'Sofa 24x',
        principalCents: 240000,
        totalInstallments: 24,
        purchaseDate: '2026-01-01',
        closingDay: 15,
        dueDay: 25,
      });

      const plans = [plan1, plan2, plan3, plan4];

      const timeline = projectInstallmentTimeline(plans, '2026-01', 24);

      // Verify length is exactly 24 months
      expect(timeline).toHaveLength(24);

      // Verify months are strictly consecutive
      expect(timeline[0].yearMonth).toBe('2026-01');
      expect(timeline[11].yearMonth).toBe('2026-12');
      expect(timeline[12].yearMonth).toBe('2027-01');
      expect(timeline[23].yearMonth).toBe('2027-12');

      // Month-by-month invariant checks
      let cumulativeTimelineTotal = 0;

      for (let m = 0; m < 24; m++) {
        const monthData = timeline[m];
        const ym = monthData.yearMonth;

        // 1. Math consistency: totalAmount === totalPrincipal + totalInterest
        expect(monthData.totalAmountCents).toBe(monthData.totalPrincipalCents + monthData.totalInterestCents);

        // 2. Active count matches items array length
        expect(monthData.activeInstallmentsCount).toBe(monthData.items.length);

        // 3. Direct obligation lookup matches timeline projection
        const directObligation = getInstallmentObligationForMonth(plans, ym);
        expect(monthData.totalAmountCents).toBe(directObligation);

        cumulativeTimelineTotal += monthData.totalAmountCents;
      }

      // 4. Total paid across all 24 months strictly equals sum of all plans' total amounts
      const expectedTotalAcrossAllPlans =
        plan1.totalAmountCents + plan2.totalAmountCents + plan3.totalAmountCents + plan4.totalAmountCents;
      expect(cumulativeTimelineTotal).toBe(expectedTotalAcrossAllPlans);

      // 5. Active plans count checks for specific months:
      // Month 0 (2026-01): Plan 1, Plan 3, Plan 4 active (3 plans)
      expect(timeline[0].activeInstallmentsCount).toBe(3);

      // Month 1 (2026-02): Plan 1, Plan 3, Plan 4 active (3 plans)
      expect(timeline[1].activeInstallmentsCount).toBe(3);

      // Month 2 (2026-03): Plan 1 (last), Plan 2 (1st), Plan 3, Plan 4 active (4 plans - PEAK)
      expect(timeline[2].activeInstallmentsCount).toBe(4);

      // Month 3 (2026-04): Plan 1 finished! Plan 2, Plan 3, Plan 4 active (3 plans - RELIEF)
      expect(timeline[3].activeInstallmentsCount).toBe(3);
      expect(timeline[3].totalAmountCents).toBeLessThan(timeline[2].totalAmountCents);

      // Month 8 (2026-09): Plan 2 finished in 2026-08! Plan 3, Plan 4 active (2 plans - RELIEF)
      expect(timeline[8].activeInstallmentsCount).toBe(2);

      // Month 12 (2027-01): Plan 3 finished in 2026-12! Only Plan 4 active (1 plan)
      expect(timeline[12].activeInstallmentsCount).toBe(1);

      // Month 23 (2027-12): Plan 4 active (1 plan)
      expect(timeline[23].activeInstallmentsCount).toBe(1);
    });

    it('throws RangeError if numMonths is less than 1 or not an integer', () => {
      expect(() => projectInstallmentTimeline([], '2026-01', 0)).toThrow(RangeError);
      expect(() => projectInstallmentTimeline([], '2026-01', -5)).toThrow(RangeError);
      expect(() => projectInstallmentTimeline([], '2026-01', 12.5)).toThrow(RangeError);
    });
  });
});
