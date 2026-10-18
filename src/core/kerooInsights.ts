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
 * Every detector takes an optional currency (default USD). pt-BR text is formatted with
 * pt-BR conventions and en-US text with en-US conventions; callers pass the user's currency.
 */

import type { Cents, InstallmentPlan, RecurringBill, YearMonth } from '../types';
import { assertIntegerCents, formatCurrency } from './currency';
import type { SupportedCurrency } from '../types';

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
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .join('_');
  return slug ? `insight_${kind}_${slug}` : `insight_${kind}`;
}
import { getNextYearMonth } from './envelopes';
import type { KerooPose } from './kerooMood';
import { calculateAnnualCommitment } from './subscriptions';

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

export interface InsightItem {
  id: string;
  type: InsightType;
  level: InsightLevel;
  title: string;
  titlePt: string;
  titleEn: string;
  message: string;
  messagePt: string;
  messageEn: string;
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
  const deliveryFormatted = formatCurrency(deliveryCents, currency, 'pt-BR');
  const groceryFormatted = formatCurrency(groceryCents, currency, 'pt-BR');

  const deliveryFormattedEn = formatCurrency(deliveryCents, currency, 'en-US');
  const groceryFormattedEn = formatCurrency(groceryCents, currency, 'en-US');

  const titlePt = 'Fatia de pão na cara! Delivery em alta 🍞';
  const titleEn = 'Toast on face! Takeout spike alert 🍞';

  const messagePt = `Seus pedidos de delivery (${deliveryFormatted}) já representam ${ratioPercentage}% dos gastos com mercado (${groceryFormatted}). Que tal cozinhar hoje?`;
  const messageEn = `Your takeout deliveries (${deliveryFormattedEn}) account for ${ratioPercentage}% of your grocery budget (${groceryFormattedEn}). How about cooking today?`;

  return {
    id: buildInsightId('delivery_spike', options.yearMonth ?? `${deliveryCents}-${groceryCents}`),
    type: 'delivery_grocery_spike',
    level: 'warning',
    title: titlePt,
    titlePt,
    titleEn,
    message: messagePt,
    messagePt,
    messageEn,
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
  const currentFormatted = formatCurrency(currentCents, currency, 'pt-BR');
  const avgFormatted = formatCurrency(prior3MonthAveragesCents, currency, 'pt-BR');

  const currentFormattedEn = formatCurrency(currentCents, currency, 'en-US');
  const avgFormattedEn = formatCurrency(prior3MonthAveragesCents, currency, 'en-US');

  const namePt = categoryName ?? 'esta categoria';
  const nameEn = categoryName ?? 'this category';

  const titlePt = `Aumento atípico em ${namePt} 📈`;
  const titleEn = `Unusual surge in ${nameEn} 📈`;

  const messagePt = `Você gastou ${currentFormatted} este mês em ${namePt}, um salto de +${surgePercent}% sobre a sua média trimestral (${avgFormatted}).`;
  const messageEn = `You spent ${currentFormattedEn} this month on ${nameEn}, a +${surgePercent}% surge above your 3-month average (${avgFormattedEn}).`;

  return {
    id: buildInsightId('category_surge', categoryName ?? 'category', options.yearMonth ?? currentCents),
    type: 'category_surge',
    level: 'warning',
    title: titlePt,
    titlePt,
    titleEn,
    message: messagePt,
    messagePt,
    messageEn,
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

  const reliefFormattedPt = formatCurrency(reliefCents, currency, 'pt-BR');
  const reliefFormattedEn = formatCurrency(reliefCents, currency, 'en-US');

  const titlePt = 'Alívio nas parcelas à vista! ✌️';
  const titleEn = 'Installment debt relief ahead! ✌️';

  let messagePt: string;
  let messageEn: string;

  if (nextMonthTotalCents === 0) {
    messagePt = `Parabéns! Suas parcelas de cartão encerram este mês. No mês que vem você terá ${reliefFormattedPt} a mais livres no seu bolso!`;
    messageEn = `Congratulations! Your installment plans finish this month. Next month you will have an extra ${reliefFormattedEn} free in your pocket!`;
  } else {
    messagePt = `Boa notícia! No próximo mês, suas parcelas de cartão vão diminuir em ${reliefFormattedPt}. Fôlego extra para suas economias!`;
    messageEn = `Great news! Next month, your credit card installment commitments will drop by ${reliefFormattedEn}. Extra breathing room for savings!`;
  }

  return {
    id: buildInsightId('installment_relief', currentYearMonth),
    type: 'installment_relief',
    level: 'celebration',
    title: titlePt,
    titlePt,
    titleEn,
    message: messagePt,
    messagePt,
    messageEn,
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
  const annualFormattedPt = formatCurrency(summary.totalAnnualCents, currency, 'pt-BR');
  const monthlyFormattedPt = formatCurrency(summary.totalMonthlyEquivalentCents, currency, 'pt-BR');

  const annualFormattedEn = formatCurrency(summary.totalAnnualCents, currency, 'en-US');
  const monthlyFormattedEn = formatCurrency(summary.totalMonthlyEquivalentCents, currency, 'en-US');

  const titlePt = 'Impacto Anual de Assinaturas 📅';
  const titleEn = 'Annual Subscriptions Impact 📅';

  const messagePt = `Você possui ${summary.activeCount} assinatura(s) ativas totalizando ${annualFormattedPt} por ano (cerca de ${monthlyFormattedPt}/mês).`;
  const messageEn = `You have ${summary.activeCount} active subscription(s) totaling ${annualFormattedEn}/year (~${monthlyFormattedEn}/month).`;

  return {
    id: buildInsightId('subscriptions_impact', options.yearMonth ?? summary.totalAnnualCents),
    type: 'annualized_subscriptions',
    level: 'info',
    title: titlePt,
    titlePt,
    titleEn,
    message: messagePt,
    messagePt,
    messageEn,
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

  const formattedPt = formatCurrency(totalReceivableCents, currency, 'pt-BR');
  const formattedEn = formatCurrency(totalReceivableCents, currency, 'en-US');

  const titlePt = 'Valores a receber no Rateio 💰';
  const titleEn = 'Pending Split Receivables 💰';

  let messagePt: string;
  let messageEn: string;

  if (debtorNames.length > 0) {
    const names = debtorNames.slice(0, 3).join(', ');
    messagePt = `Lembrete amigável: você tem ${formattedPt} a receber de amigos (${names}). Que tal solicitar o Pix?`;
    messageEn = `Friendly reminder: friends owe you ${formattedEn} (${names}). Time to send a gentle nudge?`;
  } else {
    messagePt = `Lembrete amigável: você tem ${formattedPt} a receber nas suas divisões de contas.`;
    messageEn = `Friendly reminder: you have ${formattedEn} in pending receivables from shared expenses.`;
  }

  return {
    id: buildInsightId('split_receivables', options.yearMonth ?? totalReceivableCents),
    type: 'split_receivables',
    level: 'info',
    title: titlePt,
    titlePt,
    titleEn,
    message: messagePt,
    messagePt,
    messageEn,
    recommendedPose: 'cheeky_tongue',
    data: {
      totalReceivableCents,
      debtorNames,
    },
    createdAt: options.now ?? Date.now(),
  };
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
