import React, { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type {
  Cents,
  RecurringBill,
  SupportedCurrency,
} from '../types';
import {
  evaluateKerooMood,
  getUpcomingBillCheckIn,
  handleBillPaymentAction,
  handleBillSnoozeAction,
  handleBillEditAmountAction,
  type KerooMetrics,
  type BillCheckInPrompt,
} from '../core/kerooMood';
import {
  generateAllKerooInsights,
  type InsightItem,
} from '../core/kerooInsights';
import { formatCurrency, defaultCurrencyFor } from '../core/currency';
import {
  getLocalTodayISO,
  getLocalYearMonth,
  diffCalendarDays,
  formatDateForLocale,
  formatYearMonthForLocale,
} from '../core/dates';
import { selectRadarBills, CADENCE_LABELS, BILL_STATUS_LABELS } from '../core/accountForms';
import { KerooMascot } from '../components/keroo/KerooMascot';
import { SpeechBubble } from '../components/keroo/SpeechBubble';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Sparkles,
  ArrowRight,
  Clock,
  ShieldCheck,
} from 'lucide-react';
import type { ViewId } from '../components/layout/Sidebar';

export interface DashboardViewProps {
  onNavigate?: (view: ViewId) => void;
  onQuickAdd?: () => void;
  currency?: SupportedCurrency;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onQuickAdd,
  currency: currencyProp,
}) => {
  const { t, language } = useTranslation();
  const currency: SupportedCurrency = currencyProp ?? defaultCurrencyFor(language);
  const today = getLocalTodayISO();
  const currentYearMonth = getLocalYearMonth();

  // Live queries from Dexie
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().limit(10).toArray(), [], []);
  const allMonthTransactions = useLiveQuery(
    () => db.transactions.where('date').startsWith(currentYearMonth).toArray(),
    [currentYearMonth],
    []
  );
  const envelopes = useLiveQuery(
    () => db.monthly_envelopes.where('yearMonth').equals(currentYearMonth).toArray(),
    [currentYearMonth],
    []
  );
  const recurringBills = useLiveQuery(() => db.recurring_bills.toArray(), [], []);
  const installmentPlans = useLiveQuery(() => db.installment_plans.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const mascotState = useLiveQuery(() => db.keroo_state.get('current'));

  // Calculate Net Worth & Liquid Cash
  const { netWorthCents, liquidCashCents, checkingBalanceCents } = useMemo(() => {
    let nw = 0;
    let liquid = 0;
    let checking = 0;

    for (const acc of accounts) {
      if (acc.isArchived) continue;
      nw += acc.currentBalanceCents;
      if (acc.type === 'checking' || acc.type === 'cash') {
        liquid += acc.currentBalanceCents;
      }
      if (acc.type === 'checking') {
        checking += acc.currentBalanceCents;
      }
    }
    return {
      netWorthCents: nw,
      liquidCashCents: liquid,
      checkingBalanceCents: checking,
    };
  }, [accounts]);

  // Calculate Cash Flow for Current Month
  const { monthIncomeCents, monthExpensesCents, monthBudgetCents, overspentCount } = useMemo(() => {
    let income = 0;
    let expenses = 0;

    for (const tx of allMonthTransactions) {
      if (tx.type === 'income') {
        income += tx.amountCents;
      } else if (tx.type === 'expense' || tx.type === 'cc_installment') {
        expenses += tx.amountCents;
      }
    }

    let budget = 0;
    let overspent = 0;
    for (const env of envelopes) {
      budget += env.assignedCents;
      if (env.availableCents < 0) {
        overspent += 1;
      }
    }

    return {
      monthIncomeCents: income,
      monthExpensesCents: expenses,
      monthBudgetCents: budget,
      overspentCount: overspent,
    };
  }, [allMonthTransactions, envelopes]);

  // Compute Bill Statuses & Check-In Queue
  const { overdueCount, dueSoonCount, committedBillsNext30DaysCents } = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let committedNext30 = 0;

    for (const b of recurringBills) {
      if (!b.isActive) continue;
      const due = b.nextDueDate;
      if (due < today) {
        overdue += 1;
        committedNext30 += b.amountCents;
      } else if (due === today) {
        dueSoon += 1;
        committedNext30 += b.amountCents;
      } else {
        const diffDays = diffCalendarDays(today, due);
        if (diffDays <= 3) {
          dueSoon += 1;
        }
        if (diffDays <= 30) {
          committedNext30 += b.amountCents;
        }
      }
    }

    return {
      overdueCount: overdue,
      dueSoonCount: dueSoon,
      committedBillsNext30DaysCents: committedNext30,
    };
  }, [recurringBills, today]);

  // Days since the user last interacted with Keroo (drives the sleepy mood)
  const lastInteractionDate = mascotState?.lastInteractionDate;
  const lastInteractionDays = lastInteractionDate
    ? Math.max(0, diffCalendarDays(lastInteractionDate, today))
    : 0;

  // Synchronous Keroo Metrics & Mood Evaluation (< 2ms)
  const moodEvaluation = useMemo(() => {
    const metrics: KerooMetrics = {
      lastInteractionDays,
      overdueBillsCount: overdueCount,
      dueSoonBillsCount: dueSoonCount,
      upcomingBills3DaysCount: dueSoonCount,
      overspentEnvelopesCount: overspentCount,
      monthExpensesCents,
      monthBudgetCents,
      monthIncomeCents,
      liquidCashCents,
      checkingBalanceCents,
      committedBillsNext30DaysCents,
    };

    return evaluateKerooMood(metrics);
  }, [
    lastInteractionDays,
    overdueCount,
    dueSoonCount,
    overspentCount,
    monthExpensesCents,
    monthBudgetCents,
    monthIncomeCents,
    liquidCashCents,
    checkingBalanceCents,
    committedBillsNext30DaysCents,
  ]);

  // Statistical Insights
  const insights: InsightItem[] = useMemo(() => {
    return generateAllKerooInsights({
      installmentPlans,
      currentYearMonth,
      bills: recurringBills,
      currency,
    });
  }, [installmentPlans, currentYearMonth, recurringBills, currency]);

  // Current active prompt for speech bubble
  const activePrompt: BillCheckInPrompt | null = useMemo(() => {
    return getUpcomingBillCheckIn(recurringBills, today);
  }, [recurringBills, today]);

  // Handlers for Speech Bubble interactive actions
  const handlePayBill = async (bill: RecurringBill, amountCents?: Cents) => {
    const payCents = amountCents ?? bill.amountCents;
    await handleBillPaymentAction(bill, today, {
      db,
      amountCents: payCents,
      note: t('dashboard.bill_payment_note', { name: bill.name }),
    });
  };

  const handleSnoozeBill = async (bill: RecurringBill) => {
    const updated = handleBillSnoozeAction(bill, today);
    await db.recurring_bills.put(updated);
  };

  const handleEditAmount = async (bill: RecurringBill, newAmountCents: Cents) => {
    const updated = handleBillEditAmountAction(bill, newAmountCents);
    await db.recurring_bills.put(updated);
  };

  // Bills radar: only active bills overdue or due within 3 days, overdue first
  const radarBills = useMemo(() => selectRadarBills(recurringBills, today, 3), [recurringBills, today]);

  // Category mapping
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) {
      map.set(c.id, c.name);
    }
    return map;
  }, [categories]);

  const petName = mascotState?.nickname || 'Keroo';

  return (
    <div className="space-y-6">
      {/* 1. Keroo Fortune Frog Perch Card */}
      <Card className="overflow-hidden relative bg-gradient-to-r from-surface-card via-surface-card to-brand-subtle/20 border-brand-border/40">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="shrink-0 flex flex-col items-center">
            <KerooMascot
              pose={moodEvaluation.recommendedPose}
              coinProp="polishing"
              size="lg"
              className="drop-shadow-sm cursor-pointer hover:scale-105 transition-transform"
            />
            <div className="mt-2 text-center">
              <Badge
                variant={
                  moodEvaluation.mood === 'thriving'
                    ? 'success'
                    : moodEvaluation.mood === 'sweating'
                    ? 'danger'
                    : moodEvaluation.mood === 'alert'
                    ? 'warning'
                    : 'info'
                }
                size="sm"
                pill
                dot
              >
                {t(`pet.mood_${moodEvaluation.mood}`)}
              </Badge>
            </div>
          </div>

          <div className="flex-1 w-full space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-text-primary tracking-tight flex items-center gap-2">
                  <span>{petName}</span>
                  <span className="text-xs font-normal text-text-secondary">
                    • {t('pet.coin_action')}
                  </span>
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  {language === 'pt-BR' ? moodEvaluation.reasonPt : moodEvaluation.reasonEn}
                </p>
              </div>

              {onQuickAdd && (
                <Button size="sm" variant="outline" onClick={onQuickAdd} className="hidden sm:inline-flex">
                  + {t('common.add_transaction')}
                </Button>
              )}
            </div>

            {/* Interactive Bill Check-In Speech Bubble */}
            {activePrompt ? (
              <SpeechBubble
                prompt={activePrompt}
                locale={language}
                currency={currency}
                onPay={handlePayBill}
                onSnooze={handleSnoozeBill}
                onEditAmount={handleEditAmount}
                tailPosition="left"
              />
            ) : (
              <div className="p-3.5 rounded-xl bg-surface-muted/40 border border-border-subtle text-xs text-text-secondary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-coin shrink-0" />
                <span>{t('dashboard.all_clear')}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 2. Top Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Net Worth */}
        <Card hoverable className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>{t('dashboard.net_worth')}</span>
            <Scale className="w-4 h-4 text-brand" />
          </div>
          <div className="text-2xl font-semibold tabular-nums font-mono text-text-primary">
            {formatCurrency(netWorthCents, currency, language)}
          </div>
          <div className="mt-2 text-[11px] text-text-secondary flex items-center justify-between">
            <span>{accounts.length} {t('nav.accounts')}</span>
            <span className="text-brand font-medium">{t('dashboard.local_badge')}</span>
          </div>
        </Card>

        {/* Monthly Income */}
        <Card hoverable className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>{t('dashboard.income')}</span>
            <TrendingUp className="w-4 h-4 text-success" />
          </div>
          <div className="text-2xl font-semibold tabular-nums font-mono text-success">
            +{formatCurrency(monthIncomeCents, currency, language)}
          </div>
          <div className="mt-2 text-[11px] text-text-secondary">
            {formatYearMonthForLocale(currentYearMonth, language)}
          </div>
        </Card>

        {/* Monthly Expenses */}
        <Card hoverable className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>{t('dashboard.expenses')}</span>
            <TrendingDown className="w-4 h-4 text-danger" />
          </div>
          <div className="text-2xl font-semibold tabular-nums font-mono text-text-primary">
            {formatCurrency(monthExpensesCents, currency, language)}
          </div>
          <div className="mt-2 text-[11px] text-text-secondary flex items-center justify-between">
            <span>
              {t('dashboard.budget_target', {
                amount: formatCurrency(monthBudgetCents, currency, language),
              })}
            </span>
            {overspentCount > 0 && (
              <span className="text-danger font-medium">
                {t('dashboard.overspent_count', { count: overspentCount })}
              </span>
            )}
          </div>
        </Card>

        {/* Available / Liquid Cash */}
        <Card hoverable className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-text-secondary mb-2">
            <span>{t('dashboard.liquid_cash')}</span>
            <ShieldCheck className="w-4 h-4 text-info" />
          </div>
          <div className="text-2xl font-semibold tabular-nums font-mono text-text-primary">
            {formatCurrency(liquidCashCents, currency, language)}
          </div>
          <div className="mt-2 text-[11px] text-text-secondary">
            {t('dashboard.next_30_days')}: {formatCurrency(committedBillsNext30DaysCents, currency, language)}
          </div>
        </Card>
      </div>

      {/* 3. Middle Section: Bills Radar + Statistical Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Bills Radar */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-warning" />
              <span>{t('dashboard.bills_radar')}</span>
            </div>
          }
          subtitle={t('dashboard.radar_subtitle')}
          action={
            onNavigate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('subscriptions')}
                trailingIcon={<ArrowRight className="w-3.5 h-3.5" />}
              >
                {t('common.view_all')}
              </Button>
            )
          }
        >
          {radarBills.length === 0 ? (
            <p className="text-xs text-text-secondary py-4 text-center" data-testid="bills-radar-empty">
              {recurringBills.some((b) => b.isActive)
                ? t('dashboard.radar_empty_active')
                : t('dashboard.radar_empty_none')}
            </p>
          ) : (
            <div className="space-y-2 mt-2" data-testid="bills-radar">
              {radarBills
                .slice(0, 4)
                .map(({ bill, status }) => {
                  const isOverdue = status === 'OVERDUE';
                  const isToday = status === 'DUE_TODAY';
                  const statusVariant = BILL_STATUS_LABELS[status].variant;
                  const cadenceKey = CADENCE_LABELS[bill.cadence] ? bill.cadence : 'monthly';

                  return (
                    <div
                      key={bill.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-surface-muted/30 border border-border-subtle"
                    >
                      <div className="flex items-center gap-3">
                        <Clock
                          className={`w-4 h-4 ${
                            isOverdue
                              ? 'text-danger'
                              : isToday
                              ? 'text-warning'
                              : 'text-text-muted'
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium text-text-primary leading-tight">
                            {bill.name}
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5">
                            {formatDateForLocale(bill.nextDueDate, language)} • {t(`subscriptions.cadence.${cadenceKey}`)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-2">
                        <span className="font-mono tabular-nums text-sm font-semibold text-text-primary">
                          {formatCurrency(bill.amountCents, bill.currency || currency, language)}
                        </span>
                        <Badge variant={statusVariant} size="sm">
                          {t(`subscriptions.status.${status.toLowerCase()}`)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        {/* Statistical Spending Insights */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-coin" />
              <span>{t('dashboard.insights_title')}</span>
            </div>
          }
          subtitle={t('dashboard.insights_subtitle')}
        >
          {insights.length === 0 ? (
            <p className="text-xs text-text-secondary py-4 text-center">
              {t('dashboard.insights_empty')}
            </p>
          ) : (
            <div className="space-y-2 mt-2">
              {insights.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded-xl border flex items-start gap-3 ${
                    item.level === 'critical'
                      ? 'bg-danger-subtle/40 border-danger/20'
                      : item.level === 'warning'
                      ? 'bg-warning-subtle/40 border-warning/20'
                      : item.level === 'celebration'
                      ? 'bg-brand-subtle/40 border-brand-border/30'
                      : 'bg-surface-muted/30 border-border-subtle'
                  }`}
                >
                  <span className="text-xl shrink-0">
                    {item.level === 'celebration'
                      ? '✌️'
                      : item.level === 'critical'
                      ? '💧'
                      : item.level === 'warning'
                      ? '🍞'
                      : '💡'}
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-text-primary">
                      {language === 'pt-BR' ? item.titlePt : item.titleEn}
                    </h4>
                    <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
                      {language === 'pt-BR' ? item.messagePt : item.messageEn}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Recent Transactions Ledger */}
      <Card
        title={t('dashboard.recent_transactions')}
        action={
          onNavigate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('accounts')}
              trailingIcon={<ArrowRight className="w-3.5 h-3.5" />}
            >
              {t('common.view_all')}
            </Button>
          )
        }
      >
        {transactions.length === 0 ? (
          <p className="text-xs text-text-secondary py-6 text-center">
            {t('dashboard.transactions_empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-text-secondary uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">{t('common.date')}</th>
                  <th className="py-2.5 px-3">{t('dashboard.col_payee')}</th>
                  <th className="py-2.5 px-3">{t('common.category')}</th>
                  <th className="py-2.5 px-3 text-right">{t('common.value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {transactions.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const catName = tx.categoryId
                    ? categoryMap.get(tx.categoryId) || t('common.category_general')
                    : tx.type === 'transfer'
                    ? t('common.tx_type.transfer')
                    : t('common.no_category');

                  return (
                    <tr key={tx.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-text-secondary whitespace-nowrap">
                        {formatDateForLocale(tx.date, language)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-text-primary max-w-xs truncate">
                        {tx.payee || tx.notes || t('common.no_description')}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge variant="neutral" size="sm">
                          {catName}
                        </Badge>
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                          isIncome ? 'text-success' : 'text-text-primary'
                        }`}
                      >
                        {isIncome ? '+' : '-'}
                        {formatCurrency(tx.amountCents, currency, language)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
