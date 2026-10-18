import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useTranslation } from '../i18n';
import type { SupportedCurrency, SupportedTheme } from '../types';
import { seedCleanSlate, seedDemoData } from '../db/seed';
import {
  backupRowCounts,
  exportBackup,
  formatStorageMegabytes,
  isBackupError,
  parseBackup,
  restoreBackup,
  serializeBackup,
  suggestBackupFilename,
  type KerooBackup,
} from '../core/backup';
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
  DatabaseBackup,
  Download,
  Upload,
  HardDrive,
} from 'lucide-react';

/** How long the "restored" confirmation stays visible before the app reloads. */
const RESTORE_RELOAD_DELAY_MS = 1200;

/** Reads a picked file as text (Blob.text() with a FileReader fallback for older engines). */
function readFileAsText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Danger-styled inline error with role="alert" (shared by the page and the confirm modals). */
const ErrorNote: React.FC<{ message: string; testId?: string }> = ({ message, testId }) => (
  <div
    role="alert"
    data-testid={testId}
    className="p-3 rounded-xl bg-danger-subtle/30 border border-danger/20 text-xs text-danger flex items-center gap-2"
  >
    <AlertTriangle className="w-4 h-4 shrink-0" />
    <span>{message}</span>
  </div>
);

export interface SettingsViewProps {
  theme?: SupportedTheme;
  onToggleTheme?: (theme: SupportedTheme) => void;
  currency?: SupportedCurrency;
  onCurrencyChange?: (curr: SupportedCurrency) => void;
  /** Opens one of the destructive confirmation modals on mount (used by the command palette). */
  initialAction?: 'demo' | 'reset' | null;
  /** Called once the initialAction has been consumed so the parent can clear it. */
  onInitialActionHandled?: () => void;
  /** Runs after a successful backup restore. Defaults to reloading the page. */
  onRestoreComplete?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  theme = 'light',
  onToggleTheme,
  currency = 'BRL',
  onCurrencyChange,
  initialAction = null,
  onInitialActionHandled,
  onRestoreComplete = () => window.location.reload(),
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
  // Error shown inside the open demo/reset confirmation modal (it stays open so the user can retry).
  const [modalError, setModalError] = useState<string | null>(null);

  // Backup & restore
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingBackup, setPendingBackup] = useState<KerooBackup | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [isBackupBusy, setIsBackupBusy] = useState(false);
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(
    null
  );

  // Storage usage line: every API is optional (Safari < 17, jsdom, private windows).
  useEffect(() => {
    let cancelled = false;
    try {
      const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
      if (storage && typeof storage.estimate === 'function') {
        storage
          .estimate()
          .then((est) => {
            if (cancelled) return;
            if (typeof est.usage === 'number' && typeof est.quota === 'number' && est.quota > 0) {
              setStorageEstimate({ usage: est.usage, quota: est.quota });
            }
          })
          .catch(() => {});
      }
    } catch {
      // Storage estimate unavailable: the line stays hidden.
    }
    return () => {
      cancelled = true;
    };
  }, []);

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
    setModalError(null);
    try {
      await seedDemoData(db, language, currency, currentNickname, await readPreserve());
      setIsDemoConfirmOpen(false);
      setFeedbackMsg(t('settings.demo_loaded'));
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setModalError(t('settings.err_generic'));
    } finally {
      setIsOperating(false);
    }
  };

  // Handle Reset Clean Slate
  const handleExecuteReset = async () => {
    setIsOperating(true);
    setModalError(null);
    try {
      await seedCleanSlate(db, language, currency, currentNickname, await readPreserve());
      setIsResetConfirmOpen(false);
      setFeedbackMsg(t('settings.reset_done'));
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setModalError(t('settings.err_generic'));
    } finally {
      setIsOperating(false);
    }
  };

  const closeDemoConfirm = () => {
    setIsDemoConfirmOpen(false);
    setModalError(null);
  };

  const closeResetConfirm = () => {
    setIsResetConfirmOpen(false);
    setModalError(null);
  };

  /** Translated message for a backup failure: BackupError codes, else the generic fallback. */
  const backupErrorMessage = (err: unknown): string =>
    isBackupError(err) ? t(`settings.backup_err_${err.code}`) : t('settings.backup_err_GENERIC');

  // Backup: export every table to a JSON file download.
  const handleExportBackup = async () => {
    setBackupError(null);
    setIsBackupBusy(true);
    try {
      const backup = await exportBackup(db);
      const blob = new Blob([serializeBackup(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = suggestBackupFilename(new Date());
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoke on the next tick: some browsers (iOS Safari) still read the URL after click().
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedbackMsg(t('settings.backup_exported'));
      setTimeout(() => setFeedbackMsg(null), 3000);
    } catch (err) {
      console.error(err);
      setBackupError(t('settings.err_generic'));
    } finally {
      setIsBackupBusy(false);
    }
  };

  // Restore step 1: read + validate the picked file, then ask for confirmation.
  const handleBackupFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    // Reset so picking the same file again still fires a change event.
    input.value = '';
    if (!file) return;
    setBackupError(null);
    setRestoreError(null);
    setIsBackupBusy(true);
    try {
      const backup = parseBackup(await readFileAsText(file));
      setPendingBackup(backup);
    } catch (err) {
      setBackupError(backupErrorMessage(err));
    } finally {
      setIsBackupBusy(false);
    }
  };

  const closeRestoreConfirm = () => {
    setPendingBackup(null);
    setRestoreError(null);
  };

  // Restore step 2: one atomic replace of every table, then reload the app.
  const handleExecuteRestore = async () => {
    if (!pendingBackup) return;
    setIsOperating(true);
    setRestoreError(null);
    try {
      await restoreBackup(db, pendingBackup, { mode: 'replace' });
      // The UI language is a per-device choice kept in localStorage: align it with the backup.
      const restored = await db.user_settings.get('global');
      if (
        restored &&
        (restored.language === 'pt-BR' || restored.language === 'en-US') &&
        restored.language !== language
      ) {
        setLanguage(restored.language);
      }
      setPendingBackup(null);
      setFeedbackMsg(t('settings.backup_success'));
      setTimeout(() => onRestoreComplete(), RESTORE_RELOAD_DELAY_MS);
    } catch (err) {
      console.error(err);
      setRestoreError(backupErrorMessage(err));
    } finally {
      setIsOperating(false);
    }
  };

  const pendingCounts = pendingBackup ? backupRowCounts(db, pendingBackup) : null;
  const pendingDate = (() => {
    if (!pendingBackup?.exportedAt) return null;
    const d = new Date(pendingBackup.exportedAt);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  })();

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

      {/* 6. Backup & Restore (the only copy of the data lives in this browser) */}
      <Card
        data-testid="settings-backup-card"
        title={
          <div className="flex items-center gap-2">
            <DatabaseBackup className="w-4 h-4 text-brand" />
            <span>{t('settings.backup_title')}</span>
          </div>
        }
        subtitle={t('settings.backup_desc')}
      >
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportBackup}
              isLoading={isBackupBusy}
              leadingIcon={<Download className="w-4 h-4" />}
              data-testid="backup-export-button"
            >
              {t('settings.backup_export_btn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isBackupBusy || isOperating}
              leadingIcon={<Upload className="w-4 h-4" />}
              data-testid="backup-import-button"
            >
              {t('settings.backup_import_btn')}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleBackupFileChange}
              data-testid="backup-file-input"
              aria-label={t('settings.backup_import_btn')}
            />
          </div>

          {backupError && <ErrorNote message={backupError} testId="backup-error" />}

          {storageEstimate && (
            <p
              className="text-[11px] text-text-secondary flex items-center gap-1.5"
              data-testid="backup-storage-usage"
            >
              <HardDrive className="w-3.5 h-3.5 shrink-0" />
              <span>
                {t('settings.backup_storage_usage', {
                  used: formatStorageMegabytes(storageEstimate.usage, language),
                  quota: formatStorageMegabytes(storageEstimate.quota, language),
                })}
              </span>
            </p>
          )}
        </div>
      </Card>

      {/* 7. Privacy & Security Pledge */}
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
        onClose={closeDemoConfirm}
        title={t('settings.demo_modal_title')}
        subtitle={t('settings.demo_modal_subtitle')}
        maxWidth="md"
      >
        <div className="space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            {t('settings.demo_modal_desc')}
          </p>

          {modalError && <ErrorNote message={modalError} />}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={closeDemoConfirm} disabled={isOperating}>
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
        onClose={closeResetConfirm}
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

          {modalError && <ErrorNote message={modalError} />}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={closeResetConfirm} disabled={isOperating}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleExecuteReset} isLoading={isOperating}>
              {t('settings.confirm_reset')}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Confirm Backup Restore (replaces every table) */}
      <Modal
        isOpen={pendingBackup !== null}
        onClose={() => {
          if (!isOperating) closeRestoreConfirm();
        }}
        title={t('settings.backup_confirm_title')}
        subtitle={pendingDate ? t('settings.backup_file_date', { date: pendingDate }) : undefined}
        maxWidth="md"
      >
        <div className="space-y-4" data-testid="backup-confirm-modal">
          <div className="p-3 rounded-xl bg-danger-subtle/30 border border-danger/20 text-xs text-danger flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{t('settings.backup_confirm_desc')}</span>
          </div>

          {pendingCounts && (
            <div>
              <h4 className="text-xs font-semibold text-text-primary mb-2">
                {t('settings.backup_rows_title')}
              </h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {Object.entries(pendingCounts).map(([table, count]) => (
                  <li
                    key={table}
                    data-testid={`backup-count-${table}`}
                    className="flex items-center justify-between text-[11px] text-text-secondary"
                  >
                    <span>{t(`settings.backup_tables.${table}`)}</span>
                    <span className="font-mono tabular-nums text-text-primary">{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {restoreError && <ErrorNote message={restoreError} testId="restore-error" />}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button variant="ghost" onClick={closeRestoreConfirm} disabled={isOperating}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={handleExecuteRestore}
              isLoading={isOperating}
              data-testid="backup-confirm-button"
            >
              {t('settings.backup_confirm_btn')}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
