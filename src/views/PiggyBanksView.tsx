import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type { Cents, PiggyBank, SupportedCurrency } from '../types';
import { formatCurrency, parseCurrencyToCents } from '../core/currency';
import { getLocalTodayISO } from '../core/dates';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { ProgressBar } from '../components/common/ProgressBar';
import { KerooMascot } from '../components/keroo/KerooMascot';
import {
  PiggyBank as PiggyBankIcon,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Coins,
} from 'lucide-react';

export interface PiggyBanksViewProps {
  currency?: SupportedCurrency;
  /** Opens the "new piggy bank" modal on mount (command palette deep-link). */
  initialOpenCreate?: boolean;
  /** Called once initialOpenCreate has been consumed. */
  onInitialOpenCreateHandled?: () => void;
}

/** Thrown inside the Dexie transaction to abort a withdrawal that exceeds the saved amount. */
class InsufficientPiggyFundsError extends Error {}

export const PiggyBanksView: React.FC<PiggyBanksViewProps> = ({
  currency = 'BRL',
  initialOpenCreate = false,
  onInitialOpenCreateHandled,
}) => {
  const { t, language } = useTranslation();
  const today = getLocalTodayISO();

  // Queries
  const piggyBanks = useLiveQuery(() => db.piggy_banks.toArray(), [], []);
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);

  // Modals & Active Cofrinho state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isDepositWithdrawOpen, setIsDepositWithdrawOpen] = useState(false);
  const [activePiggy, setActivePiggy] = useState<PiggyBank | null>(null);
  const [actionType, setActionType] = useState<'deposit' | 'withdraw'>('deposit');
  const [amountInputStr, setAmountInputStr] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [movementError, setMovementError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!initialOpenCreate) return;
    setIsCreateOpen(true);
    onInitialOpenCreateHandled?.();
  }, [initialOpenCreate, onInitialOpenCreateHandled]);

  // Form State for New Piggy Bank
  const [newName, setNewName] = useState('');
  const [newTargetStr, setNewTargetStr] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newIcon, setNewIcon] = useState('🎯');

  // Mascot celebratory state
  const [celebratingPiggyId, setCelebratingPiggyId] = useState<string | null>(null);

  // Totals
  const { totalSavedCents, totalTargetCents } = useMemo(() => {
    let saved = 0;
    let target = 0;
    for (const pb of piggyBanks) {
      saved += pb.savedCents;
      target += pb.targetCents;
    }
    return { totalSavedCents: saved, totalTargetCents: target };
  }, [piggyBanks]);

  // Monthly Pacing Calculator helper
  const calculatePacing = (pb: PiggyBank): { monthsRemaining: number; monthlyRequiredCents: Cents } | null => {
    if (!pb.targetDate || pb.targetDate <= today) return null;

    const [curY, curM] = today.split('-').map(Number);
    const [tarY, tarM] = pb.targetDate.split('-').map(Number);
    const months = Math.max(1, (tarY - curY) * 12 + (tarM - curM));
    const remainingCents = Math.max(0, pb.targetCents - pb.savedCents);
    const monthlyRequiredCents = Math.ceil(remainingCents / months);

    return { monthsRemaining: months, monthlyRequiredCents };
  };

  // Handle Deposit / Withdraw
  const handleDepositWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePiggy) return;
    // Ignore double submits while the previous write is still running.
    if (submittingRef.current) return;
    setMovementError(null);

    const cents = parseCurrencyToCents(amountInputStr, { locale: language, currency });
    if (cents <= 0) return;

    const accId = selectedAccountId || (accounts[0]?.id ?? '');
    if (!accId) {
      setMovementError(t('piggy_banks.err_no_account'));
      return;
    }

    const piggyId = activePiggy.id;
    const isDeposit = actionType === 'deposit';

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await db.transaction('rw', [db.piggy_banks, db.accounts, db.transactions], async () => {
        // Re-read inside the transaction so stale React state can never create money.
        const piggy = await db.piggy_banks.get(piggyId);
        const acc = await db.accounts.get(accId);
        if (!piggy || !acc) throw new Error('Piggy bank or account not found');
        if (!isDeposit && cents > piggy.savedCents) {
          throw new InsufficientPiggyFundsError();
        }

        const nowIso = new Date().toISOString();
        await db.piggy_banks.update(piggyId, {
          savedCents: isDeposit ? piggy.savedCents + cents : piggy.savedCents - cents,
          updatedAt: nowIso,
        });

        await db.accounts.update(accId, {
          currentBalanceCents: acc.currentBalanceCents + (isDeposit ? -cents : cents),
          updatedAt: nowIso,
        });

        // Movement between own money: a transfer, never income/expense.
        await db.transactions.add({
          id: crypto.randomUUID(),
          accountId: accId,
          date: today,
          amountCents: cents,
          type: 'transfer',
          categoryId: null,
          payee: piggy.name,
          // Persisted ledger note, written once in the active language (not re-translated at render time).
          notes: isDeposit
            ? t('piggy_banks.deposit_note', { name: piggy.name })
            : t('piggy_banks.withdraw_note', { name: piggy.name }),
          status: 'cleared',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      });
    } catch (err) {
      if (err instanceof InsufficientPiggyFundsError) {
        setMovementError(
          t('piggy_banks.err_exceeds', {
            amount: formatCurrency(activePiggy.savedCents, currency, language),
          })
        );
      } else {
        console.error(err);
        setMovementError(t('piggy_banks.err_generic'));
      }
      return;
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }

    // If deposit, trigger Keroo coin swallowing celebration!
    if (isDeposit) {
      setCelebratingPiggyId(piggyId);
      setTimeout(() => setCelebratingPiggyId(null), 3500);
    }

    setAmountInputStr('');
    setIsDepositWithdrawOpen(false);
  };

  // Handle Create Cofrinho
  const handleCreatePiggy = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCents = parseCurrencyToCents(newTargetStr, { locale: language, currency });
    if (targetCents <= 0 || !newName.trim()) return;

    const newPb: PiggyBank = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      targetCents,
      savedCents: 0,
      targetDate: newTargetDate || undefined,
      color: '#10b981',
      icon: newIcon,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.piggy_banks.add(newPb);

    setNewName('');
    setNewTargetStr('');
    setNewTargetDate('');
    setIsCreateOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
            <PiggyBankIcon className="w-5 h-5 text-brand" />
            <span>{t('nav.piggy_banks')}</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {t('piggy_banks.subtitle')}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsCreateOpen(true)}
          leadingIcon={<Plus className="w-4 h-4" />}
        >
          {t('piggy_banks.new_piggy')}
        </Button>
      </div>

      {/* Summary KPI Banner */}
      <Card className="bg-gradient-to-r from-surface-card via-surface-card to-coin-subtle/25 border-coin/30">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div>
            <span className="text-xs text-text-secondary block font-medium">{t('piggy_banks.total_saved')}</span>
            <span className="text-2xl font-semibold font-mono tabular-nums text-text-primary mt-1 block">
              {formatCurrency(totalSavedCents, currency, language)}
            </span>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              {t('piggy_banks.active_count', { count: piggyBanks.length })}
            </span>
          </div>

          <div>
            <span className="text-xs text-text-secondary block font-medium">{t('piggy_banks.global_target')}</span>
            <span className="text-xl font-semibold font-mono tabular-nums text-coin-text mt-1 block">
              {formatCurrency(totalTargetCents, currency, language)}
            </span>
            <span className="text-[11px] text-text-secondary mt-0.5 block">
              {totalTargetCents > 0
                ? t('piggy_banks.global_progress', {
                    percent: Math.round((totalSavedCents / totalTargetCents) * 100),
                  })
                : t('piggy_banks.set_goals')}
            </span>
          </div>

          <div className="flex items-center gap-3 p-3 bg-surface-muted/40 rounded-xl border border-border-subtle">
            <Coins className="w-6 h-6 text-coin shrink-0" />
            <div className="text-xs text-text-secondary">
              {t('piggy_banks.keroo_hint')}
            </div>
          </div>
        </div>
      </Card>

      {/* Cofrinhos Grid */}
      {piggyBanks.length === 0 ? (
        <Card className="text-center py-12">
          <PiggyBankIcon className="w-10 h-10 text-text-muted mx-auto mb-2" />
          <h3 className="text-base font-semibold text-text-primary">{t('piggy_banks.empty_title')}</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
            {t('piggy_banks.empty_desc')}
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => setIsCreateOpen(true)}
            leadingIcon={<Plus className="w-4 h-4" />}
          >
            {t('piggy_banks.create_first')}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {piggyBanks.map((pb) => {
            const percentage = Math.min(100, (pb.savedCents / pb.targetCents) * 100);
            const isCompleted = pb.savedCents >= pb.targetCents;
            const pacing = calculatePacing(pb);
            const isCelebrating = celebratingPiggyId === pb.id;

            return (
              <Card
                key={pb.id}
                hoverable
                className={`relative flex flex-col justify-between overflow-hidden transition-all duration-300 ${
                  isCelebrating ? 'ring-2 ring-brand bg-brand-subtle/20' : ''
                }`}
              >
                {/* Floating Coin Swallowing Mascot celebration */}
                {isCelebrating && (
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-brand text-surface-card px-2.5 py-1 rounded-full text-xs font-semibold shadow-md animate-bounce">
                    <KerooMascot pose="coin_swallowing" coinProp="swallowing" size="xs" />
                    <span>{t('piggy_banks.lucky_coin')}</span>
                  </div>
                )}

                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl p-2 bg-surface-muted/50 rounded-xl border border-border-subtle">
                        {pb.icon || '🎯'}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold text-text-primary leading-tight">
                          {pb.name}
                        </h3>
                        {pb.targetDate && (
                          <span className="text-[11px] text-text-secondary flex items-center gap-1 mt-0.5 font-mono">
                            <Calendar className="w-3 h-3" />
                            {t('piggy_banks.target_date', { date: pb.targetDate })}
                          </span>
                        )}
                      </div>
                    </div>

                    <Badge variant={isCompleted ? 'success' : 'coin'} size="sm">
                      {isCompleted ? t('piggy_banks.completed') : `${Math.round(percentage)}%`}
                    </Badge>
                  </div>

                  {/* Balances */}
                  <div className="space-y-1.5 my-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xl font-bold font-mono tabular-nums text-text-primary">
                        {formatCurrency(pb.savedCents, currency, language)}
                      </span>
                      <span className="text-xs text-text-secondary font-mono tabular-nums">
                        {t('piggy_banks.of_target', {
                          amount: formatCurrency(pb.targetCents, currency, language),
                        })}
                      </span>
                    </div>

                    <ProgressBar
                      value={pb.savedCents}
                      max={pb.targetCents}
                      variant={isCompleted ? 'success' : 'coin'}
                      size="md"
                    />
                  </div>

                  {/* Monthly Pacing Calculator */}
                  {pacing && !isCompleted && (
                    <div className="p-2.5 rounded-xl bg-surface-muted/30 border border-border-subtle text-xs text-text-secondary flex items-center justify-between mb-4">
                      <span>{t('piggy_banks.suggested_pace')}</span>
                      <span className="font-mono tabular-nums font-semibold text-brand-text">
                        {t('piggy_banks.per_month', {
                          amount: formatCurrency(pacing.monthlyRequiredCents, currency, language),
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions: Deposit & Withdraw */}
                <div className="flex items-center gap-2 pt-2 border-t border-border-subtle">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setActivePiggy(pb);
                      setActionType('withdraw');
                      setMovementError(null);
                      setIsDepositWithdrawOpen(true);
                    }}
                    leadingIcon={<ArrowDownLeft className="w-3.5 h-3.5 text-danger" />}
                  >
                    {t('piggy_banks.withdraw')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    className="flex-1"
                    onClick={() => {
                      setActivePiggy(pb);
                      setActionType('deposit');
                      setMovementError(null);
                      setIsDepositWithdrawOpen(true);
                    }}
                    leadingIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
                  >
                    {t('piggy_banks.deposit')}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal 1: Deposit / Withdraw */}
      <Modal
        isOpen={isDepositWithdrawOpen}
        onClose={() => setIsDepositWithdrawOpen(false)}
        title={
          actionType === 'deposit'
            ? t('piggy_banks.deposit_title', { name: activePiggy?.name ?? '' })
            : t('piggy_banks.withdraw_title', { name: activePiggy?.name ?? '' })
        }
        subtitle={
          actionType === 'deposit'
            ? t('piggy_banks.deposit_subtitle')
            : t('piggy_banks.withdraw_subtitle')
        }
        maxWidth="md"
      >
        <form onSubmit={handleDepositWithdraw} className="space-y-4">
          <Input
            label={
              actionType === 'deposit'
                ? t('piggy_banks.deposit_amount_label')
                : t('piggy_banks.withdraw_amount_label')
            }
            placeholder={t('common.amount_placeholder')}
            value={amountInputStr}
            onChange={(e) => {
              setAmountInputStr(e.target.value);
              setMovementError(null);
            }}
            required
          />

          {movementError && (
            <p role="alert" data-testid="piggy-movement-error" className="text-xs font-medium text-danger">
              {movementError}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-primary">
              {actionType === 'deposit'
                ? t('piggy_banks.take_from_account')
                : t('piggy_banks.put_in_account')}
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({formatCurrency(a.currentBalanceCents, a.currency || currency, language)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsDepositWithdrawOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {actionType === 'deposit'
                ? t('piggy_banks.confirm_deposit')
                : t('piggy_banks.confirm_withdraw')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Create Piggy Bank */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={t('piggy_banks.create_title')}
        subtitle={t('piggy_banks.create_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreatePiggy} className="space-y-4">
          <div className="grid grid-cols-[60px_1fr] gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('piggy_banks.icon_label')}</label>
              <input
                type="text"
                value={newIcon}
                onChange={(e) => setNewIcon(e.target.value)}
                className="w-full text-center bg-surface-card border border-border-subtle rounded-xl py-2 text-lg outline-none focus:border-brand"
              />
            </div>

            <Input
              label={t('piggy_banks.name_label')}
              placeholder={t('piggy_banks.name_placeholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('piggy_banks.target_label')}
              placeholder={t('piggy_banks.target_placeholder')}
              value={newTargetStr}
              onChange={(e) => setNewTargetStr(e.target.value)}
              required
            />

            <Input
              type="date"
              label={t('piggy_banks.deadline_label')}
              value={newTargetDate}
              onChange={(e) => setNewTargetDate(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('piggy_banks.create_button')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
