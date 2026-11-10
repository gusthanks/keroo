/**
 * src/core/kerooInsights.ts
 *
 * Statistical Spending Heuristics & Insight Engine for Keroo.
 *
 * 100% deterministic local rules running across user financial data.
 * Zero external network or AI calls.
 *
 * Implements the 5 core heuristics defined in docs/ARCHITECTURE.md Section 4.3:
 * 1. Delivery vs. Grocery Ratio Spike Heuristic (takeout >= 60% of groceries).
 * 2. 3-Month Moving Average Category Surge Heuristic (category spending > 35% above baseline).
 * 3. Credit Card Installment Relief Month Celebration (upcoming decrease in installment debt).
 * 4. Annualized Subscription Cost Summary (normalization of recurring bills).
 * 5. Bilateral Split Net Receivables Alert (reminds when net receivables >= 5000 cents).
 *
 * The engine is locale-free: each insight carries i18n keys (`titleKey`, `messageKey`)
 * plus placeholder values. Money placeholders stay in integer cents (`amounts`) and are
 * formatted for the reader's language at render time with `formatInsightParams()`.
 * Every detector takes an optional currency (default USD); callers pass the user's currency.
 */

import type {
  Cents,
  InstallmentPlan,
  RecurringBill,
  SupportedCurrency,
  SupportedLocale,
  YearMonth,
} from '../types';
import { assertIntegerCents, formatCurrency } from './currency';
import { getNextYearMonth, getPreviousYearMonth } from './envelopes';
import type { KerooPose } from './kerooMood';
import { calculateAnnualCommitment } from './subscriptions';

/**
 * Optional context shared by every detector.
 * - yearMonth: month the insight refers to (part of the deterministic id).
 * - now: injected epoch-ms timestamp for createdAt (defaults to Date.now()).
 */
export interface InsightContextOptions {
  yearMonth?: YearMonth;
  now?: number;
}

/** Builds a deterministic, React-key-safe insight id from its content. */
function buildInsightId(kind: string, ...parts: Array<string | number | undefined>): string {
  const slug = parts
    .filter((p) => p !== undefined && p !== '')
    .map((p) =>
      String(p)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .join('_');
  return slug ? `insight_${kind}_${slug}` : `insight_${kind}`;
}

// ============================================================================
// Types
// ============================================================================

export type InsightType =
  | 'delivery_grocery_spike'
  | 'category_surge'
  | 'installment_relief'
  | 'annualized_subscriptions'
  | 'split_receivables';

export type InsightLevel = 'info' | 'warning' | 'celebration' | 'critical';

/**
 * Every dictionary key an insight can point to. They live under `insights.*` in
 * src/i18n/en-US.json and src/i18n/pt-BR.json.
 */
export const INSIGHT_TEXT_KEYS = [
  'insights.delivery_spike.title',
  'insights.delivery_spike.message',
  'insights.delivery_spike.message_no_grocery',
  'insights.category_surge.title',
  'insights.category_surge.title_unnamed',
  'insights.category_surge.message',
  'insights.category_surge.message_unnamed',
  'insights.installment_relief.title',
  'insights.installment_relief.message_finished',
  'insights.installment_relief.message_lower',
  'insights.subscriptions.title',
  'insights.subscriptions.message_one',
  'insights.subscriptions.message_other',
  'insights.split_receivables.title',
  'insights.split_receivables.message_named',
  'insights.split_receivables.message',
] as const;

export type InsightTextKey = (typeof INSIGHT_TEXT_KEYS)[number];

export interface InsightItem {
  id: string;
  type: InsightType;
  level: InsightLevel;
  /** Dictionary key of the short headline. */
  titleKey: InsightTextKey;
  /** Dictionary key of the explanation. */
  messageKey: InsightTextKey;
  /** Plain placeholder values: percentages, counts, names. */
  params: Record<string, string | number>;
  /** Money placeholders in integer cents, formatted per locale by formatInsightParams(). */
  amounts: Record<string, Cents>;
  /** Currency used to format `amounts`. */
  currency: SupportedCurrency;
  recommendedPose: KerooPose;
  data: Record<string, unknown>;
  createdAt: number;
}

export interface SplitPartyBalance {
  partyName: string;
  netBalanceCents: Cents; // positive = other party owes user; negative = user owes other party
}

// ============================================================================
// 1. Delivery vs. Grocery Ratio Spike Heuristic
// ============================================================================

/**
 * Detects if takeout/delivery spending is disproportionate to grocery spending.
 * Triggers when delivery spending is >= 60% of grocery spending (and delivery > 0).
 *
 * @param deliveryCents Delivery/takeout expenditure in cents
 * @param groceryCents Supermarket/grocery expenditure in cents
 * @returns InsightItem warning if threshold breached, or null if healthy
 */
export function detectDeliveryVsGrocerySpike(
  deliveryCents: Cents,
  groceryCents: Cents,
  currency: SupportedCurrency = 'USD',
  options: InsightContextOptions = {}
): InsightItem | null {
  assertIntegerCents(deliveryCents, 'detectDeliveryVsGrocerySpike: deliveryCents');
  assertIntegerCents(groceryCents, 'detectDeliveryVsGrocerySpike: groceryCents');

  if (deliveryCents <= 0) {
    return null;
  }

  let ratio: number;
  let isSpike = false;

  if (groceryCents <= 0) {
    // If grocery is 0 but delivery has spending, ratio is infinitely higher
    ratio = 1.0;
    isSpike = true;
  } else {
    ratio = deliveryCents / groceryCents;
    isSpike = ratio >= 0.6; // Delivery >= 60% of groceries
  }

  if (!isSpike) {
    return null;
  }

  const ratioPercentage = Math.round(ratio * 100);

  return {
    id: buildInsightId('delivery_spike', options.yearMonth ?? `${deliveryCents}-${groceryCents}`),
    type: 'delivery_grocery_spike',
    level: 'warning',
    titleKey: 'insights.delivery_spike.title',
    messageKey:
      groceryCents <= 0
        ? 'insights.delivery_spike.message_no_grocery'
        : 'insights.delivery_spike.message',
    params: { percent: ratioPercentage },
    amounts: { delivery: deliveryCents, grocery: groceryCents },
    currency,
    recommendedPose: 'toast_face',
    data: {
      deliveryCents,
      groceryCents,
      ratio,
      ratioPercentage,
    },
    createdAt: options.now ?? Date.now(),
  };
}

// ============================================================================
// 2. 3-Month Moving Average Category Surge Heuristic
// ============================================================================

/**
 * Detects if a category's current month spending surged > 35% above its historical 3-month baseline.
 *
 * @param currentCents Current month spending in cents
 * @param prior3MonthAveragesCents Average spending in the prior 3 months in cents
 * @param categoryName Optional friendly category name
 * @returns InsightItem if spending spiked > 35%, or null
 */
export function detectCategorySurge(
  currentCents: Cents,
  prior3MonthAveragesCents: Cents,
  categoryName?: string,
  currency: SupportedCurrency = 'USD',
  options: InsightContextOptions = {}
): InsightItem | null {
  assertIntegerCents(currentCents, 'detectCategorySurge: currentCents');
  assertIntegerCents(prior3MonthAveragesCents, 'detectCategorySurge: prior3MonthAveragesCents');

  if (currentCents <= 0 || prior3MonthAveragesCents <= 0) {
    return null;
  }

  if (currentCents <= prior3MonthAveragesCents) {
    return null;
  }

  const surgeFraction = (currentCents - prior3MonthAveragesCents) / prior3MonthAveragesCents;
  // Trigger on > 35% spike
  if (surgeFraction <= 0.35) {
    return null;
  }

  const surgePercent = Math.round(surgeFraction * 100);
  const named = categoryName !== undefined && categoryName.trim() !== '';

  return {
    id: buildInsightId('category_surge', categoryName ?? 'category', options.yearMonth ?? currentCents),
    type: 'category_surge',
    level: 'warning',
    titleKey: named ? 'insights.category_surge.title' : 'insights.category_surge.title_unnamed',
    messageKey: named ? 'insights.category_surge.message' : 'insights.category_surge.message_unnamed',
    params: named ? { percent: surgePercent, category: categoryName ?? '' } : { percent: surgePercent },
    amounts: { current: currentCents, average: prior3MonthAveragesCents },
    currency,
    recommendedPose: 'waterfall_tears',
    data: {
      currentCents,
      prior3MonthAveragesCents,
      surgePercent,
      categoryName,
    },
    createdAt: options.now ?? Date.now(),
  };
}

// ============================================================================
// 3. Credit Card Installment Relief Month Celebration
// ============================================================================

/**
 * Evaluates active installment plans and detects when monthly debt commitments
 * decrease in the upcoming month (due to installment plans completing).
 * Triggers a celebration when obligations decrease by >= 5000 cents (50.00 in the user's currency) or drop to zero.
 *
 * @param plans Array of active credit card installment plans
 * @param currentYearMonth Format 'YYYY-MM' (e.g. '2026-10')
 * @returns InsightItem celebration if debt burden decreases, or null
 */
export function detectInstallmentRelief(
  plans: InstallmentPlan[],
  currentYearMonth: YearMonth,
  currency: SupportedCurrency = 'USD',
  options: InsightContextOptions = {}
): InsightItem | null {
  if (!plans || plans.length === 0) {
    return null;
  }

  const nextYearMonth = getNextYearMonth(currentYearMonth);

  let currentMonthTotalCents = 0;
  let nextMonthTotalCents = 0;
  let completingPlansCount = 0;

  for (const plan of plans) {
    for (const item of plan.installments) {
      if (item.statementMonth === currentYearMonth) {
        currentMonthTotalCents += item.amountCents;
        if (item.index === plan.totalInstallments) {
          completingPlansCount += 1;
        }
      } else if (item.statementMonth === nextYearMonth) {
        nextMonthTotalCents += item.amountCents;
      }
    }
  }

  // Check relief conditions:
  // 1. Obligations decrease by >= 5000 cents (50.00 in any currency) OR
  // 2. Next month obligations drop to zero while current month has debt OR
  // 3. One or more installment plans conclude this month
  const reliefCents = currentMonthTotalCents - nextMonthTotalCents;
  const isRelief =
    (currentMonthTotalCents > 0 && reliefCents >= 5000) ||
    (currentMonthTotalCents > 0 && nextMonthTotalCents === 0) ||
    completingPlansCount > 0;

  if (!isRelief || reliefCents <= 0) {
    return null;
  }

  return {
    id: buildInsightId('installment_relief', currentYearMonth),
    type: 'installment_relief',
    level: 'celebration',
    titleKey: 'insights.installment_relief.title',
    messageKey:
      nextMonthTotalCents === 0
        ? 'insights.installment_relief.message_finished'
        : 'insights.installment_relief.message_lower',
    params: {},
    amounts: { amount: reliefCents },
    currency,
    recommendedPose: 'peace_dab',
    data: {
      currentMonthTotalCents,
      nextMonthTotalCents,
      reliefCents,
      completingPlansCount,
      currentYearMonth,
      nextYearMonth,
    },
    createdAt: options.now ?? Date.now(),
  };
}

// ============================================================================
// 4. Annualized Subscription Cost Summary
// ============================================================================

/**
 * Summarizes the total annual commitment of all active recurring bills and subscriptions.
 * Always returns an InsightItem providing clarity on normalized yearly recurring obligations.
 *
 * @param bills Collection of recurring bills / subscriptions
 * @returns InsightItem with normalized annual and monthly amounts
 */
export function calculateAnnualizedSubscriptionsImpact(
  bills: RecurringBill[],
  currency: SupportedCurrency = 'USD',
  options: InsightContextOptions = {}
): InsightItem {
  const summary = calculateAnnualCommitment(bills || []);

  return {
    id: buildInsightId('subscriptions_impact', options.yearMonth ?? summary.totalAnnualCents),
    type: 'annualized_subscriptions',
    level: 'info',
    titleKey: 'insights.subscriptions.title',
    messageKey:
      summary.activeCount === 1
        ? 'insights.subscriptions.message_one'
        : 'insights.subscriptions.message_other',
    params: { count: summary.activeCount },
    amounts: { annual: summary.totalAnnualCents, monthly: summary.totalMonthlyEquivalentCents },
    currency,
    recommendedPose: 'curious_head_tilt',
    data: {
      totalAnnualCents: summary.totalAnnualCents,
      totalMonthlyEquivalentCents: summary.totalMonthlyEquivalentCents,
      activeCount: summary.activeCount,
      byCadenceCount: summary.byCadenceCount,
    },
    createdAt: options.now ?? Date.now(),
  };
}

// ============================================================================
// 5. Bilateral Split Net Receivables Alert
// ============================================================================

/**
 * Alerts the user when net receivables from friends or roommates reach 5000 cents (50.00 in the user's currency).
 * Helps users remember to request settlement without awkwardness.
 *
 * @param balances Array of party balance objects OR total net receivable in cents
 * @returns InsightItem if net receivables >= 5000 cents, or null
 */
export function detectSplitReceivablesAlert(
  balances: SplitPartyBalance[] | Cents,
  currency: SupportedCurrency = 'USD',
  options: InsightContextOptions = {}
): InsightItem | null {
  let totalReceivableCents = 0;
  const debtorNames: string[] = [];

  if (typeof balances === 'number') {
    assertIntegerCents(balances, 'detectSplitReceivablesAlert: balances');
    totalReceivableCents = balances > 0 ? balances : 0;
  } else if (Array.isArray(balances)) {
    for (const b of balances) {
      if (b.netBalanceCents > 0) {
        totalReceivableCents += b.netBalanceCents;
        debtorNames.push(b.partyName);
      }
    }
  }

  // Trigger alert when net receivable >= 5000 cents (50.00 in any currency)
  if (totalReceivableCents < 5000) {
    return null;
  }

  const named = debtorNames.length > 0;

  return {
    id: buildInsightId('split_receivables', options.yearMonth ?? totalReceivableCents),
    type: 'split_receivables',
    level: 'info',
    titleKey: 'insights.split_receivables.title',
    messageKey: named ? 'insights.split_receivables.message_named' : 'insights.split_receivables.message',
    params: named ? { names: debtorNames.slice(0, 3).join(', ') } : {},
    amounts: { amount: totalReceivableCents },
    currency,
    recommendedPose: 'cheeky_tongue',
    data: {
      totalReceivableCents,
      debtorNames,
    },
    createdAt: options.now ?? Date.now(),
  };
}

// ============================================================================
// Input builders (raw ledger rows -> detector inputs)
// ============================================================================

/** The transaction fields the surge input builder reads. */
export interface SpendingTransaction {
  date: string;
  amountCents: Cents;
  type: string;
  categoryId: string | null;
}

/**
 * Groups expense transactions by category and compares this month's total with the
 * average of the three previous calendar months (integer cents, rounded). Categories
 * with no spending in the prior three months are skipped (there is no baseline yet), and
 * so are rows whose category no longer exists.
 *
 * @param transactions Expense rows covering at least the current and the prior 3 months
 * @param currentYearMonth Month being evaluated ('YYYY-MM')
 * @param categoryNames categoryId -> display name
 */
export function buildCategorySurgeInputs(
  transactions: SpendingTransaction[],
  currentYearMonth: YearMonth,
  categoryNames: ReadonlyMap<string, string>
): { currentCents: Cents; prior3MonthAveragesCents: Cents; categoryName: string }[] {
  const m1 = getPreviousYearMonth(currentYearMonth);
  const m2 = getPreviousYearMonth(m1);
  const m3 = getPreviousYearMonth(m2);
  const prior = new Set<string>([m1, m2, m3]);

  const current = new Map<string, number>();
  const priorTotals = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.categoryId) continue;
    assertIntegerCents(tx.amountCents, 'buildCategorySurgeInputs: amountCents');
    const month = tx.date.slice(0, 7);
    if (month === currentYearMonth) {
      current.set(tx.categoryId, (current.get(tx.categoryId) ?? 0) + tx.amountCents);
    } else if (prior.has(month)) {
      priorTotals.set(tx.categoryId, (priorTotals.get(tx.categoryId) ?? 0) + tx.amountCents);
    }
  }

  const result: { currentCents: Cents; prior3MonthAveragesCents: Cents; categoryName: string }[] = [];
  for (const [categoryId, currentCents] of current) {
    const priorTotal = priorTotals.get(categoryId) ?? 0;
    const categoryName = categoryNames.get(categoryId);
    if (priorTotal <= 0 || !categoryName) continue;
    result.push({
      currentCents,
      prior3MonthAveragesCents: Math.round(priorTotal / 3),
      categoryName,
    });
  }
  return result;
}

// ============================================================================
// Rendering helper
// ============================================================================

/**
 * Placeholder values for `t(item.titleKey, ...)` / `t(item.messageKey, ...)`: the plain
 * params plus every money amount formatted in the insight's currency for `locale`.
 */
export function formatInsightParams(
  item: Pick<InsightItem, 'params' | 'amounts' | 'currency'>,
  locale: SupportedLocale
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...item.params };
  for (const [name, cents] of Object.entries(item.amounts)) {
    out[name] = formatCurrency(cents, item.currency, locale);
  }
  return out;
}

// ============================================================================
// Comprehensive Insights Collector
// ============================================================================

export interface CollectInsightsParams {
  deliveryCents?: Cents;
  groceryCents?: Cents;
  categorySurges?: { currentCents: Cents; prior3MonthAveragesCents: Cents; categoryName: string }[];
  installmentPlans?: InstallmentPlan[];
  currentYearMonth?: YearMonth;
  bills?: RecurringBill[];
  splitBalances?: SplitPartyBalance[] | Cents;
  /** Currency used to format every amount in both languages (default 'USD'). */
  currency?: SupportedCurrency;
  /** Injected epoch-ms timestamp for createdAt (keeps output deterministic). */
  now?: number;
}

/**
 * Collects all active deterministic spending insights based on current metrics.
 */
export function generateAllKerooInsights(params: CollectInsightsParams): InsightItem[] {
  const insights: InsightItem[] = [];
  const currency: SupportedCurrency = params.currency ?? 'USD';
  const ctx: InsightContextOptions = { yearMonth: params.currentYearMonth, now: params.now };

  // 1. Delivery vs Grocery Spike
  if (params.deliveryCents !== undefined && params.groceryCents !== undefined) {
    const spike = detectDeliveryVsGrocerySpike(params.deliveryCents, params.groceryCents, currency, ctx);
    if (spike) insights.push(spike);
  }

  // 2. Category Surges
  if (params.categorySurges && params.categorySurges.length > 0) {
    for (const surge of params.categorySurges) {
      const item = detectCategorySurge(
        surge.currentCents,
        surge.prior3MonthAveragesCents,
        surge.categoryName,
        currency,
        ctx
      );
      if (item) insights.push(item);
    }
  }

  // 3. Installment Relief
  if (params.installmentPlans && params.currentYearMonth) {
    const relief = detectInstallmentRelief(params.installmentPlans, params.currentYearMonth, currency, ctx);
    if (relief) insights.push(relief);
  }

  // 4. Annualized Subscriptions Impact
  if (params.bills && params.bills.length > 0) {
    insights.push(calculateAnnualizedSubscriptionsImpact(params.bills, currency, ctx));
  }

  // 5. Split Receivables
  if (params.splitBalances !== undefined) {
    const alert = detectSplitReceivablesAlert(params.splitBalances, currency, ctx);
    if (alert) insights.push(alert);
  }

  return insights;
}
