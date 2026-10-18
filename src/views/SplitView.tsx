import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type {
  SplitExpense,
  SplitParty,
  SplitSettlement,
  SupportedCurrency,
} from '../types';
import {
  calculateBilateralSummary,
  split50_50,
  createSettlement,
  type BilateralSummary,
} from '../core/split';
import { formatCurrency, parseCurrencyToCents } from '../core/currency';
import { getLocalTodayISO } from '../core/dates';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import {
  Users,
  Plus,
  HandCoins,
  CheckCircle2,
  ArrowRightLeft,
  UserPlus,
} from 'lucide-react';

type SplitRelationship = SplitParty['relationship'];

export interface SplitViewProps {
  currency?: SupportedCurrency;
}

export const SplitView: React.FC<SplitViewProps> = ({ currency = 'BRL' }) => {
  const { t, language } = useTranslation();
  const today = getLocalTodayISO();

  // Queries
  const contacts = useLiveQuery(() => db.split_parties.toArray(), [], []);
  const allExpenses = useLiveQuery(() => db.split_expenses.toArray(), [], []);
  const allSettlements = useLiveQuery(() => db.split_settlements.toArray(), [], []);

  // Selected Contact State
  const [selectedContactId, setSelectedContactId] = useState<string>('');

  // Modals State
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isSettleOpen, setIsSettleOpen] = useState(false);
  const [isAddContactOpen, setIsAddContactOpen] = useState(false);

  // New Expense Form State
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmountStr, setExpenseAmountStr] = useState('');
  const [paidByParty, setPaidByParty] = useState<'USER' | string>('USER');
  const [expenseDate, setExpenseDate] = useState(today);

  // New Contact Form State
  const [newContactName, setNewContactName] = useState('');
  const [newContactRelationship, setNewContactRelationship] =
    useState<SplitRelationship>('household_partner');
  const [newContactPix, setNewContactPix] = useState('');

  // Active contact object
  const activeContact = useMemo(() => {
    if (contacts.length === 0) return null;
    return contacts.find((c) => c.id === selectedContactId) || contacts[0];
  }, [contacts, selectedContactId]);

  // Bilateral summary calculation between 'USER' and selected contact
  const bilateralBalance: BilateralSummary | null = useMemo(() => {
    if (!activeContact) return null;
    return calculateBilateralSummary(
      allExpenses,
      allSettlements,
      'USER',
      activeContact.id
    );
  }, [activeContact, allExpenses, allSettlements]);

  // Filtered expense & settlement history for the active contact
  const contactHistory = useMemo(() => {
    if (!activeContact) return [];

    const expList = allExpenses
      .filter((e) => e.shares.some((s) => s.partyId === activeContact.id))
      .map((e) => ({
        id: e.id,
        type: 'expense' as const,
        date: e.date,
        description: e.description,
        totalCents: e.totalAmountCents,
        paidBy: e.paidByPartyId === 'USER' ? t('split.you') : activeContact.name,
      }));

    const setList = allSettlements
      .filter(
        (s) =>
          (s.fromPartyId === 'USER' && s.toPartyId === activeContact.id) ||
          (s.fromPartyId === activeContact.id && s.toPartyId === 'USER')
      )
      .map((s) => ({
        id: s.id,
        type: 'settlement' as const,
        date: s.date,
        description: s.notes || t('split.settlement_default'),
        totalCents: s.amountCents,
        paidBy: s.fromPartyId === 'USER' ? t('split.you') : activeContact.name,
      }));

    return [...expList, ...setList].sort((a, b) => b.date.localeCompare(a.date));
  }, [activeContact, allExpenses, allSettlements, t]);

  // Handle Add Contact
  const handleCreateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim()) return;

    const newContact: SplitParty = {
      id: crypto.randomUUID(),
      name: newContactName.trim(),
      phoneOrPix: newContactPix.trim() || undefined,
      relationship: newContactRelationship,
      isArchived: false,
      createdAt: new Date().toISOString(),
    };

    await db.split_parties.add(newContact);
    setSelectedContactId(newContact.id);
    setNewContactName('');
    setNewContactPix('');
    setIsAddContactOpen(false);
  };

  // Handle Create Split Expense (50/50 with odd-cent payer absorption)
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContact) return;

    const totalCents = parseCurrencyToCents(expenseAmountStr, { locale: language, currency });
    if (totalCents <= 0 || !expenseDesc.trim()) return;

    const shares = split50_50(totalCents, paidByParty, activeContact.id);

    const expense: SplitExpense = {
      id: crypto.randomUUID(),
      description: expenseDesc.trim(),
      totalAmountCents: totalCents,
      currency,
      date: expenseDate,
      paidByPartyId: paidByParty,
      splitMethod: 'equal_50_50',
      shares,
      createdAt: new Date().toISOString(),
    };

    await db.split_expenses.add(expense);

    setExpenseDesc('');
    setExpenseAmountStr('');
    setIsAddExpenseOpen(false);
  };

  // Handle 1-Click Settle Balance (brings running net balance to R$ 0,00)
  const handleSettle = async () => {
    if (!activeContact || !bilateralBalance) return;
    if (bilateralBalance.direction === 'SETTLED') return;

    const fromParty =
      bilateralBalance.direction === 'A_OWES_B' ? 'USER' : activeContact.id;
    const toParty =
      bilateralBalance.direction === 'A_OWES_B' ? activeContact.id : 'USER';

    const settlement: SplitSettlement = createSettlement(
      fromParty,
      toParty,
      bilateralBalance.settlementAmountCents,
      today,
      `Acerto completo com ${activeContact.name}`
    );

    await db.split_settlements.add(settlement);
    setIsSettleOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-brand" />
            <span>{t('nav.split')}</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {t('split.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAddContactOpen(true)}
            leadingIcon={<UserPlus className="w-4 h-4" />}
          >
            {t('split.new_contact')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPaidByParty('USER');
              setIsAddExpenseOpen(true);
            }}
            leadingIcon={<Plus className="w-4 h-4" />}
            disabled={!activeContact}
          >
            {t('split.new_expense')}
          </Button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <Card className="text-center py-12">
          <Users className="w-10 h-10 text-text-muted mx-auto mb-2" />
          <h3 className="text-base font-semibold text-text-primary">{t('split.no_contacts_title')}</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
            {t('split.no_contacts_desc')}
          </p>
          <Button
            variant="primary"
            size="sm"
            className="mt-4"
            onClick={() => setIsAddContactOpen(true)}
            leadingIcon={<UserPlus className="w-4 h-4" />}
          >
            {t('split.add_contact')}
          </Button>
        </Card>
      ) : (
        <>
          {/* Contacts Switcher Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {contacts.map((c) => {
              const isSelected = activeContact?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedContactId(c.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                    isSelected
                      ? 'bg-brand-subtle text-brand-text border-brand font-semibold shadow-xs'
                      : 'bg-surface-card text-text-secondary border-border-subtle hover:border-border-strong'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* Bilateral Net Balance Banner */}
          {activeContact && bilateralBalance && (
            <Card
              className={`border transition-colors ${
                bilateralBalance.direction === 'B_OWES_A'
                  ? 'bg-success-subtle/30 border-success/30'
                  : bilateralBalance.direction === 'A_OWES_B'
                  ? 'bg-danger-subtle/30 border-danger/30'
                  : 'bg-surface-card border-border-subtle'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-medium text-text-secondary uppercase tracking-wider block">
                    {t('split.balance_with', { name: activeContact.name })}
                  </span>

                  <div className="flex items-center gap-2.5 mt-1">
                    <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-text-primary">
                      {bilateralBalance.direction === 'SETTLED' ? (
                        formatCurrency(0, currency, language)
                      ) : (
                        formatCurrency(bilateralBalance.settlementAmountCents, currency, language)
                      )}
                    </span>
                    <Badge
                      variant={
                        bilateralBalance.direction === 'B_OWES_A'
                          ? 'success'
                          : bilateralBalance.direction === 'A_OWES_B'
                          ? 'danger'
                          : 'neutral'
                      }
                      size="md"
                    >
                      {bilateralBalance.direction === 'B_OWES_A'
                        ? t('split.to_receive')
                        : bilateralBalance.direction === 'A_OWES_B'
                        ? t('split.you_owe')
                        : t('split.settled')}
                    </Badge>
                  </div>

                  <p className="text-xs text-text-secondary mt-1">
                    {bilateralBalance.direction === 'B_OWES_A'
                      ? t('split.contact_owes_you', {
                          name: activeContact.name,
                          amount: formatCurrency(
                            bilateralBalance.settlementAmountCents,
                            currency,
                            language
                          ),
                        })
                      : bilateralBalance.direction === 'A_OWES_B'
                      ? t('split.you_owe_contact', {
                          name: activeContact.name,
                          amount: formatCurrency(
                            bilateralBalance.settlementAmountCents,
                            currency,
                            language
                          ),
                        })
                      : t('split.no_pending')}
                  </p>
                </div>

                {bilateralBalance.direction !== 'SETTLED' && (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => setIsSettleOpen(true)}
                    leadingIcon={<HandCoins className="w-4 h-4" />}
                  >
                    {t('split.settle_balance')}
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Shared History Ledger Table */}
          <Card
            title={t('split.history_title', { name: activeContact?.name ?? '' })}
            subtitle={t('split.history_count', { count: contactHistory.length })}
          >
            {contactHistory.length === 0 ? (
              <p className="text-xs text-text-secondary py-6 text-center">
                {t('split.history_empty')}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border-subtle text-text-secondary uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-3">{t('common.date')}</th>
                      <th className="py-2.5 px-3">{t('common.description')}</th>
                      <th className="py-2.5 px-3">{t('split.col_paid_by')}</th>
                      <th className="py-2.5 px-3 text-right">{t('split.col_total')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50">
                    {contactHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-surface-hover/50 transition-colors">
                        <td className="py-2.5 px-3 font-mono tabular-nums text-text-secondary whitespace-nowrap">
                          {item.date}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-text-primary">
                          <div className="flex items-center gap-1.5">
                            {item.type === 'settlement' ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                            ) : (
                              <ArrowRightLeft className="w-3.5 h-3.5 text-brand" />
                            )}
                            <span>{item.description}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-text-secondary whitespace-nowrap">
                          {item.paidBy}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap">
                          {formatCurrency(item.totalCents, currency, language)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Modal 1: Add Split Expense */}
      <Modal
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        title={t('split.expense_modal_title', { name: activeContact?.name ?? '' })}
        subtitle={t('split.expense_modal_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <Input
            label={t('split.expense_desc_label')}
            placeholder={t('split.expense_desc_placeholder')}
            value={expenseDesc}
            onChange={(e) => setExpenseDesc(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('split.total_label')}
              placeholder={t('common.amount_placeholder')}
              value={expenseAmountStr}
              onChange={(e) => setExpenseAmountStr(e.target.value)}
              required
            />

            <Input
              type="date"
              label={t('split.expense_date_label')}
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-primary">{t('split.who_paid')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPaidByParty('USER')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  paidByParty === 'USER'
                    ? 'border-brand bg-brand-subtle text-brand-text'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('split.i_paid')}
              </button>
              <button
                type="button"
                onClick={() => setPaidByParty(activeContact?.id || '')}
                className={`p-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  paidByParty !== 'USER'
                    ? 'border-brand bg-brand-subtle text-brand-text'
                    : 'border-border-subtle text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('split.contact_paid', { name: activeContact?.name ?? '' })}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsAddExpenseOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('split.save_split')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: 1-Click Settle Balance */}
      <Modal
        isOpen={isSettleOpen}
        onClose={() => setIsSettleOpen(false)}
        title={t('split.settle_balance')}
        subtitle={t('split.settle_modal_subtitle', { name: activeContact?.name ?? '' })}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            {t('split.settle_desc_pre')}{' '}
            <strong className="text-text-primary font-mono tabular-nums">
              {bilateralBalance &&
                formatCurrency(bilateralBalance.settlementAmountCents, currency, language)}
            </strong>
            {t('split.settle_desc_post', { amount: formatCurrency(0, currency, language) })}
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsSettleOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleSettle}>
              {t('split.confirm_settle')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal 3: Add Contact */}
      <Modal
        isOpen={isAddContactOpen}
        onClose={() => setIsAddContactOpen(false)}
        title={t('split.new_contact')}
        subtitle={t('split.contact_modal_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateContact} className="space-y-4">
          <Input
            label={t('split.contact_name_label')}
            placeholder={t('split.contact_name_placeholder')}
            value={newContactName}
            onChange={(e) => setNewContactName(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-primary">{t('split.relationship_label')}</label>
            <select
              value={newContactRelationship}
              onChange={(e) => setNewContactRelationship(e.target.value as SplitRelationship)}
              className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
            >
              <option value="household_partner">{t('split.rel.household_partner')}</option>
              <option value="roommate">{t('split.rel.roommate')}</option>
              <option value="friend">{t('split.rel.friend')}</option>
              <option value="family">{t('split.rel.family')}</option>
              <option value="other">{t('split.rel.other')}</option>
            </select>
          </div>

          <Input
            label={t('split.pix_label')}
            placeholder={t('split.pix_placeholder')}
            value={newContactPix}
            onChange={(e) => setNewContactPix(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsAddContactOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('split.register_contact')}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
