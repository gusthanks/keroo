import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type {
  InterestType,
  SupportedCurrency,
} from '../types';
import {
  createInstallmentPlan,
  projectInstallmentTimeline,
  type InstallmentTimelineMonth,
} from '../core/installments';
import { formatCurrency, parseCurrencyToCents } from '../core/currency';
import { getLocalTodayISO, getLocalYearMonth, formatDateForLocale } from '../core/dates';
import { parsePercentInput } from '../core/accountForms';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { ProgressBar } from '../components/common/ProgressBar';
import {
  CreditCard as CreditCardIcon,
  Plus,
  Calendar,
  Clock,
  Layers,
} from 'lucide-react';

export interface CreditCardsViewProps {
  currency?: SupportedCurrency;
}

export const CreditCardsView: React.FC<CreditCardsViewProps> = ({ currency = 'BRL' }) => {
  const { t, language } = useTranslation();
  const today = getLocalTodayISO();
  const currentYearMonth = getLocalYearMonth();

  // Queries
  const allAccounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const installmentPlans = useLiveQuery(() => db.installment_plans.toArray(), [], []);

  // Filter credit card accounts
  const creditCards = useMemo(() => {
    return allAccounts.filter((a) => a.type === 'credit_card' && !a.isArchived);
  }, [allAccounts]);

  // Modal State
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [numInstallments, setNumInstallments] = useState<number>(3);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [interestType, setInterestType] = useState<InterestType>('none');
  const [monthlyInterestRatePercent, setMonthlyInterestRatePercent] = useState('1,99');
  const [rateError, setRateError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [selectedMonthsProjection, setSelectedMonthsProjection] = useState<number>(12);

  // Installment Timeline Projections (6 to 24 months)
  const timeline: InstallmentTimelineMonth[] = useMemo(() => {
    return projectInstallmentTimeline(
      installmentPlans,
      currentYearMonth,
      selectedMonthsProjection
    );
  }, [installmentPlans, currentYearMonth, selectedMonthsProjection]);

  // Find max monthly commitment for progress scaling
  const maxMonthLiabilityCents = useMemo(() => {
    return Math.max(1, ...timeline.map((m) => m.totalAmountCents));
  }, [timeline]);

  // Handle Create Installment Plan
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setRateError(null);
    setPlanError(null);
    const principalCents = parseCurrencyToCents(amountStr, { locale: language, currency });
    if (principalCents <= 0) return;

    const targetCard =
      creditCards.find((c) => c.id === selectedCardId) || creditCards[0];
    if (!targetCard) return;

    // No silent 10/17 defaults: the statement cycle must be configured on the card
    if (!targetCard.closingDay || !targetCard.dueDay) {
      setPlanError(t('credit_cards.err_no_cycle'));
      return;
    }
    const closingDay = targetCard.closingDay;
    const dueDay = targetCard.dueDay;

    let rate: number | undefined;
    if (interestType === 'compound_monthly') {
      const percent = parsePercentInput(monthlyInterestRatePercent);
      if (percent === null || !(percent > 0)) {
        setRateError(t('credit_cards.err_rate'));
        return;
      }
      rate = percent / 100;
    }

    const plan = createInstallmentPlan({
      accountId: targetCard.id,
      description: description.trim(),
      principalCents,
      totalInstallments: numInstallments,
      purchaseDate,
      closingDay,
      dueDay,
      interestType,
      monthlyInterestRate: rate,
    });

    try {
      await db.transaction('rw', [db.installment_plans, db.accounts, db.transactions], async () => {
        // Re-read the card inside the transaction (never trust the render closure)
        const freshCard = await db.accounts.get(targetCard.id);
        if (!freshCard) {
          throw new Error(t('credit_cards.err_card_not_found'));
        }

        await db.installment_plans.add(plan);

        // Create transaction for the initial liability / account balance impact
        const txId = crypto.randomUUID();
        await db.transactions.add({
          id: txId,
          accountId: targetCard.id,
          date: purchaseDate,
          amountCents: plan.installments[0]?.amountCents ?? principalCents,
          type: 'cc_installment',
          categoryId: null,
          payee: description.trim(),
          // Persisted ledger note, written in the active language (same wording as the demo seed).
          notes: t('credit_cards.installment_note', {
            index: 1,
            total: numInstallments,
            description: description.trim(),
          }),
          status: 'cleared',
          installmentPlanId: plan.id,
          installmentIndex: 1,
          totalInstallments: numInstallments,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Update card balance by the full plan liability (principal + interest)
        await db.accounts.update(freshCard.id, {
          currentBalanceCents: freshCard.currentBalanceCents - plan.totalAmountCents,
          updatedAt: new Date().toISOString(),
        });
      });
    } catch (err: any) {
      setPlanError(err?.message || t('credit_cards.err_save'));
      return;
    }

    // Reset Form
    setDescription('');
    setAmountStr('');
    setNumInstallments(3);
    setIsAddPlanOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5 text-brand" />
            <span>{t('nav.credit_cards')}</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {t('credit_cards.subtitle')}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            setSelectedCardId(creditCards[0]?.id || '');
            setIsAddPlanOpen(true);
          }}
          leadingIcon={<Plus className="w-4 h-4" />}
          disabled={creditCards.length === 0}
        >
          {t('credit_cards.new_plan')}
        </Button>
      </div>

      {/* Credit Cards Summary Cards */}
      {creditCards.length === 0 ? (
        <Card className="text-center py-8">
          <CreditCardIcon className="w-8 h-8 text-text-muted mx-auto mb-2" />
          <p className="text-sm font-medium text-text-primary">
            {t('credit_cards.no_cards_title')}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            {t('credit_cards.no_cards_desc')}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {creditCards.map((card) => {
            const limitCents = card.creditLimitCents || 500000;
            const currentDebtCents = Math.abs(Math.min(0, card.currentBalanceCents));
            const availableLimitCents = Math.max(0, limitCents - currentDebtCents);
            const usagePercent = limitCents > 0 ? (currentDebtCents / limitCents) * 100 : 0;

            return (
              <Card key={card.id} hoverable className="space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-text-primary">{card.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t('credit_cards.closes_day', { day: card.closingDay ?? '—' })}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {t('credit_cards.due_day', { day: card.dueDay ?? '—' })}
                      </span>
                    </div>
                  </div>
                  <Badge variant="warning" size="sm">
                    {t('credit_cards.card_badge')}
                  </Badge>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-text-secondary">{t('credit_cards.statement_used')}</span>
                    <span className="font-mono tabular-nums font-semibold text-danger">
                      {formatCurrency(currentDebtCents, currency, language)}
                    </span>
                  </div>
                  <ProgressBar
                    value={currentDebtCents}
                    max={limitCents}
                    variant={usagePercent > 80 ? 'danger' : 'brand'}
                    size="sm"
                  />
                  <div className="flex justify-between text-[11px] text-text-secondary">
                    <span>
                      {t('credit_cards.limit_label', {
                        amount: formatCurrency(limitCents, currency, language),
                      })}
                    </span>
                    <span className="text-success font-medium">
                      {t('credit_cards.available_label', {
                        amount: formatCurrency(availableLimitCents, currency, language),
                      })}
                    </span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 6 to 24-Month Installment Projection Timeline */}
      <Card
        title={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-brand" />
              <span>{t('credit_cards.timeline_title')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {[6, 12, 24].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonthsProjection(m)}
                  className={`px-2.5 py-1 text-xs font-mono rounded-lg border transition-colors ${
                    selectedMonthsProjection === m
                      ? 'bg-brand-subtle border-brand text-brand-text font-medium'
                      : 'border-border-subtle hover:bg-surface-hover text-text-secondary'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>
        }
        subtitle={t('credit_cards.timeline_subtitle')}
      >
        {timeline.every((m) => m.totalAmountCents === 0) ? (
          <p className="text-xs text-text-secondary py-8 text-center">
            {t('credit_cards.timeline_empty', { months: selectedMonthsProjection })}
          </p>
        ) : (
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {timeline.map((month) => {
                const isCurrent = month.yearMonth === currentYearMonth;

                return (
                  <div
                    key={month.yearMonth}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between transition-colors ${
                      isCurrent
                        ? 'border-brand bg-brand-subtle/30 shadow-xs'
                        : 'border-border-subtle bg-surface-muted/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-semibold text-text-primary">
                        {month.yearMonth}
                        {isCurrent && (
                          <span className="ml-1.5 text-[10px] text-brand uppercase font-sans">
                            {t('credit_cards.current_month')}
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-text-secondary">
                        {t('credit_cards.installments_count', { count: month.activeInstallmentsCount })}
                      </span>
                    </div>

                    <div className="text-base font-semibold font-mono tabular-nums text-text-primary mb-2">
                      {formatCurrency(month.totalAmountCents, currency, language)}
                    </div>

                    <ProgressBar
                      value={month.totalAmountCents}
                      max={maxMonthLiabilityCents}
                      variant={isCurrent ? 'brand' : 'coin'}
                      size="sm"
                    />

                    {month.items.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-border-subtle/60 space-y-1">
                        {month.items.slice(0, 3).map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between text-[11px] text-text-secondary"
                          >
                            <span className="truncate max-w-[120px]">{item.description}</span>
                            <span className="font-mono tabular-nums text-text-primary">
                              {item.index}/{item.totalInstallments} • {formatCurrency(item.amountCents, currency, language)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      {/* Active Installment Plans Table */}
      <Card
        title={t('credit_cards.active_plans')}
        subtitle={t('credit_cards.plans_count', { count: installmentPlans.length })}
      >
        {installmentPlans.length === 0 ? (
          <p className="text-xs text-text-secondary py-6 text-center">
            {t('credit_cards.plans_empty')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-text-secondary uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">{t('credit_cards.col_purchase')}</th>
                  <th className="py-2.5 px-3">{t('common.date')}</th>
                  <th className="py-2.5 px-3">{t('credit_cards.col_installments')}</th>
                  <th className="py-2.5 px-3">{t('credit_cards.col_total')}</th>
                  <th className="py-2.5 px-3">{t('credit_cards.col_interest')}</th>
                  <th className="py-2.5 px-3 text-right">{t('credit_cards.col_installment_value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {installmentPlans.map((plan) => {
                  const p1 = plan.installments[0]?.amountCents || 0;
                  return (
                    <tr key={plan.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-text-primary">
                        {plan.description}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-text-secondary whitespace-nowrap">
                        {formatDateForLocale(plan.purchaseDate, language)}
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums">
                        {plan.totalInstallments}x
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums font-medium">
                        {formatCurrency(plan.totalAmountCents, currency, language)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant={plan.interestType === 'none' ? 'success' : 'warning'} size="sm">
                          {plan.interestType === 'none' ? t('credit_cards.no_interest') : t('credit_cards.price_table')}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                        {formatCurrency(p1, currency, language)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal: Add Purchase / Installment Plan */}
      <Modal
        isOpen={isAddPlanOpen}
        onClose={() => setIsAddPlanOpen(false)}
        title={t('credit_cards.modal_title')}
        subtitle={t('credit_cards.modal_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreatePlan} className="space-y-4">
          <Input
            label={t('credit_cards.desc_label')}
            placeholder={t('credit_cards.desc_placeholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('credit_cards.principal_label')}
              placeholder={t('common.amount_placeholder')}
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">
                {t('credit_cards.num_installments_label')}
              </label>
              <select
                value={numInstallments}
                onChange={(e) => setNumInstallments(parseInt(e.target.value, 10))}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map((n) => (
                  <option key={n} value={n}>
                    {n}x {n === 1 ? t('credit_cards.upfront_hint') : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('accounts.type.credit_card')}</label>
              <select
                value={selectedCardId}
                onChange={(e) => setSelectedCardId(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                {creditCards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t('credit_cards.card_option', { name: c.name, day: c.closingDay ?? '—' })}
                  </option>
                ))}
              </select>
            </div>

            <Input
              type="date"
              label={t('credit_cards.purchase_date_label')}
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <label className="text-xs font-medium text-text-primary block">
              {t('credit_cards.interest_type_label')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setInterestType('none')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  interestType === 'none'
                    ? 'border-brand bg-brand-subtle text-brand-text'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('credit_cards.interest_none_button')}
              </button>
              <button
                type="button"
                onClick={() => setInterestType('compound_monthly')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  interestType === 'compound_monthly'
                    ? 'border-warning bg-warning-subtle text-warning'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('credit_cards.interest_monthly_button')}
              </button>
            </div>

            {interestType === 'compound_monthly' && (
              <Input
                label={t('credit_cards.rate_label')}
                placeholder={t('credit_cards.rate_placeholder')}
                inputMode="decimal"
                value={monthlyInterestRatePercent}
                onChange={(e) => setMonthlyInterestRatePercent(e.target.value)}
                error={rateError ?? undefined}
                helperText={t('credit_cards.rate_helper')}
              />
            )}
          </div>

          {planError && (
            <p className="text-xs text-danger font-medium" role="alert">
              {planError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsAddPlanOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('credit_cards.save_button')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
