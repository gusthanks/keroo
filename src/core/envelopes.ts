/**
 * src/core/envelopes.ts
 *
 * Envelope Budgeting Engine for Keroo.
 * Zero-Based Budgeting (ZBB) with To-Be-Budgeted (TBB) pool,
 * category available balance tracking, activity aggregation,
 * and monthly rollover transitions ('rollover_negative' vs 'reset_zero').
 */

import type { Cents, YearMonth, MonthlyEnvelope, Transaction, Category } from '../types';
import { assertIntegerCents } from './currency';

export interface EnvelopeSummary {
  yearMonth: YearMonth;
  totalIncomeCents: Cents;
  totalAssignedCents: Cents;
  totalActivityCents: Cents;
  totalAvailableCents: Cents;
  toBeBudgetCents: Cents;
  overspentCount: number;
  totalOverspentCents: Cents;
}

export interface MonthTransitionResult {
  nextYearMonth: YearMonth;
  newEnvelopes: MonthlyEnvelope[];
  toBeBudgetCents: Cents;
  overspentDeductedCents: Cents;
}

// ============================================================================
// YearMonth String Arithmetic Helpers
// ============================================================================

export function isValidYearMonth(ym: string): ym is YearMonth {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(ym);
}

export function assertValidYearMonth(ym: string, context = 'YearMonth'): void {
  if (!isValidYearMonth(ym)) {
    throw new TypeError(
      `[EnvelopeError] Invalid YearMonth format in ${context}: expected 'YYYY-MM', received '${ym}'`
    );
  }
}

export function getNextYearMonth(ym: YearMonth): YearMonth {
  assertValidYearMonth(ym, 'getNextYearMonth');
  const [yearStr, monthStr] = ym.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);

  if (month === 12) {
    year += 1;
    month = 1;
  } else {
    month += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

export function getPreviousYearMonth(ym: YearMonth): YearMonth {
  assertValidYearMonth(ym, 'getPreviousYearMonth');
  const [yearStr, monthStr] = ym.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(monthStr, 10);

  if (month === 1) {
    year -= 1;
    month = 12;
  } else {
    month -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

export function isDateInYearMonth(isoDate: string, ym: YearMonth): boolean {
  return typeof isoDate === 'string' && isoDate.startsWith(ym);
}

// ============================================================================
// Available Balance Calculation
// ============================================================================

/**
 * Computes available envelope balance:
 * Available = Rollover + Assigned - Activity
 */
export function computeAvailableBalance(
  assignedCents: number,
  activityCents: number,
  rolloverCents: number = 0
): number {
  assertIntegerCents(assignedCents, 'computeAvailableBalance: assignedCents');
  assertIntegerCents(activityCents, 'computeAvailableBalance: activityCents');
  assertIntegerCents(rolloverCents, 'computeAvailableBalance: rolloverCents');

  const available = rolloverCents + assignedCents - activityCents;
  assertIntegerCents(available, 'computeAvailableBalance: result');
  return available;
}

export const calculateEnvelopeAvailable = (
  rolloverCents: number,
  assignedCents: number,
  activityCents: number
): number => {
  return computeAvailableBalance(assignedCents, activityCents, rolloverCents);
};

// ============================================================================
// Activity Aggregation
// ============================================================================

/**
 * Computes net expenditure for a category in a specific month:
 * Expenses, card installments, and split shares increase activity (+).
 * Inflows/refunds assigned to this category decrease activity (-).
 */
export function calculateCategoryActivity(
  categoryId: string,
  yearMonth: YearMonth,
  transactions: Transaction[]
): number {
  assertValidYearMonth(yearMonth, 'calculateCategoryActivity: yearMonth');

  let netActivityCents = 0;

  for (const tx of transactions) {
    if (tx.categoryId !== categoryId) continue;
    if (!isDateInYearMonth(tx.date, yearMonth)) continue;

    if (tx.type === 'expense' || tx.type === 'cc_installment' || tx.type === 'split_share') {
      netActivityCents += tx.amountCents;
    } else if (tx.type === 'income') {
      netActivityCents -= tx.amountCents;
    }
  }

  assertIntegerCents(netActivityCents, 'calculateCategoryActivity: netActivityCents');
  return netActivityCents;
}

// ============================================================================
// To-Be-Budgeted (TBB) Pool Calculation
// ============================================================================

/**
 * Computes To-Be-Budgeted pool.
 * Supports both simple 2-arg (totalIncomeCents, assignedCentsSum) and
 * comprehensive 4-arg formulas with previous month rollover & overspending deduction.
 */
export function computeToBeBudgeted(
  totalIncomeCents: number,
  assignedCentsSum: number,
  previousMonthTBB: number = 0,
  previousMonthResetOverspent: number = 0
): number {
  assertIntegerCents(totalIncomeCents, 'computeToBeBudgeted: totalIncomeCents');
  assertIntegerCents(assignedCentsSum, 'computeToBeBudgeted: assignedCentsSum');
  assertIntegerCents(previousMonthTBB, 'computeToBeBudgeted: previousMonthTBB');
  assertIntegerCents(previousMonthResetOverspent, 'computeToBeBudgeted: previousMonthResetOverspent');

  const tbb = previousMonthTBB + totalIncomeCents - assignedCentsSum - previousMonthResetOverspent;
  assertIntegerCents(tbb, 'computeToBeBudgeted: result');
  return tbb;
}

export function calculateToBeBudgeted(
  previousMonthTBB: number,
  currentMonthIncomeCents: number,
  currentMonthEnvelopes: MonthlyEnvelope[],
  previousMonthResetOverspentCents = 0
): number {
  assertIntegerCents(previousMonthTBB, 'calculateToBeBudgeted: previousMonthTBB');
  assertIntegerCents(currentMonthIncomeCents, 'calculateToBeBudgeted: currentMonthIncomeCents');
  assertIntegerCents(previousMonthResetOverspentCents, 'calculateToBeBudgeted: previousMonthResetOverspentCents');

  const totalAssignedCents = currentMonthEnvelopes.reduce((acc, env) => {
    assertIntegerCents(env.assignedCents, 'calculateToBeBudgeted: assignedCents');
    return acc + env.assignedCents;
  }, 0);

  return computeToBeBudgeted(
    currentMonthIncomeCents,
    totalAssignedCents,
    previousMonthTBB,
    previousMonthResetOverspentCents
  );
}

// ============================================================================
// Month Boundary Transition Engine
// ============================================================================

/**
 * Computes transition of monthly envelopes to next month:
 * In 'rollover_negative' mode:
 *   - Positive available balance carries forward.
 *   - Negative available balance (overspending) carries forward inside the category envelope.
 * In 'reset_zero' mode:
 *   - Positive available balance carries forward.
 *   - Negative available balance resets to zero in envelope, and is absorbed/deducted from TBB.
 */
export function computeMonthTransition(
  currentMonthEnvelopes: MonthlyEnvelope[],
  _currentMonthTransactions: Transaction[],
  nextMonthYearMonth: string,
  mode: 'rollover_negative' | 'reset_zero' = 'rollover_negative',
  categories?: Category[],
  _currentMonthTBB: number = 0
): MonthlyEnvelope[] {
  assertValidYearMonth(nextMonthYearMonth, 'computeMonthTransition: nextMonthYearMonth');

  const newEnvelopes: MonthlyEnvelope[] = [];

  // Group or iterate over envelopes
  for (const env of currentMonthEnvelopes) {
    const available = env.availableCents;
    let nextRolloverCents = 0;

    // Determine rollover mode for this envelope (category-specific or default)
    let envMode = mode;
    if (categories) {
      const cat = categories.find((c) => c.id === env.categoryId);
      if (cat?.rolloverMode) {
        envMode = cat.rolloverMode;
      }
    }

    if (available >= 0) {
      nextRolloverCents = available;
    } else {
      if (envMode === 'rollover_negative') {
        nextRolloverCents = available; // Retain negative deficit
      } else {
        nextRolloverCents = 0; // Reset to 0
      }
    }

    newEnvelopes.push({
      id: `${env.categoryId}_${nextMonthYearMonth}`,
      categoryId: env.categoryId,
      yearMonth: nextMonthYearMonth,
      assignedCents: 0,
      activityCents: 0,
      availableCents: nextRolloverCents,
    });
  }

  return newEnvelopes;
}

export function computeMonthTransitionDetailed(
  currentMonthEnvelopes: MonthlyEnvelope[],
  _currentMonthTransactions: Transaction[],
  nextMonthYearMonth: YearMonth,
  categories: Category[],
  currentMonthTBB: number
): MonthTransitionResult {
  assertValidYearMonth(nextMonthYearMonth, 'computeMonthTransitionDetailed: nextMonthYearMonth');
  assertIntegerCents(currentMonthTBB, 'computeMonthTransitionDetailed: currentMonthTBB');

  let overspentDeductedCents = 0;
  const newEnvelopes: MonthlyEnvelope[] = [];

  for (const category of categories) {
    if (category.isArchived) continue;

    const existingEnv = currentMonthEnvelopes.find((e) => e.categoryId === category.id);
    const available = existingEnv ? existingEnv.availableCents : 0;
    const mode = category.rolloverMode ?? 'rollover_negative';

    let nextRolloverCents = 0;

    if (available >= 0) {
      nextRolloverCents = available;
    } else {
      if (mode === 'rollover_negative') {
        nextRolloverCents = available;
      } else {
        nextRolloverCents = 0;
        overspentDeductedCents += Math.abs(available);
      }
    }

    newEnvelopes.push({
      id: `${category.id}_${nextMonthYearMonth}`,
      categoryId: category.id,
      yearMonth: nextMonthYearMonth,
      assignedCents: 0,
      activityCents: 0,
      availableCents: nextRolloverCents,
    });
  }

  const nextMonthStartingTBB = currentMonthTBB - overspentDeductedCents;
  assertIntegerCents(nextMonthStartingTBB, 'computeMonthTransitionDetailed: nextMonthStartingTBB');

  return {
    nextYearMonth: nextMonthYearMonth,
    newEnvelopes,
    toBeBudgetCents: nextMonthStartingTBB,
    overspentDeductedCents,
  };
}

// ============================================================================
// Envelope Summary Helper
// ============================================================================

export function computeEnvelopeSummary(
  envelopes: MonthlyEnvelope[],
  unassignedIncomeCents: number,
  previousMonthTBB = 0,
  previousMonthResetOverspent = 0
): EnvelopeSummary {
  let totalAssignedCents = 0;
  let totalActivityCents = 0;
  let totalAvailableCents = 0;
  let overspentCount = 0;
  let totalOverspentCents = 0;

  for (const env of envelopes) {
    totalAssignedCents += env.assignedCents;
    totalActivityCents += env.activityCents;
    totalAvailableCents += env.availableCents;

    if (env.availableCents < 0) {
      overspentCount += 1;
      totalOverspentCents += Math.abs(env.availableCents);
    }
  }

  const toBeBudgetCents = computeToBeBudgeted(
    unassignedIncomeCents,
    totalAssignedCents,
    previousMonthTBB,
    previousMonthResetOverspent
  );

  return {
    yearMonth: envelopes.length > 0 ? envelopes[0].yearMonth : '2026-10',
    totalIncomeCents: unassignedIncomeCents,
    totalAssignedCents,
    totalActivityCents,
    totalAvailableCents,
    toBeBudgetCents,
    overspentCount,
    totalOverspentCents,
  };
}
