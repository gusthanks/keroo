import React from 'react';
import {
  LayoutDashboard,
  Wallet,
  CreditCard,
  CalendarClock,
  PiggyBank,
  Users,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Languages,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { SupportedLocale, SupportedTheme } from '../../types';

export type ViewId =
  | 'dashboard'
  | 'accounts'
  | 'credit_cards'
  | 'subscriptions'
  | 'piggy_banks'
  | 'split'
  | 'settings';

export interface SidebarProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onQuickAdd?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  petNickname?: string;
  theme?: SupportedTheme;
  onToggleTheme?: () => void;
  className?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onNavigate,
  onQuickAdd,
  isCollapsed = false,
  onToggleCollapse,
  petNickname = 'Keroo',
  theme = 'light',
  onToggleTheme,
  className = '',
}) => {
  const { t, language, setLanguage } = useTranslation();

  const navItems: { id: ViewId; labelKey: string; icon: React.ReactNode }[] = [
    {
      id: 'dashboard',
      labelKey: 'nav.dashboard',
      icon: <LayoutDashboard className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'accounts',
      labelKey: 'nav.accounts',
      icon: <Wallet className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'credit_cards',
      labelKey: 'nav.credit_cards',
      icon: <CreditCard className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'subscriptions',
      labelKey: 'nav.subscriptions',
      icon: <CalendarClock className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'piggy_banks',
      labelKey: 'nav.piggy_banks',
      icon: <PiggyBank className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'split',
      labelKey: 'nav.split',
      icon: <Users className="w-5 h-5 shrink-0" />,
    },
    {
      id: 'settings',
      labelKey: 'nav.settings',
      icon: <Settings className="w-5 h-5 shrink-0" />,
    },
  ];

  const toggleLanguage = () => {
    const nextLang: SupportedLocale = language === 'pt-BR' ? 'en-US' : 'pt-BR';
    setLanguage(nextLang);
  };

  return (
    <aside
      className={`h-screen sticky top-0 bg-surface-card border-r border-border-subtle flex flex-col justify-between transition-all duration-300 z-30 select-none ${
        isCollapsed ? 'w-[72px]' : 'w-[260px]'
      } ${className}`}
      data-testid="desktop-sidebar"
    >
      {/* Top Brand Header */}
      <div className="p-4 border-b border-border-subtle flex items-center justify-between">
        <div
          className={`flex items-center gap-2.5 overflow-hidden cursor-pointer ${
            isCollapsed ? 'justify-center w-full' : ''
          }`}
          onClick={() => onNavigate('dashboard')}
          title="Keroo"
        >
          <span className="text-2xl shrink-0" role="img" aria-label={t('sidebar.mascot_aria')}>
            🐸
          </span>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <h1 className="text-base font-semibold text-text-primary tracking-tight truncate leading-none">
                Keroo
              </h1>
              <p className="text-[11px] text-text-secondary truncate mt-0.5 font-medium">
                {t('sidebar.brand_subtitle', { name: petNickname })}
              </p>
            </div>
          )}
        </div>

        {onToggleCollapse && !isCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={t('sidebar.collapse')}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Quick Add Button */}
      {onQuickAdd && (
        <div className="p-3 border-b border-border-subtle">
          <button
            type="button"
            onClick={onQuickAdd}
            className={`w-full bg-brand hover:bg-brand-hover text-surface-card rounded-xl py-2 px-3 flex items-center justify-center gap-2 font-medium text-sm transition-all shadow-sm active:scale-[0.98] ${
              isCollapsed ? 'px-0' : ''
            }`}
            title={t('common.add_transaction')}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {!isCollapsed && (
              <span className="truncate">
                {t('common.add_transaction')}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Main Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-left ${
                isCollapsed ? 'justify-center px-0' : ''
              } ${
                isActive
                  ? 'bg-brand-subtle text-brand-text font-medium border border-brand-border/40 shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
              title={t(item.labelKey)}
            >
              <span className={isActive ? 'text-brand' : 'text-text-muted'}>
                {item.icon}
              </span>
              {!isCollapsed && <span className="truncate">{t(item.labelKey)}</span>}
            </button>
          );
        })}
      </nav>

      {/* Footer Controls */}
      <div className="p-3 border-t border-border-subtle flex flex-col gap-2">
        <div
          className={`flex items-center gap-2 ${
            isCollapsed ? 'flex-col justify-center' : 'justify-between'
          }`}
        >
          {/* Language Switch */}
          <button
            type="button"
            onClick={toggleLanguage}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors flex items-center gap-1.5 text-xs font-medium"
            title={t('sidebar.switch_language', { lang: language })}
          >
            <Languages className="w-4 h-4 shrink-0" />
            {!isCollapsed && (
              <span className="uppercase font-mono">{language === 'pt-BR' ? 'PT' : 'EN'}</span>
            )}
          </button>

          {/* Theme Toggle */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors flex items-center gap-1.5 text-xs font-medium"
              title={t('common.toggle_theme')}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4 text-warning shrink-0" />
              ) : (
                <Moon className="w-4 h-4 shrink-0" />
              )}
              {!isCollapsed && (
                <span>{theme === 'dark' ? t('common.theme_light') : t('common.theme_dark')}</span>
              )}
            </button>
          )}

          {/* Expand toggle when collapsed */}
          {onToggleCollapse && isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={t('sidebar.expand')}
              className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
