import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  Wallet,
  Plus,
  CalendarClock,
  Settings,
  CreditCard,
  PiggyBank,
  Users,
  MoreHorizontal,
} from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { ViewId } from './Sidebar';

export interface BottomNavProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  onQuickAdd: () => void;
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeView,
  onNavigate,
  onQuickAdd,
  className = '',
}) => {
  const { t } = useTranslation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // Views reachable only through the "Mais" sheet on phones.
  const moreItems: { id: ViewId; labelKey: string; icon: React.ReactNode }[] = [
    { id: 'credit_cards', labelKey: 'nav.credit_cards', icon: <CreditCard className="w-5 h-5 shrink-0" /> },
    { id: 'piggy_banks', labelKey: 'nav.piggy_banks', icon: <PiggyBank className="w-5 h-5 shrink-0" /> },
    { id: 'split', labelKey: 'nav.split', icon: <Users className="w-5 h-5 shrink-0" /> },
    { id: 'settings', labelKey: 'nav.settings', icon: <Settings className="w-5 h-5 shrink-0" /> },
  ];
  const isMoreActive = moreItems.some((item) => item.id === activeView);
  const moreLabel = t('nav.more');

  // Close the sheet on Escape
  useEffect(() => {
    if (!isMoreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMoreOpen]);

  const handleSelectMore = (view: ViewId) => {
    setIsMoreOpen(false);
    onNavigate(view);
  };

  return (
    <>
    {isMoreOpen && (
      <div className="fixed inset-0 z-50" data-testid="mobile-more-sheet">
        {/* Backdrop */}
        <button
          type="button"
          aria-label={t('nav.close_menu')}
          data-testid="mobile-more-backdrop"
          className="absolute inset-0 w-full h-full bg-black/40 cursor-default"
          onClick={() => setIsMoreOpen(false)}
        />
        {/* Bottom sheet */}
        <div
          role="menu"
          aria-label={moreLabel}
          className="absolute bottom-0 left-0 right-0 bg-surface-card border-t border-border-subtle rounded-t-2xl shadow-lg px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
          {moreItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={() => handleSelectMore(item.id)}
              className={`w-full min-h-[48px] flex items-center gap-3 px-3 rounded-xl text-sm font-medium transition-colors ${
                activeView === item.id
                  ? 'bg-brand-subtle text-brand-text'
                  : 'text-text-primary hover:bg-surface-muted'
              }`}
            >
              {item.icon}
              <span className="truncate">{t(item.labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    )}
    <nav
      className={`fixed bottom-0 left-0 right-0 z-40 bg-surface-card/95 backdrop-blur-md border-t border-border-subtle flex items-center justify-around px-2 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-lg select-none ${className}`}
      data-testid="mobile-bottom-nav"
    >
      {/* 1. Dashboard Tab */}
      <button
        type="button"
        onClick={() => onNavigate('dashboard')}
        className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
          activeView === 'dashboard'
            ? 'text-brand'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        title={t('nav.dashboard')}
      >
        <LayoutDashboard className="w-5 h-5 shrink-0" />
        <span className="truncate">{t('nav.dashboard')}</span>
      </button>

      {/* 2. Accounts Tab */}
      <button
        type="button"
        onClick={() => onNavigate('accounts')}
        className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
          activeView === 'accounts'
            ? 'text-brand'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        title={t('nav.accounts')}
      >
        <Wallet className="w-5 h-5 shrink-0" />
        <span className="truncate">{t('nav.accounts')}</span>
      </button>

      {/* 3. Center Quick Add Button */}
      <div className="flex-1 flex items-center justify-center">
        <button
          type="button"
          onClick={onQuickAdd}
          className="w-12 h-12 -mt-5 rounded-full bg-brand hover:bg-brand-hover text-surface-card flex items-center justify-center shadow-md active:scale-95 transition-all border-2 border-surface-card"
          aria-label={t('common.add_transaction')}
          title={t('common.add_transaction')}
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {/* 4. Subscriptions / Bills Tab */}
      <button
        type="button"
        onClick={() => onNavigate('subscriptions')}
        className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
          activeView === 'subscriptions'
            ? 'text-brand'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        title={t('nav.subscriptions')}
      >
        <CalendarClock className="w-5 h-5 shrink-0" />
        <span className="truncate">{t('nav.subscriptions')}</span>
      </button>

      {/* 5. More Tab: Cartões, Cofrinhos, Divisão, Configurações */}
      <button
        type="button"
        onClick={() => setIsMoreOpen((prev) => !prev)}
        className={`flex-1 min-h-[48px] flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
          isMoreActive || isMoreOpen
            ? 'text-brand'
            : 'text-text-secondary hover:text-text-primary'
        }`}
        title={moreLabel}
        aria-haspopup="menu"
        aria-expanded={isMoreOpen}
        data-testid="mobile-more-tab"
      >
        <MoreHorizontal className="w-5 h-5 shrink-0" />
        <span className="truncate">{moreLabel}</span>
      </button>
    </nav>
    </>
  );
};
