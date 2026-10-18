import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type {
  RecurringBill,
  SubscriptionCadence,
  SubscriptionPaymentStatus,
  SupportedCurrency,
} from '../types';
import {
  calculateAnnualCommitment,
  evaluateSubscriptionStatus,
  recordBillPayment,
  snoozeBillReminder,
  addDaysToISODate,
} from '../core/subscriptions';
import { formatCurrency, parseCurrencyToCents } from '../core/currency';
import { getLocalTodayISO, formatDateForLocale, splitISODate } from '../core/dates';
import { CADENCE_LABELS, BILL_STATUS_LABELS, getCurrencySymbol } from '../core/accountForms';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import {
  CalendarClock,
  Plus,
  CheckCircle,
  Sparkles,
  Repeat,
  Calendar,
} from 'lucide-react';

export interface SubscriptionsViewProps {
  currency?: SupportedCurrency;
}

export const SubscriptionsView: React.FC<SubscriptionsViewProps> = ({ currency = 'BRL' }) => {
  const { t, language } = useTranslation();
  const today = getLocalTodayISO();

  // Queries
  const bills = useLiveQuery(() => db.recurring_bills.toArray(), [], []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);

  // Modal State
  const [isAddBillOpen, setIsAddBillOpen] = useState(false);
  const [billName, setBillName] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [cadence, setCadence] = useState<SubscriptionCadence>('monthly');
  const [startDate, setStartDate] = useState(today);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // In-flight Pay/Snooze guard + inline action error
  const [busyBillId, setBusyBillId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Anchor day is always derived from the start date (no independent field to drift)
  const derivedAnchorDay = splitISODate(startDate)?.day ?? null;
  const currencySymbol = getCurrencySymbol(currency, language);

  // Annual Commitment
  const annualSummary = useMemo(() => {
    return calculateAnnualCommitment(bills);
  }, [bills]);

  // Evaluated bills with current status
  const evaluatedBills = useMemo(() => {
    return bills.map((b) => {
      const status = evaluateSubscriptionStatus(b, today);
      return {
        ...b,
        currentStatus: status,
      };
    });
  }, [bills, today]);

  // Original DB row (without the derived currentStatus) for the core helpers
  const findOriginalBill = (billId: string): RecurringBill | undefined =>
    bills.find((b) => b.id === billId);

  const payBill = async (bill: RecurringBill, payAccountId: string) => {
    const updatedBill = recordBillPayment(bill, today);

    await db.transaction('rw', [db.recurring_bills, db.transactions, db.accounts], async () => {
      const acc = await db.accounts.get(payAccountId);
      if (!acc) {
        throw new Error(t('subscriptions.err_account_not_found'));
      }

      await db.recurring_bills.put(updatedBill);

      // Record payment transaction
      const txId = crypto.randomUUID();
      await db.transactions.add({
        id: txId,
        accountId: payAccountId,
        date: today,
        amountCents: bill.amountCents,
        type: 'expense',
        categoryId: bill.categoryId,
        payee: bill.name,
        notes: `Pagamento Recorrente: ${bill.name}`,
        status: 'cleared',
        subscriptionId: bill.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Deduct from the same paying account
      await db.accounts.update(acc.id, {
        currentBalanceCents: acc.currentBalanceCents - bill.amountCents,
        updatedAt: new Date().toISOString(),
      });
    });
  };

  // Handle Quick Pay Action
  const handleQuickPay = async (billId: string) => {
    if (busyBillId) return;
    const bill = findOriginalBill(billId);
    if (!bill) return;

    // Resolve the paying account ONCE and use it for both the tx and the balance
    const payAccountId =
      (bill.paymentAccountId && accounts.some((a) => a.id === bill.paymentAccountId)
        ? bill.paymentAccountId
        : accounts[0]?.id) || '';
    if (!payAccountId) {
      setActionError(t('subscriptions.err_no_account'));
      return;
    }

    setActionError(null);
    setBusyBillId(billId);
    try {
      await payBill(bill, payAccountId);
    } catch (err: any) {
      setActionError(err?.message || t('subscriptions.err_pay'));
    } finally {
      setBusyBillId(null);
    }
  };

  // Handle Snooze Action
  const handleSnooze = async (billId: string) => {
    if (busyBillId) return;
    const bill = findOriginalBill(billId);
    if (!bill) return;
    setActionError(null);
    setBusyBillId(billId);
    try {
      const updated = snoozeBillReminder(bill, addDaysToISODate(today, 1));
      await db.recurring_bills.put(updated);
    } catch (err: any) {
      setActionError(err?.message || t('subscriptions.err_snooze'));
    } finally {
      setBusyBillId(null);
    }
  };

  // Create Recurring Bill
  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseCurrencyToCents(amountStr, { locale: language, currency });
    if (amountCents <= 0 || !billName.trim()) return;
    if (derivedAnchorDay === null) {
      setFormError(t('subscriptions.err_invalid_start'));
      return;
    }

    const accId = accountId || (accounts[0]?.id ?? '');
    const catId = categoryId || (categories[0]?.id ?? '');
    // Month-based and day-based cadences both anchor on the start date's day
    const anchorDay = derivedAnchorDay;

    const newBill: RecurringBill = {
      id: crypto.randomUUID(),
      name: billName.trim(),
      amountCents,
      currency,
      cadence,
      anchorDay,
      startDate,
      nextDueDate: startDate,
      paymentStatus: 'UPCOMING_SAFE',
      categoryId: catId,
      paymentAccountId: accId,
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await db.recurring_bills.add(newBill);
    } catch (err: any) {
      setFormError(err?.message || t('subscriptions.err_save'));
      return;
    }
    setFormError(null);

    // Reset Form
    setBillName('');
    setAmountStr('');
    setIsAddBillOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-brand" />
            <span>{t('nav.subscriptions')}</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {t('subscriptions.subtitle')}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setAccountId(accounts[0]?.id || '');
            setCategoryId(categories[0]?.id || '');
            setIsAddBillOpen(true);
          }}
          leadingIcon={<Plus className="w-4 h-4" />}
        >
          {t('subscriptions.new_subscription')}
        </Button>
      </div>

      {/* Annual Commitment Summary Banner */}
      <Card className="bg-gradient-to-r from-surface-card via-surface-card to-coin-subtle/20 border-coin/30">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <span className="text-xs text-text-secondary block font-medium">
              {t('subscriptions.annual_impact')}
            </span>
            <span className="text-2xl font-semibold font-mono tabular-nums text-text-primary mt-1 block">
              {formatCurrency(annualSummary.totalAnnualCents, currency, language)}
            </span>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              {t('subscriptions.active_count', { count: annualSummary.activeCount })}
            </span>
          </div>

          <div>
            <span className="text-xs text-text-secondary block font-medium">
              {t('subscriptions.monthly_equiv')}
            </span>
            <span className="text-xl font-semibold font-mono tabular-nums text-coin-text mt-1 block">
              {formatCurrency(annualSummary.totalMonthlyEquivalentCents, currency, language)}
            </span>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              {t('subscriptions.budget_weight')}
            </span>
          </div>

          <div className="p-3 bg-surface-muted/40 rounded-xl border border-border-subtle text-xs text-text-secondary flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-coin shrink-0 mt-0.5" />
            <span>
              {t('subscriptions.keroo_hint')}
            </span>
          </div>
        </div>
      </Card>

      {/* Subscriptions List */}
      <Card
        title={t('subscriptions.list_title')}
        subtitle={t('subscriptions.list_count', { count: evaluatedBills.length })}
      >
        {actionError && (
          <p className="text-xs text-danger font-medium mb-3" role="alert">
            {actionError}
          </p>
        )}
        {evaluatedBills.length === 0 ? (
          <p className="text-xs text-text-secondary py-8 text-center">
            {t('subscriptions.empty')}
          </p>
        ) : (
          <div className="space-y-3">
            {evaluatedBills.map((bill) => {
              const statusKey: SubscriptionPaymentStatus = BILL_STATUS_LABELS[bill.currentStatus]
                ? bill.currentStatus
                : 'UPCOMING_SAFE';
              const statusVariant = BILL_STATUS_LABELS[statusKey].variant;
              const cadenceKey: SubscriptionCadence = CADENCE_LABELS[bill.cadence]
                ? bill.cadence
                : 'monthly';
              const isOverdue = bill.currentStatus === 'OVERDUE';
              const isDueToday = bill.currentStatus === 'DUE_TODAY';
              const isPaid = bill.currentStatus === 'PAID_OK';

              return (
                <div
                  key={bill.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-colors ${
                    isOverdue
                      ? 'bg-danger-subtle/20 border-danger/30'
                      : isDueToday
                      ? 'bg-warning-subtle/20 border-warning/30'
                      : 'bg-surface-muted/20 border-border-subtle'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-surface-card border border-border-subtle shrink-0">
                      <Repeat className="w-4 h-4 text-brand" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-text-primary truncate">
                          {bill.name}
                        </h4>
                        <Badge variant={statusVariant} size="sm">
                          {t(`subscriptions.status.${statusKey.toLowerCase()}`)}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-text-secondary">
                        <span className="flex items-center gap-1 font-mono tabular-nums">
                          <Calendar className="w-3.5 h-3.5" />
                          {t('subscriptions.next_due', {
                            date: formatDateForLocale(bill.nextDueDate, language),
                          })}
                        </span>
                        <span>•</span>
                        <span>
                          {t('subscriptions.anchor_day', {
                            day: bill.anchorDay,
                            cadence: t(`subscriptions.cadence.${cadenceKey}`),
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-base text-text-primary">
                      {formatCurrency(bill.amountCents, bill.currency || currency, language)}
                    </span>

                    {!isPaid && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSnooze(bill.id)}
                          disabled={busyBillId !== null}
                          title={t('subscriptions.snooze_title')}
                        >
                          {t('subscriptions.snooze')}
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => handleQuickPay(bill.id)}
                          disabled={busyBillId !== null}
                          leadingIcon={<CheckCircle className="w-3.5 h-3.5" />}
                        >
                          {t('subscriptions.quick_pay')}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Modal: Add Recurring Bill */}
      <Modal
        isOpen={isAddBillOpen}
        onClose={() => setIsAddBillOpen(false)}
        title={t('subscriptions.new_subscription')}
        subtitle={t('subscriptions.modal_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateBill} className="space-y-4">
          <Input
            label={t('subscriptions.name_label')}
            placeholder={t('subscriptions.name_placeholder')}
            value={billName}
            onChange={(e) => setBillName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('common.amount_with_symbol', { symbol: currencySymbol })}
              placeholder={t('common.amount_placeholder')}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('subscriptions.cadence_label')}</label>
              <select
                value={cadence}
                onChange={(e) => setCadence(e.target.value as SubscriptionCadence)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                <option value="weekly">{t('subscriptions.cadence.weekly')}</option>
                <option value="biweekly">{t('subscriptions.cadence.biweekly')}</option>
                <option value="monthly">{t('subscriptions.cadence.monthly')}</option>
                <option value="bimonthly">{t('subscriptions.cadence.bimonthly')}</option>
                <option value="quarterly">{t('subscriptions.cadence.quarterly')}</option>
                <option value="semi_annually">{t('subscriptions.cadence.semi_annually')}</option>
                <option value="annually">{t('subscriptions.cadence.annually')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              type="date"
              label={t('subscriptions.start_date_label')}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              helperText={
                derivedAnchorDay !== null
                  ? t('subscriptions.anchor_helper', { day: derivedAnchorDay })
                  : undefined
              }
              required
            />
          </div>

          {formError && (
            <p className="text-xs text-danger font-medium" role="alert">
              {formError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('subscriptions.pay_account_label')}</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('common.category')}</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsAddBillOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('subscriptions.save_button')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
