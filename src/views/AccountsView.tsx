import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type {
  Account,
  AccountType,
  Transaction,
  TransactionType,
  SupportedCurrency,
} from '../types';
import { formatCurrency, parseCurrencyToCents } from '../core/currency';
import { applyAutoRules, filterDuplicateTransactions } from '../core/autoRules';
import { getLocalTodayISO, formatDateForLocale } from '../core/dates';
import { parseDayOfMonth, getCurrencySymbol } from '../core/accountForms';
import { parseImportFile, type ImportTransactionDraft } from '../core/importParser';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import {
  Plus,
  Upload,
  Wallet,
  PiggyBank,
  TrendingUp,
  Coins,
  FileText,
  Building2,
} from 'lucide-react';

export interface AccountsViewProps {
  currency?: SupportedCurrency;
}

// Display labels live in the dictionaries (accounts.type.<type>); only the icons are defined here.
const ACCOUNT_TYPE_ICONS: Record<AccountType, React.ReactNode> = {
  checking: <Wallet className="w-4 h-4 text-brand" />,
  savings: <PiggyBank className="w-4 h-4 text-coin" />,
  credit_card: <Building2 className="w-4 h-4 text-warning" />,
  investment: <TrendingUp className="w-4 h-4 text-info" />,
  cash: <Coins className="w-4 h-4 text-success" />,
};

export const AccountsView: React.FC<AccountsViewProps> = ({ currency = 'BRL' }) => {
  const { t, language } = useTranslation();
  const today = getLocalTodayISO();
  const currencySymbol = getCurrencySymbol(currency, language);

  // Queries
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const transactions = useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const autoRules = useLiveQuery(() => db.auto_rules.toArray(), [], []);

  // Filter state
  const [selectedAccountId, setSelectedAccountId] = useState<string | 'all'>('all');

  // Modals state
  const [isAddTxOpen, setIsAddTxOpen] = useState(false);
  const [isAddAccountOpen, setIsAddAccountOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Add Transaction Form
  const [txPayee, setTxPayee] = useState('');
  const [txAmountStr, setTxAmountStr] = useState('');
  const [txDate, setTxDate] = useState(today);
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [txAccountId, setTxAccountId] = useState('');
  const [txCategoryId, setTxCategoryId] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [autoRuleApplied, setAutoRuleApplied] = useState<string | null>(null);

  // Add Account Form
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('checking');
  const [newAccBalanceStr, setNewAccBalanceStr] = useState('0,00');
  const [newAccClosingDayStr, setNewAccClosingDayStr] = useState('');
  const [newAccDueDayStr, setNewAccDueDayStr] = useState('');
  const [newAccLimitStr, setNewAccLimitStr] = useState('');
  const [newAccError, setNewAccError] = useState<string | null>(null);

  // Import Form
  const [importContent, setImportContent] = useState('');
  const [importAccountId, setImportAccountId] = useState('');
  const [importDrafts, setImportDrafts] = useState<ImportTransactionDraft[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<{ duplicates: number; invalid: number } | null>(null);

  // Total balance
  const totalBalanceCents = useMemo(() => {
    return accounts.reduce((sum, a) => (a.isArchived ? sum : sum + a.currentBalanceCents), 0);
  }, [accounts]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (selectedAccountId === 'all') return transactions;
    return transactions.filter((t) => t.accountId === selectedAccountId);
  }, [transactions, selectedAccountId]);

  // Category map
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  // Account map
  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    for (const a of accounts) map.set(a.id, a);
    return map;
  }, [accounts]);

  // Instant Auto-Rules Evaluation on Payee input
  const handlePayeeChange = (val: string) => {
    setTxPayee(val);
    if (!val.trim()) {
      setAutoRuleApplied(null);
      return;
    }

    const cents = parseCurrencyToCents(txAmountStr, { locale: language, currency });
    const applied = applyAutoRules(
      {
        payee: val,
        amountCents: cents,
        accountId: txAccountId || (accounts[0]?.id ?? ''),
        date: txDate,
        type: txType,
        categoryId: txCategoryId || null,
        notes: txNotes,
        status: 'cleared',
      },
      autoRules,
      'first_match_stop'
    );

    if (applied.categoryId && applied.categoryId !== txCategoryId) {
      setTxCategoryId(applied.categoryId);
      setAutoRuleApplied(applied.appliedRuleNames?.[0] || t('accounts.auto_rule_fallback'));
    }
  };

  // Submit New Transaction
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseCurrencyToCents(txAmountStr, { locale: language, currency });
    if (amountCents <= 0) return;

    const accId = txAccountId || accounts[0]?.id;
    if (!accId) return;

    const newTx: Transaction = {
      id: crypto.randomUUID(),
      accountId: accId,
      date: txDate,
      amountCents,
      type: txType,
      categoryId: txCategoryId || null,
      payee: txPayee.trim(),
      notes: txNotes.trim(),
      status: 'cleared',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.transaction('rw', [db.transactions, db.accounts], async () => {
      await db.transactions.add(newTx);
      const acc = await db.accounts.get(accId);
      if (acc) {
        const delta = txType === 'income' ? amountCents : -amountCents;
        await db.accounts.update(accId, {
          currentBalanceCents: acc.currentBalanceCents + delta,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    // Reset form
    setTxPayee('');
    setTxAmountStr('');
    setTxNotes('');
    setAutoRuleApplied(null);
    setIsAddTxOpen(false);
  };

  // Submit New Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName.trim()) return;
    setNewAccError(null);

    let balanceCents: number;
    try {
      balanceCents = parseCurrencyToCents(newAccBalanceStr, { locale: language, currency });
    } catch {
      setNewAccError(t('accounts.err_invalid_value'));
      return;
    }

    const nowIso = new Date().toISOString();
    let acc: Account;

    if (newAccType === 'credit_card') {
      const closingDay = parseDayOfMonth(newAccClosingDayStr);
      const dueDay = parseDayOfMonth(newAccDueDayStr);
      if (closingDay === null || dueDay === null) {
        setNewAccError(t('accounts.err_days'));
        return;
      }
      let creditLimitCents: number | undefined;
      if (newAccLimitStr.trim()) {
        try {
          creditLimitCents = parseCurrencyToCents(newAccLimitStr, {
            locale: language,
            currency,
            allowNegative: false,
          });
        } catch {
          setNewAccError(t('accounts.err_limit_negative'));
          return;
        }
      }
      // Entered amount = current card debt → stored as a negative balance
      acc = {
        id: crypto.randomUUID(),
        name: newAccName.trim(),
        type: newAccType,
        currency,
        initialBalanceCents: 0,
        currentBalanceCents: -Math.abs(balanceCents),
        creditLimitCents,
        closingDay,
        dueDay,
        isArchived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    } else {
      if (balanceCents < 0) {
        setNewAccError(t('accounts.err_balance_negative'));
        return;
      }
      acc = {
        id: crypto.randomUUID(),
        name: newAccName.trim(),
        type: newAccType,
        currency,
        initialBalanceCents: balanceCents,
        currentBalanceCents: balanceCents,
        isArchived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    try {
      await db.accounts.add(acc);
    } catch (err: any) {
      setNewAccError(err?.message || t('accounts.err_create'));
      return;
    }
    setNewAccName('');
    setNewAccBalanceStr('0,00');
    setNewAccClosingDayStr('');
    setNewAccDueDayStr('');
    setNewAccLimitStr('');
    setIsAddAccountOpen(false);
  };

  // Drops drafts already present in the target account (FITID or content hash).
  // Both sides are hashed with the same rules-engine scheme (the parser's own
  // importHash uses a different algorithm), and drafts are keyed by index so
  // identical rows inside one file stay distinct.
  const dedupeAgainstAccount = async (drafts: ImportTransactionDraft[], accId: string) => {
    const existing = await db.transactions.where('accountId').equals(accId).toArray();
    const result = filterDuplicateTransactions(
      drafts.map((d, i) => ({
        id: String(i),
        accountId: accId,
        date: d.date,
        amountCents: d.amountCents,
        type: d.type,
        payee: d.payee,
        notes: d.notes,
        fitid: d.fitid,
      })),
      existing.map((t) => ({ ...t, importHash: undefined }))
    );
    const keep = new Set(result.unique.map((u) => u.id));
    return {
      unique: drafts.filter((_, i) => keep.has(String(i))),
      duplicatesCount: result.duplicatesCount,
    };
  };

  // Parse Bank Statement Preview
  const handleParseImport = async () => {
    if (!importContent.trim()) {
      setImportError(t('accounts.err_import_empty'));
      return;
    }
    const accId = importAccountId || accounts[0]?.id;
    if (!accId) {
      setImportError(t('accounts.err_import_no_account'));
      return;
    }

    try {
      setImportError(null);
      setImportStats(null);
      const res = await parseImportFile(importContent, 'auto', accId);
      const invalid = res.metadata?.invalidRowsCount ?? 0;
      if (!res.success || res.transactions.length === 0) {
        setImportDrafts([]);
        setImportError(res.warnings[0]?.message || t('accounts.err_import_none'));
        return;
      }
      const { unique, duplicatesCount } = await dedupeAgainstAccount(res.transactions, accId);
      setImportStats({ duplicates: duplicatesCount, invalid });
      if (unique.length === 0) {
        setImportDrafts([]);
        setImportError(t('accounts.err_import_all_dupes', { count: duplicatesCount }));
        return;
      }
      setImportDrafts(unique);
    } catch (err: any) {
      setImportError(err.message || t('accounts.err_import_process'));
    }
  };

  // Commit Bank Import
  const handleCommitImport = async () => {
    if (importDrafts.length === 0) return;
    const accId = importAccountId || accounts[0]?.id;
    if (!accId) return;

    try {
      setImportError(null);
      // Re-check against the (possibly changed) target account right before writing
      const { unique: toImport } = await dedupeAgainstAccount(importDrafts, accId);
      await db.transaction('rw', [db.transactions, db.accounts], async () => {
        let netDelta = 0;
        for (const draft of toImport) {
          const tx: Transaction = {
            id: draft.id,
            accountId: accId,
            date: draft.date,
            amountCents: draft.amountCents,
            type: draft.type,
            categoryId: draft.categoryId,
            payee: draft.payee,
            notes: draft.notes,
            status: draft.status,
            importHash: draft.importHash,
            fitid: draft.fitid,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          await db.transactions.add(tx);
          netDelta += tx.type === 'income' ? tx.amountCents : -tx.amountCents;
        }

        const acc = await db.accounts.get(accId);
        if (acc) {
          await db.accounts.update(accId, {
            currentBalanceCents: acc.currentBalanceCents + netDelta,
            updatedAt: new Date().toISOString(),
          });
        }
      });
    } catch (err: any) {
      setImportError(err?.message || t('accounts.err_import_save'));
      return;
    }

    setImportDrafts([]);
    setImportStats(null);
    setImportContent('');
    setIsImportOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-text-primary tracking-tight">
            {t('nav.accounts')}
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            {t('accounts.total_balance')}:{' '}
            <span className="font-mono tabular-nums font-semibold text-text-primary">
              {formatCurrency(totalBalanceCents, currency, language)}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsImportOpen(true)}
            leadingIcon={<Upload className="w-4 h-4" />}
          >
            {t('accounts.import_statement')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAddAccountOpen(true)}
            leadingIcon={<Building2 className="w-4 h-4" />}
          >
            {t('accounts.new_account')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setTxAccountId(selectedAccountId !== 'all' ? selectedAccountId : accounts[0]?.id || '');
              setIsAddTxOpen(true);
            }}
            leadingIcon={<Plus className="w-4 h-4" />}
          >
            {t('accounts.new_transaction')}
          </Button>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* All Accounts Selector card */}
        <div
          onClick={() => setSelectedAccountId('all')}
          className={`p-4 rounded-2xl border cursor-pointer transition-all ${
            selectedAccountId === 'all'
              ? 'bg-brand-subtle border-brand shadow-xs'
              : 'bg-surface-card border-border-subtle hover:border-border-strong'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">{t('accounts.all_accounts')}</span>
            <Wallet className="w-4 h-4 text-brand" />
          </div>
          <div className="text-xl font-semibold font-mono tabular-nums text-text-primary">
            {formatCurrency(totalBalanceCents, currency, language)}
          </div>
          <span className="text-[11px] text-text-secondary mt-1 block">
            {t('accounts.accounts_count', { count: accounts.length })}
          </span>
        </div>

        {accounts.map((acc) => {
          const isSelected = selectedAccountId === acc.id;
          const typeKey: AccountType = ACCOUNT_TYPE_ICONS[acc.type] ? acc.type : 'checking';

          return (
            <div
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                isSelected
                  ? 'bg-brand-subtle border-brand shadow-xs'
                  : 'bg-surface-card border-border-subtle hover:border-border-strong'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-text-primary truncate">
                  {acc.name}
                </span>
                {ACCOUNT_TYPE_ICONS[typeKey]}
              </div>
              <div className="text-xl font-semibold font-mono tabular-nums text-text-primary truncate">
                {formatCurrency(acc.currentBalanceCents, acc.currency || currency, language)}
              </div>
              <span className="text-[11px] text-text-secondary mt-1 block truncate">
                {t(`accounts.type.${typeKey}`)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Transaction Ledger Table */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand" />
            <span>
              {selectedAccountId === 'all'
                ? t('accounts.ledger_all')
                : t('accounts.ledger_for', { name: accountMap.get(selectedAccountId)?.name || '' })}
            </span>
          </div>
        }
        subtitle={t('accounts.entries_count', { count: filteredTransactions.length })}
      >
        {filteredTransactions.length === 0 ? (
          <p className="text-xs text-text-secondary py-8 text-center">
            {t('accounts.no_transactions')}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border-subtle text-text-secondary uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">{t('common.date')}</th>
                  <th className="py-2.5 px-3">{t('common.payee_description')}</th>
                  <th className="py-2.5 px-3">{t('common.account')}</th>
                  <th className="py-2.5 px-3">{t('common.category')}</th>
                  <th className="py-2.5 px-3 text-right">{t('common.value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50">
                {filteredTransactions.map((tx) => {
                  const isIncome = tx.type === 'income';
                  const catName = tx.categoryId
                    ? categoryMap.get(tx.categoryId) || t('common.category_general')
                    : tx.type === 'transfer'
                    ? t('common.tx_type.transfer')
                    : t('common.no_category');
                  const txAccount = accountMap.get(tx.accountId);
                  const accName = txAccount?.name || t('common.account');

                  return (
                    <tr key={tx.id} className="hover:bg-surface-hover/50 transition-colors">
                      <td className="py-2.5 px-3 font-mono tabular-nums text-text-secondary whitespace-nowrap">
                        {formatDateForLocale(tx.date, language)}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-text-primary max-w-xs truncate">
                        {tx.payee || tx.notes || t('common.no_description')}
                        {tx.notes && tx.payee && (
                          <span className="block text-[10px] text-text-secondary font-normal truncate">
                            {tx.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-text-secondary">
                        {accName}
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
                        {formatCurrency(tx.amountCents, txAccount?.currency || currency, language)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modal 1: Add Transaction */}
      <Modal
        isOpen={isAddTxOpen}
        onClose={() => setIsAddTxOpen(false)}
        title={t('accounts.new_transaction')}
        subtitle={t('accounts.tx_modal_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateTransaction} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-muted/50 rounded-xl">
            <button
              type="button"
              onClick={() => setTxType('expense')}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                txType === 'expense'
                  ? 'bg-surface-card text-danger shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('common.tx_type.expense')}
            </button>
            <button
              type="button"
              onClick={() => setTxType('income')}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                txType === 'income'
                  ? 'bg-surface-card text-success shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('common.tx_type.income')}
            </button>
          </div>

          <Input
            label={t('common.payee_description')}
            placeholder={t('accounts.payee_placeholder')}
            value={txPayee}
            onChange={(e) => handlePayeeChange(e.target.value)}
            required
            helperText={
              autoRuleApplied ? t('accounts.auto_categorized', { rule: autoRuleApplied }) : undefined
            }
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('common.amount_with_symbol', { symbol: currencySymbol })}
              placeholder={t('common.amount_placeholder')}
              value={txAmountStr}
              onChange={(e) => setTxAmountStr(e.target.value)}
              required
            />
            <Input
              type="date"
              label={t('accounts.tx_date_label')}
              value={txDate}
              onChange={(e) => setTxDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('accounts.bank_account_label')}</label>
              <select
                value={txAccountId}
                onChange={(e) => setTxAccountId(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({formatCurrency(a.currentBalanceCents, a.currency || currency, language)})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('common.category')}</label>
              <select
                value={txCategoryId}
                onChange={(e) => setTxCategoryId(e.target.value)}
                className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
              >
                <option value="">{t('common.no_category')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label={t('common.notes_optional')}
            placeholder={t('common.notes_placeholder')}
            value={txNotes}
            onChange={(e) => setTxNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsAddTxOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save_transaction')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 2: Add Account */}
      <Modal
        isOpen={isAddAccountOpen}
        onClose={() => setIsAddAccountOpen(false)}
        title={t('accounts.modal_account_title')}
        subtitle={t('accounts.modal_account_subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleCreateAccount} className="space-y-4">
          <Input
            label={t('accounts.account_name_label')}
            placeholder={t('accounts.account_name_placeholder')}
            value={newAccName}
            onChange={(e) => setNewAccName(e.target.value)}
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-primary">{t('accounts.account_type_label')}</label>
            <select
              value={newAccType}
              onChange={(e) => setNewAccType(e.target.value as AccountType)}
              className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-base sm:text-sm text-text-primary outline-none focus:border-brand"
            >
              <option value="checking">{t('accounts.type_option.checking')}</option>
              <option value="savings">{t('accounts.type_option.savings')}</option>
              <option value="credit_card">{t('accounts.type_option.credit_card')}</option>
              <option value="investment">{t('accounts.type_option.investment')}</option>
              <option value="cash">{t('accounts.type_option.cash')}</option>
            </select>
          </div>

          <Input
            label={
              newAccType === 'credit_card'
                ? t('accounts.open_statement_label', { symbol: currencySymbol })
                : t('accounts.initial_balance_label', { symbol: currencySymbol })
            }
            placeholder={t('common.amount_placeholder')}
            value={newAccBalanceStr}
            onChange={(e) => setNewAccBalanceStr(e.target.value)}
          />

          {newAccType === 'credit_card' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                type="number"
                min={1}
                max={31}
                label={t('accounts.closing_day_label')}
                value={newAccClosingDayStr}
                onChange={(e) => setNewAccClosingDayStr(e.target.value)}
                required
              />
              <Input
                type="number"
                min={1}
                max={31}
                label={t('accounts.due_day_label')}
                value={newAccDueDayStr}
                onChange={(e) => setNewAccDueDayStr(e.target.value)}
                required
              />
              <Input
                label={t('accounts.limit_label', { symbol: currencySymbol })}
                placeholder={t('common.amount_placeholder')}
                value={newAccLimitStr}
                onChange={(e) => setNewAccLimitStr(e.target.value)}
              />
            </div>
          )}

          {newAccError && (
            <p className="text-xs text-danger font-medium" role="alert">
              {newAccError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsAddAccountOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('accounts.create_account')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal 3: Bank Statement Import (CSV / OFX) */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setImportDrafts([]);
          setImportError(null);
          setImportStats(null);
        }}
        title={t('accounts.import_title')}
        subtitle={t('accounts.import_subtitle')}
        maxWidth="xl"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-text-primary">{t('accounts.import_dest_label')}</label>
            <select
              value={importAccountId}
              onChange={(e) => setImportAccountId(e.target.value)}
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
            <label className="text-xs font-medium text-text-primary">
              {t('accounts.import_content_label')}
            </label>
            <textarea
              rows={6}
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder={t('accounts.import_placeholder')}
              className="w-full bg-surface-card border border-border-subtle rounded-xl p-3 font-mono text-xs text-text-primary outline-none focus:border-brand"
            />
          </div>

          {importError && (
            <p className="text-xs text-danger font-medium">{importError}</p>
          )}

          {importDrafts.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-medium text-text-primary">
                <span>{t('accounts.import_ready', { count: importDrafts.length })}</span>
                <span className="text-brand font-mono" data-testid="import-stats">
                  {t('accounts.import_stats', {
                    duplicates: importStats?.duplicates ?? 0,
                    invalid: importStats?.invalid ?? 0,
                  })}
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto border border-border-subtle rounded-xl divide-y divide-border-subtle/40">
                {importDrafts.slice(0, 10).map((d, i) => (
                  <div key={i} className="p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-text-primary">{d.payee}</span>
                      <span className="text-[10px] text-text-secondary block font-mono">
                        {formatDateForLocale(d.date, language)} • {t(`common.tx_type.${d.type}`)}
                      </span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums">
                      {formatCurrency(
                        d.amountCents,
                        accountMap.get(importAccountId || accounts[0]?.id || '')?.currency || currency,
                        language
                      )}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setImportDrafts([])}>
                  {t('common.back')}
                </Button>
                <Button variant="primary" onClick={handleCommitImport}>
                  {t('accounts.import_confirm', { count: importDrafts.length })}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <Button variant="ghost" onClick={() => setIsImportOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={handleParseImport}>
                {t('accounts.import_preview')}
              </Button>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
