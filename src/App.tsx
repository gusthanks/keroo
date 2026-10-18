import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { I18nProvider, useTranslation } from './i18n';
import type {
  KerooMood,
  SupportedCurrency,
  SupportedTheme,
  Transaction,
  TransactionType,
} from './types';
import { evaluateKerooMood, type KerooMetrics } from './core/kerooMood';
import { parseCurrencyToCents, defaultCurrencyFor } from './core/currency';
import { applyAutoRules } from './core/autoRules';
import { getLocalTodayISO, getLocalYearMonth } from './core/dates';
import { AppLayout, type ViewId } from './components/layout';
import { CommandPalette } from './components/command';
import { Modal } from './components/common/Modal';
import { Input } from './components/common/Input';
import { Button } from './components/common/Button';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import {
  DashboardView,
  AccountsView,
  CreditCardsView,
  SubscriptionsView,
  PiggyBanksView,
  SplitView,
  SettingsView,
} from './views';

const MainAppContent: React.FC = () => {
  const { t, language, setLanguage } = useTranslation();
  const today = getLocalTodayISO();
  const currentYearMonth = getLocalYearMonth();

  // Active view state
  const [activeView, setActiveView] = useState<ViewId>('dashboard');

  // Deep-link actions coming from the command palette
  const [settingsInitialAction, setSettingsInitialAction] = useState<'demo' | 'reset' | null>(null);
  const [piggyOpenCreate, setPiggyOpenCreate] = useState(false);

  // Command palette state
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Global Quick Add Transaction Modal state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickPayee, setQuickPayee] = useState('');
  const [quickAmountStr, setQuickAmountStr] = useState('');
  const [quickDate, setQuickDate] = useState(today);
  const [quickType, setQuickType] = useState<TransactionType>('expense');
  const [quickAccountId, setQuickAccountId] = useState('');
  const [quickCategoryId, setQuickCategoryId] = useState('');
  const [quickNotes, setQuickNotes] = useState('');

  // Live queries
  // NOTE: `useLiveQuery` yields `undefined` both while loading AND when the row
  // does not exist. On a clean slate there is no 'global' row yet, so we map a
  // missing row to `null` to tell "fresh database" apart from "still loading".
  // Without this the first launch stays on the loading screen forever.
  const settings = useLiveQuery(
    async () => (await db.user_settings.get('global')) ?? null,
    []
  );
  const mascot = useLiveQuery(() => db.keroo_state.get('current'));
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const categories = useLiveQuery(() => db.categories.toArray(), [], []);
  const autoRules = useLiveQuery(() => db.auto_rules.toArray(), [], []);
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

  // Theme synchronization with .dark class on <html>
  const [theme, setTheme] = useState<SupportedTheme>(() => {
    return (localStorage.getItem('keroo_theme') as SupportedTheme) || 'light';
  });

  useEffect(() => {
    if (settings?.theme) {
      setTheme(settings.theme);
    }
  }, [settings?.theme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else {
      const prefersDark =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : false;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
    localStorage.setItem('keroo_theme', theme);
  }, [theme]);

  // Header/Sidebar call this straight from onClick, so the first argument may be a
  // PointerEvent. Only accept a real theme string; anything else toggles light/dark.
  const handleToggleTheme = async (nextTheme?: unknown) => {
    const target: SupportedTheme =
      nextTheme === 'light' || nextTheme === 'dark' || nextTheme === 'system'
        ? nextTheme
        : theme === 'dark'
          ? 'light'
          : 'dark';
    setTheme(target);
    if (settings) {
      await db.user_settings.update('global', {
        theme: target,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleCurrencyChange = async (newCurr: SupportedCurrency) => {
    if (settings) {
      await db.user_settings.update('global', {
        currency: newCurr,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // Keyboard shortcut for Cmd+K (macOS) / Ctrl+K (Windows/Linux)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Synchronous Keroo Mood Evaluation
  const evaluatedMood: KerooMood = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let committedNext30 = 0;

    for (const b of recurringBills) {
      if (!b.isActive) continue;
      if (b.nextDueDate < today) {
        overdue += 1;
        committedNext30 += b.amountCents;
      } else if (b.nextDueDate === today) {
        dueSoon += 1;
        committedNext30 += b.amountCents;
      } else {
        const diffDays = Math.ceil(
          (new Date(b.nextDueDate).getTime() - new Date(today).getTime()) /
            (1000 * 3600 * 24)
        );
        if (diffDays <= 3) dueSoon += 1;
        if (diffDays <= 30) committedNext30 += b.amountCents;
      }
    }

    let income = 0;
    let expenses = 0;
    for (const tx of allMonthTransactions) {
      if (tx.type === 'income') income += tx.amountCents;
      else if (tx.type === 'expense' || tx.type === 'cc_installment')
        expenses += tx.amountCents;
    }

    let budget = 0;
    let overspent = 0;
    for (const env of envelopes) {
      budget += env.assignedCents;
      if (env.availableCents < 0) overspent += 1;
    }

    let liquid = 0;
    let checking = 0;
    for (const acc of accounts) {
      if (acc.isArchived) continue;
      if (acc.type === 'checking' || acc.type === 'cash')
        liquid += acc.currentBalanceCents;
      if (acc.type === 'checking') checking += acc.currentBalanceCents;
    }

    const metrics: KerooMetrics = {
      lastInteractionDays: 0,
      overdueBillsCount: overdue,
      dueSoonBillsCount: dueSoon,
      upcomingBills3DaysCount: dueSoon,
      overspentEnvelopesCount: overspent,
      monthExpensesCents: expenses,
      monthBudgetCents: budget,
      monthIncomeCents: income,
      liquidCashCents: liquid,
      checkingBalanceCents: checking,
      committedBillsNext30DaysCents: committedNext30,
    };

    return evaluateKerooMood(metrics).mood;
  }, [recurringBills, today, allMonthTransactions, envelopes, accounts]);

  // Handle Quick Add Payee change with auto-rules
  const handleQuickPayeeChange = (val: string) => {
    setQuickPayee(val);
    if (!val.trim()) return;

    const cents = parseCurrencyToCents(quickAmountStr, {
      locale: language,
      currency: settings?.currency || defaultCurrencyFor(language),
    });
    const applied = applyAutoRules(
      {
        payee: val,
        amountCents: cents,
        accountId: quickAccountId || (accounts[0]?.id ?? ''),
        date: quickDate,
        type: quickType,
        categoryId: quickCategoryId || null,
        notes: quickNotes,
        status: 'cleared',
      },
      autoRules,
      'first_match_stop'
    );

    if (applied.categoryId && applied.categoryId !== quickCategoryId) {
      setQuickCategoryId(applied.categoryId);
    }
  };

  // Submit Quick Add Transaction
  const handleSaveQuickTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const curr = settings?.currency || defaultCurrencyFor(language);
    const amountCents = parseCurrencyToCents(quickAmountStr, {
      locale: language,
      currency: curr,
    });
    if (amountCents <= 0) return;

    const accId = quickAccountId || accounts[0]?.id;
    if (!accId) return;

    const newTx: Transaction = {
      id: crypto.randomUUID(),
      accountId: accId,
      date: quickDate,
      amountCents,
      type: quickType,
      categoryId: quickCategoryId || null,
      payee: quickPayee.trim(),
      notes: quickNotes.trim(),
      status: 'cleared',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.transaction('rw', [db.transactions, db.accounts], async () => {
      await db.transactions.add(newTx);
      const acc = await db.accounts.get(accId);
      if (acc) {
        const delta = quickType === 'income' ? amountCents : -amountCents;
        await db.accounts.update(accId, {
          currentBalanceCents: acc.currentBalanceCents + delta,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    setQuickPayee('');
    setQuickAmountStr('');
    setQuickNotes('');
    setIsQuickAddOpen(false);
  };

  // Initial loading state while Dexie initializes
  if (settings === undefined) {
    return (
      <div className="min-h-screen bg-surface-canvas flex items-center justify-center p-6 text-text-secondary">
        <p className="animate-pulse">{t('common.loading')}</p>
      </div>
    );
  }

  // Onboarding wizard if database is fresh / not completed
  if (!settings || !settings.onboardingCompleted) {
    return <OnboardingWizard onComplete={() => window.location.reload()} />;
  }

  const curr = settings.currency || defaultCurrencyFor(language);
  const petNick = mascot?.nickname || settings.petNickname || 'Keroo';
  const roamingEnabled = settings.roamingPetEnabled ?? true;

  // View titles & subtitles
  const VIEW_TITLES: Record<ViewId, { title: string; subtitle?: string }> = {
    dashboard: {
      title: t('nav.dashboard'),
      subtitle: t('app.tagline'),
    },
    accounts: {
      title: t('nav.accounts'),
      subtitle: t('app.subtitles.accounts'),
    },
    credit_cards: {
      title: t('nav.credit_cards'),
      subtitle: t('app.subtitles.credit_cards'),
    },
    subscriptions: {
      title: t('nav.subscriptions'),
      subtitle: t('app.subtitles.subscriptions'),
    },
    piggy_banks: {
      title: t('nav.piggy_banks'),
      subtitle: t('app.subtitles.piggy_banks'),
    },
    split: {
      title: t('nav.split'),
      subtitle: t('app.subtitles.split'),
    },
    settings: {
      title: t('nav.settings'),
      subtitle: t('app.subtitles.settings'),
    },
  };

  const currentViewCfg = VIEW_TITLES[activeView] || VIEW_TITLES.dashboard;

  return (
    <>
      <AppLayout
        activeView={activeView}
        onNavigate={(v) => setActiveView(v)}
        title={currentViewCfg.title}
        subtitle={currentViewCfg.subtitle}
        mood={evaluatedMood}
        currency={curr}
        petNickname={petNick}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onQuickAdd={() => {
          setQuickAccountId(accounts[0]?.id || '');
          setIsQuickAddOpen(true);
        }}
        roamingPetEnabled={roamingEnabled}
      >
        {activeView === 'dashboard' && (
          <DashboardView
            onNavigate={(v) => setActiveView(v)}
            onQuickAdd={() => {
              setQuickAccountId(accounts[0]?.id || '');
              setIsQuickAddOpen(true);
            }}
            currency={curr}
          />
        )}
        {activeView === 'accounts' && <AccountsView currency={curr} />}
        {activeView === 'credit_cards' && <CreditCardsView currency={curr} />}
        {activeView === 'subscriptions' && <SubscriptionsView currency={curr} />}
        {activeView === 'piggy_banks' && (
          <PiggyBanksView
            currency={curr}
            initialOpenCreate={piggyOpenCreate}
            onInitialOpenCreateHandled={() => setPiggyOpenCreate(false)}
          />
        )}
        {activeView === 'split' && <SplitView currency={curr} />}
        {activeView === 'settings' && (
          <SettingsView
            theme={theme}
            onToggleTheme={handleToggleTheme}
            currency={curr}
            onCurrencyChange={handleCurrencyChange}
            initialAction={settingsInitialAction}
            onInitialActionHandled={() => setSettingsInitialAction(null)}
          />
        )}
      </AppLayout>

      {/* Global Command Palette (Cmd+K / Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={(v) => setActiveView(v)}
        onQuickAddTransaction={() => {
          setQuickAccountId(accounts[0]?.id || '');
          setIsQuickAddOpen(true);
        }}
        onNewPiggyBank={() => {
          setPiggyOpenCreate(true);
          setActiveView('piggy_banks');
        }}
        onLoadDemoData={() => {
          setSettingsInitialAction('demo');
          setActiveView('settings');
        }}
        onResetCleanSlate={() => {
          setSettingsInitialAction('reset');
          setActiveView('settings');
        }}
        onToggleTheme={handleToggleTheme}
        onToggleLanguage={() =>
          setLanguage(language === 'pt-BR' ? 'en-US' : 'pt-BR')
        }
        onToggleRoamingPet={async () => {
          if (settings) {
            await db.user_settings.update('global', {
              roamingPetEnabled: !roamingEnabled,
              updatedAt: new Date().toISOString(),
            });
          }
        }}
        currency={curr}
      />

      {/* Global Quick Add Transaction Modal */}
      <Modal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        title={t('quick_add.title')}
        subtitle={t('quick_add.subtitle')}
        maxWidth="md"
      >
        <form onSubmit={handleSaveQuickTransaction} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-muted/50 rounded-xl">
            <button
              type="button"
              onClick={() => setQuickType('expense')}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                quickType === 'expense'
                  ? 'bg-surface-card text-danger shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('common.tx_type.expense')}
            </button>
            <button
              type="button"
              onClick={() => setQuickType('income')}
              className={`py-1.5 text-xs font-medium rounded-lg transition-colors ${
                quickType === 'income'
                  ? 'bg-surface-card text-success shadow-xs'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {t('common.tx_type.income')}
            </button>
          </div>

          <Input
            label={t('common.payee_description')}
            placeholder={t('quick_add.payee_placeholder')}
            value={quickPayee}
            onChange={(e) => handleQuickPayeeChange(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label={t('quick_add.amount_label')}
              placeholder={t('common.amount_placeholder')}
              value={quickAmountStr}
              onChange={(e) => setQuickAmountStr(e.target.value)}
              required
            />
            <Input
              type="date"
              label={t('common.date')}
              value={quickDate}
              onChange={(e) => setQuickDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-text-primary">{t('common.account')}</label>
              <select
                value={quickAccountId}
                onChange={(e) => setQuickAccountId(e.target.value)}
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
                value={quickCategoryId}
                onChange={(e) => setQuickCategoryId(e.target.value)}
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
            value={quickNotes}
            onChange={(e) => setQuickNotes(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsQuickAddOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save_transaction')}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export const App: React.FC = () => {
  return (
    <I18nProvider>
      <MainAppContent />
    </I18nProvider>
  );
};

export default App;
