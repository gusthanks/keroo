import { describe, it, expect } from 'vitest';
import {
  parseISODateToUTC,
  getCalendarDayDifference,
  addDaysToISODate,
  getCadenceMonthDelta,
  advanceNextDueDate,
  projectSubscriptionCycles,
  getCadenceCyclesPerYear,
  getAnnualizedCostCents,
  getMonthlyEquivalentCostCents,
  calculateAnnualCommitment,
  evaluateSubscriptionStatus,
  refreshBillStatus,
  getUpcomingCheckInQueue,
  recordBillPayment,
  snoozeBillReminder,
} from '../core/subscriptions';
import type { RecurringBill } from '../types';

describe('Subscriptions & Recurring Bills Radar Engine (src/core/subscriptions.ts)', () => {
  describe('Date Arithmetic & Cadence Delta Utilities', () => {
    it('parses ISODate to UTC Date and computes exact calendar day difference', () => {
      const utc = parseISODateToUTC('2026-10-16');
      expect(utc.getUTCFullYear()).toBe(2026);
      expect(utc.getUTCMonth()).toBe(9);
      expect(utc.getUTCDate()).toBe(16);

      expect(getCalendarDayDifference('2026-10-16', '2026-10-16')).toBe(0);
      expect(getCalendarDayDifference('2026-10-16', '2026-10-20')).toBe(4);
      expect(getCalendarDayDifference('2026-10-16', '2026-10-10')).toBe(-6);

      expect(addDaysToISODate('2026-10-16', 5)).toBe('2026-10-21');
      expect(addDaysToISODate('2026-10-31', 1)).toBe('2026-11-01');
    });

    it('returns exact cadence month deltas', () => {
      expect(getCadenceMonthDelta('monthly')).toBe(1);
      expect(getCadenceMonthDelta('bimonthly')).toBe(2);
      expect(getCadenceMonthDelta('quarterly')).toBe(3);
      expect(getCadenceMonthDelta('semi_annually')).toBe(6);
      expect(getCadenceMonthDelta('annually')).toBe(12);
      expect(getCadenceMonthDelta('weekly')).toBe(0);
      expect(getCadenceMonthDelta('biweekly')).toBe(0);
    });
  });

  describe('Anchor-Day Preservation Across 24 Months (Invariant 6)', () => {
    it('preserves anchorDay=31 over 24 consecutive months starting Jan 31', () => {
      // Starting from 2026-01-31 (non-leap year 2026 and 2027)
      const cycles = projectSubscriptionCycles('2026-01-31', 'monthly', 31, 24);
      expect(cycles).toHaveLength(24);

      // Verify each month's date
      expect(cycles[0]).toBe('2026-01-31');
      expect(cycles[1]).toBe('2026-02-28'); // Clamped to 28
      expect(cycles[2]).toBe('2026-03-31'); // Restored to 31!
      expect(cycles[3]).toBe('2026-04-30'); // Clamped to 30
      expect(cycles[4]).toBe('2026-05-31'); // Restored to 31!
      expect(cycles[5]).toBe('2026-06-30'); // Clamped to 30
      expect(cycles[6]).toBe('2026-07-31'); // Restored to 31!
      expect(cycles[7]).toBe('2026-08-31'); // Restored to 31!
      expect(cycles[8]).toBe('2026-09-30'); // Clamped to 30
      expect(cycles[9]).toBe('2026-10-31'); // Restored to 31!
      expect(cycles[10]).toBe('2026-11-30'); // Clamped to 30
      expect(cycles[11]).toBe('2026-12-31'); // Restored to 31!

      // Year 2 (2027)
      expect(cycles[12]).toBe('2027-01-31');
      expect(cycles[13]).toBe('2027-02-28'); // Clamped to 28
      expect(cycles[14]).toBe('2027-03-31'); // Restored to 31!
      expect(cycles[15]).toBe('2027-04-30'); // Clamped to 30
      expect(cycles[16]).toBe('2027-05-31'); // Restored to 31!
      expect(cycles[17]).toBe('2027-06-30'); // Clamped to 30
      expect(cycles[18]).toBe('2027-07-31'); // Restored to 31!
      expect(cycles[19]).toBe('2027-08-31'); // Restored to 31!
      expect(cycles[20]).toBe('2027-09-30'); // Clamped to 30
      expect(cycles[21]).toBe('2027-10-31'); // Restored to 31!
      expect(cycles[22]).toBe('2027-11-30'); // Clamped to 30
      expect(cycles[23]).toBe('2027-12-31'); // Restored to 31!
    });

    it('preserves anchorDay=29 in leap year vs non-leap year', () => {
      // Leap year 2024: Feb 29
      const leapNext = advanceNextDueDate('2024-01-29', 'monthly', 29);
      expect(leapNext).toBe('2024-02-29');

      // Non-leap year 2025: Feb 28
      const nonLeapNext = advanceNextDueDate('2025-01-29', 'monthly', 29);
      expect(nonLeapNext).toBe('2025-02-28');

      // March restored to 29
      const marRestored = advanceNextDueDate('2025-02-28', 'monthly', 29);
      expect(marRestored).toBe('2025-03-29');
    });

    it('advances multi-month cadences (bimonthly, quarterly, semi_annually, annually) with anchorDay preservation', () => {
      // Quarterly with anchorDay 31 starting Jan 31
      // Jan 31 -> Apr 30 -> Jul 31 -> Oct 31 -> Jan 31
      const qCycles = projectSubscriptionCycles('2026-01-31', 'quarterly', 31, 5);
      expect(qCycles).toEqual([
        '2026-01-31',
        '2026-04-30',
        '2026-07-31',
        '2026-10-31',
        '2027-01-31',
      ]);

      // Semi-annually with anchorDay 31 starting Aug 31
      // Aug 31 -> Feb 28 -> Aug 31
      const saCycles = projectSubscriptionCycles('2026-08-31', 'semi_annually', 31, 3);
      expect(saCycles).toEqual([
        '2026-08-31',
        '2027-02-28',
        '2027-08-31',
      ]);

      // Annually with anchorDay 29 starting Feb 29 2024
      const annualCycles = projectSubscriptionCycles('2024-02-29', 'annually', 29, 5);
      expect(annualCycles).toEqual([
        '2024-02-29',
        '2025-02-28', // Clamped non-leap
        '2026-02-28', // Clamped non-leap
        '2027-02-28', // Clamped non-leap
        '2028-02-29', // Restored in leap year 2028!
      ]);
    });

    it('advances weekly and biweekly cadences accurately by 7 and 14 days', () => {
      expect(advanceNextDueDate('2026-10-16', 'weekly', 16)).toBe('2026-10-23');
      expect(advanceNextDueDate('2026-10-23', 'weekly', 16)).toBe('2026-10-30');
      expect(advanceNextDueDate('2026-10-30', 'weekly', 16)).toBe('2026-11-06');

      expect(advanceNextDueDate('2026-10-16', 'biweekly', 16)).toBe('2026-10-30');
      expect(advanceNextDueDate('2026-10-30', 'biweekly', 16)).toBe('2026-11-13');
    });
  });

  describe('Cadence Normalization & Annualized Commitment', () => {
    it('returns exact cycle multipliers per year', () => {
      expect(getCadenceCyclesPerYear('weekly')).toBe(52);
      expect(getCadenceCyclesPerYear('biweekly')).toBe(26);
      expect(getCadenceCyclesPerYear('monthly')).toBe(12);
      expect(getCadenceCyclesPerYear('bimonthly')).toBe(6);
      expect(getCadenceCyclesPerYear('quarterly')).toBe(4);
      expect(getCadenceCyclesPerYear('semi_annually')).toBe(2);
      expect(getCadenceCyclesPerYear('annually')).toBe(1);
    });

    it('calculates annualized costs in exact integer cents', () => {
      // Monthly R$ 55,90 (5590 cents) * 12 = 67080 cents (R$ 670,80)
      expect(getAnnualizedCostCents(5590, 'monthly')).toBe(67080);

      // Weekly R$ 25,00 (2500 cents) * 52 = 130000 cents (R$ 1.300,00)
      expect(getAnnualizedCostCents(2500, 'weekly')).toBe(130000);

      // Biweekly R$ 50,00 (5000 cents) * 26 = 130000 cents
      expect(getAnnualizedCostCents(5000, 'biweekly')).toBe(130000);

      // Quarterly R$ 100,00 (10000 cents) * 4 = 40000 cents
      expect(getAnnualizedCostCents(10000, 'quarterly')).toBe(40000);

      // Annually R$ 350,00 (35000 cents) * 1 = 35000 cents
      expect(getAnnualizedCostCents(35000, 'annually')).toBe(35000);
    });

    it('calculates monthly equivalent cost', () => {
      // Annual R$ 120,00 (12000 cents) / 12 = 1000 cents (R$ 10,00 / mo)
      expect(getMonthlyEquivalentCostCents(12000, 'annually')).toBe(1000);

      // Monthly R$ 55,90 = 5590 cents
      expect(getMonthlyEquivalentCostCents(5590, 'monthly')).toBe(5590);
    });

    it('calculates portfolio annual commitment across diverse cadences', () => {
      const sampleBills: RecurringBill[] = [
        {
          id: 'b1',
          name: 'Netflix',
          amountCents: 5000, // R$ 50,00 / mo -> 60000 / yr
          currency: 'BRL',
          cadence: 'monthly',
          anchorDay: 15,
          startDate: '2026-01-15',
          nextDueDate: '2026-11-15',
          paymentStatus: 'UPCOMING_SAFE',
          categoryId: 'cat_1',
          paymentAccountId: 'acc_1',
          isActive: true,
          autoRenew: true,
          reminderDaysBefore: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b2',
          name: 'Gym',
          amountCents: 10000, // R$ 100,00 / mo -> 120000 / yr
          currency: 'BRL',
          cadence: 'monthly',
          anchorDay: 1,
          startDate: '2026-01-01',
          nextDueDate: '2026-11-01',
          paymentStatus: 'UPCOMING_SAFE',
          categoryId: 'cat_2',
          paymentAccountId: 'acc_1',
          isActive: true,
          autoRenew: true,
          reminderDaysBefore: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b3',
          name: 'Domain Host',
          amountCents: 12000, // R$ 120,00 / yr -> 12000 / yr
          currency: 'BRL',
          cadence: 'annually',
          anchorDay: 10,
          startDate: '2026-05-10',
          nextDueDate: '2027-05-10',
          paymentStatus: 'UPCOMING_SAFE',
          categoryId: 'cat_3',
          paymentAccountId: 'acc_1',
          isActive: true,
          autoRenew: true,
          reminderDaysBefore: 3,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b4_inactive',
          name: 'Old Service',
          amountCents: 99999,
          currency: 'BRL',
          cadence: 'monthly',
          anchorDay: 1,
          startDate: '2025-01-01',
          nextDueDate: '2025-02-01',
          paymentStatus: 'OVERDUE',
          categoryId: 'cat_1',
          paymentAccountId: 'acc_1',
          isActive: false, // Inactive!
          autoRenew: false,
          reminderDaysBefore: 3,
          createdAt: '',
          updatedAt: '',
        },
      ];

      const summary = calculateAnnualCommitment(sampleBills);
      expect(summary.activeCount).toBe(3);
      // Total annual: 60000 + 120000 + 12000 = 192000 cents (R$ 1.920,00)
      expect(summary.totalAnnualCents).toBe(192000);
      // Monthly equivalent: 5000 + 10000 + 1000 = 16000 cents (R$ 160,00 / mo)
      expect(summary.totalMonthlyEquivalentCents).toBe(16000);
      expect(summary.byCadenceCount.monthly).toBe(2);
      expect(summary.byCadenceCount.annually).toBe(1);
    });

    it('regression: monthly total is derived once from the annual total (no per-bill rounding drift)', () => {
      const mk = (id: string): RecurringBill => ({
        id, name: id, amountCents: 1000, currency: 'BRL', cadence: 'annually', anchorDay: 1,
        startDate: '2026-01-01', nextDueDate: '2027-01-01', paymentStatus: 'UPCOMING_SAFE',
        categoryId: 'c', paymentAccountId: 'a', isActive: true, autoRenew: true,
        reminderDaysBefore: 3, createdAt: '', updatedAt: '',
      });
      // Per bill: round(1000/12) = 83 -> 3 x 83 = 249 (old). Exact: round(3000/12) = 250.
      const summary = calculateAnnualCommitment([mk('a1'), mk('a2'), mk('a3')]);
      expect(summary.totalAnnualCents).toBe(3000);
      expect(summary.totalMonthlyEquivalentCents).toBe(250);
    });
  });

  describe('5-State Status Machine Transitions', () => {
    const today = '2026-10-16';

    it('returns PAID_OK when bill is already marked paid', () => {
      const status = evaluateSubscriptionStatus(
        { nextDueDate: '2026-11-15', paymentStatus: 'PAID_OK' },
        today
      );
      expect(status).toBe('PAID_OK');

      const statusFromFlag = evaluateSubscriptionStatus(
        { nextDueDate: '2026-10-15', isPaidForCurrentCycle: true },
        today
      );
      expect(statusFromFlag).toBe('PAID_OK');
    });

    it('regression: stored PAID_OK expires once the next cycle enters the radar window', () => {
      // 4 days ahead: still paid
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-20', paymentStatus: 'PAID_OK' }, today)).toBe('PAID_OK');
      // 3 days ahead: due soon again
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-19', paymentStatus: 'PAID_OK' }, today)).toBe('DUE_SOON');
      expect(evaluateSubscriptionStatus({ nextDueDate: today, paymentStatus: 'PAID_OK' }, today)).toBe('DUE_TODAY');
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-15', paymentStatus: 'PAID_OK' }, today)).toBe('OVERDUE');
    });

    it('returns OVERDUE when due date is in the past (< 0 days) and unpaid', () => {
      // Due yesterday (Oct 15) vs today (Oct 16) -> -1 day
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-15' }, today)).toBe('OVERDUE');
      // Due 10 days ago
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-06' }, today)).toBe('OVERDUE');
    });

    it('returns DUE_TODAY when due date is today (0 days)', () => {
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-16' }, today)).toBe('DUE_TODAY');
    });

    it('returns DUE_SOON when due date is within 1 to 3 days future', () => {
      // Tomorrow (Oct 17, +1 day)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-17' }, today)).toBe('DUE_SOON');
      // Day after tomorrow (Oct 18, +2 days)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-18' }, today)).toBe('DUE_SOON');
      // 3 days away (Oct 19, +3 days)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-19' }, today)).toBe('DUE_SOON');
    });

    it('returns UPCOMING_SAFE when due date is > 3 days in the future', () => {
      // 4 days away (Oct 20, +4 days)
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-20' }, today)).toBe('UPCOMING_SAFE');
      // 15 days away
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-10-31' }, today)).toBe('UPCOMING_SAFE');
      // Next month
      expect(evaluateSubscriptionStatus({ nextDueDate: '2026-11-15' }, today)).toBe('UPCOMING_SAFE');
    });

    it('refreshes bill payment status correctly using refreshBillStatus', () => {
      const bill: RecurringBill = {
        id: 'bill_test',
        name: 'Internet',
        amountCents: 10000,
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 18,
        startDate: '2026-09-18',
        nextDueDate: '2026-10-18', // +2 days from Oct 16
        paymentStatus: 'UPCOMING_SAFE', // Outdated
        categoryId: 'cat_1',
        paymentAccountId: 'acc_1',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '',
        updatedAt: '',
      };

      const refreshed = refreshBillStatus(bill, '2026-10-16');
      expect(refreshed).toBe('DUE_SOON');
    });
  });

  describe('Proactive 3-Day Radar Detector & Speech Bubble Queue', () => {
    const today = '2026-10-16';

    const billOverdueOld: RecurringBill = {
      id: 'b_overdue_old',
      name: 'Old Energy Bill',
      amountCents: 15000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 10,
      startDate: '2026-09-10',
      nextDueDate: '2026-10-10', // -6 days
      paymentStatus: 'OVERDUE',
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    const billOverdueRecent: RecurringBill = {
      id: 'b_overdue_recent',
      name: 'Recent Water Bill',
      amountCents: 8000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 15,
      startDate: '2026-09-15',
      nextDueDate: '2026-10-15', // -1 day
      paymentStatus: 'OVERDUE',
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    const billToday: RecurringBill = {
      id: 'b_today',
      name: 'Rent',
      amountCents: 240000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 16,
      startDate: '2026-09-16',
      nextDueDate: '2026-10-16', // 0 days
      paymentStatus: 'DUE_TODAY',
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    const billSoon1: RecurringBill = {
      id: 'b_soon_1',
      name: 'Internet (in 1 day)',
      amountCents: 12000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 17,
      startDate: '2026-09-17',
      nextDueDate: '2026-10-17', // +1 day
      paymentStatus: 'DUE_SOON',
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    const billSoon3: RecurringBill = {
      id: 'b_soon_3',
      name: 'Spotify (in 3 days)',
      amountCents: 3490,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 19,
      startDate: '2026-09-19',
      nextDueDate: '2026-10-19', // +3 days
      paymentStatus: 'DUE_SOON',
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    const billSafe: RecurringBill = {
      id: 'b_safe',
      name: 'Netflix (in 10 days)',
      amountCents: 5590,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 26,
      startDate: '2026-09-26',
      nextDueDate: '2026-10-26', // +10 days -> safe!
      paymentStatus: 'UPCOMING_SAFE',
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    const billSnoozed: RecurringBill = {
      id: 'b_snoozed',
      name: 'Snoozed Gym',
      amountCents: 10000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 16,
      startDate: '2026-09-16',
      nextDueDate: '2026-10-16', // Due today
      paymentStatus: 'DUE_TODAY',
      snoozedUntilDate: '2026-10-17', // Snoozed until tomorrow!
      categoryId: 'cat_1',
      paymentAccountId: 'acc_1',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '',
      updatedAt: '',
    };

    it('returns items prioritized in order: oldest OVERDUE -> DUE_TODAY -> closest DUE_SOON', () => {
      const allBills = [
        billSafe,
        billSoon3,
        billOverdueRecent,
        billToday,
        billOverdueOld,
        billSoon1,
        billSnoozed,
      ];

      const queue = getUpcomingCheckInQueue(allBills, today);

      // billSafe (UPCOMING_SAFE) and billSnoozed (snoozedUntil > today) must NOT be in queue
      expect(queue.find((q) => q.bill.id === 'b_safe')).toBeUndefined();
      expect(queue.find((q) => q.bill.id === 'b_snoozed')).toBeUndefined();

      expect(queue).toHaveLength(5);

      // Rank 1: Oldest overdue (b_overdue_old, -6 days)
      expect(queue[0].bill.id).toBe('b_overdue_old');
      expect(queue[0].status).toBe('OVERDUE');
      expect(queue[0].urgencyLevel).toBe('critical');

      // Rank 2: Recent overdue (b_overdue_recent, -1 day)
      expect(queue[1].bill.id).toBe('b_overdue_recent');
      expect(queue[1].status).toBe('OVERDUE');

      // Rank 3: Due today (b_today)
      expect(queue[2].bill.id).toBe('b_today');
      expect(queue[2].status).toBe('DUE_TODAY');
      expect(queue[2].urgencyLevel).toBe('alert');

      // Rank 4: Due in 1 day (b_soon_1)
      expect(queue[3].bill.id).toBe('b_soon_1');
      expect(queue[3].status).toBe('DUE_SOON');
      expect(queue[3].urgencyLevel).toBe('warning');

      // Rank 5: Due in 3 days (b_soon_3)
      expect(queue[4].bill.id).toBe('b_soon_3');
      expect(queue[4].status).toBe('DUE_SOON');
    });

    it('filters out inactive bills', () => {
      const inactiveOverdue = { ...billOverdueOld, isActive: false };
      const queue = getUpcomingCheckInQueue([inactiveOverdue], today);
      expect(queue).toHaveLength(0);
    });
  });

  describe('Payment Recording & Snoozing Mechanics', () => {
    it('records bill payment: advances nextDueDate with anchor-day preservation, sets lastPaymentDate, clears snooze', () => {
      const bill: RecurringBill = {
        id: 'bill_rent',
        name: 'Aluguel',
        amountCents: 240000,
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 31,
        startDate: '2026-01-31',
        nextDueDate: '2026-01-31',
        paymentStatus: 'DUE_TODAY',
        snoozedUntilDate: '2026-01-31',
        categoryId: 'cat_rent',
        paymentAccountId: 'acc_checking',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const updated = recordBillPayment(bill, '2026-01-31');

      expect(updated.lastPaymentDate).toBe('2026-01-31');
      // Advanced to February with clamping to 28
      expect(updated.nextDueDate).toBe('2026-02-28');
      expect(updated.anchorDay).toBe(31); // Preserved!
      expect(updated.snoozedUntilDate).toBeUndefined();
      expect(updated.paymentStatus).toBe('UPCOMING_SAFE');
    });

    it('snoozes bill reminder until specified date', () => {
      const bill: RecurringBill = {
        id: 'bill_spotify',
        name: 'Spotify',
        amountCents: 3490,
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 15,
        startDate: '2026-01-15',
        nextDueDate: '2026-10-15',
        paymentStatus: 'DUE_TODAY',
        categoryId: 'cat_stream',
        paymentAccountId: 'acc_card',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '',
        updatedAt: '',
      };

      const snoozed = snoozeBillReminder(bill, '2026-10-16');
      expect(snoozed.snoozedUntilDate).toBe('2026-10-16');
    });
  });
});
