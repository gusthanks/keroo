import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type { SupportedCurrency, SupportedTheme } from '../types';
import { seedCleanSlate, seedDemoData } from '../db/seed';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import {
  Settings as SettingsIcon,
  Globe,
  Coins,
  Sun,
  Moon,
  Monitor,
  Bot,
  Sparkles,
  RotateCcw,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export interface SettingsViewProps {
  theme?: SupportedTheme;
  onToggleTheme?: (theme: SupportedTheme) => void;
  currency?: SupportedCurrency;
  onCurrencyChange?: (curr: SupportedCurrency) => void;
  /** Opens one of the destructive confirmation modals on mount (used by the command palette). */
  initialAction?: 'demo' | 'reset' | null;
  /** Called once the initialAction has been consumed so the parent can clear it. */
  onInitialActionHandled?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme = 'light',
  onToggleTheme,
  currency = 'BRL',
  onCurrencyChange,
  initialAction = null,
  onInitialActionHandled,
}) => {
  const { t, language, setLanguage } = useTranslation();

  // Settings from DB
  const settings = useLiveQuery(() => db.user_settings.get('global'));
  const mascot = useLiveQuery(() => db.keroo_state.get('current'));

  // Form states
  const [nicknameInput, setNicknameInput] = useState('');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isDemoConfirmOpen, setIsDemoConfirmOpen] = useState(false);
  const [isOperating, setIsOperating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Command palette deep-link: open the matching confirmation modal.
  useEffect(() => {
    if (!initialAction) return;
    if (initialAction === 'demo') setIsDemoConfirmOpen(true);
    else if (initialAction === 'reset') setIsResetConfirmOpen(true);
    onInitialActionHandled?.();
  }, [initialAction, onInitialActionHandled]);

  const currentNickname = mascot?.nickname || settings?.petNickname || 'Keroo';
  const isRoamingEnabled = settings?.roamingPetEnabled ?? true;

  // Handle Nickname Save
  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nicknameInput.trim();
    // An empty input must never overwrite the current nickname.
    if (!name) return;

    await db.transaction('rw', [db.user_settings, db.keroo_state], async () => {
      if (settings) {
        await db.user_settings.update('global', {
          petNickname: name,
          updatedAt: new Date().toISOString(),
        });
      }
      if (mascot) {
        await db.keroo_state.update('current', {
          nickname: name,
        });
      }
    });

    setNicknameInput('');
    setFeedbackMsg(t('settings.nickname_saved'));
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  // Handle Toggle Roaming Pet
  const handleToggleRoaming = async () => {
    const nextVal = !isRoamingEnabled;
    if (settings) {
      await db.user_settings.update('global', {
        roamingPetEnabled: nextVal,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // Handle Currency Change
  const handleSelectCurrency = async (curr: SupportedCurrency) => {
    onCurrencyChange?.(curr);
    if (settings) {
      await db.user_settings.update('global', {
        currency: curr,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  // Read the live settings so a reset/demo load keeps the user's theme & roaming pet.
  const readPreserve = async () => {
    const current = await db.user_settings.get('global');
    return {
      theme: current?.theme ?? theme,
      roamingPetEnabled: current?.roamingPetEnabled ?? isRoamingEnabled,
    };
  };

  // Handle Load Demo Data
  const handleExecuteLoadDemo = async () => {
    setIsOperating(true);
    try {
      await seedDemoData(db, language, currency, currentNickname, await readPreserve());
      setIsDemoConfirmOpen(false);
      setFeedbackMsg(t('settings.demo_loaded'));
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsOperating(false);
    }
  };

  // Handle Reset Clean Slate
  const handleExecuteReset = async () => {
    setIsOperating(true);
    try {
      await seedCleanSlate(db, language, currency, currentNickname, await readPreserve());
      setIsResetConfirmOpen(false);
      setFeedbackMsg(t('settings.reset_done'));
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsOperating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-semibold text-text-primary tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-brand" />
          <span>{t('settings.title')}</span>
        </h2>
        <p className="text-xs text-text-secondary mt-0.5">
          {t('settings.subtitle')}
        </p>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-brand-subtle text-brand-text border border-brand-border text-xs font-medium flex items-center gap-2 animate-in fade-in">
          <CheckCircle className="w-4 h-4 shrink-0 text-brand" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* 1. Language & Regional Settings */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-brand" />
            <span>{t('settings.language_title')}</span>
          </div>
        }
        subtitle={t('settings.language_subtitle')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
          <button
            type="button"
            onClick={() => setLanguage('pt-BR')}
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
              language === 'pt-BR'
                ? 'border-brand bg-brand-subtle text-brand-text font-semibold shadow-xs'
                : 'border-border-subtle hover:border-border-strong text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🇧🇷</span>
              <span>{t('settings.lang_pt_name')}</span>
            </div>
            {language === 'pt-BR' && <Badge variant="brand" size="sm">{t('settings.badge_active')}</Badge>}
          </button>

          <button
            type="button"
            onClick={() => setLanguage('en-US')}
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
              language === 'en-US'
                ? 'border-brand bg-brand-subtle text-brand-text font-semibold shadow-xs'
                : 'border-border-subtle hover:border-border-strong text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🇺🇸</span>
              <span>{t('settings.lang_en_name')}</span>
            </div>
            {language === 'en-US' && <Badge variant="brand" size="sm">{t('settings.badge_active')}</Badge>}
          </button>
        </div>
      </Card>

      {/* 2. Base Currency Settings */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-coin" />
            <span>{t('settings.currency_title')}</span>
          </div>
        }
        subtitle={t('settings.currency_subtitle')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          {(['BRL', 'USD', 'EUR'] as SupportedCurrency[]).map((c) => {
            const isSelected = currency === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleSelectCurrency(c)}
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
                  isSelected
                    ? 'border-brand bg-brand-subtle text-brand-text font-semibold shadow-xs'
                    : 'border-border-subtle hover:border-border-strong text-text-primary'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{c}</span>
                  <span className="text-text-secondary">
                    {t(`settings.currency_names.${c}`)}
                  </span>
                </div>
                {isSelected && <Badge variant="brand" size="sm">{t('settings.badge_default')}</Badge>}
              </button>
            );
          })}
        </div>
      </Card>

      {/* 3. Theme & Appearance */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Sun className="w-4 h-4 text-warning" />
            <span>{t('settings.theme_title')}</span>
          </div>
        }
        subtitle={t('settings.theme_subtitle')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
          <button
            type="button"
            onClick={() => onToggleTheme?.('light')}
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
              theme === 'light'
                ? 'border-brand bg-brand-subtle text-brand-text font-semibold shadow-xs'
                : 'border-border-subtle hover:border-border-strong text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Sun className="w-5 h-5 text-warning" />
              <div>
                <span className="block font-semibold">{t('settings.theme_light')}</span>
                <span className="text-[11px] text-text-secondary">{t('settings.theme_light_desc')}</span>
              </div>
            </div>
            {theme === 'light' && <Badge variant="brand" size="sm">{t('settings.badge_active')}</Badge>}
          </button>

          <button
            type="button"
            onClick={() => onToggleTheme?.('dark')}
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
              theme === 'dark'
                ? 'border-brand bg-brand-subtle text-brand-text font-semibold shadow-xs'
                : 'border-border-subtle hover:border-border-strong text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Moon className="w-5 h-5 text-brand" />
              <div>
                <span className="block font-semibold">{t('settings.theme_dark')}</span>
                <span className="text-[11px] text-text-secondary">{t('settings.theme_dark_desc')}</span>
              </div>
            </div>
            {theme === 'dark' && <Badge variant="brand" size="sm">{t('settings.badge_active')}</Badge>}
          </button>

          <button
            type="button"
            onClick={() => onToggleTheme?.('system')}
            data-testid="theme-option-system"
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium transition-all ${
              theme === 'system'
                ? 'border-brand bg-brand-subtle text-brand-text font-semibold shadow-xs'
                : 'border-border-subtle hover:border-border-strong text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Monitor className="w-5 h-5 text-text-secondary" />
              <div>
                <span className="block font-semibold">{t('settings.theme_system')}</span>
                <span className="text-[11px] text-text-secondary">{t('settings.theme_system_desc')}</span>
              </div>
            </div>
            {theme === 'system' && <Badge variant="brand" size="sm">{t('settings.badge_active')}</Badge>}
          </button>
        </div>
      </Card>

      {/* 4. Mascot & Roaming Companion Settings */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-brand" />
            <span>{t('settings.mascot_title')}</span>
          </div>
        }
        subtitle={t('settings.mascot_subtitle')}
      >
        <div className="space-y-4 mt-2">
          {/* Roaming Companion Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-muted/30 border border-border-subtle">
            <div>
              <h4 className="text-xs font-semibold text-text-primary">
                {t('settings.roaming_title')}
              </h4>
              <p className="text-[11px] text-text-secondary mt-0.5">
                {t('settings.roaming_desc')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleRoaming}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                isRoamingEnabled ? 'bg-brand' : 'bg-surface-muted border border-border-subtle'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-surface-card shadow-sm transition-transform ${
                  isRoamingEnabled ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Nickname Form */}
          <form onSubmit={handleSaveNickname} className="flex gap-2 items-end">
            <div className="flex-1">
              <Input
                label={t('settings.nickname_label')}
                placeholder={currentNickname}
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" size="md" disabled={!nicknameInput.trim()}>
              {t('common.save')}
            </Button>
          </form>
        </div>
      </Card>

      {/* 5. Local Data Management (Demo & Clean Slate) */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-coin" />
            <span>{t('settings.data_title')}</span>
          </div>
        }
        subtitle={t('settings.data_subtitle')}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
          {/* Demo Data Button */}
          <div className="p-4 rounded-xl border border-border-subtle bg-surface-muted/20 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-coin" />
                <span>{t('settings.demo_title')}</span>
              </h4>
              <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                {t('settings.demo_desc')}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsDemoConfirmOpen(true)}
            >
              {t('settings.demo_button')}
            </Button>
          </div>

          {/* Clean Slate Reset Button */}
          <div className="p-4 rounded-xl border border-danger/20 bg-danger-subtle/10 flex flex-col justify-between space-y-3">
            <div>
              <h4 className="text-xs font-semibold text-danger flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" />
                <span>{t('settings.reset_title')}</span>
              </h4>
              <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                {t('settings.reset_desc')}
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsResetConfirmOpen(true)}
            >
              {t('settings.reset_button')}
            </Button>
          </div>
        </div>
      </Card>

      {/* 6. Privacy & Security Pledge */}
      <Card className="bg-surface-muted/20 border-brand-border/30">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-brand shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-semibold text-text-primary">
              {t('settings.privacy_title')}
            </h4>
            <p className="text-[11px] text-text-secondary leading-relaxed">
              {t('settings.privacy_desc')}
            </p>
          </div>
        </div>
      </Card>

      {/* Modal: Confirm Demo Data */}
      <Modal
        isOpen={isDemoConfirmOpen}
        onClose={() => setIsDemoConfirmOpen(false)}
        title={t('settings.demo_modal_title')}
        subtitle={t('settings.demo_modal_subtitle')}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            {t('settings.demo_modal_desc')}
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsDemoConfirmOpen(false)} disabled={isOperating}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={handleExecuteLoadDemo} isLoading={isOperating}>
              {t('settings.confirm_load')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirm Clean Slate Reset */}
      <Modal
        isOpen={isResetConfirmOpen}
        onClose={() => setIsResetConfirmOpen(false)}
        title={t('settings.reset_modal_title')}
        subtitle={t('settings.reset_modal_subtitle')}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-danger-subtle/30 border border-danger/20 text-xs text-danger flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              {t('settings.reset_modal_warning')}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setIsResetConfirmOpen(false)} disabled={isOperating}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleExecuteReset} isLoading={isOperating}>
              {t('settings.confirm_reset')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
