/**
 * src/core/kerooMood.ts
 *
 * Deterministic Keroo Pet Assistant Engine.
 *
 * 100% deterministic (zero AI, zero external network calls).
 * Sub-2ms synchronous mood evaluator evaluating a 5-mood state machine:
 *   - 'thriving' (ecstatic / celebratory)
 *   - 'calm' (content / equilibrium)
 *   - 'alert' (watchful / cautious)
 *   - 'sweating' (anxious / financial tension)
 *   - 'sleepy' (inactive / dormant)
 *
 * Follows the strictly ordered, non-overlapping priority cascade defined in
 * docs/ARCHITECTURE.md Section 4.1:
 *   Priority 1: Critical Financial Tension Gate  ==> 'sweating'
 *   Priority 2: Inactivity Gate (>= 5 days)     ==> 'sleepy'
 *   Priority 3: Imminent Obligations & Caution  ==> 'alert'
 *   Priority 4: Prosperity & Thriving Surplus   ==> 'thriving'
 *   Priority 5: Default Equilibrium             ==> 'calm'
 *
 * Also provides:
 *   - Proactive bill check-in queue generator prioritizing overdue, due today, and due soon bills.
 *   - Bill check-in action handlers (payment commitment, snoozing, and inline amount editing).
 */

import type {
  Cents,
  ISODate,
  KerooMood,
  RecurringBill,
} from '../types';
export type { KerooMood } from '../types';
import { assertIntegerCents } from './currency';
import {
  advanceNextDueDate,
  getCalendarDayDifference,
  addDaysToISODate,
  evaluateSubscriptionStatus,
} from './subscriptions';
import { getLocalTodayISO } from './dates';

/** Generates a unique id (crypto.randomUUID when available, timestamp fallback otherwise). */
function generateEntityId(prefix: string): string {
  const c: Crypto | undefined = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// Types & Enums
// ============================================================================

export type KerooPose =
  | 'default_sitting'
  | 'waterfall_tears'
  | 'melted_blob'
  | 'toast_face'
  | 'peace_dab'
  | 'sipping_drink'
  | 'sleeping_bubble'
  | 'cheeky_tongue'
  | 'coin_swallowing'
  | 'curious_head_tilt';

export const KEROO_MOODS = {
  THRIVING: 'thriving',
  CALM: 'calm',
  ALERT: 'alert',
  SWEATING: 'sweating',
  SLEEPY: 'sleepy',
} as const;

export interface KerooMetrics {
  lastInteractionDays: number;
  overdueBillsCount: number;
  overdueBillsTotalCents?: Cents;
  upcomingBills3DaysCount?: number;
  dueSoonBillsCount?: number;
  dueSoonBillsTotalCents?: Cents;
  overspentEnvelopesCount?: number;
  totalOverspentCents?: Cents;
  monthExpensesCents: Cents;
  monthBudgetCents: Cents;
  monthIncomeCents: Cents;
  liquidCashCents?: Cents;
  checkingBalanceCents?: Cents;
  committedBillsNext30DaysCents?: Cents;
}

export interface KerooMoodEvaluation {
  mood: KerooMood;
  reason: string;
  reasonPt: string;
  reasonEn: string;
  priority: number;
  recommendedPose: KerooPose;
  timestamp: number;
  toString(): string;
  valueOf(): string;
}

export interface BillCheckInPrompt {
  bill: RecurringBill;
  urgency: 'overdue' | 'due_today' | 'due_soon';
  daysDelta: number; // negative if overdue, 0 if today, 1..3 if soon
  promptText: string;
  promptTextPt: string;
  promptTextEn: string;
  suggestedActions: ('pay' | 'snooze' | 'edit_amount')[];
}

export interface BillPaymentActionResult {
  updatedBill: RecurringBill;
  paymentTransaction?: {
    id?: string;
    accountId: string;
    date: ISODate;
    amountCents: Cents;
    type: 'expense';
    categoryId: string;
    payee: string;
    notes: string;
    status: 'cleared';
    subscriptionId?: string;
    createdAt?: string;
    updatedAt?: string;
  };
  newMoodEvaluation?: KerooMoodEvaluation;
}

// ============================================================================
// Deterministic Mood Evaluation Engine (< 2ms)
// ============================================================================

/**
 * Creates a KerooMoodEvaluation object that responds cleanly as both an object
 * and as a primitive string matching `mood` (via valueOf/toString).
 */
function createEvaluation(
  mood: KerooMood,
  priority: number,
  pose: KerooPose,
  reasonPt: string,
  reasonEn: string
): KerooMoodEvaluation {
  const evalObj: KerooMoodEvaluation = {
    mood,
    priority,
    recommendedPose: pose,
    reason: reasonPt,
    reasonPt,
    reasonEn,
    timestamp: Date.now(),
    toString() {
      return mood;
    },
    valueOf() {
      return mood;
    },
  };
  return evalObj;
}

/**
 * Evaluates user financial posture in < 2ms using a pre-aggregated data vector.
 * Pure, synchronous deterministic function with zero external network or AI calls.
 *
 * @param metrics Pre-computed financial metrics vector
 * @returns KerooMoodEvaluation with mood, reason, priority level, and recommended pose
 */
export function evaluateKerooMood(metrics: KerooMetrics): KerooMoodEvaluation {
  const overdueBills = metrics.overdueBillsCount || 0;
  const overspentEnvelopes = metrics.overspentEnvelopesCount || 0;
  const dueSoonBills = Math.max(metrics.dueSoonBillsCount ?? 0, metrics.upcomingBills3DaysCount ?? 0);
  const dueSoonTotal = metrics.dueSoonBillsTotalCents ?? 0;

  const checkingBalance = metrics.checkingBalanceCents ?? metrics.liquidCashCents;
  const liquidCash = metrics.liquidCashCents ?? metrics.checkingBalanceCents;
  const committedNext30 = metrics.committedBillsNext30DaysCents ?? dueSoonTotal;

  // --------------------------------------------------------------------------
  // Priority 1: Critical Financial Tension Gate ==> 'sweating'
  // --------------------------------------------------------------------------
  // 1. Overdue bills
  if (overdueBills > 0) {
    return createEvaluation(
      'sweating',
      1,
      'waterfall_tears',
      `Atenção! Você possui ${overdueBills} conta(s) em atraso!`,
      `Warning! You have ${overdueBills} overdue bill(s)!`
    );
  }

  // 2. Budget breach (strictly when monthBudgetCents > 0)
  if (metrics.monthBudgetCents > 0 && metrics.monthExpensesCents > metrics.monthBudgetCents) {
    return createEvaluation(
      'sweating',
      1,
      'melted_blob',
      'Orçamento mensal estourado! As despesas superaram a meta.',
      'Monthly budget blown! Expenses exceeded target.'
    );
  }

  // 3. Severe envelope overspending (>= 2 envelopes overspent)
  if (overspentEnvelopes >= 2) {
    return createEvaluation(
      'sweating',
      1,
      'waterfall_tears',
      `Alerta vermelho! ${overspentEnvelopes} envelopes de gastos estão estourados.`,
      `Red alert! ${overspentEnvelopes} spending envelopes are overspent.`
    );
  }

  // 4. Acute liquidity shortfall (negative cash, or cash insufficient for imminent/committed bills)
  const isLiquidityShortfall =
    (liquidCash !== undefined && liquidCash < 0) ||
    (checkingBalance !== undefined && dueSoonTotal > 0 && checkingBalance < dueSoonTotal) ||
    (liquidCash !== undefined && committedNext30 > 0 && liquidCash < committedNext30);

  if (isLiquidityShortfall) {
    return createEvaluation(
      'sweating',
      1,
      'melted_blob',
      'Liquidez crítica! Saldo em conta insuficiente para os compromissos imediatos.',
      'Critical liquidity shortfall! Cash balance is insufficient for upcoming obligations.'
    );
  }

  // --------------------------------------------------------------------------
  // Priority 2: Inactivity Gate (>= 5 days) ==> 'sleepy'
  // Evaluated only when no critical emergencies exist
  // --------------------------------------------------------------------------
  if (metrics.lastInteractionDays >= 5) {
    return createEvaluation(
      'sleepy',
      2,
      'sleeping_bubble',
      `Faz ${metrics.lastInteractionDays} dias que você não registra nada... Zzz...`,
      `It's been ${metrics.lastInteractionDays} days since you last logged in... Zzz...`
    );
  }

  // --------------------------------------------------------------------------
  // Priority 3: Imminent Obligations & Caution Gate ==> 'alert'
  // --------------------------------------------------------------------------
  // 1. Imminent bills due within 3 days
  if (dueSoonBills > 0) {
    return createEvaluation(
      'alert',
      3,
      'curious_head_tilt',
      `Fique atento! Há ${dueSoonBills} conta(s) vencendo nos próximos 3 dias.`,
      `Heads up! There are ${dueSoonBills} bill(s) due within the next 3 days.`
    );
  }

  // 2. Single envelope overspent
  if (overspentEnvelopes === 1) {
    return createEvaluation(
      'alert',
      3,
      'curious_head_tilt',
      'Um envelope de gastos ultrapassou o limite planejado.',
      'One spending envelope has exceeded its planned limit.'
    );
  }

  // 3. High budget utilization (>= 80% or >= 85%)
  if (
    metrics.monthBudgetCents > 0 &&
    metrics.monthExpensesCents * 10 >= metrics.monthBudgetCents * 8
  ) {
    return createEvaluation(
      'alert',
      3,
      'toast_face',
      'Cuidado com os gastos! Você já consumiu mais de 80% do orçamento mensal.',
      'Watch out! You have consumed over 80% of your monthly budget.'
    );
  }

  // 4. Mild inactivity check-in (>= 3 days)
  if (metrics.lastInteractionDays >= 3) {
    return createEvaluation(
      'alert',
      3,
      'curious_head_tilt',
      'Olá! Alguma novidade nos seus gastos dos últimos dias?',
      'Hello! Any updates on your expenses from the past few days?'
    );
  }

  // --------------------------------------------------------------------------
  // Priority 4: Prosperity & Thriving Surplus Gate ==> 'thriving'
  // --------------------------------------------------------------------------
  const hasZeroObligations = overdueBills === 0 && dueSoonBills === 0 && overspentEnvelopes === 0;

  // Qualified savings rate >= 20%: (Income - Expenses) * 5 >= Income  <=>  Savings / Income >= 0.20
  const isSavingsRateQualified =
    metrics.monthIncomeCents > 0 &&
    metrics.monthExpensesCents < metrics.monthIncomeCents &&
    (metrics.monthIncomeCents - metrics.monthExpensesCents) * 5 >= metrics.monthIncomeCents;

  const isBudgetSafe =
    metrics.monthBudgetCents === 0 ||
    metrics.monthExpensesCents * 10 < metrics.monthBudgetCents * 8;

  if (hasZeroObligations && isSavingsRateQualified && isBudgetSafe) {
    return createEvaluation(
      'thriving',
      4,
      'peace_dab',
      'Incrível! Suas contas estão em dia e você poupou mais de 20% da sua renda!',
      'Awesome! All bills are settled and you saved over 20% of your income!'
    );
  }

  // --------------------------------------------------------------------------
  // Priority 5: Default Equilibrium ==> 'calm'
  // --------------------------------------------------------------------------
  return createEvaluation(
    'calm',
    5,
    'sipping_drink',
    'Tudo sob controle e em equilíbrio por aqui.',
    'Everything is in calm equilibrium.'
  );
}

// ============================================================================
// Proactive Bill Check-In Queue Generator
// ============================================================================

/**
 * Returns the highest priority bill check-in prompt for Keroo's speech bubble,
 * or null if no bills require immediate user confirmation.
 *
 * Prioritizes:
 * 1. OVERDUE bills (oldest overdue first, then largest amount).
 * 2. DUE_TODAY bills (largest amount first).
 * 3. DUE_SOON bills (due in 1, 2, or 3 days; soonest first, then largest amount).
 *
 * Filters out:
 * - Inactive bills (isActive === false)
 * - Already settled bills (paymentStatus === 'PAID_OK')
 * - Currently snoozed bills (snoozedUntilDate > referenceDate)
 */
export function getUpcomingBillCheckIn(
  bills: RecurringBill[],
  referenceDate: ISODate
): BillCheckInPrompt | null {
  const eligible: {
    bill: RecurringBill;
    urgency: 'overdue' | 'due_today' | 'due_soon';
    daysDelta: number;
    priorityRank: number;
  }[] = [];

  for (const bill of bills) {
    if (!bill.isActive) continue;

    // Check snooze
    if (bill.snoozedUntilDate && bill.snoozedUntilDate > referenceDate) {
      continue;
    }

    const daysDelta = getCalendarDayDifference(referenceDate, bill.nextDueDate);
    const status = evaluateSubscriptionStatus(
      {
        nextDueDate: bill.nextDueDate,
        paymentStatus: bill.paymentStatus,
        lastPaymentDate: bill.lastPaymentDate,
      },
      referenceDate
    );

    if (status === 'PAID_OK' || status === 'UPCOMING_SAFE') {
      continue;
    }

    if (status === 'OVERDUE' || daysDelta < 0) {
      // Priority tier 1: Overdue. Smaller daysDelta = more overdue = higher priority
      eligible.push({
        bill,
        urgency: 'overdue',
        daysDelta,
        priorityRank: 1000 + daysDelta,
      });
    } else if (status === 'DUE_TODAY' || daysDelta === 0) {
      // Priority tier 2: Due today
      eligible.push({
        bill,
        urgency: 'due_today',
        daysDelta: 0,
        priorityRank: 2000,
      });
    } else if (status === 'DUE_SOON' || (daysDelta >= 1 && daysDelta <= 3)) {
      // Priority tier 3: Due soon (1..3 days)
      eligible.push({
        bill,
        urgency: 'due_soon',
        daysDelta,
        priorityRank: 3000 + daysDelta,
      });
    }
  }

  if (eligible.length === 0) {
    return null;
  }

  // Sort: lowest priorityRank first, then highest amountCents first
  eligible.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) {
      return a.priorityRank - b.priorityRank;
    }
    return b.bill.amountCents - a.bill.amountCents;
  });

  const top = eligible[0];
  const { bill, urgency, daysDelta } = top;

  let promptTextPt: string;
  let promptTextEn: string;

  if (urgency === 'overdue') {
    const absDays = Math.abs(daysDelta);
    promptTextPt = `Você já pagou ${bill.name}? Ela venceu há ${absDays} dia${absDays === 1 ? '' : 's'}!`;
    promptTextEn = `Did you already pay ${bill.name}? It was due ${absDays} day${absDays === 1 ? '' : 's'} ago!`;
  } else if (urgency === 'due_today') {
    promptTextPt = `Você já pagou ${bill.name}? O boleto vence hoje!`;
    promptTextEn = `Did you already pay ${bill.name}? It is due today!`;
  } else {
    promptTextPt = `Lembrete: ${bill.name} vence em ${daysDelta} dia${daysDelta === 1 ? '' : 's'}!`;
    promptTextEn = `Reminder: ${bill.name} is due in ${daysDelta} day${daysDelta === 1 ? '' : 's'}!`;
  }

  return {
    bill,
    urgency,
    daysDelta,
    promptText: promptTextPt,
    promptTextPt,
    promptTextEn,
    suggestedActions: ['pay', 'snooze', 'edit_amount'],
  };
}

// ============================================================================
// Bill Check-In Action Handlers
// ============================================================================

/**
 * Handles the `[✅ Paid!]` 1-click check-in action:
 * - Advances the bill to the next billing cycle using anchorDay preservation.
 * - Sets lastPaymentDate to paymentDate.
 * - Clears any active snooze.
 * - Constructs a corresponding cleared expense transaction record.
 *
 * Supports both pure in-memory invocation and optional database execution.
 */
export async function handleBillPaymentAction(
  billOrParams:
    | RecurringBill
    | {
        bill: RecurringBill;
        paymentDate: ISODate;
        paymentAccountId?: string;
        amountCents?: Cents;
        db?: any;
        /** Ledger note for the payment transaction (callers pass a translated string). */
        note?: string;
      },
  paymentDateArg?: ISODate,
  optionsArg?: { paymentAccountId?: string; amountCents?: Cents; db?: any; note?: string }
): Promise<BillPaymentActionResult> {
  let bill: RecurringBill;
  let paymentDate: ISODate;
  let paymentAccountId: string;
  let amountCents: Cents;
  let db: any = undefined;

  if ('bill' in billOrParams) {
    bill = billOrParams.bill;
    paymentDate = billOrParams.paymentDate || getLocalTodayISO();
    paymentAccountId = billOrParams.paymentAccountId || bill.paymentAccountId;
    amountCents = billOrParams.amountCents ?? bill.amountCents;
    db = billOrParams.db;
  } else {
    bill = billOrParams;
    paymentDate = paymentDateArg || getLocalTodayISO();
    paymentAccountId = optionsArg?.paymentAccountId || bill.paymentAccountId;
    amountCents = optionsArg?.amountCents ?? bill.amountCents;
    db = optionsArg?.db;
  }

  assertIntegerCents(amountCents, 'handleBillPaymentAction: amountCents');

  const nextDueDate = advanceNextDueDate(bill.nextDueDate, bill.cadence, bill.anchorDay);
  const nowIso = new Date().toISOString();
  // The bill's own amountCents is intentionally preserved: a one-off different
  // paid amount only affects this payment transaction and the balance debit.
  const updatedBill: RecurringBill = {
    ...bill,
    lastPaymentDate: paymentDate,
    nextDueDate,
    paymentStatus: 'UPCOMING_SAFE',
    snoozedUntilDate: undefined,
    updatedAt: nowIso,
  };

  const paymentNote =
    ('bill' in billOrParams ? billOrParams.note : optionsArg?.note) ??
    `Recurring payment: ${bill.name}`;

  const paymentTransaction = {
    id: generateEntityId('tx'),
    accountId: paymentAccountId,
    date: paymentDate,
    amountCents,
    type: 'expense' as const,
    categoryId: bill.categoryId,
    payee: bill.name,
    notes: paymentNote,
    status: 'cleared' as const,
    subscriptionId: bill.id,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // If a Dexie database instance is passed, execute atomically
  if (db && typeof db.transaction === 'function') {
    await db.transaction(
      'rw',
      [db.recurring_bills, db.transactions, db.accounts, db.monthly_envelopes],
      async () => {
        const account = await db.accounts.get(paymentAccountId);
        if (!account) {
          throw new Error(
            `[KerooMoodError] handleBillPaymentAction: payment account "${paymentAccountId}" not found`
          );
        }

        await db.recurring_bills.put(updatedBill);
        await db.transactions.add(paymentTransaction);

        await db.accounts.update(paymentAccountId, {
          currentBalanceCents: account.currentBalanceCents - amountCents,
          updatedAt: nowIso,
        });

        // Book the payment against the month envelope of the bill's category.
        if (bill.categoryId) {
          const yearMonth = paymentDate.slice(0, 7);
          const envelopeId = `${bill.categoryId}_${yearMonth}`;
          const envelope = await db.monthly_envelopes.get(envelopeId);
          if (envelope) {
            await db.monthly_envelopes.update(envelopeId, {
              activityCents: envelope.activityCents + amountCents,
              availableCents: envelope.availableCents - amountCents,
            });
          } else {
            await db.monthly_envelopes.add({
              id: envelopeId,
              categoryId: bill.categoryId,
              yearMonth,
              assignedCents: 0,
              activityCents: amountCents,
              availableCents: -amountCents,
            });
          }
        }
      }
    );
  }

  return {
    updatedBill,
    paymentTransaction,
  };
}

/**
 * Handles the `[⏰ Snooze]` check-in action:
 * Snoozes the bill reminder by the specified number of days (default: 1 day).
 */
export function handleBillSnoozeAction(
  bill: RecurringBill,
  referenceDate: ISODate = getLocalTodayISO(),
  snoozeDays = 1
): RecurringBill {
  if (!Number.isInteger(snoozeDays) || snoozeDays < 1) {
    throw new RangeError(
      `[KerooMoodError] handleBillSnoozeAction: snoozeDays must be an integer >= 1 (received ${snoozeDays})`
    );
  }
  const snoozedUntilDate = addDaysToISODate(referenceDate, snoozeDays);

  return {
    ...bill,
    snoozedUntilDate,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Handles the `[✏️ Edit amount]` check-in action:
 * Modifies the recurring bill's amount in integer cents.
 */
export function handleBillEditAmountAction(
  bill: RecurringBill,
  newAmountCents: Cents
): RecurringBill {
  assertIntegerCents(newAmountCents, 'handleBillEditAmountAction: newAmountCents');
  if (newAmountCents <= 0) {
    throw new RangeError('[KerooMoodError] Bill amount must be positive');
  }

  return {
    ...bill,
    amountCents: newAmountCents,
    updatedAt: new Date().toISOString(),
  };
}
