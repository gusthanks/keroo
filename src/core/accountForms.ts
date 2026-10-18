/**
 * src/core/accountForms.ts
 *
 * Small pure helpers shared by the Accounts / Credit Cards / Subscriptions /
 * Dashboard views: form-field parsing (day of month, percentage rates),
 * currency symbol lookup, bilingual cadence/status labels and the dashboard
 * bills-radar selector. No UI, no DB access, no money floats.
 */

import type {
  ISODate,
  RecurringBill,
  SubscriptionCadence,
  SubscriptionPaymentStatus,
  SupportedCurrency,
  SupportedLocale,
} from '../types';
import { evaluateSubscriptionStatus } from './subscriptions';
import { diffCalendarDays } from './dates';

export const CADENCE_LABELS: Record<SubscriptionCadence, { labelPt: string; labelEn: string }> = {
  weekly: { labelPt: 'Semanal', labelEn: 'Weekly' },
  biweekly: { labelPt: 'Quinzenal', labelEn: 'Bi-weekly' },
  monthly: { labelPt: 'Mensal', labelEn: 'Monthly' },
  bimonthly: { labelPt: 'Bimestral', labelEn: 'Bi-monthly' },
  quarterly: { labelPt: 'Trimestral', labelEn: 'Quarterly' },
  semi_annually: { labelPt: 'Semestral', labelEn: 'Semi-annually' },
  annually: { labelPt: 'Anual', labelEn: 'Annually' },
};

export const BILL_STATUS_LABELS: Record<
  SubscriptionPaymentStatus,
  { labelPt: string; labelEn: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }
> = {
  PAID_OK: { labelPt: 'Pago', labelEn: 'Paid', variant: 'success' },
  UPCOMING_SAFE: { labelPt: 'Em Dia', labelEn: 'Upcoming', variant: 'info' },
  DUE_SOON: { labelPt: 'Vence Breve', labelEn: 'Due Soon', variant: 'warning' },
  DUE_TODAY: { labelPt: 'Vence Hoje', labelEn: 'Due Today', variant: 'warning' },
  OVERDUE: { labelPt: 'Atrasado', labelEn: 'Overdue', variant: 'danger' },
};

/** Localized cadence label ('Mensal' / 'Monthly'). Unknown cadences fall back to monthly. */
export function getCadenceLabel(cadence: SubscriptionCadence, locale: SupportedLocale): string {
  const cfg = CADENCE_LABELS[cadence] || CADENCE_LABELS.monthly;
  return locale === 'pt-BR' ? cfg.labelPt : cfg.labelEn;
}

/** Currency symbol for labels, e.g. 'R$', '$', '€'. */
export function getCurrencySymbol(currency: SupportedCurrency, locale: SupportedLocale): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/**
 * Parses a user-typed percentage accepting a decimal comma ('1,99' → 1.99) or
 * dot ('1.99'). Returns null for empty, non-finite or malformed input.
 * (A rate is not money, so a JS number is fine here.)
 */
export function parsePercentInput(raw: string): number | null {
  const s = (raw ?? '').trim().replace(/\s|%/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Parses a day-of-month field (integer 1..31). Returns null when invalid. */
export function parseDayOfMonth(raw: string | number): number | null {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= 31 ? n : null;
}

export interface RadarBill {
  bill: RecurringBill;
  status: SubscriptionPaymentStatus;
  daysUntilDue: number;
}

/**
 * Dashboard bills radar: ACTIVE bills that are overdue or due within
 * `windowDays` days (default 3), sorted by nextDueDate ascending (so overdue
 * bills come first). Status is computed from the due date relative to today.
 */
export function selectRadarBills(
  bills: RecurringBill[],
  today: ISODate,
  windowDays = 3
): RadarBill[] {
  const out: RadarBill[] = [];
  for (const bill of bills) {
    if (!bill.isActive) continue;
    const daysUntilDue = diffCalendarDays(today, bill.nextDueDate);
    if (daysUntilDue > windowDays) continue;
    const status = evaluateSubscriptionStatus({ nextDueDate: bill.nextDueDate }, today);
    out.push({ bill, status, daysUntilDue });
  }
  return out.sort((a, b) =>
    a.bill.nextDueDate < b.bill.nextDueDate ? -1 : a.bill.nextDueDate > b.bill.nextDueDate ? 1 : 0
  );
}
