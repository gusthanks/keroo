import React, { useState } from 'react';
import { KeyRound, Lock } from 'lucide-react';
import { useTranslation } from '../../i18n';
import {
  APP_LOCK_DEFAULT_ITERATIONS,
  APP_LOCK_MIN_LENGTH,
  clearAppLock,
  createAppLockRecord,
  isValidAppLockPassword,
  readAppLock,
  verifyAppLockPassword,
  writeAppLock,
  type AppLockStorage,
} from '../../core/appLock';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { useAppLock } from './AppLockGate';

type Mode = 'idle' | 'change' | 'disable';

export interface AppLockCardProps {
  /** Where the lock record lives (defaults to localStorage). */
  storage?: AppLockStorage | null;
  /** PBKDF2 work factor for new passwords (tests pass a smaller one). */
  iterations?: number;
}

/** Settings card that turns the app lock on, changes its password, or turns it off. */
export const AppLockCard: React.FC<AppLockCardProps> = ({
  storage,
  iterations = APP_LOCK_DEFAULT_ITERATIONS,
}) => {
  const { t } = useTranslation();
  const { lockNow, refresh } = useAppLock();
  const [isEnabled, setIsEnabled] = useState(() => readAppLock(storage) !== null);
  const [mode, setMode] = useState<Mode>('idle');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const resetForm = (nextMode: Mode = 'idle') => {
    setMode(nextMode);
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  /** Validates the new password pair; returns an error message or null. */
  const checkNewPassword = (): string | null => {
    if (!isValidAppLockPassword(next)) return t('settings.lock_err_short', { min: APP_LOCK_MIN_LENGTH });
    if (next !== confirm) return t('settings.lock_err_mismatch');
    return null;
  };

  /** Confirms the current password; returns false (and shows an error) when it is wrong. */
  const checkCurrentPassword = async (): Promise<boolean> => {
    const record = readAppLock(storage);
    if (!record) return true;
    if (await verifyAppLockPassword(record, current)) return true;
    setError(t('settings.lock_err_wrong'));
    setCurrent('');
    return false;
  };

  const run = async (action: () => Promise<string | null>) => {
    setIsBusy(true);
    setError(null);
    setMessage(null);
    try {
      const done = await action();
      if (done) {
        setMessage(done);
        resetForm();
        setIsEnabled(readAppLock(storage) !== null);
        refresh();
      }
    } catch {
      setError(t('settings.lock_err_unavailable'));
    } finally {
      setIsBusy(false);
    }
  };

  const handleEnable = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword();
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      writeAppLock(await createAppLockRecord(next, iterations), storage);
      return t('settings.lock_enabled_msg');
    });
  };

  const handleChange = (e: React.FormEvent) => {
    e.preventDefault();
    const problem = checkNewPassword();
    if (problem) {
      setError(problem);
      return;
    }
    void run(async () => {
      if (!(await checkCurrentPassword())) return null;
      writeAppLock(await createAppLockRecord(next, iterations), storage);
      return t('settings.lock_changed_msg');
    });
  };

  const handleDisable = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (!(await checkCurrentPassword())) return null;
      clearAppLock(storage);
      return t('settings.lock_disabled_msg');
    });
  };

  const newPasswordFields = (
    <>
      <Input
        type="password"
        label={t('settings.lock_new_label')}
        value={next}
        onChange={(e) => setNext(e.target.value)}
        autoComplete="new-password"
        data-testid="lock-new-input"
      />
      <Input
        type="password"
        label={t('settings.lock_confirm_label')}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        data-testid="lock-confirm-input"
      />
    </>
  );

  const currentPasswordField = (
    <Input
      type="password"
      label={t('settings.lock_current_label')}
      value={current}
      onChange={(e) => setCurrent(e.target.value)}
      autoComplete="current-password"
      data-testid="lock-current-input"
    />
  );

  return (
    <Card
      data-testid="settings-lock-card"
      title={
        <div className="flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-brand" />
          <span>{t('settings.lock_title')}</span>
          <Badge variant={isEnabled ? 'success' : 'neutral'} size="sm" pill dot>
            {isEnabled ? t('settings.lock_status_on') : t('settings.lock_status_off')}
          </Badge>
        </div>
      }
      subtitle={t('settings.lock_desc')}
    >
      <div className="space-y-3 mt-2">
        {!isEnabled && (
          <form onSubmit={handleEnable} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            {newPasswordFields}
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isBusy}
              leadingIcon={<Lock className="w-4 h-4" />}
              className="sm:col-span-2"
              data-testid="lock-enable-button"
            >
              {t('settings.lock_enable_btn')}
            </Button>
          </form>
        )}

        {isEnabled && mode === 'idle' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={lockNow}
              leadingIcon={<Lock className="w-4 h-4" />}
              data-testid="lock-now-button"
            >
              {t('settings.lock_now_btn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetForm('change')}
              data-testid="lock-change-button"
            >
              {t('settings.lock_change_btn')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetForm('disable')}
              data-testid="lock-disable-button"
            >
              {t('settings.lock_disable_btn')}
            </Button>
          </div>
        )}

        {isEnabled && mode === 'change' && (
          <form onSubmit={handleChange} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            {currentPasswordField}
            {newPasswordFields}
            <div className="sm:col-span-3 flex items-center justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => resetForm()} disabled={isBusy}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isBusy}
                data-testid="lock-save-button"
              >
                {t('settings.lock_save_btn')}
              </Button>
            </div>
          </form>
        )}

        {isEnabled && mode === 'disable' && (
          <form onSubmit={handleDisable} className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            {currentPasswordField}
            <div className="flex items-center justify-end gap-2.5">
              <Button variant="ghost" size="sm" onClick={() => resetForm()} disabled={isBusy}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="danger"
                size="sm"
                isLoading={isBusy}
                data-testid="lock-disable-confirm-button"
              >
                {t('settings.lock_disable_btn')}
              </Button>
            </div>
          </form>
        )}

        {error && (
          <p className="text-xs text-danger" role="alert" data-testid="lock-error">
            {error}
          </p>
        )}
        {message && (
          <p className="text-xs text-success" role="status" data-testid="lock-message">
            {message}
          </p>
        )}

        <p className="text-[11px] text-text-secondary leading-relaxed">{t('settings.lock_note')}</p>
      </div>
    </Card>
  );
};
