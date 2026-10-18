/**
 * src/core/subscriptions.ts
 *
 * Recurring Bills & Subscriptions Radar Engine for Keroo.
 * Implements:
 * 1. Anchor-day preservation (Invariant 6) preventing schedule drift across short months.
 * 2. Cadence normalization & annualized commitment calculators.
 * 3. 5-state status machine (PAID_OK, UPCOMING_SAFE, DUE_SOON, DUE_TODAY, OVERDUE).
 * 4. Proactive 3-day advance window detector for Keroo speech bubble check-in queue.
 * 5. Cycle progression & atomic payment advancement.
 */

import type {
  Cents,
  ISODate,
  RecurringBill,
  SubscriptionCadence,
  SubscriptionPaymentStatus,
} from '../types';
import { assertIntegerCents, assertPositiveCents } from './currency';
import {
  clampDayToMonth,
  formatISODate,
  parseISODate,
  addMonths,
} from './installments';

// ============================================================================
// Types
// ============================================================================

export interface AnnualCommitmentSummary {
  totalAnnualCents: Cents;
  totalMonthlyEquivalentCents: Cents;
  activeCount: number;
  byCadenceCount: Record<SubscriptionCadence, number>;
}

export interface CheckInQueueItem {
  bill: RecurringBill;
  status: SubscriptionPaymentStatus;
  daysUntilDue: number; // negative if overdue, 0 if today, 1..3 if soon
  urgencyLevel: 'critical' | 'alert' | 'warning';
  priorityScore: number; // lower number = higher priority
}

// ============================================================================
// Date Arithmetic & Day Difference
// ============================================================================

/**
 * Parses an ISODate ('YYYY-MM-DD') into a UTC Date object at midnight.
 * Avoids any local timezone/DST offset distortion.
 */
export function parseISODateToUTC(dateStr: ISODate): Date {
  const { year, month, day } = parseISODate(dateStr);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Calculates calendar day difference (toDate - fromDate).
 * Positive: toDate is in the future.
 * Zero: same calendar day.
 * Negative: toDate is in the past.
 */
export function getCalendarDayDifference(fromDate: ISODate, toDate: ISODate): number {
  const t1 = parseISODateToUTC(fromDate).getTime();
  const t2 = parseISODateToUTC(toDate).getTime();
  const msPerDay = 86400000;
  return Math.round((t2 - t1) / msPerDay);
}

/**
 * Adds an integer number of calendar days to an ISODate.
 */
export function addDaysToISODate(dateStr: ISODate, days: number): ISODate {
  const date = parseISODateToUTC(dateStr);
  date.setUTCDate(date.getUTCDate() + days);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  return formatISODate(y, m, d);
}

// ============================================================================
// Anchor-Day Preservation & Cycle Advancement (Invariant 6)
// ============================================================================

/**
 * Returns the month interval corresponding to a cadence.
 * Returns 0 for day-based cadences (weekly, biweekly).
 */
export function getCadenceMonthDelta(cadence: SubscriptionCadence): number {
  switch (cadence) {
    case 'monthly':
      return 1;
    case 'bimonthly':
      return 2;
    case 'quarterly':
      return 3;
    case 'semi_annually':
      return 6;
    case 'annually':
      return 12;
    case 'weekly':
    case 'biweekly':
      return 0;
    default: {
      const _exhaustive: never = cadence;
      throw new Error(`[SubscriptionsError] Unsupported cadence: ${_exhaustive}`);
    }
  }
}

/**
 * Evaluates the next due date following currentDueDate while preserving anchorDay.
 *
 * Invariant 6 (DATABASE_SCHEMA.md):
 *   (Y_k, M_k) = (Y_0, M_0) + (k * deltaMonths)
 *   dueDate_k = (Y_k, M_k, min(anchorDay, daysInMonth(Y_k, M_k)))
 * Intermediate clamping in short months (e.g. Feb 28) NEVER mutates anchorDay.
 * Subsequent 31-day months automatically restore to day 31.
 */
export function advanceNextDueDate(
  currentDueDate: ISODate,
  cadence: SubscriptionCadence,
  anchorDay: number
): ISODate {
  if (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31) {
    throw new RangeError(
      `[SubscriptionsError] anchorDay must be between 1 and 31, received: ${anchorDay}`
    );
  }

  if (cadence === 'weekly') {
    return addDaysToISODate(currentDueDate, 7);
  }
  if (cadence === 'biweekly') {
    return addDaysToISODate(currentDueDate, 14);
  }

  const { year, month } = parseISODate(currentDueDate);
  const deltaMonths = getCadenceMonthDelta(cadence);
  const next = addMonths(year, month, deltaMonths);
  const clampedDay = clampDayToMonth(next.year, next.month, anchorDay);

  return formatISODate(next.year, next.month, clampedDay);
}

/**
 * Projects a sequence of N consecutive future due dates starting from initialDueDate.
 * Demonstrates anchor-day preservation over arbitrarily long horizons (e.g. 24 months).
 */
export function projectSubscriptionCycles(
  initialDueDate: ISODate,
  cadence: SubscriptionCadence,
  anchorDay: number,
  numCycles = 24
): ISODate[] {
  if (!Number.isInteger(numCycles) || numCycles < 1) {
    throw new RangeError(`[SubscriptionsError] numCycles must be >= 1, received: ${numCycles}`);
  }

  const result: ISODate[] = [initialDueDate];
  let current = initialDueDate;

  for (let i = 1; i < numCycles; i++) {
    current = advanceNextDueDate(current, cadence, anchorDay);
    result.push(current);
  }

  return result;
}

// ============================================================================
// Cadence Normalization & Cost Calculators
// ============================================================================

/**
 * Returns how many billing cycles occur in one calendar year for a cadence.
 */
export function getCadenceCyclesPerYear(cadence: SubscriptionCadence): number {
  switch (cadence) {
    case 'weekly':
      return 52;
    case 'biweekly':
      return 26;
    case 'monthly':
      return 12;
    case 'bimonthly':
      return 6;
    case 'quarterly':
      return 4;
    case 'semi_annually':
      return 2;
    case 'annually':
      return 1;
    default: {
      const _exhaustive: never = cadence;
      throw new Error(`[SubscriptionsError] Unsupported cadence: ${_exhaustive}`);
    }
  }
}

/**
 * Calculates annualized commitment cost in cents for a subscription.
 */
export function getAnnualizedCostCents(
  amountCents: Cents,
  cadence: SubscriptionCadence
): Cents {
  assertPositiveCents(amountCents, 'getAnnualizedCostCents: amountCents');
  const cycles = getCadenceCyclesPerYear(cadence);
  const total = amountCents * cycles;
  assertIntegerCents(total, 'getAnnualizedCostCents: result');
  return total;
}

/**
 * Calculates normalized monthly equivalent cost in cents (rounded half-up).
 */
export function getMonthlyEquivalentCostCents(
  amountCents: Cents,
  cadence: SubscriptionCadence
): Cents {
  assertPositiveCents(amountCents, 'getMonthlyEquivalentCostCents: amountCents');
  const annual = getAnnualizedCostCents(amountCents, cadence);
  const monthly = Math.round(annual / 12);
  assertIntegerCents(monthly, 'getMonthlyEquivalentCostCents: result');
  return monthly;
}

/**
 * Calculates total annual and monthly commitment summary across a collection of bills.
 */
export function calculateAnnualCommitment(
  bills: RecurringBill[]
): AnnualCommitmentSummary {
  let totalAnnual = 0;
  let activeCount = 0;

  const byCadenceCount: Record<SubscriptionCadence, number> = {
    weekly: 0,
    biweekly: 0,
    monthly: 0,
    bimonthly: 0,
    quarterly: 0,
    semi_annually: 0,
    annually: 0,
  };

  for (const bill of bills) {
    if (!bill.isActive) continue;

    activeCount += 1;
    byCadenceCount[bill.cadence] = (byCadenceCount[bill.cadence] || 0) + 1;

    totalAnnual += getAnnualizedCostCents(bill.amountCents, bill.cadence);
  }

  // Monthly total derived once from the exact annual total (avoids summing
  // per-bill rounding errors).
  const totalMonthly = Math.round(totalAnnual / 12);

  return {
    totalAnnualCents: totalAnnual,
    totalMonthlyEquivalentCents: totalMonthly,
    activeCount,
    byCadenceCount,
  };
}

// ============================================================================
// 5-State Status Machine
// ============================================================================

export interface EvaluateStatusParams {
  nextDueDate: ISODate;
  paymentStatus?: SubscriptionPaymentStatus;
  lastPaymentDate?: ISODate;
  isPaidForCurrentCycle?: boolean;
}

/**
 * Evaluates the 5-state payment status for a recurring bill relative to currentDate:
 * - PAID_OK: Marked paid or already settled for current period.
 * - DUE_TODAY: Due date is today (0 days).
 * - DUE_SOON: Due date is within 1 to 3 days (1 <= days <= 3).
 * - OVERDUE: Due date has passed (< 0 days) and bill is unpaid.
 * - UPCOMING_SAFE: Due date is > 3 days in the future.
 */
export function evaluateSubscriptionStatus(
  params: EvaluateStatusParams,
  currentDate: ISODate
): SubscriptionPaymentStatus {
  if (params.isPaidForCurrentCycle) {
    return 'PAID_OK';
  }

  const diffDays = getCalendarDayDifference(currentDate, params.nextDueDate);

  // A stored PAID_OK is cycle-aware: it only holds while the next cycle has not
  // yet entered the 3-day radar window. Once it is due soon / today / overdue,
  // the status falls back to the date-based evaluation below.
  if (params.paymentStatus === 'PAID_OK' && diffDays > 3) {
    return 'PAID_OK';
  }

  if (diffDays < 0) {
    return 'OVERDUE';
  }
  if (diffDays === 0) {
    return 'DUE_TODAY';
  }
  if (diffDays <= 3) {
    return 'DUE_SOON';
  }
  return 'UPCOMING_SAFE';
}

/**
 * Updates a bill's paymentStatus based on currentDate.
 */
export function refreshBillStatus(
  bill: RecurringBill,
  currentDate: ISODate
): SubscriptionPaymentStatus {
  return evaluateSubscriptionStatus(
    {
      nextDueDate: bill.nextDueDate,
      paymentStatus: bill.paymentStatus,
      lastPaymentDate: bill.lastPaymentDate,
    },
    currentDate
  );
}

// ============================================================================
// Proactive 3-Day Radar Detector & Speech Bubble Queue
// ============================================================================

/**
 * Proactive 3-day advance window detector.
 * Returns prioritized items for the Keroo speech bubble check-in queue:
 * 1. OVERDUE bills (oldest overdue first, then largest amount).
 * 2. DUE_TODAY bills (largest amount first).
 * 3. DUE_SOON bills (1 day, 2 days, 3 days, then largest amount).
 *
 * Filters out:
 * - Inactive bills (isActive === false)
 * - Bills already PAID_OK
 * - Bills currently snoozed (snoozedUntilDate > currentDate)
 */
export function getUpcomingCheckInQueue(
  bills: RecurringBill[],
  currentDate: ISODate
): CheckInQueueItem[] {
  const queue: CheckInQueueItem[] = [];

  for (const bill of bills) {
    if (!bill.isActive) continue;

    // Check snooze
    if (bill.snoozedUntilDate && bill.snoozedUntilDate > currentDate) {
      continue;
    }

    const diffDays = getCalendarDayDifference(currentDate, bill.nextDueDate);
    const status = evaluateSubscriptionStatus(
      {
        nextDueDate: bill.nextDueDate,
        paymentStatus: bill.paymentStatus,
        lastPaymentDate: bill.lastPaymentDate,
      },
      currentDate
    );

    // Only OVERDUE, DUE_TODAY, or DUE_SOON enter the check-in queue
    if (status === 'PAID_OK' || status === 'UPCOMING_SAFE') {
      continue;
    }

    let urgencyLevel: CheckInQueueItem['urgencyLevel'];
    let priorityBase: number;

    if (status === 'OVERDUE') {
      urgencyLevel = 'critical';
      // Priority tier 1000 + days overdue (older overdue = smaller negative = higher priority)
      // e.g. -5 days -> 1000 - 5 = 995
      priorityBase = 1000 + diffDays;
    } else if (status === 'DUE_TODAY') {
      urgencyLevel = 'alert';
      priorityBase = 2000;
    } else {
      // DUE_SOON
      urgencyLevel = 'warning';
      priorityBase = 3000 + diffDays; // 1 day -> 3001, 2 days -> 3002, 3 days -> 3003
    }

    queue.push({
      bill: { ...bill, paymentStatus: status },
      status,
      daysUntilDue: diffDays,
      urgencyLevel,
      priorityScore: priorityBase,
    });
  }

  // Sort: lower priorityScore first, then higher amountCents first
  queue.sort((a, b) => {
    if (a.priorityScore !== b.priorityScore) {
      return a.priorityScore - b.priorityScore;
    }
    return b.bill.amountCents - a.bill.amountCents;
  });

  return queue;
}

// ============================================================================
// Payment & Progression Mechanics
// ============================================================================

/**
 * Atomically marks a bill paid for the current cycle:
 * - Updates lastPaymentDate to paymentDate.
 * - Clears snoozedUntilDate.
 * - Advances nextDueDate to the next cycle using anchorDay preservation.
 * - Resets paymentStatus to UPCOMING_SAFE (or evaluates against paymentDate).
 */
export function recordBillPayment(
  bill: RecurringBill,
  paymentDate: ISODate
): RecurringBill {
  const updatedNextDueDate = advanceNextDueDate(
    bill.nextDueDate,
    bill.cadence,
    bill.anchorDay
  );

  const newStatus = evaluateSubscriptionStatus(
    {
      nextDueDate: updatedNextDueDate,
      paymentStatus: 'UPCOMING_SAFE',
      lastPaymentDate: paymentDate,
    },
    paymentDate
  );

  return {
    ...bill,
    lastPaymentDate: paymentDate,
    nextDueDate: updatedNextDueDate,
    paymentStatus: newStatus,
    snoozedUntilDate: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Snoozes a bill's reminder until snoozeUntilDate (typically currentDate + 1 day).
 */
export function snoozeBillReminder(
  bill: RecurringBill,
  snoozeUntilDate: ISODate
): RecurringBill {
  return {
    ...bill,
    snoozedUntilDate: snoozeUntilDate,
    updatedAt: new Date().toISOString(),
  };
}
