import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  LayoutDashboard,
  Wallet,
  CreditCard,
  CalendarClock,
  PiggyBank as PiggyBankIcon,
  Users,
  Settings as SettingsIcon,
  Plus,
  Languages,
  Sun,
  Sparkles,
  RotateCcw,
  Bot,
  Coins,
  ArrowRight,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { ViewId } from '../layout/Sidebar';
import { db } from '../../db';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrency } from '../../core/currency';
import type { SupportedCurrency } from '../../types';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: ViewId) => void;
  onQuickAddTransaction?: () => void;
  onNewPiggyBank?: () => void;
  onToggleTheme?: () => void;
  onToggleLanguage?: () => void;
  onToggleRoamingPet?: () => void;
  onLoadDemoData?: () => void;
  onResetCleanSlate?: () => void;
  currency?: SupportedCurrency;
}

interface CommandItem {
  id: string;
  category: 'views' | 'actions' | 'accounts' | 'piggy_banks';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  keywords?: string[];
  action: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onQuickAddTransaction,
  onNewPiggyBank,
  onToggleTheme,
  onToggleLanguage,
  onToggleRoamingPet,
  onLoadDemoData,
  onResetCleanSlate,
  currency = 'BRL',
}) => {
  const { t, language } = useTranslation();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Queries for dynamic records
  const accounts = useLiveQuery(() => db.accounts.toArray(), [], []);
  const piggyBanks = useLiveQuery(() => db.piggy_banks.toArray(), [], []);

  // Global Keyboard listener for Cmd+K / Ctrl+K
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Construct all available items
  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      // Quick Actions
      {
        id: 'action-new-tx',
        category: 'actions',
        title: t('common.add_transaction'),
        subtitle: t('command.new_tx_desc'),
        icon: <Plus className="w-4 h-4 text-brand" />,
        keywords: ['nova', 'transacao', 'gasto', 'receita', 'expense', 'income', 'add'],
        action: () => {
          onClose();
          onQuickAddTransaction?.();
        },
      },
      {
        id: 'action-new-piggy',
        category: 'actions',
        title: t('piggy_banks.new_piggy'),
        subtitle: t('command.new_piggy_desc'),
        icon: <PiggyBankIcon className="w-4 h-4 text-coin" />,
        keywords: ['cofrinho', 'meta', 'poupanca', 'piggy', 'goal', 'savings'],
        action: () => {
          onClose();
          onNewPiggyBank?.();
        },
      },

      // Navigation Items
      {
        id: 'nav-dashboard',
        category: 'views',
        title: t('command.go_dashboard'),
        subtitle: t('command.go_dashboard_desc'),
        icon: <LayoutDashboard className="w-4 h-4" />,
        keywords: ['dashboard', 'painel', 'inicio', 'home', 'keroo'],
        action: () => {
          onClose();
          onNavigate('dashboard');
        },
      },
      {
        id: 'nav-accounts',
        category: 'views',
        title: t('command.go_accounts'),
        subtitle: t('command.go_accounts_desc'),
        icon: <Wallet className="w-4 h-4" />,
        keywords: ['contas', 'accounts', 'bancos', 'saldo', 'balance'],
        action: () => {
          onClose();
          onNavigate('accounts');
        },
      },
      {
        id: 'nav-credit-cards',
        category: 'views',
        title: t('command.go_credit_cards'),
        subtitle: t('command.go_credit_cards_desc'),
        icon: <CreditCard className="w-4 h-4" />,
        keywords: ['cartoes', 'parcelas', 'credit', 'cards', 'installments', 'limite'],
        action: () => {
          onClose();
          onNavigate('credit_cards');
        },
      },
      {
        id: 'nav-subscriptions',
        category: 'views',
        title: t('command.go_subscriptions'),
        subtitle: t('command.go_subscriptions_desc'),
        icon: <CalendarClock className="w-4 h-4" />,
        keywords: ['assinaturas', 'boletos', 'recorrencia', 'bills', 'subscriptions'],
        action: () => {
          onClose();
          onNavigate('subscriptions');
        },
      },
      {
        id: 'nav-piggy-banks',
        category: 'views',
        title: t('command.go_piggy_banks'),
        subtitle: t('command.go_piggy_banks_desc'),
        icon: <PiggyBankIcon className="w-4 h-4" />,
        keywords: ['cofrinhos', 'metas', 'piggy', 'banks', 'saving'],
        action: () => {
          onClose();
          onNavigate('piggy_banks');
        },
      },
      {
        id: 'nav-split',
        category: 'views',
        title: t('command.go_split'),
        subtitle: t('command.go_split_desc'),
        icon: <Users className="w-4 h-4" />,
        keywords: ['divisao', 'amigos', 'iou', 'split', 'contas', 'settle'],
        action: () => {
          onClose();
          onNavigate('split');
        },
      },
      {
        id: 'nav-settings',
        category: 'views',
        title: t('command.go_settings'),
        subtitle: t('command.go_settings_desc'),
        icon: <SettingsIcon className="w-4 h-4" />,
        keywords: ['configuracoes', 'settings', 'ajustes', 'preferencias'],
        action: () => {
          onClose();
          onNavigate('settings');
        },
      },

      // System Actions
      {
        id: 'action-switch-lang',
        category: 'actions',
        title: t('command.switch_language'),
        subtitle: t('command.switch_language_desc'),
        icon: <Languages className="w-4 h-4 text-info" />,
        keywords: ['idioma', 'language', 'locale', 'traducao', 'english', 'portugues'],
        action: () => {
          onClose();
          onToggleLanguage?.();
        },
      },
      {
        id: 'action-toggle-theme',
        category: 'actions',
        title: t('command.toggle_theme'),
        subtitle: t('command.toggle_theme_desc'),
        icon: <Sun className="w-4 h-4 text-warning" />,
        keywords: ['tema', 'theme', 'dark', 'light', 'escuro', 'claro'],
        action: () => {
          onClose();
          onToggleTheme?.();
        },
      },
      {
        id: 'action-toggle-pet',
        category: 'actions',
        title: t('command.toggle_pet'),
        subtitle: t('command.toggle_pet_desc'),
        icon: <Bot className="w-4 h-4 text-brand" />,
        keywords: ['mascote', 'pet', 'keroo', 'sapinho', 'frog', 'roaming'],
        action: () => {
          onClose();
          onToggleRoamingPet?.();
        },
      },
      {
        id: 'action-load-demo',
        category: 'actions',
        title: t('command.load_demo'),
        subtitle: t('command.load_demo_desc'),
        icon: <Sparkles className="w-4 h-4 text-coin" />,
        keywords: ['demo', 'exemplo', 'teste', 'sample', 'populate'],
        action: () => {
          onClose();
          onLoadDemoData?.();
        },
      },
      {
        id: 'action-reset-clean',
        category: 'actions',
        title: t('command.reset_clean'),
        subtitle: t('command.reset_clean_desc'),
        icon: <RotateCcw className="w-4 h-4 text-danger" />,
        keywords: ['reset', 'limpar', 'zerar', 'clean', 'slate', 'apagar'],
        action: () => {
          onClose();
          onResetCleanSlate?.();
        },
      },
    ];

    // Append dynamic accounts
    if (accounts) {
      for (const acc of accounts) {
        items.push({
          id: `acc-${acc.id}`,
          category: 'accounts',
          title: acc.name,
          subtitle: `${formatCurrency(acc.currentBalanceCents, acc.currency || currency, language)} • ${t(`accounts.type.${acc.type}`)}`,
          icon: <Wallet className="w-4 h-4 text-text-secondary" />,
          keywords: [acc.name, acc.type, 'conta', 'account'],
          action: () => {
            onClose();
            onNavigate('accounts');
          },
        });
      }
    }

    // Append dynamic piggy banks
    if (piggyBanks) {
      for (const pb of piggyBanks) {
        items.push({
          id: `pb-${pb.id}`,
          category: 'piggy_banks',
          title: pb.name,
          subtitle: `${formatCurrency(pb.savedCents, currency, language)} / ${formatCurrency(
            pb.targetCents,
            currency,
            language
          )}`,
          icon: <Coins className="w-4 h-4 text-coin" />,
          keywords: [pb.name, 'cofrinho', 'meta', 'goal', 'piggy'],
          action: () => {
            onClose();
            onNavigate('piggy_banks');
          },
        });
      }
    }

    // Never show a destructive action whose handler is not wired (it would be a silent no-op).
    return items.filter(
      (item) =>
        !(item.id === 'action-load-demo' && !onLoadDemoData) &&
        !(item.id === 'action-reset-clean' && !onResetCleanSlate)
    );
  }, [
    accounts,
    piggyBanks,
    currency,
    language,
    t,
    onClose,
    onNavigate,
    onQuickAddTransaction,
    onNewPiggyBank,
    onToggleTheme,
    onToggleLanguage,
    onToggleRoamingPet,
    onLoadDemoData,
    onResetCleanSlate,
  ]);

  // Filter items according to search query
  const filteredItems = useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase().trim();

    return allItems.filter((item) => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.subtitle && item.subtitle.toLowerCase().includes(q)) return true;
      if (item.keywords && item.keywords.some((k) => k.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [allItems, query]);

  // Keyboard navigation inside list
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView?.({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/40 backdrop-blur-md transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      data-testid="command-palette-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('command.dialog_label')}
        className="w-full max-w-xl bg-surface-card border border-border-subtle rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-border-subtle bg-surface-card">
          <Search className="w-5 h-5 text-text-muted shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('command.placeholder')}
            className="w-full py-4 text-base sm:text-sm bg-transparent text-text-primary placeholder:text-text-muted outline-none"
          />
          <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono text-text-muted border border-border-subtle rounded bg-surface-muted">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border-subtle/40">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-text-muted">
              {t('command.no_results')}
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  data-selected={isSelected}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-sm transition-colors ${
                    isSelected
                      ? 'bg-brand-subtle text-brand-text font-medium border border-brand-border/40'
                      : 'hover:bg-surface-hover text-text-primary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0">{item.icon}</span>
                    <div className="truncate">
                      <span className="block truncate">{item.title}</span>
                      {item.subtitle && (
                        <span className="block text-xs text-text-secondary truncate mt-0.5">
                          {item.subtitle}
                        </span>
                      )}
                    </div>
                  </div>

                  <ArrowRight
                    className={`w-4 h-4 shrink-0 transition-opacity ${
                      isSelected ? 'opacity-100 text-brand' : 'opacity-0'
                    }`}
                  />
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 bg-surface-muted/30 border-t border-border-subtle text-[11px] text-text-secondary flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono bg-surface-card px-1 py-0.5 rounded border border-border-subtle mr-1">
                ↑
              </kbd>
              <kbd className="font-mono bg-surface-card px-1 py-0.5 rounded border border-border-subtle mr-1">
                ↓
              </kbd>
              {t('command.navigate')}
            </span>
            <span>
              <kbd className="font-mono bg-surface-card px-1 py-0.5 rounded border border-border-subtle mr-1">
                ↵
              </kbd>
              {t('command.select')}
            </span>
          </div>
          <span className="tabular-nums font-mono">
            {filteredItems.length} {t('command.items')}
          </span>
        </div>
      </div>
    </div>
  );
};
