import React, { useEffect, useState } from 'react';
import { Lock, AlertTriangle } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { verifyAppLockPassword, type AppLockRecord } from '../../core/appLock';
import { applyThemeClass, readStoredTheme } from '../layout/theme';
import { KerooMascot } from '../keroo/KerooMascot';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

export interface LockScreenProps {
  record: AppLockRecord;
  onUnlock: () => void;
  /** Erases every Keroo table and the lock, then restarts the app (the forgotten-password path). */
  onEraseAll: () => Promise<void>;
}

export const LockScreen: React.FC<LockScreenProps> = ({ record, onUnlock, onEraseAll }) => {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [isErasing, setIsErasing] = useState(false);
  const [eraseError, setEraseError] = useState<string | null>(null);

  // The app has not opened the database yet, so take the theme from the last session.
  useEffect(() => {
    applyThemeClass(readStoredTheme());
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || isChecking) return;
    setIsChecking(true);
    setError(null);
    try {
      if (await verifyAppLockPassword(record, password)) {
        onUnlock();
        return;
      }
      setError(t('lock.wrong_password'));
      setPassword('');
    } catch {
      setError(t('lock.wrong_password'));
    } finally {
      setIsChecking(false);
    }
  };

  const handleErase = async () => {
    setIsErasing(true);
    setEraseError(null);
    try {
      await onEraseAll();
    } catch {
      setEraseError(t('lock.erase_error'));
      setIsErasing(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-surface-canvas flex items-center justify-center p-6"
      data-testid="lock-screen"
    >
      <div className="w-full max-w-sm bg-surface-card border border-border-subtle rounded-2xl p-6 shadow-sm space-y-5">
        <div className="flex flex-col items-center text-center gap-3">
          <KerooMascot pose="sleeping_bubble" size="md" ariaLabel={t('lock.mascot_label')} />
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-text-primary flex items-center justify-center gap-2">
              <Lock className="w-4 h-4 text-brand" />
              <span>{t('lock.title')}</span>
            </h1>
            <p className="text-xs text-text-secondary">{t('lock.subtitle')}</p>
          </div>
        </div>

        {!showForgot ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              label={t('lock.password_label')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              error={error ?? undefined}
              data-testid="lock-password-input"
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={isChecking}
              disabled={!password}
              data-testid="lock-unlock-button"
            >
              {t('lock.unlock_button')}
            </Button>
            <button
              type="button"
              onClick={() => setShowForgot(true)}
              className="w-full text-center text-xs text-text-secondary hover:text-text-primary underline-offset-2 hover:underline"
              data-testid="lock-forgot-link"
            >
              {t('lock.forgot_link')}
            </button>
          </form>
        ) : (
          <div className="space-y-4" data-testid="lock-forgot-panel">
            <div className="p-3 rounded-xl bg-danger-subtle/30 border border-danger/20 text-xs text-danger flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <div className="space-y-1">
                <p className="font-semibold">{t('lock.forgot_title')}</p>
                <p className="leading-relaxed">{t('lock.forgot_desc')}</p>
              </div>
            </div>
            {eraseError && (
              <p className="text-xs text-danger" role="alert">
                {eraseError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="ghost" onClick={() => setShowForgot(false)} disabled={isErasing}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={handleErase}
                isLoading={isErasing}
                data-testid="lock-erase-button"
              >
                {t('lock.erase_button')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
