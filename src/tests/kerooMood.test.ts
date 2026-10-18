/**
 * src/tests/kerooMood.test.ts
 *
 * Comprehensive Test Suite for Deterministic Keroo Mood Engine.
 * Verifies:
 * 1. 5-State Mood Transitions (thriving, calm, alert, sweating, sleepy).
 * 2. Strict Priority Cascade (Critical Tension > Inactivity > Alert > Thriving > Calm).
 * 3. Zero-budget and boundary guards (zero division immunity).
 * 4. Sub-2ms Performance Benchmark across 1,000 iterations.
 * 5. Proactive Bill Check-In Queue Prioritization.
 * 6. 1-Click Action Handlers (Payment, Snooze, Edit Amount).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  evaluateKerooMood,
  getUpcomingBillCheckIn,
  handleBillPaymentAction,
  handleBillSnoozeAction,
  handleBillEditAmountAction,
  type KerooMetrics,
} from '../core/kerooMood';
import type { RecurringBill } from '../types';
import { KerooDatabase } from '../db';

describe('Deterministic Keroo Mood Engine', () => {
  // Base healthy metrics template
  const baseHealthyMetrics: KerooMetrics = {
    lastInteractionDays: 1,
    overdueBillsCount: 0,
    overdueBillsTotalCents: 0,
    upcomingBills3DaysCount: 0,
    dueSoonBillsCount: 0,
    dueSoonBillsTotalCents: 0,
    overspentEnvelopesCount: 0,
    totalOverspentCents: 0,
    monthExpensesCents: 200000, // R$ 2.000,00
    monthBudgetCents: 300000,   // R$ 3.000,00 (66% utilization)
    monthIncomeCents: 350000,   // R$ 3.500,00 (saves 1500 / 3500 = 42.8% >= 20%)
    liquidCashCents: 500000,    // R$ 5.000,00
    checkingBalanceCents: 500000,
    committedBillsNext30DaysCents: 100000,
  };

  describe('Priority Cascade & Mood State Transitions', () => {
    it('evaluates to THRIVING when savings rate >= 20% and zero debt/obligations pending', () => {
      const evaluation = evaluateKerooMood(baseHealthyMetrics);
      expect(evaluation.mood).toBe('thriving');
      expect(evaluation.priority).toBe(4);
      expect(evaluation.recommendedPose).toBe('peace_dab');
      expect(evaluation.toString()).toBe('thriving');
    });

    it('evaluates to CALM when finances are in equilibrium but savings rate < 20%', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        monthIncomeCents: 220000, // R$ 2.200,00 (saves 200 / 2200 = 9% < 20%)
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('calm');
      expect(evaluation.priority).toBe(5);
      expect(evaluation.recommendedPose).toBe('sipping_drink');
    });

    it('Priority 1 strictly preempts Inactivity (overdue bill overrides 10 days idle -> sweating)', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        lastInteractionDays: 10, // Dormant >= 5 days
        overdueBillsCount: 1,    // Emergency!
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
      expect(evaluation.recommendedPose).toBe('waterfall_tears');
    });

    it('Priority 1 triggers on budget breach (monthExpensesCents > monthBudgetCents -> sweating)', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        monthExpensesCents: 320000, // Exceeds budget of 300000
        monthBudgetCents: 300000,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
      expect(evaluation.recommendedPose).toBe('melted_blob');
    });

    it('Priority 1 triggers on severe envelope overspending (>= 2 overspent envelopes -> sweating)', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        overspentEnvelopesCount: 2,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
    });

    it('Priority 1 triggers on acute liquidity shortfall (checking balance < due soon bills)', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        checkingBalanceCents: 10000,  // R$ 100,00
        dueSoonBillsTotalCents: 50000, // R$ 500,00 needed
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
      expect(evaluation.recommendedPose).toBe('melted_blob');
    });

    it('Priority 1 triggers when liquid cash is strictly negative', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        liquidCashCents: -5000, // Overdrawn account
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('sweating');
      expect(evaluation.priority).toBe(1);
    });

    it('Priority 2 triggers on inactivity (lastInteractionDays >= 5) when no Priority 1 emergencies exist', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        lastInteractionDays: 6,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('sleepy');
      expect(evaluation.priority).toBe(2);
      expect(evaluation.recommendedPose).toBe('sleeping_bubble');
    });

    it('Priority 3 triggers on upcoming bills due within 3 days -> alert', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        dueSoonBillsCount: 2,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('alert');
      expect(evaluation.priority).toBe(3);
      expect(evaluation.recommendedPose).toBe('curious_head_tilt');
    });

    it('Priority 3 triggers on upcomingBills3DaysCount alias -> alert', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        dueSoonBillsCount: 0,
        upcomingBills3DaysCount: 1,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('alert');
      expect(evaluation.priority).toBe(3);
    });

    it('Priority 3 triggers on high budget utilization (>= 80% or >= 85%) -> alert', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        monthExpensesCents: 260000, // 260000 / 300000 = 86.6% >= 80% and >= 85%
        monthBudgetCents: 300000,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('alert');
      expect(evaluation.priority).toBe(3);
      expect(evaluation.recommendedPose).toBe('toast_face');
    });

    it('Priority 3 triggers on single envelope overspent -> alert', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        overspentEnvelopesCount: 1,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('alert');
      expect(evaluation.priority).toBe(3);
    });

    it('Priority 3 triggers on mild inactivity (>= 3 days) -> alert', () => {
      const metrics: KerooMetrics = {
        ...baseHealthyMetrics,
        lastInteractionDays: 4,
      };
      const evaluation = evaluateKerooMood(metrics);
      expect(evaluation.mood).toBe('alert');
      expect(evaluation.priority).toBe(3);
    });
  });

  describe('Zero-Budget and Arithmetic Edge Cases', () => {
    it('safely handles zero budget without division by zero errors', () => {
      const zeroBudgetMetrics: KerooMetrics = {
        ...baseHealthyMetrics,
        monthBudgetCents: 0,
        monthExpensesCents: 150000,
        monthIncomeCents: 300000,
      };
      const evaluation = evaluateKerooMood(zeroBudgetMetrics);
      // With zero budget, budget safe predicate is true (monthBudgetCents === 0), so it can thrive!
      expect(evaluation.mood).toBe('thriving');
    });

    it('safely handles zero income without errors', () => {
      const zeroIncomeMetrics: KerooMetrics = {
        ...baseHealthyMetrics,
        monthIncomeCents: 0,
        monthExpensesCents: 50000,
      };
      const evaluation = evaluateKerooMood(zeroIncomeMetrics);
      // Not thriving because savings rate requires monthIncomeCents > 0
      expect(evaluation.mood).toBe('calm');
    });
  });

  describe('Sub-2ms Performance Benchmark', () => {
    it('evaluates 1,000 randomized state vectors in well under 2.0ms per iteration', () => {
      const iterations = 1000;
      const testCases: KerooMetrics[] = [];

      for (let i = 0; i < iterations; i++) {
        testCases.push({
          lastInteractionDays: i % 10,
          overdueBillsCount: i % 7 === 0 ? 1 : 0,
          overdueBillsTotalCents: (i % 7 === 0 ? 1 : 0) * 15000,
          dueSoonBillsCount: i % 5 === 0 ? 2 : 0,
          dueSoonBillsTotalCents: (i % 5 === 0 ? 2 : 0) * 8000,
          overspentEnvelopesCount: i % 8 === 0 ? 2 : 0,
          monthExpensesCents: 100000 + (i * 100),
          monthBudgetCents: 200000,
          monthIncomeCents: 250000,
          liquidCashCents: 300000 - (i * 50),
          checkingBalanceCents: 300000 - (i * 50),
          committedBillsNext30DaysCents: 50000,
        });
      }

      const tStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        evaluateKerooMood(testCases[i]);
      }
      const tEnd = performance.now();
      const totalMs = tEnd - tStart;
      const avgMs = totalMs / iterations;

      // Must be strictly < 2.0ms (actual is typically < 0.05ms)
      expect(avgMs).toBeLessThan(2.0);
    });
  });

  describe('Proactive Bill Check-In Queue Generator', () => {
    const today = '2026-10-17';

    const sampleBills: RecurringBill[] = [
      {
        id: 'bill_rent',
        name: 'Aluguel Apartamento',
        amountCents: 250000, // R$ 2.500,00
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 10,
        startDate: '2026-01-10',
        nextDueDate: '2026-10-10', // 7 days overdue!
        paymentStatus: 'OVERDUE',
        categoryId: 'cat_housing',
        paymentAccountId: 'acc_itau',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-10-10',
      },
      {
        id: 'bill_internet',
        name: 'Internet Fibra',
        amountCents: 12000, // R$ 120,00
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 17,
        startDate: '2026-01-17',
        nextDueDate: '2026-10-17', // Due today!
        paymentStatus: 'DUE_TODAY',
        categoryId: 'cat_utilities',
        paymentAccountId: 'acc_nubank',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-10-17',
      },
      {
        id: 'bill_gym',
        name: 'Smart Fit',
        amountCents: 9990, // R$ 99,90
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 19,
        startDate: '2026-01-19',
        nextDueDate: '2026-10-19', // Due in 2 days!
        paymentStatus: 'DUE_SOON',
        categoryId: 'cat_health',
        paymentAccountId: 'acc_nubank',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-10-01',
      },
      {
        id: 'bill_spotify',
        name: 'Spotify Family',
        amountCents: 3490,
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 30,
        startDate: '2026-01-30',
        nextDueDate: '2026-10-30', // Due in 13 days (> 3 days safe)
        paymentStatus: 'UPCOMING_SAFE',
        categoryId: 'cat_entertainment',
        paymentAccountId: 'acc_nubank',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-10-01',
      },
    ];

    it('prioritizes overdue bills above all other bills', () => {
      const prompt = getUpcomingBillCheckIn(sampleBills, today);
      expect(prompt).not.toBeNull();
      expect(prompt!.bill.id).toBe('bill_rent');
      expect(prompt!.urgency).toBe('overdue');
      expect(prompt!.daysDelta).toBe(-7);
      expect(prompt!.promptTextPt).toContain('Aluguel Apartamento');
      expect(prompt!.promptTextPt).toContain('7 dias');
    });

    it('prioritizes due today bill when no overdue bills exist', () => {
      const billsWithoutOverdue = sampleBills.filter((b) => b.id !== 'bill_rent');
      const prompt = getUpcomingBillCheckIn(billsWithoutOverdue, today);
      expect(prompt).not.toBeNull();
      expect(prompt!.bill.id).toBe('bill_internet');
      expect(prompt!.urgency).toBe('due_today');
      expect(prompt!.daysDelta).toBe(0);
      expect(prompt!.promptTextPt).toContain('vence hoje');
    });

    it('prioritizes due soon bill when no overdue or due today bills exist', () => {
      const billsSoonOnly = sampleBills.filter(
        (b) => b.id === 'bill_gym' || b.id === 'bill_spotify'
      );
      const prompt = getUpcomingBillCheckIn(billsSoonOnly, today);
      expect(prompt).not.toBeNull();
      expect(prompt!.bill.id).toBe('bill_gym');
      expect(prompt!.urgency).toBe('due_soon');
      expect(prompt!.daysDelta).toBe(2);
      expect(prompt!.promptTextPt).toContain('2 dias');
    });

    it('ignores bills that are snoozed until after referenceDate', () => {
      const snoozedBills = sampleBills.map((b) =>
        b.id === 'bill_rent' ? { ...b, snoozedUntilDate: '2026-10-18' } : b
      );
      // Rent is snoozed until tomorrow, so Internet (due today) should take priority
      const prompt = getUpcomingBillCheckIn(snoozedBills, today);
      expect(prompt).not.toBeNull();
      expect(prompt!.bill.id).toBe('bill_internet');
    });

    it('ignores inactive bills and returns null if no pending bills in window', () => {
      const safeOnly = sampleBills.filter((b) => b.id === 'bill_spotify');
      const prompt = getUpcomingBillCheckIn(safeOnly, today);
      expect(prompt).toBeNull();
    });
  });

  describe('Check-In 1-Click Action Handlers', () => {
    const testBill: RecurringBill = {
      id: 'bill_test',
      name: 'Internet',
      amountCents: 15000,
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 15,
      startDate: '2026-01-15',
      nextDueDate: '2026-10-15',
      paymentStatus: 'DUE_TODAY',
      categoryId: 'cat_net',
      paymentAccountId: 'acc_itau',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '2026-01-01',
      updatedAt: '2026-10-01',
    };

    it('handleBillPaymentAction advances nextDueDate preserving anchorDay and generates transaction', async () => {
      const result = await handleBillPaymentAction(testBill, '2026-10-15');
      expect(result.updatedBill.lastPaymentDate).toBe('2026-10-15');
      expect(result.updatedBill.nextDueDate).toBe('2026-11-15');
      expect(result.updatedBill.paymentStatus).toBe('UPCOMING_SAFE');
      expect(result.paymentTransaction).toBeDefined();
      expect(result.paymentTransaction!.amountCents).toBe(15000);
      expect(result.paymentTransaction!.type).toBe('expense');
    });

    it('handleBillSnoozeAction sets snoozedUntilDate without mutating nextDueDate', () => {
      const snoozed = handleBillSnoozeAction(testBill, '2026-10-15', 1);
      expect(snoozed.snoozedUntilDate).toBe('2026-10-16');
      expect(snoozed.nextDueDate).toBe('2026-10-15');
    });

    it('handleBillEditAmountAction updates amountCents and rejects negative/zero amounts', () => {
      const edited = handleBillEditAmountAction(testBill, 18000);
      expect(edited.amountCents).toBe(18000);

      expect(() => handleBillEditAmountAction(testBill, 0)).toThrow();
      expect(() => handleBillEditAmountAction(testBill, -500)).toThrow();
    });

    it('handleBillSnoozeAction rejects non-integer or < 1 snoozeDays', () => {
      expect(() => handleBillSnoozeAction(testBill, '2026-10-15', 0)).toThrow(/snoozeDays/);
      expect(() => handleBillSnoozeAction(testBill, '2026-10-15', 1.5)).toThrow(/snoozeDays/);
      expect(() => handleBillSnoozeAction(testBill, '2026-10-15', -2)).toThrow(/snoozeDays/);
    });

    it('handleBillPaymentAction keeps the bill amount when a different amount is paid', async () => {
      const result = await handleBillPaymentAction(testBill, '2026-10-15', { amountCents: 17000 });
      expect(result.updatedBill.amountCents).toBe(15000);
      expect(result.paymentTransaction!.amountCents).toBe(17000);
      expect(result.paymentTransaction!.id).toBeTruthy();
      expect(result.paymentTransaction!.createdAt).toBeTruthy();
    });

    describe('with a real Dexie database (regression: "Já paguei!" DataError)', () => {
      let db: KerooDatabase;
      const now = '2026-10-01T00:00:00.000Z';

      beforeEach(async () => {
        db = new KerooDatabase(`keroo_mood_pay_${Math.random().toString(36).slice(2)}`);
        await db.open();
      });

      afterEach(async () => {
        await db.delete();
      });

      it('persists bill, transaction (with id/timestamps), account debit and envelope activity', async () => {
        await db.accounts.add({
          id: 'acc_itau', name: 'Itaú', type: 'checking', currency: 'BRL',
          initialBalanceCents: 100000, currentBalanceCents: 100000,
          isArchived: false, createdAt: now, updatedAt: now,
        } as any);
        await db.monthly_envelopes.add({
          id: 'cat_net_2026-10', categoryId: 'cat_net', yearMonth: '2026-10',
          assignedCents: 20000, activityCents: 1000, availableCents: 19000,
        });

        await handleBillPaymentAction(testBill, '2026-10-15', { db, amountCents: 16000 });

        const txs = await db.transactions.toArray();
        expect(txs).toHaveLength(1);
        expect(txs[0].id).toBeTruthy();
        expect(txs[0].createdAt).toBeTruthy();
        expect(txs[0].amountCents).toBe(16000);

        const acc = await db.accounts.get('acc_itau');
        expect(acc!.currentBalanceCents).toBe(84000);

        const env = await db.monthly_envelopes.get('cat_net_2026-10');
        expect(env!.activityCents).toBe(17000);
        expect(env!.availableCents).toBe(3000);

        const bill = await db.recurring_bills.get('bill_test');
        expect(bill!.nextDueDate).toBe('2026-11-15');
        expect(bill!.amountCents).toBe(15000);
      });

      it('creates the month envelope when missing', async () => {
        await db.accounts.add({
          id: 'acc_itau', name: 'Itaú', type: 'checking', currency: 'BRL',
          initialBalanceCents: 0, currentBalanceCents: 50000,
          isArchived: false, createdAt: now, updatedAt: now,
        } as any);
        await handleBillPaymentAction(testBill, '2026-10-15', { db });
        const env = await db.monthly_envelopes.get('cat_net_2026-10');
        expect(env).toMatchObject({ assignedCents: 0, activityCents: 15000, availableCents: -15000 });
      });

      it('throws a clear error and writes nothing when the account is missing', async () => {
        await expect(handleBillPaymentAction(testBill, '2026-10-15', { db })).rejects.toThrow(/not found/);
        expect(await db.transactions.count()).toBe(0);
        expect(await db.recurring_bills.count()).toBe(0);
      });
    });
  });
});
