/**
 * src/core/installments.ts
 *
 * Brazilian Credit Card Installment Engine for Keroo.
 * Handles 1x-24x statement projections, month-end date clamping,
 * exact cent-remainder allocation to the 1st installment (sum conservation),
 * Tabela Price compound interest amortization, upfront surcharge fees,
 * and 6-24 month visual timeline projections.
 */

import type {
  Cents,
  ISODate,
  YearMonth,
  InstallmentPlan,
  InstallmentScheduleItem,
  InterestType,
} from '../types';
import { assertNonNegativeCents, assertPositiveCents } from './currency';

// ============================================================================
// Types
// ============================================================================

export interface CreateInstallmentPlanParams {
  id?: string;
  accountId: string;
  description: string;
  principalCents: Cents;
  totalInstallments: number; // 1 to 24
  purchaseDate: ISODate;
  closingDay: number; // 1 to 31
  dueDay: number; // 1 to 31
  interestType?: InterestType;
  monthlyInterestRate?: number; // e.g. 0.0199 for 1.99%/mo
  surchargePercent?: number; // e.g. 5 for 5%
  surchargeFeeCents?: Cents;
  createdAt?: string;
}

export interface TabelaPriceSchedule {
  totalAmountCents: Cents;
  totalInterestCents: Cents;
  totalPrincipalCents: Cents;
  items: {
    index: number;
    amountCents: Cents;
    principalCents: Cents;
    interestCents: Cents;
    remainingPrincipalCents: Cents;
  }[];
}

export interface InstallmentTimelineItem {
  planId: string;
  description: string;
  index: number;
  totalInstallments: number;
  amountCents: Cents;
  principalCents: Cents;
  interestCents: Cents;
  dueDate: ISODate;
  isPaid: boolean;
}

export interface InstallmentTimelineMonth {
  yearMonth: YearMonth;
  totalAmountCents: Cents;
  totalPrincipalCents: Cents;
  totalInterestCents: Cents;
  activeInstallmentsCount: number;
  items: InstallmentTimelineItem[];
}

// ============================================================================
// Date & Month-End Clamping Utilities
// ============================================================================

/**
 * Checks whether a given Gregorian year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year)) {
    throw new TypeError(`[InstallmentsError] Year must be an integer, received: ${year}`);
  }
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the exact number of days in the specified month of a given year.
 * Handles February leap years (29 days) and non-leap years (28 days).
 * Month is 1-indexed (1 = January, 12 = December).
 */
export function getDaysInMonth(year: number, month: number): number {
  if (!Number.isInteger(year)) {
    throw new TypeError(`[InstallmentsError] Year must be an integer, received: ${year}`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`[InstallmentsError] Month must be between 1 and 12, received: ${month}`);
  }

  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) {
    return 30;
  }
  return 31;
}

/**
 * Month-End Date Clamping Invariant (DATABASE_SCHEMA.md Invariant 5).
 * Clamps target day D to min(D, daysInMonth(Y, M)).
 * Prevents JavaScript calendar overflow (e.g. Feb 31 -> Mar 3).
 */
export function clampDayToMonth(year: number, month: number, day: number): number {
  if (!Number.isInteger(day) || day < 1) {
    throw new RangeError(`[InstallmentsError] Day must be >= 1, received: ${day}`);
  }
  const maxDays = getDaysInMonth(year, month);
  return Math.min(day, maxDays);
}

/**
 * Formats year and month to 'YYYY-MM' format.
 */
export function formatYearMonth(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Formats year, month, and day to 'YYYY-MM-DD' ISO date.
 */
export function formatISODate(year: number, month: number, day: number): ISODate {
  const clamped = clampDayToMonth(year, month, day);
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/**
 * Parses an ISODate ('YYYY-MM-DD') into its components.
 */
export function parseISODate(dateStr: ISODate): { year: number; month: number; day: number } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new TypeError(`[InstallmentsError] Invalid ISODate format: expected 'YYYY-MM-DD', received '${dateStr}'`);
  }
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  if (m < 1 || m > 12) {
    throw new RangeError(`[InstallmentsError] Invalid ISODate month (1-12): '${dateStr}'`);
  }
  const maxDay = getDaysInMonth(y, m);
  if (d < 1 || d > maxDay) {
    throw new RangeError(`[InstallmentsError] Invalid ISODate day (1-${maxDay}): '${dateStr}'`);
  }
  return { year: y, month: m, day: d };
}

/**
 * Parses a YearMonth ('YYYY-MM') into year and month numbers.
 */
export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) {
    throw new TypeError(`[InstallmentsError] Invalid YearMonth format: expected 'YYYY-MM', received '${ym}'`);
  }
  const [y, m] = ym.split('-').map((v) => parseInt(v, 10));
  return { year: y, month: m };
}

/**
 * Adds integer months to a (year, month) pair, correctly advancing years.
 */
export function addMonths(
  year: number,
  month: number,
  deltaMonths: number
): { year: number; month: number } {
  const totalMonths = year * 12 + (month - 1) + deltaMonths;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return { year: newYear, month: newMonth };
}

// ============================================================================
// Statement Mapping & Cutoff Rules
// ============================================================================

/**
 * Determines which credit card statement month a purchase lands on.
 * Invariant: If purchase day > closing day of month M, the 1st installment
 * lands on month M+1's bill; otherwise on month M's bill.
 * Closing day is clamped to the month's maximum days.
 */
export function getStatementMonthForPurchase(
  purchaseDate: ISODate,
  closingDay: number
): YearMonth {
  const { year, month, day } = parseISODate(purchaseDate);
  const effectiveClosingDay = clampDayToMonth(year, month, closingDay);

  if (day > effectiveClosingDay) {
    const next = addMonths(year, month, 1);
    return formatYearMonth(next.year, next.month);
  }
  return formatYearMonth(year, month);
}

/**
 * Computes the due date for a statement month given card closingDay and dueDay.
 * If dueDay >= closingDay, the due date is in the same month as statementMonth.
 * If dueDay < closingDay, the due date is in the month following statementMonth.
 * Both are strictly clamped to month-end.
 */
export function getStatementDueDate(
  statementMonth: YearMonth,
  closingDay: number,
  dueDay: number
): ISODate {
  const { year, month } = parseYearMonth(statementMonth);
  if (dueDay >= closingDay) {
    return formatISODate(year, month, dueDay);
  }
  const next = addMonths(year, month, 1);
  return formatISODate(next.year, next.month, dueDay);
}

// ============================================================================
// Cent-Remainder Allocation Invariant
// ============================================================================

/**
 * First-Installment Remainder Invariant (DATABASE_SCHEMA.md Invariant 2).
 * Splits totalAmountCents into totalInstallments (1x-24x) such that:
 *   I_1 = floor(A / N) + (A % N)
 *   I_k = floor(A / N) for k in [2, N]
 * Exact cent conservation: sum(I_k) === A.
 */
export function allocateInstallmentCents(
  totalAmountCents: Cents,
  totalInstallments: number
): Cents[] {
  assertNonNegativeCents(totalAmountCents, 'allocateInstallmentCents: totalAmountCents');

  if (!Number.isInteger(totalInstallments) || totalInstallments < 1 || totalInstallments > 24) {
    throw new RangeError(
      `[InstallmentsError] totalInstallments must be an integer between 1 and 24, received: ${totalInstallments}`
    );
  }

  const baseCents = Math.floor(totalAmountCents / totalInstallments);
  const remainderCents = totalAmountCents % totalInstallments;

  const result: Cents[] = new Array(totalInstallments);
  for (let i = 0; i < totalInstallments; i++) {
    result[i] = i === 0 ? baseCents + remainderCents : baseCents;
  }

  return result;
}

// ============================================================================
// Interest & Surcharge Calculations
// ============================================================================

/**
 * Calculates French Amortization (Tabela Price) compound monthly interest.
 * Produces integer cents for every installment while strictly conserving
 * total principal payoff and exact interest cents.
 *
 * Formula: PMT = P * (i * (1 + i)^N) / ((1 + i)^N - 1)
 */
export function calculateTabelaPrice(
  principalCents: Cents,
  monthlyRate: number,
  totalInstallments: number
): TabelaPriceSchedule {
  assertPositiveCents(principalCents, 'calculateTabelaPrice: principalCents');

  if (!Number.isInteger(totalInstallments) || totalInstallments < 1 || totalInstallments > 24) {
    throw new RangeError(
      `[InstallmentsError] totalInstallments must be between 1 and 24, received: ${totalInstallments}`
    );
  }

  if (typeof monthlyRate !== 'number' || !Number.isFinite(monthlyRate) || monthlyRate < 0) {
    throw new RangeError(
      `[InstallmentsError] monthlyRate must be a non-negative finite number, received: ${monthlyRate}`
    );
  }

  // If rate is 0, zero interest schedule
  if (monthlyRate === 0) {
    const allocated = allocateInstallmentCents(principalCents, totalInstallments);
    let remaining = principalCents;
    const items = allocated.map((amount, idx) => {
      remaining -= amount;
      return {
        index: idx + 1,
        amountCents: amount,
        principalCents: amount,
        interestCents: 0,
        remainingPrincipalCents: Math.max(0, remaining),
      };
    });
    return {
      totalAmountCents: principalCents,
      totalInterestCents: 0,
      totalPrincipalCents: principalCents,
      items,
    };
  }

  // Tabela Price exact PMT calculation
  const N = totalInstallments;
  const factor = Math.pow(1 + monthlyRate, N);
  const pmtExact = (principalCents * (monthlyRate * factor)) / (factor - 1);
  const pmtCents = Math.round(pmtExact);

  let currentBalance = principalCents;
  let totalInterest = 0;
  let totalPaid = 0;

  const items: TabelaPriceSchedule['items'] = [];

  for (let k = 1; k <= N; k++) {
    const isLast = k === N;
    // Interest for current period on remaining balance
    const interestK = Math.round(currentBalance * monthlyRate);

    let principalK: number;
    let amountK: number;

    if (isLast) {
      // Last installment pays off exactly whatever principal remains
      principalK = currentBalance;
      amountK = principalK + interestK;
      currentBalance = 0;
    } else {
      principalK = Math.max(0, Math.min(currentBalance, pmtCents - interestK));
      amountK = principalK + interestK;
      currentBalance -= principalK;
    }

    totalInterest += interestK;
    totalPaid += amountK;

    items.push({
      index: k,
      amountCents: amountK,
      principalCents: principalK,
      interestCents: interestK,
      remainingPrincipalCents: currentBalance,
    });
  }

  return {
    totalAmountCents: totalPaid,
    totalInterestCents: totalInterest,
    totalPrincipalCents: principalCents,
    items,
  };
}

/**
 * Calculates upfront flat surcharge fees (either as a percentage or fixed cent fee).
 */
export function calculateFlatSurcharge(
  principalCents: Cents,
  surcharge: { percent?: number; fixedFeeCents?: Cents }
): { surchargeCents: Cents; totalAmountCents: Cents } {
  assertPositiveCents(principalCents, 'calculateFlatSurcharge: principalCents');

  let surchargeCents = 0;
  if (surcharge.percent !== undefined) {
    if (typeof surcharge.percent !== 'number' || surcharge.percent < 0) {
      throw new RangeError('[InstallmentsError] Surcharge percent must be >= 0');
    }
    surchargeCents += Math.round((principalCents * surcharge.percent) / 100);
  }

  if (surcharge.fixedFeeCents !== undefined) {
    assertNonNegativeCents(surcharge.fixedFeeCents, 'calculateFlatSurcharge: fixedFeeCents');
    surchargeCents += surcharge.fixedFeeCents;
  }

  return {
    surchargeCents,
    totalAmountCents: principalCents + surchargeCents,
  };
}

// ============================================================================
// Core Plan Generator
// ============================================================================

/**
 * Creates a fully validated InstallmentPlan with all schedule items,
 * handling zero interest, Tabela Price compound interest, or flat surcharges,
 * along with closing day cutoffs and month-end clamping.
 */
export function createInstallmentPlan(params: CreateInstallmentPlanParams): InstallmentPlan {
  const {
    id = `inst_plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accountId,
    description,
    principalCents,
    totalInstallments,
    purchaseDate,
    closingDay,
    dueDay,
    interestType = 'none',
    monthlyInterestRate = 0,
    surchargePercent,
    surchargeFeeCents,
    createdAt = new Date().toISOString(),
  } = params;

  assertPositiveCents(principalCents, 'createInstallmentPlan: principalCents');

  if (!Number.isInteger(totalInstallments) || totalInstallments < 1 || totalInstallments > 24) {
    throw new RangeError(
      `[InstallmentsError] totalInstallments must be between 1 and 24, received: ${totalInstallments}`
    );
  }

  if (!Number.isInteger(closingDay) || closingDay < 1 || closingDay > 31) {
    throw new RangeError(`[InstallmentsError] closingDay must be between 1 and 31, received: ${closingDay}`);
  }

  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    throw new RangeError(`[InstallmentsError] dueDay must be between 1 and 31, received: ${dueDay}`);
  }

  const firstStatementMonth = getStatementMonthForPurchase(purchaseDate, closingDay);
  const { year: startYear, month: startMonth } = parseYearMonth(firstStatementMonth);

  let totalAmountCents = principalCents;
  let scheduleItems: InstallmentScheduleItem[] = [];

  if (interestType === 'compound_monthly') {
    const priceSchedule = calculateTabelaPrice(principalCents, monthlyInterestRate, totalInstallments);
    totalAmountCents = priceSchedule.totalAmountCents;

    scheduleItems = priceSchedule.items.map((item, idx) => {
      const monthObj = addMonths(startYear, startMonth, idx);
      const statementMonth = formatYearMonth(monthObj.year, monthObj.month);
      const dueDate = getStatementDueDate(statementMonth, closingDay, dueDay);

      return {
        index: item.index,
        statementMonth,
        dueDate,
        amountCents: item.amountCents,
        principalCents: item.principalCents,
        interestCents: item.interestCents,
        isPaid: false,
      };
    });
  } else if (interestType === 'flat_surcharge') {
    const surchargeResult = calculateFlatSurcharge(principalCents, {
      percent: surchargePercent,
      fixedFeeCents: surchargeFeeCents,
    });
    totalAmountCents = surchargeResult.totalAmountCents;

    // Split the surcharge (interest) on its own with the same 1st-installment
    // remainder rule and derive principal = amount - interest, so that
    // sum(amount) === total and sum(interest) === surcharge exactly and no
    // installment carries negative interest.
    const surchargeCents = totalAmountCents - principalCents;
    let amounts = allocateInstallmentCents(totalAmountCents, totalInstallments);
    const interestParts = allocateInstallmentCents(surchargeCents, totalInstallments);
    let principalParts = amounts.map((amount, idx) => amount - interestParts[idx]);

    // Degenerate tiny-principal case (principal smaller than ~N cents): the
    // derived 1st principal could go negative. Fall back to splitting principal
    // and surcharge independently (sums stay exact, both parts >= 0).
    if (principalParts.some((p) => p < 0)) {
      principalParts = allocateInstallmentCents(principalCents, totalInstallments);
      amounts = principalParts.map((p, idx) => p + interestParts[idx]);
    }

    scheduleItems = amounts.map((amount, idx) => {
      const monthObj = addMonths(startYear, startMonth, idx);
      const statementMonth = formatYearMonth(monthObj.year, monthObj.month);
      const dueDate = getStatementDueDate(statementMonth, closingDay, dueDay);
      const principal = principalParts[idx];
      const interest = interestParts[idx];

      return {
        index: idx + 1,
        statementMonth,
        dueDate,
        amountCents: amount,
        principalCents: principal,
        interestCents: interest,
        isPaid: false,
      };
    });
  } else {
    // interestType === 'none'
    const amounts = allocateInstallmentCents(principalCents, totalInstallments);

    scheduleItems = amounts.map((amount, idx) => {
      const monthObj = addMonths(startYear, startMonth, idx);
      const statementMonth = formatYearMonth(monthObj.year, monthObj.month);
      const dueDate = getStatementDueDate(statementMonth, closingDay, dueDay);

      return {
        index: idx + 1,
        statementMonth,
        dueDate,
        amountCents: amount,
        principalCents: amount,
        interestCents: 0,
        isPaid: false,
      };
    });
  }

  return {
    id,
    accountId,
    description,
    totalAmountCents,
    originalPrincipalCents: principalCents,
    totalInstallments,
    purchaseDate,
    interestType,
    interestRateMonthly: monthlyInterestRate > 0 ? monthlyInterestRate : undefined,
    installments: scheduleItems,
    createdAt,
  };
}

// ============================================================================
// Multi-Month Timeline Projection (6 to 24 Months)
// ============================================================================

/**
 * Projects installment obligations across consecutive future months (e.g. 6 to 24 months).
 * Used for visual graphs, relief month detection, and cash-flow pacing.
 */
export function projectInstallmentTimeline(
  plans: InstallmentPlan[],
  startMonth: YearMonth,
  numMonths = 24
): InstallmentTimelineMonth[] {
  if (!Number.isInteger(numMonths) || numMonths < 1) {
    throw new RangeError(`[InstallmentsError] numMonths must be >= 1, received: ${numMonths}`);
  }

  const { year: baseYear, month: baseMonth } = parseYearMonth(startMonth);
  const result: InstallmentTimelineMonth[] = [];

  for (let m = 0; m < numMonths; m++) {
    const { year, month } = addMonths(baseYear, baseMonth, m);
    const targetYearMonth = formatYearMonth(year, month);

    let totalAmount = 0;
    let totalPrincipal = 0;
    let totalInterest = 0;
    const items: InstallmentTimelineItem[] = [];

    for (const plan of plans) {
      for (const inst of plan.installments) {
        if (inst.statementMonth === targetYearMonth) {
          totalAmount += inst.amountCents;
          totalPrincipal += inst.principalCents;
          totalInterest += inst.interestCents;
          items.push({
            planId: plan.id,
            description: plan.description,
            index: inst.index,
            totalInstallments: plan.totalInstallments,
            amountCents: inst.amountCents,
            principalCents: inst.principalCents,
            interestCents: inst.interestCents,
            dueDate: inst.dueDate,
            isPaid: inst.isPaid,
          });
        }
      }
    }

    result.push({
      yearMonth: targetYearMonth,
      totalAmountCents: totalAmount,
      totalPrincipalCents: totalPrincipal,
      totalInterestCents: totalInterest,
      activeInstallmentsCount: items.length,
      items,
    });
  }

  return result;
}

/**
 * Returns total installment obligations in cents for a given statement month.
 */
export function getInstallmentObligationForMonth(
  plans: InstallmentPlan[],
  targetYearMonth: YearMonth
): Cents {
  let sum = 0;
  for (const plan of plans) {
    for (const inst of plan.installments) {
      if (inst.statementMonth === targetYearMonth && !inst.isPaid) {
        sum += inst.amountCents;
      }
    }
  }
  return sum;
}
