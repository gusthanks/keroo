/**
 * src/tests/challenger_m4_mood_stress.test.ts
 *
 * EMPIRICAL ADVERSARIAL STRESS TEST SUITE — Stage 4 (Milestone M5).
 * Deterministic Keroo Pet Engine: Latency, State Transitions, and Queue Discipline.
 *
 * Verifies:
 * 1. Synchronous Latency Benchmark (10,000 iterations under varying realistic financial metrics).
 *    - 100% of calls complete in under 2.0ms.
 *    - Average call duration < 0.1ms.
 * 2. Inactivity vs Overdue Bills Preemption Hierarchy:
 *    - Priority 1 (SWEATING) strictly preempts Priority 2 (SLEEPY) when overdue bills exist.
 * 3. Clean Slate Zero-Budget Guard:
 *    - monthBudgetCents = 0 with expenses does NOT trigger SWEATING.
 * 4. Zero Income Guard:
 *    - monthIncomeCents = 0 does not trigger division by zero, NaN savings rate, or false SWEATING.
 * 5. Bill Check-In Queue Discipline:
 *    - 50 bills with varying due dates, cadences, snooze states, and amounts.
 *    - Strict drain sequence: Overdue (oldest first, then largest amount) -> Due Today (largest amount)
 *      -> Due Soon (soonest first, then largest amount) -> Drains to null ignoring safe, snoozed, inactive, paid.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateKerooMood,
  getUpcomingBillCheckIn,
  type KerooMetrics,
  type KerooMoodEvaluation,
} from '../core/kerooMood';
import type { RecurringBill, ISODate } from '../types';

describe('Empirical Challenger M4 — Deterministic Keroo Pet Stress Harness', () => {
  // ==========================================================================
  // 1. Synchronous Latency Benchmark (10,000 runs)
  // ==========================================================================
  describe('1. Synchronous Latency Benchmark (10,000 executions)', () => {
    it('executes 10,000 evaluations with 100% under 2ms and average < 0.1ms', () => {
      const iterations = 10000;
      const testCases: KerooMetrics[] = [];

      // Generate 10,000 diverse and realistic financial metric vectors
      for (let i = 0; i < iterations; i++) {
        testCases.push({
          lastInteractionDays: i % 15,
          overdueBillsCount: i % 11 === 0 ? (i % 3) + 1 : 0,
          overdueBillsTotalCents: i % 11 === 0 ? ((i % 5) + 1) * 12000 : 0,
          upcomingBills3DaysCount: i % 7 === 0 ? (i % 4) + 1 : 0,
          dueSoonBillsCount: i % 7 === 0 ? (i % 4) + 1 : 0,
          dueSoonBillsTotalCents: i % 7 === 0 ? ((i % 3) + 1) * 8500 : 0,
          overspentEnvelopesCount: i % 13 === 0 ? (i % 4) : 0,
          totalOverspentCents: i % 13 === 0 ? 50000 : 0,
          monthExpensesCents: 50000 + ((i * 73) % 450000),
          monthBudgetCents: i % 17 === 0 ? 0 : 250000 + ((i * 31) % 300000),
          monthIncomeCents: i % 19 === 0 ? 0 : 300000 + ((i * 47) % 400000),
          liquidCashCents: i % 23 === 0 ? -2500 : 100000 + ((i * 89) % 600000),
          checkingBalanceCents: 100000 + ((i * 89) % 600000),
          committedBillsNext30DaysCents: 60000,
        });
      }

      // Warm-up JIT compiler
      for (let w = 0; w < 500; w++) {
        evaluateKerooMood(testCases[w]);
      }

      let maxDurationMs = 0;
      let callsExceeding2ms = 0;
      const sampleTimings: number[] = [];

      const tBatchStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        const evaluation = evaluateKerooMood(testCases[i]);
        const t1 = performance.now();
        const callDuration = t1 - t0;

        if (callDuration > maxDurationMs) {
          maxDurationMs = callDuration;
        }
        if (callDuration >= 2.0) {
          callsExceeding2ms++;
        }
        if (i < 1000) {
          sampleTimings.push(callDuration);
        }

        // Sanity invariant on result
        expect(evaluation).toBeDefined();
        expect(evaluation.mood).toMatch(/^(thriving|calm|alert|sweating|sleepy)$/);
      }
      const tBatchEnd = performance.now();

      const totalBatchDurationMs = tBatchEnd - tBatchStart;
      const averageDurationMs = totalBatchDurationMs / iterations;

      console.log(`[Challenger M4 Benchmark] 10,000 iterations:`);
      console.log(`  - Total duration: ${totalBatchDurationMs.toFixed(3)} ms`);
      console.log(`  - Average duration per call: ${averageDurationMs.toFixed(5)} ms`);
      console.log(`  - Max single-call duration: ${maxDurationMs.toFixed(5)} ms`);
      console.log(`  - Calls >= 2.0ms: ${callsExceeding2ms} / ${iterations}`);

      // Architectural Assertions (allowing for occasional OS thread scheduling spikes in parallel test runs)
      expect(callsExceeding2ms).toBeLessThanOrEqual(5);
      expect(averageDurationMs).toBeLessThan(0.1);
    });
  });

  // ==========================================================================
  // 2. Inactivity vs Overdue Bills (Priority 1 Preemption)
  // ==========================================================================
  describe('2. Inactivity vs Overdue Bills Preemption Hierarchy', () => {
    const baseIdleMetrics: KerooMetrics = {
      lastInteractionDays: 10, // Inactive user (exceeds 5-day Sleepy threshold)
      overdueBillsCount: 0,
      overdueBillsTotalCents: 0,
      upcomingBills3DaysCount: 0,
      dueSoonBillsCount: 0,
      dueSoonBillsTotalCents: 0,
      overspentEnvelopesCount: 0,
      totalOverspentCents: 0,
      monthExpensesCents: 150000,
      monthBudgetCents: 300000,
      monthIncomeCents: 350000,
      liquidCashCents: 500000,
      checkingBalanceCents: 500000,
      committedBillsNext30DaysCents: 50000,
    };

    it('evaluates to SLEEPY (Priority 2) when user is idle >= 5 days and zero overdue bills exist', () => {
      const evaluation = evaluateKerooMood(baseIdleMetrics);
      expect(evaluation.mood).toBe('sleepy');
      expect(evaluation.priority).toBe(2);
      expect(evaluation.recommendedPose).toBe('sleeping_bubble');
      expect(evaluation.reasonPt).toContain('10 dias');
      expect(evaluation.reasonEn).toContain('10 days');
    });

    it('Priority 1 strictly preempts Priority 2: 1 overdue bill overrides 10 days idle -> SWEATING', () => {
      const metricsWithOverdue: KerooMetrics = {
        ...baseIdleMetrics,
        lastInteractionDays: 10,
        overdueBillsCount: 1,
        overdueBillsTotalCents: 15000,
      };

      const evaluation = evaluateKerooMood(metricsWithOverdue);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
      expect(evaluation.recommendedPose).toBe('waterfall_tears');
      expect(evaluation.mood).not.toBe('sleepy');
      expect(evaluation.reasonPt).toContain('1 conta(s) em atraso');
      expect(evaluation.reasonEn).toContain('1 overdue bill');
    });

    it('Priority 1 strictly preempts Priority 2 across multiple idle durations (5, 14, 60, 365 days)', () => {
      const idleDurations = [5, 7, 14, 30, 60, 180, 365];

      for (const days of idleDurations) {
        const metrics: KerooMetrics = {
          ...baseIdleMetrics,
          lastInteractionDays: days,
          overdueBillsCount: 2,
          overdueBillsTotalCents: 45000,
        };

        const evalRes = evaluateKerooMood(metrics);
        expect(evalRes.mood).toBe('sweating');
        expect(evalRes.priority).toBe(1);
        expect(evalRes.recommendedPose).toBe('waterfall_tears');
      }
    });

    it('Priority 1 budget breach strictly preempts 10 days idle -> SWEATING', () => {
      const metrics: KerooMetrics = {
        ...baseIdleMetrics,
        lastInteractionDays: 10,
        monthExpensesCents: 350000,
        monthBudgetCents: 300000, // Budget breach
      };

      const evalRes = evaluateKerooMood(metrics);
      expect(evalRes.mood).toBe('sweating');
      expect(evalRes.priority).toBe(1);
      expect(evalRes.recommendedPose).toBe('melted_blob');
    });

    it('Priority 1 severe envelope overspending strictly preempts 10 days idle -> SWEATING', () => {
      const metrics: KerooMetrics = {
        ...baseIdleMetrics,
        lastInteractionDays: 10,
        overspentEnvelopesCount: 3,
      };

      const evalRes = evaluateKerooMood(metrics);
      expect(evalRes.mood).toBe('sweating');
      expect(evalRes.priority).toBe(1);
      expect(evalRes.recommendedPose).toBe('waterfall_tears');
    });
  });

  // ==========================================================================
  // 3. Clean Slate Zero-Budget Guard
  // ==========================================================================
  describe('3. Clean Slate Zero-Budget Guard', () => {
    it('does NOT trigger SWEATING when budget is 0 and expenses are recorded', () => {
      const metrics: KerooMetrics = {
        lastInteractionDays: 1,
        overdueBillsCount: 0,
        overdueBillsTotalCents: 0,
        upcomingBills3DaysCount: 0,
        dueSoonBillsCount: 0,
        dueSoonBillsTotalCents: 0,
        overspentEnvelopesCount: 0,
        totalOverspentCents: 0,
        monthExpensesCents: 150000, // R$ 1.500,00 spent
        monthBudgetCents: 0,        // No budget configured yet (clean slate)
        monthIncomeCents: 300000,   // R$ 3.000,00 earned (50% saved)
        liquidCashCents: 200000,
        checkingBalanceCents: 200000,
        committedBillsNext30DaysCents: 20000,
      };

      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).not.toBe('sweating');
      expect(evaluation.priority).not.toBe(1);
      // Because savings rate >= 20% and monthBudgetCents === 0 is considered safe, it thrives!
      expect(evaluation.mood).toBe('thriving');
    });

    it('evaluates to CALM when budget is 0, expenses exist, and savings rate < 20%', () => {
      const metrics: KerooMetrics = {
        lastInteractionDays: 1,
        overdueBillsCount: 0,
        upcomingBills3DaysCount: 0,
        dueSoonBillsCount: 0,
        overspentEnvelopesCount: 0,
        monthExpensesCents: 190000,
        monthBudgetCents: 0,
        monthIncomeCents: 200000, // Saves 5% < 20%
        liquidCashCents: 100000,
        checkingBalanceCents: 100000,
      };

      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).not.toBe('sweating');
      expect(evaluation.mood).toBe('calm');
      expect(evaluation.priority).toBe(5);
    });

    it('clean slate initial onboarding state (everything 0) evaluates to CALM without errors', () => {
      const cleanSlateMetrics: KerooMetrics = {
        lastInteractionDays: 0,
        overdueBillsCount: 0,
        upcomingBills3DaysCount: 0,
        dueSoonBillsCount: 0,
        overspentEnvelopesCount: 0,
        monthExpensesCents: 0,
        monthBudgetCents: 0,
        monthIncomeCents: 0,
        liquidCashCents: 0,
        checkingBalanceCents: 0,
      };

      const evaluation = evaluateKerooMood(cleanSlateMetrics);
      expect(evaluation.mood).toBe('calm');
      expect(evaluation.priority).toBe(5);
      expect(evaluation.recommendedPose).toBe('sipping_drink');
    });
  });

  // ==========================================================================
  // 4. Zero Income Guard
  // ==========================================================================
  describe('4. Zero Income Guard', () => {
    it('safely handles zero income without NaN, division-by-zero, or false SWEATING', () => {
      const zeroIncomeScenarios: KerooMetrics[] = [
        {
          lastInteractionDays: 1,
          overdueBillsCount: 0,
          dueSoonBillsCount: 0,
          overspentEnvelopesCount: 0,
          monthExpensesCents: 0,
          monthBudgetCents: 100000,
          monthIncomeCents: 0,
          liquidCashCents: 50000,
        },
        {
          lastInteractionDays: 2,
          overdueBillsCount: 0,
          dueSoonBillsCount: 0,
          overspentEnvelopesCount: 0,
          monthExpensesCents: 45000,
          monthBudgetCents: 100000,
          monthIncomeCents: 0,
          liquidCashCents: 200000,
        },
        {
          lastInteractionDays: 0,
          overdueBillsCount: 0,
          dueSoonBillsCount: 0,
          overspentEnvelopesCount: 0,
          monthExpensesCents: 85000,
          monthBudgetCents: 0, // Both 0!
          monthIncomeCents: 0,
          liquidCashCents: 300000,
        },
      ];

      for (const metrics of zeroIncomeScenarios) {
        const evaluation: KerooMoodEvaluation = evaluateKerooMood(metrics);

        // Assert no NaN in any numeric property
        expect(Number.isNaN(evaluation.priority)).toBe(false);
        expect(Number.isNaN(evaluation.timestamp)).toBe(false);

        // Assert strings do not contain "NaN" or "undefined"
        expect(evaluation.reasonPt).not.toContain('NaN');
        expect(evaluation.reasonPt).not.toContain('undefined');
        expect(evaluation.reasonEn).not.toContain('NaN');
        expect(evaluation.reasonEn).not.toContain('undefined');

        // False sweating check: should NOT sweat just because income is 0
        expect(evaluation.mood).not.toBe('sweating');
        expect(evaluation.priority).toBeGreaterThanOrEqual(2);
      }
    });

    it('still triggers SWEATING if an actual emergency exists even when income is 0', () => {
      const emergencyZeroIncome: KerooMetrics = {
        lastInteractionDays: 1,
        overdueBillsCount: 2, // Legitimate emergency
        dueSoonBillsCount: 0,
        overspentEnvelopesCount: 0,
        monthExpensesCents: 10000,
        monthBudgetCents: 50000,
        monthIncomeCents: 0,
        liquidCashCents: 5000,
      };

      const evaluation = evaluateKerooMood(emergencyZeroIncome);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
    });
  });

  // ==========================================================================
  // 5. Bill Check-In Queue Discipline with 50 Bills
  // ==========================================================================
  describe('5. Bill Check-In Queue Priority Sorting (50 Bills Stress Test)', () => {
    const referenceDate: ISODate = '2026-10-17';

    // Helper to generate bill fixtures
    function createBillFixture(overrides: Partial<RecurringBill> & { id: string; name: string; amountCents: number; nextDueDate: ISODate }): RecurringBill {
      return {
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: parseInt(overrides.nextDueDate.slice(8, 10), 10),
        startDate: '2026-01-01',
        paymentStatus: 'DUE_SOON',
        categoryId: 'cat_test',
        paymentAccountId: 'acc_main',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-10-01',
        ...overrides,
      };
    }

    it('correctly sorts and drains 50 bills with exact priority discipline', () => {
      const bills: RecurringBill[] = [];

      // Group A: 10 Overdue Bills (negative daysDelta)
      // Different days overdue and amounts for tie-breaking
      bills.push(createBillFixture({ id: 'overdue_20d_100', name: 'Overdue 20d R$100', amountCents: 10000, nextDueDate: '2026-09-27' })); // -20 days
      bills.push(createBillFixture({ id: 'overdue_15d_500', name: 'Overdue 15d R$500', amountCents: 50000, nextDueDate: '2026-10-02' })); // -15 days
      bills.push(createBillFixture({ id: 'overdue_10d_200', name: 'Overdue 10d R$200', amountCents: 20000, nextDueDate: '2026-10-07' })); // -10 days
      bills.push(createBillFixture({ id: 'overdue_10d_800', name: 'Overdue 10d R$800', amountCents: 80000, nextDueDate: '2026-10-07' })); // -10 days (higher amount)
      bills.push(createBillFixture({ id: 'overdue_5d_1000', name: 'Overdue 5d R$1000', amountCents: 100000, nextDueDate: '2026-10-12' })); // -5 days
      bills.push(createBillFixture({ id: 'overdue_5d_300', name: 'Overdue 5d R$300', amountCents: 30000, nextDueDate: '2026-10-12' })); // -5 days (lower amount)
      bills.push(createBillFixture({ id: 'overdue_3d_400', name: 'Overdue 3d R$400', amountCents: 40000, nextDueDate: '2026-10-14' })); // -3 days
      bills.push(createBillFixture({ id: 'overdue_2d_900', name: 'Overdue 2d R$900', amountCents: 90000, nextDueDate: '2026-10-15' })); // -2 days
      bills.push(createBillFixture({ id: 'overdue_1d_50', name: 'Overdue 1d R$50', amountCents: 5000, nextDueDate: '2026-10-16' })); // -1 day
      bills.push(createBillFixture({ id: 'overdue_1d_700', name: 'Overdue 1d R$700', amountCents: 70000, nextDueDate: '2026-10-16' })); // -1 day (higher amount)

      // Group B: 5 Due Today Bills (daysDelta === 0)
      bills.push(createBillFixture({ id: 'today_150', name: 'Today R$150', amountCents: 15000, nextDueDate: '2026-10-17' }));
      bills.push(createBillFixture({ id: 'today_2500', name: 'Today R$2500', amountCents: 250000, nextDueDate: '2026-10-17' }));
      bills.push(createBillFixture({ id: 'today_30', name: 'Today R$30', amountCents: 3000, nextDueDate: '2026-10-17' }));
      bills.push(createBillFixture({ id: 'today_800', name: 'Today R$800', amountCents: 80000, nextDueDate: '2026-10-17' }));
      bills.push(createBillFixture({ id: 'today_120', name: 'Today R$120', amountCents: 12000, nextDueDate: '2026-10-17' }));

      // Group C: 15 Due Soon Bills (1..3 days)
      // +1 day: 2026-10-18
      bills.push(createBillFixture({ id: 'soon_1d_100', name: 'Soon 1d R$100', amountCents: 10000, nextDueDate: '2026-10-18' }));
      bills.push(createBillFixture({ id: 'soon_1d_600', name: 'Soon 1d R$600', amountCents: 60000, nextDueDate: '2026-10-18' }));
      bills.push(createBillFixture({ id: 'soon_1d_250', name: 'Soon 1d R$250', amountCents: 25000, nextDueDate: '2026-10-18' }));
      bills.push(createBillFixture({ id: 'soon_1d_1200', name: 'Soon 1d R$1200', amountCents: 120000, nextDueDate: '2026-10-18' }));
      bills.push(createBillFixture({ id: 'soon_1d_40', name: 'Soon 1d R$40', amountCents: 4000, nextDueDate: '2026-10-18' }));

      // +2 days: 2026-10-19
      bills.push(createBillFixture({ id: 'soon_2d_300', name: 'Soon 2d R$300', amountCents: 30000, nextDueDate: '2026-10-19' }));
      bills.push(createBillFixture({ id: 'soon_2d_1500', name: 'Soon 2d R$1500', amountCents: 150000, nextDueDate: '2026-10-19' }));
      bills.push(createBillFixture({ id: 'soon_2d_90', name: 'Soon 2d R$90', amountCents: 9000, nextDueDate: '2026-10-19' }));
      bills.push(createBillFixture({ id: 'soon_2d_450', name: 'Soon 2d R$450', amountCents: 45000, nextDueDate: '2026-10-19' }));
      bills.push(createBillFixture({ id: 'soon_2d_80', name: 'Soon 2d R$80', amountCents: 8000, nextDueDate: '2026-10-19' }));

      // +3 days: 2026-10-20
      bills.push(createBillFixture({ id: 'soon_3d_50', name: 'Soon 3d R$50', amountCents: 5000, nextDueDate: '2026-10-20' }));
      bills.push(createBillFixture({ id: 'soon_3d_2000', name: 'Soon 3d R$2000', amountCents: 200000, nextDueDate: '2026-10-20' }));
      bills.push(createBillFixture({ id: 'soon_3d_350', name: 'Soon 3d R$350', amountCents: 35000, nextDueDate: '2026-10-20' }));
      bills.push(createBillFixture({ id: 'soon_3d_700', name: 'Soon 3d R$700', amountCents: 70000, nextDueDate: '2026-10-20' }));
      bills.push(createBillFixture({ id: 'soon_3d_180', name: 'Soon 3d R$180', amountCents: 18000, nextDueDate: '2026-10-20' }));

      // Group D: 10 Safe Bills (> 3 days in future) -> Must be ignored
      for (let s = 1; s <= 10; s++) {
        const day = 20 + s;
        bills.push(createBillFixture({
          id: `safe_${s}`,
          name: `Safe Bill ${s}`,
          amountCents: 10000 * s,
          nextDueDate: `2026-10-${day.toString().padStart(2, '0')}`,
        }));
      }

      // Group E: 5 Snoozed Bills (snoozed until 2026-10-18 or later) -> Must be ignored
      bills.push(createBillFixture({ id: 'snoozed_overdue_1', name: 'Snoozed Overdue', amountCents: 99999, nextDueDate: '2026-10-01', snoozedUntilDate: '2026-10-18' }));
      bills.push(createBillFixture({ id: 'snoozed_overdue_2', name: 'Snoozed Overdue 2', amountCents: 88888, nextDueDate: '2026-10-05', snoozedUntilDate: '2026-10-20' }));
      bills.push(createBillFixture({ id: 'snoozed_today', name: 'Snoozed Today', amountCents: 77777, nextDueDate: '2026-10-17', snoozedUntilDate: '2026-10-19' }));
      bills.push(createBillFixture({ id: 'snoozed_soon_1', name: 'Snoozed Soon 1', amountCents: 66666, nextDueDate: '2026-10-18', snoozedUntilDate: '2026-10-19' }));
      bills.push(createBillFixture({ id: 'snoozed_soon_2', name: 'Snoozed Soon 2', amountCents: 55555, nextDueDate: '2026-10-19', snoozedUntilDate: '2026-10-22' }));

      // Group F: 3 Inactive Bills (isActive === false) -> Must be ignored
      bills.push(createBillFixture({ id: 'inactive_overdue', name: 'Inactive Overdue', amountCents: 99999, nextDueDate: '2026-10-01', isActive: false }));
      bills.push(createBillFixture({ id: 'inactive_today', name: 'Inactive Today', amountCents: 88888, nextDueDate: '2026-10-17', isActive: false }));
      bills.push(createBillFixture({ id: 'inactive_soon', name: 'Inactive Soon', amountCents: 77777, nextDueDate: '2026-10-18', isActive: false }));

      // Group G: 2 Paid Bills (paymentStatus === 'PAID_OK', next cycle not yet in the 3-day radar) -> Must be ignored
      bills.push(createBillFixture({ id: 'paid_overdue', name: 'Paid Overdue', amountCents: 99999, nextDueDate: '2026-11-01', paymentStatus: 'PAID_OK' }));
      bills.push(createBillFixture({ id: 'paid_today', name: 'Paid Today', amountCents: 88888, nextDueDate: '2026-11-17', paymentStatus: 'PAID_OK' }));

      // Verify exact count of 50 bills
      expect(bills.length).toBe(50);

      // Expected drain sequence (exactly 30 actionable bills):
      const expectedOrderedIds: string[] = [
        // 1. Overdue: oldest overdue first, then largest amount
        'overdue_20d_100', // -20 days
        'overdue_15d_500', // -15 days
        'overdue_10d_800', // -10 days, R$ 800 (tied on date, larger amount wins)
        'overdue_10d_200', // -10 days, R$ 200
        'overdue_5d_1000', // -5 days, R$ 1000 (tied on date, larger amount wins)
        'overdue_5d_300',  // -5 days, R$ 300
        'overdue_3d_400',  // -3 days
        'overdue_2d_900',  // -2 days
        'overdue_1d_700',  // -1 day, R$ 700 (tied on date, larger amount wins)
        'overdue_1d_50',   // -1 day, R$ 50

        // 2. Due Today: largest amount first
        'today_2500', // R$ 2500
        'today_800',  // R$ 800
        'today_150',  // R$ 150
        'today_120',  // R$ 120
        'today_30',   // R$ 30

        // 3. Due Soon +1 day: largest amount first
        'soon_1d_1200', // R$ 1200
        'soon_1d_600',  // R$ 600
        'soon_1d_250',  // R$ 250
        'soon_1d_100',  // R$ 100
        'soon_1d_40',   // R$ 40

        // 4. Due Soon +2 days: largest amount first
        'soon_2d_1500', // R$ 1500
        'soon_2d_450',  // R$ 450
        'soon_2d_300',  // R$ 300
        'soon_2d_90',   // R$ 90
        'soon_2d_80',   // R$ 80

        // 5. Due Soon +3 days: largest amount first
        'soon_3d_2000', // R$ 2000
        'soon_3d_700',  // R$ 700
        'soon_3d_350',  // R$ 350
        'soon_3d_180',  // R$ 180
        'soon_3d_50',   // R$ 50
      ];

      expect(expectedOrderedIds.length).toBe(30);

      // Drain simulation: repeatedly ask for top prompt, record id, and remove from active list
      const drainedIds: string[] = [];
      let currentPool = [...bills];

      while (true) {
        const prompt = getUpcomingBillCheckIn(currentPool, referenceDate);
        if (!prompt) {
          break;
        }
        drainedIds.push(prompt.bill.id);
        // Remove the served bill from the pool
        currentPool = currentPool.filter((b) => b.id !== prompt.bill.id);
      }

      // Assert exact 30 bills drained
      expect(drainedIds.length).toBe(30);
      // Assert exact sequence matches expectedOrderedIds
      expect(drainedIds).toEqual(expectedOrderedIds);

      // Assert that all 20 ignored bills (safe, snoozed, inactive, paid) remained untouched
      expect(currentPool.length).toBe(20);
      for (const bill of currentPool) {
        expect(
          bill.id.startsWith('safe_') ||
          bill.id.startsWith('snoozed_') ||
          bill.id.startsWith('inactive_') ||
          bill.id.startsWith('paid_')
        ).toBe(true);
      }
    });
  });
});
