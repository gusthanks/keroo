/**
 * src/tests/subscriptionsSplit.stress.test.ts
 *
 * Stress tests for the subscriptions radar and the bilateral split ledger:
 * 1. Anchor-day preservation across 48 monthly billing cycles (Jan 2026 - Dec 2029)
 *    with zero schedule drift across 30-day months, leap-year Feb 29 (2028),
 *    and non-leap Feb 28.
 * 2. 5-state status machine exact boundary transitions (today, +/- 1..4 days, leap year, month/year ends).
 * 3. 3-day check-in window detector (speech bubble queue: 1, 2, 3 days included; 4+ excluded).
 * 4. Bilateral debt netting across 50 alternating transactions, odd-cent payer absorption (1, 3, 5, 10001 cents),
 *    zero-sum invariance at every step, and full settlement reconciliation to exactly 0 cents.
 */

import { describe, it, expect } from 'vitest';
import {
  advanceNextDueDate,
  projectSubscriptionCycles,
  evaluateSubscriptionStatus,
  refreshBillStatus,
  getUpcomingCheckInQueue,
  recordBillPayment,
  getCalendarDayDifference,
  addDaysToISODate,
} from '../core/subscriptions';
import {
  split50_50,
  splitEqual,
  createSplitExpense,
  calculateBilateralNetBalance,
  calculateBilateralSummary,
  createSettlement,
  createFullSettlement,
} from '../core/split';
import type { RecurringBill, SplitExpense, SplitSettlement, ISODate } from '../types';

describe('Subscriptions radar & bilateral split netting stress tests', () => {
  // ==========================================================================
  // 1. Anchor-Day Preservation Stress Test (48 Months & Leap Year 2028)
  // ==========================================================================
  describe('1. Anchor-Day Preservation Invariant (48 Billing Cycles)', () => {
    it('projects 48 monthly cycles from 2026-01-31 to 2029-12-31 with zero schedule drift', () => {
      const cycles = projectSubscriptionCycles('2026-01-31', 'monthly', 31, 48);

      expect(cycles).toHaveLength(48);

      const months31 = [1, 3, 5, 7, 8, 10, 12];
      const months30 = [4, 6, 9, 11];

      let count31 = 0;
      let count30 = 0;
      let countFebNonLeap = 0;
      let countFebLeap = 0;

      for (let i = 0; i < 48; i++) {
        const dateStr = cycles[i];
        const [yearStr, monthStr, dayStr] = dateStr.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const day = parseInt(dayStr, 10);

        // Verify sequence year and month match expectations
        const expectedYear = 2026 + Math.floor(i / 12);
        const expectedMonth = (i % 12) + 1;
        expect(year).toBe(expectedYear);
        expect(month).toBe(expectedMonth);

        if (month === 2) {
          if (year === 2028) {
            // Leap year February must land on 29
            expect(day).toBe(29);
            expect(dateStr).toBe('2028-02-29');
            countFebLeap++;
          } else {
            // Non-leap February must land on 28
            expect(day).toBe(28);
            expect(dateStr).toBe(`${year}-02-28`);
            countFebNonLeap++;
          }
        } else if (months30.includes(month)) {
          // 30-day month must clamp to 30
          expect(day).toBe(30);
          count30++;
        } else if (months31.includes(month)) {
          // 31-day month MUST land on 31 with ZERO drift to 28 or 30!
          expect(day).toBe(31);
          count31++;
        } else {
          throw new Error(`Unexpected month: ${month}`);
        }
      }

      // Assert exact distribution across 4 full years (48 months)
      expect(count31).toBe(7 * 4); // 28 months with 31 days
      expect(count30).toBe(4 * 4); // 16 months with 30 days
      expect(countFebNonLeap).toBe(3); // 2026, 2027, 2029
      expect(countFebLeap).toBe(1); // 2028
    });

    it('simulates 48 sequential payments via recordBillPayment without anchor day corruption', () => {
      let bill: RecurringBill = {
        id: 'bill_gym_vip',
        name: 'Gym VIP Subscription',
        amountCents: 12900, // R$ 129,00
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 31,
        startDate: '2026-01-31',
        nextDueDate: '2026-01-31',
        paymentStatus: 'DUE_TODAY',
        categoryId: 'cat_health',
        paymentAccountId: 'acc_main',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const recordedDates: ISODate[] = [bill.nextDueDate];

      for (let cycle = 0; cycle < 47; cycle++) {
        const paymentDate = bill.nextDueDate;
        bill = recordBillPayment(bill, paymentDate);
        recordedDates.push(bill.nextDueDate);

        // Crucial invariant: anchorDay property is never overwritten or mutated
        expect(bill.anchorDay).toBe(31);
      }

      expect(recordedDates).toHaveLength(48);

      // Verify that after 2026-02-28, March immediately recovers to 31
      expect(recordedDates[1]).toBe('2026-02-28');
      expect(recordedDates[2]).toBe('2026-03-31');

      // Verify 2028 leap year February lands on 29
      expect(recordedDates[25]).toBe('2028-02-29');
      expect(recordedDates[26]).toBe('2028-03-31');

      // Verify final cycle in Dec 2029 lands on 31
      expect(recordedDates[47]).toBe('2029-12-31');
    });

    it('preserves anchorDay=30 across February in 4 consecutive years', () => {
      const cycles = projectSubscriptionCycles('2026-01-30', 'monthly', 30, 48);
      expect(cycles).toHaveLength(48);

      for (let i = 0; i < 48; i++) {
        const dateStr = cycles[i];
        const [, mStr, dStr] = dateStr.split('-');
        const month = parseInt(mStr, 10);
        const day = parseInt(dStr, 10);
        const year = parseInt(dateStr.split('-')[0], 10);

        if (month === 2) {
          if (year === 2028) {
            expect(day).toBe(29);
          } else {
            expect(day).toBe(28);
          }
        } else {
          // All other months have at least 30 days, so day must be exactly 30
          expect(day).toBe(30);
        }
      }
    });

    it('directly tests advanceNextDueDate preserving anchorDay=31 when advancing past short months', () => {
      // 2026-02-28 with anchorDay 31 advances to 2026-03-31
      expect(advanceNextDueDate('2026-02-28', 'monthly', 31)).toBe('2026-03-31');
      // 2028-02-29 (leap) with anchorDay 31 advances to 2028-03-31
      expect(advanceNextDueDate('2028-02-29', 'monthly', 31)).toBe('2028-03-31');
      // 2026-04-30 with anchorDay 31 advances to 2026-05-31
      expect(advanceNextDueDate('2026-04-30', 'monthly', 31)).toBe('2026-05-31');
    });

    it('verifies day arithmetic utilities across month and year boundaries', () => {
      expect(getCalendarDayDifference('2026-02-28', '2026-03-01')).toBe(1);
      expect(getCalendarDayDifference('2026-12-31', '2027-01-01')).toBe(1);
      expect(addDaysToISODate('2026-02-28', 1)).toBe('2026-03-01');
      expect(addDaysToISODate('2028-02-28', 1)).toBe('2028-02-29'); // Leap day
    });
  });

  // ==========================================================================
  // 2. 5-State Status Machine Exact Boundary Stress Tests
  // ==========================================================================
  describe('2. 5-State Status Machine Exact Boundaries', () => {
    const referenceDate = '2026-06-15';

    it('classifies exact status transitions for regular mid-month dates', () => {
      // 4 days before due -> UPCOMING_SAFE
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-19' }, referenceDate)
      ).toBe('UPCOMING_SAFE');

      // 3 days before due -> DUE_SOON
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-18' }, referenceDate)
      ).toBe('DUE_SOON');

      // 2 days before due -> DUE_SOON
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-17' }, referenceDate)
      ).toBe('DUE_SOON');

      // 1 day before due -> DUE_SOON
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-16' }, referenceDate)
      ).toBe('DUE_SOON');

      // Due today -> DUE_TODAY
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-15' }, referenceDate)
      ).toBe('DUE_TODAY');

      // 1 day past due -> OVERDUE
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-14' }, referenceDate)
      ).toBe('OVERDUE');

      // 2 days past due -> OVERDUE
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-06-13' }, referenceDate)
      ).toBe('OVERDUE');

      // 30 days past due -> OVERDUE
      expect(
        evaluateSubscriptionStatus({ nextDueDate: '2026-05-16' }, referenceDate)
      ).toBe('OVERDUE');
    });

    it('stored PAID_OK is cycle-aware; isPaidForCurrentCycle still overrides', () => {
      // Stored PAID_OK but the next cycle is 10 days overdue -> falls back to date-based status
      expect(
        evaluateSubscriptionStatus(
          { nextDueDate: '2026-06-05', paymentStatus: 'PAID_OK' },
          referenceDate
        )
      ).toBe('OVERDUE');

      // Due today, but isPaidForCurrentCycle is true
      expect(
        evaluateSubscriptionStatus(
          { nextDueDate: referenceDate, isPaidForCurrentCycle: true },
          referenceDate
        )
      ).toBe('PAID_OK');
    });

    it('handles month-end boundaries (February non-leap to March)', () => {
      const feb28 = '2026-02-28';

      // 1 day before due (due Mar 01)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-03-01' }, feb28)).toBe('DUE_SOON');
      // 2 days before due (due Mar 02)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-03-02' }, feb28)).toBe('DUE_SOON');
      // 3 days before due (due Mar 03)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-03-03' }, feb28)).toBe('DUE_SOON');
      // 4 days before due (due Mar 04) -> UPCOMING_SAFE
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-03-04' }, feb28)).toBe('UPCOMING_SAFE');
      // 1 day past due (due Feb 27)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-02-27' }, feb28)).toBe('OVERDUE');
    });

    it('handles leap day boundary (2028-02-28 and 2028-02-29)', () => {
      const feb28Leap = '2028-02-28';

      // Due on leap day Feb 29 (+1 day)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2028-02-29' }, feb28Leap)).toBe('DUE_SOON');
      // Due Mar 01 (+2 days in leap year)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2028-03-01' }, feb28Leap)).toBe('DUE_SOON');
      // Due Mar 02 (+3 days)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2028-03-02' }, feb28Leap)).toBe('DUE_SOON');
      // Due Mar 03 (+4 days)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2028-03-03' }, feb28Leap)).toBe('UPCOMING_SAFE');

      // On leap day itself
      const feb29Leap = '2028-02-29';
      expect(evaluateSubscriptionStatus({ nextDueDate: '2028-02-29' }, feb29Leap)).toBe('DUE_TODAY');
      expect(evaluateSubscriptionStatus({ nextDueDate: '2028-02-28' }, feb29Leap)).toBe('OVERDUE');
    });

    it('handles year-end rollover boundary (2026-12-31 to 2027-01-01)', () => {
      const dec31 = '2026-12-31';

      expect(evaluateSubscriptionStatus({ nextDueDate: '2027-01-01' }, dec31)).toBe('DUE_SOON');
      expect(evaluateSubscriptionStatus({ nextDueDate: '2027-01-02' }, dec31)).toBe('DUE_SOON');
      expect(evaluateSubscriptionStatus({ nextDueDate: '2027-01-03' }, dec31)).toBe('DUE_SOON');
      expect(evaluateSubscriptionStatus({ nextDueDate: '2027-01-04' }, dec31)).toBe('UPCOMING_SAFE');
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-12-30' }, dec31)).toBe('OVERDUE');
    });

    it('updates bill paymentStatus dynamically via refreshBillStatus', () => {
      const bill: RecurringBill = {
        id: 'bill_status_check',
        name: 'Internet Provider',
        amountCents: 9990,
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 18,
        startDate: '2026-05-18',
        nextDueDate: '2026-06-18',
        paymentStatus: 'UPCOMING_SAFE',
        categoryId: 'cat_utility',
        paymentAccountId: 'acc_main',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      // 4 days before (June 14) -> UPCOMING_SAFE
      expect(refreshBillStatus(bill, '2026-06-14')).toBe('UPCOMING_SAFE');
      // 3 days before (June 15) -> DUE_SOON
      expect(refreshBillStatus(bill, '2026-06-15')).toBe('DUE_SOON');
      // Due day (June 18) -> DUE_TODAY
      expect(refreshBillStatus(bill, '2026-06-18')).toBe('DUE_TODAY');
      // 1 day after (June 19) -> OVERDUE
      expect(refreshBillStatus(bill, '2026-06-19')).toBe('OVERDUE');
    });
  });

  // ==========================================================================
  // 3. Proactive 3-Day Window Detector Stress Tests
  // ==========================================================================
  describe('3. Proactive 3-Day Window Detector (Speech Bubble Queue)', () => {
    const today = '2026-10-16';

    const createTestBill = (
      id: string,
      nextDueDate: ISODate,
      overrides?: Partial<RecurringBill>
    ): RecurringBill => ({
      id,
      name: `Bill ${id}`,
      amountCents: 5000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 16,
      startDate: '2026-01-01',
      nextDueDate,
      paymentStatus: 'UPCOMING_SAFE',
      categoryId: 'cat_bills',
      paymentAccountId: 'acc_main',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    });

    it('captures bills due in 1, 2, and 3 days while excluding bills due in 4 days', () => {
      const bills: RecurringBill[] = [
        createTestBill('bill_1d', '2026-10-17', { amountCents: 1000 }), // +1 day
        createTestBill('bill_2d', '2026-10-18', { amountCents: 2000 }), // +2 days
        createTestBill('bill_3d', '2026-10-19', { amountCents: 3000 }), // +3 days
        createTestBill('bill_4d', '2026-10-20', { amountCents: 4000 }), // +4 days (MUST BE EXCLUDED)
        createTestBill('bill_5d', '2026-10-21', { amountCents: 5000 }), // +5 days (MUST BE EXCLUDED)
        createTestBill('bill_30d', '2026-11-15', { amountCents: 9000 }), // +30 days (EXCLUDED)
      ];

      const queue = getUpcomingCheckInQueue(bills, today);
      const queueIds = queue.map((q) => q.bill.id);

      expect(queueIds).toContain('bill_1d');
      expect(queueIds).toContain('bill_2d');
      expect(queueIds).toContain('bill_3d');
      expect(queueIds).not.toContain('bill_4d');
      expect(queueIds).not.toContain('bill_5d');
      expect(queueIds).not.toContain('bill_30d');
      expect(queue).toHaveLength(3);
    });

    it('prioritizes OVERDUE (oldest first) -> DUE_TODAY -> DUE_SOON (closest first)', () => {
      const bills: RecurringBill[] = [
        createTestBill('b_due_today', '2026-10-16', { amountCents: 8000 }), // 0 days
        createTestBill('b_overdue_old', '2026-10-10', { amountCents: 5000 }), // -6 days
        createTestBill('b_overdue_recent', '2026-10-15', { amountCents: 9000 }), // -1 day
        createTestBill('b_due_3d', '2026-10-19', { amountCents: 3000 }), // +3 days
        createTestBill('b_due_1d', '2026-10-17', { amountCents: 4000 }), // +1 day
        createTestBill('b_due_2d', '2026-10-18', { amountCents: 6000 }), // +2 days
      ];

      const queue = getUpcomingCheckInQueue(bills, today);

      expect(queue.map((q) => q.bill.id)).toEqual([
        'b_overdue_old',    // -6 days overdue (oldest first)
        'b_overdue_recent', // -1 day overdue
        'b_due_today',      // due today
        'b_due_1d',         // due in 1 day
        'b_due_2d',         // due in 2 days
        'b_due_3d',         // due in 3 days
      ]);

      expect(queue[0].urgencyLevel).toBe('critical');
      expect(queue[1].urgencyLevel).toBe('critical');
      expect(queue[2].urgencyLevel).toBe('alert');
      expect(queue[3].urgencyLevel).toBe('warning');
      expect(queue[4].urgencyLevel).toBe('warning');
      expect(queue[5].urgencyLevel).toBe('warning');
    });

    it('filters out inactive, paid, and currently snoozed bills', () => {
      const bills: RecurringBill[] = [
        createTestBill('b_inactive_overdue', '2026-10-12', { isActive: false }), // Inactive
        createTestBill('b_paid_due_today', '2026-11-16', { paymentStatus: 'PAID_OK' }), // Paid, next cycle a month away
        createTestBill('b_snoozed_future', '2026-10-17', { snoozedUntilDate: '2026-10-18' }), // Snoozed until tomorrow
        createTestBill('b_snoozed_today_expired', '2026-10-17', { snoozedUntilDate: '2026-10-16' }), // Snooze was for today (expired, should trigger!)
        createTestBill('b_active_due_1d', '2026-10-17'), // Normal
      ];

      const queue = getUpcomingCheckInQueue(bills, today);
      const queueIds = queue.map((q) => q.bill.id);

      expect(queueIds).not.toContain('b_inactive_overdue');
      expect(queueIds).not.toContain('b_paid_due_today');
      expect(queueIds).not.toContain('b_snoozed_future');
      expect(queueIds).toContain('b_snoozed_today_expired');
      expect(queueIds).toContain('b_active_due_1d');
      expect(queue).toHaveLength(2);
    });
  });

  // ==========================================================================
  // 4. Bilateral Debt Netting & Roommate Simulation (50 Transactions)
  // ==========================================================================
  describe('4. Bilateral Debt Netting & 50-Transaction Roommate Simulation', () => {
    it('verifies odd-cent payer absorption invariant on 1, 3, 5, and 10001 cents', () => {
      const oddAmounts = [1, 3, 5, 10001];

      for (const amount of oddAmounts) {
        const shares = split50_50(amount, 'USER', 'party_camila');
        expect(shares).toHaveLength(2);

        const payerShare = shares.find((s) => s.partyId === 'USER')!.shareCents;
        const counterpartShare = shares.find((s) => s.partyId === 'party_camila')!.shareCents;

        // Invariant 7: payer absorbs the odd cent
        expect(payerShare).toBe(Math.ceil(amount / 2));
        expect(counterpartShare).toBe(Math.floor(amount / 2));
        expect(payerShare - counterpartShare).toBe(1);

        // Exact conservation
        expect(payerShare + counterpartShare).toBe(amount);
      }
    });

    it('simulates 50 alternating transactions between User and Camila, verifying zero-sum invariance and zero settlement', () => {
      const expenses: SplitExpense[] = [];
      const settlements: SplitSettlement[] = [];

      // Seed 50 deterministic amounts mixing small odd cents, large grocery trips, utilities, and dining
      const rawAmounts = [
        1,       // 1 cent
        3,       // 3 cents
        5,       // 5 cents
        10001,   // R$ 100,01
        25000,   // R$ 250,00 (Rent/electricity)
        12555,   // R$ 125,55 (Supermarket)
        7777,    // R$ 77,77 (Gas bill)
        999,     // R$ 9,99 (Coffee)
        45000,   // R$ 450,00 (Groceries)
        1850,    // R$ 18,50 (Bakery)
        3333,    // R$ 33,33 (Cleaning)
        80000,   // R$ 800,00 (Condo)
        1500,    // R$ 15,00 (Snack)
        24501,   // R$ 245,01 (Wi-Fi)
        6700,    // R$ 67,00 (Pharmacy)
        1099,    // R$ 10,99 (App)
        32000,   // R$ 320,00 (Water)
        8501,    // R$ 85,01 (Hardware)
        14990,   // R$ 149,90 (Streaming shared)
        4200,    // R$ 42,00 (Dinner dessert)
      ];

      // Expand to 50 transactions deterministically
      const transactionAmounts: number[] = [];
      for (let i = 0; i < 50; i++) {
        const base = rawAmounts[i % rawAmounts.length];
        const offset = (i * 37) % 500;
        transactionAmounts.push(base + offset);
      }
      expect(transactionAmounts).toHaveLength(50);

      // Execute 50 alternating expenses
      for (let i = 0; i < 50; i++) {
        const isUserPayer = i % 2 === 0;
        const payerId = isUserPayer ? 'USER' : 'party_camila';
        const counterpartId = isUserPayer ? 'party_camila' : 'USER';
        const amountCents = transactionAmounts[i];

        const exp = createSplitExpense({
          id: `exp_${i + 1}`,
          description: `Transaction ${i + 1}`,
          totalAmountCents: amountCents,
          date: '2026-10-16',
          paidByPartyId: payerId,
          splitMethod: 'equal_50_50',
          counterpartPartyId: counterpartId,
        });

        expenses.push(exp);

        // Verification A: Share Conservation at step i
        const sumShares = exp.shares.reduce((acc, s) => acc + s.shareCents, 0);
        expect(sumShares).toBe(amountCents);

        // Verification B: Bilateral Anti-Symmetry / Zero-Sum Invariance at step i
        const balUser = calculateBilateralNetBalance(expenses, settlements, 'USER', 'party_camila');
        const balCamila = calculateBilateralNetBalance(expenses, settlements, 'party_camila', 'USER');

        const expectedInverse = -balCamila === 0 ? 0 : -balCamila;
        expect(balUser).toBe(expectedInverse);
        expect(balUser + balCamila).toBe(0);

        // Verification C: Bilateral Summary matches
        const summaryUser = calculateBilateralSummary(expenses, settlements, 'USER', 'party_camila');
        expect(summaryUser.netBalanceCents).toBe(balUser);
        expect(summaryUser.settlementAmountCents).toBe(Math.abs(balUser));
      }

      // Record running balance before any settlements
      const preSettlementBalance = calculateBilateralNetBalance(expenses, settlements, 'USER', 'party_camila');
      expect(preSettlementBalance).not.toBe(0); // With 50 transactions, balance is active

      // Intermediate partial settlement at mid-point (e.g. debtor pays partial R$ 100,00 / 10000 cents)
      const debtorId = preSettlementBalance > 0 ? 'party_camila' : 'USER';
      const creditorId = preSettlementBalance > 0 ? 'USER' : 'party_camila';
      const partialPayment = createSettlement(debtorId, creditorId, 5000, '2026-10-20', 'Partial PIX');
      settlements.push(partialPayment);

      const postPartialBalance = calculateBilateralNetBalance(expenses, settlements, 'USER', 'party_camila');
      if (preSettlementBalance > 0) {
        expect(postPartialBalance).toBe(preSettlementBalance - 5000);
      } else {
        expect(postPartialBalance).toBe(preSettlementBalance + 5000);
      }

      // Verification D: Full Settlement Reconciliation to EXACT 0 cents
      const fullSettlement = createFullSettlement(
        expenses,
        settlements,
        'USER',
        'party_camila',
        '2026-10-31',
        'Full Month-End PIX Netting'
      );

      expect(fullSettlement).not.toBeNull();
      expect(fullSettlement!.amountCents).toBe(Math.abs(postPartialBalance));

      settlements.push(fullSettlement!);

      // Assert final balance is EXACTLY ZERO
      const finalBalance = calculateBilateralNetBalance(expenses, settlements, 'USER', 'party_camila');
      const finalReverse = calculateBilateralNetBalance(expenses, settlements, 'party_camila', 'USER');

      expect(finalBalance).toBe(0);
      expect(finalReverse).toBe(0);

      // Verify summary shows 'SETTLED'
      const finalSummary = calculateBilateralSummary(expenses, settlements, 'USER', 'party_camila');
      expect(finalSummary.direction).toBe('SETTLED');
      expect(finalSummary.netBalanceCents).toBe(0);
      expect(finalSummary.settlementAmountCents).toBe(0);

      // Calling createFullSettlement again returns null (idempotent)
      const noOp = createFullSettlement(expenses, settlements, 'USER', 'party_camila', '2026-10-31');
      expect(noOp).toBeNull();
    });

    it('verifies multi-party equal splits where payer absorbs the remainder via splitEqual', () => {
      // 10 cents across 3 parties with USER as payer: 10 / 3 = 3 rem 1 -> USER gets 4, others 3
      const shares = splitEqual(10, ['party_A', 'USER', 'party_B'], 'USER');
      const userShare = shares.find((s) => s.partyId === 'USER')!.shareCents;
      const aShare = shares.find((s) => s.partyId === 'party_A')!.shareCents;
      const bShare = shares.find((s) => s.partyId === 'party_B')!.shareCents;

      expect(userShare).toBe(4);
      expect(aShare).toBe(3);
      expect(bShare).toBe(3);
      expect(userShare + aShare + bShare).toBe(10);
    });
  });
});
