import React from 'react';
import { Search, Sun, Moon, Coins, Lock } from 'lucide-react';
import { useTranslation } from '../../i18n';
import type { KerooMood, SupportedCurrency, SupportedTheme } from '../../types';
import { Badge } from '../common/Badge';
import { KerooMascot } from '../keroo/KerooMascot';

export interface HeaderProps {
  title: string;
  subtitle?: string;
  mood?: KerooMood;
  currency?: SupportedCurrency;
  petNickname?: string;
  theme?: SupportedTheme;
  onToggleTheme?: () => void;
  onOpenCommandPalette?: () => void;
  /** Locks the app right away; the button only shows when the app lock is on. */
  onLock?: () => void;
  className?: string;
}

const MOOD_BADGE_CONFIG: Record<
  KerooMood,
  { labelKey: string; variant: 'success' | 'info' | 'warning' | 'danger' | 'neutral' }
> = {
  thriving: { labelKey: 'pet.mood_thriving', variant: 'success' },
  calm: { labelKey: 'pet.mood_calm', variant: 'info' },
  alert: { labelKey: 'pet.mood_alert', variant: 'warning' },
  sweating: { labelKey: 'pet.mood_sweating', variant: 'danger' },
  sleepy: { labelKey: 'pet.mood_sleepy', variant: 'neutral' },
};

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  mood = 'calm',
  currency = 'BRL',
  petNickname = 'Keroo',
  theme = 'light',
  onToggleTheme,
  onOpenCommandPalette,
  onLock,
  className = '',
}) => {
  const { t } = useTranslation();
  const moodCfg = MOOD_BADGE_CONFIG[mood] || MOOD_BADGE_CONFIG.calm;

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');

  return (
    <header
      className={`h-16 border-b border-border-subtle bg-surface-card/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 ${className}`}
      data-testid="app-header"
    >
      {/* Left: View Title & Subtitle */}
      <div className="flex flex-col min-w-0">
        <h2 className="text-base sm:text-lg font-semibold text-text-primary tracking-tight truncate leading-tight">
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs text-text-secondary truncate hidden sm:block">
            {subtitle}
          </p>
        )}
      </div>

      {/* Right Controls: Command Palette Search, Keroo Mood Mini Status, Theme */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Command Palette Button */}
        {onOpenCommandPalette && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-border-subtle hover:border-border-strong bg-surface-muted/40 hover:bg-surface-hover text-text-secondary hover:text-text-primary text-xs transition-colors shadow-xs"
            title={t('header.command_palette_title')}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline font-normal text-text-muted">
              {t('common.search_placeholder')}
            </span>
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-card border border-border-subtle text-text-muted">
              {isMac ? '⌘K' : 'Ctrl+K'}
            </kbd>
          </button>
        )}

        {/* Keroo Mini Status Widget */}
        <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-xl bg-surface-muted/30 border border-border-subtle">
          <KerooMascot size={24} animated={false} pose={mood === 'sleepy' ? 'sleeping_bubble' : 'default_sitting'} ariaLabel={t('header.mascot_mini')} />
          <span className="text-xs font-medium text-text-secondary truncate max-w-[80px]">
            {petNickname}
          </span>
          <Badge variant={moodCfg.variant} size="sm" pill dot>
            {t(moodCfg.labelKey)}
          </Badge>
        </div>

        {/* Currency pill indicator */}
        <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono font-medium text-text-secondary bg-surface-muted/50 border border-border-subtle tabular-nums">
          <Coins className="w-3 h-3 text-coin" />
          {currency}
        </span>

        {/* Lock Button (only when a password is set) */}
        {onLock && (
          <button
            type="button"
            onClick={onLock}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title={t('lock.button_title')}
            aria-label={t('lock.button_title')}
            data-testid="header-lock-button"
          >
            <Lock className="w-4 h-4" />
          </button>
        )}

        {/* Theme Toggle Button */}
        {onToggleTheme && (
          <button
            type="button"
            onClick={onToggleTheme}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            title={t('header.toggle_theme_title')}
            aria-label={t('common.toggle_theme')}
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-warning" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
    </header>
  );
};
