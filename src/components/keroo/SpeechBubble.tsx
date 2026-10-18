/**
 * src/components/keroo/SpeechBubble.tsx
 *
 * Interactive Speech Bubble for Keroo Mascot.
 *
 * Displays proactive bill check-in prompts ("Você já pagou tal conta?")
 * and deterministic insights with 1-click actions:
 *   - [✅ Já paguei!] / [Paid!]
 *   - [⏰ Lembrar amanhã] / [Snooze]
 *   - [✏️ Ajustar valor] / [Edit amount] -> expands inline integer-cent numeric editor.
 */

import React, { useState } from 'react';
import type { Cents, RecurringBill, SupportedCurrency, SupportedLocale } from '../../types';
import { formatCurrency, parseCurrencyToCents } from '../../core/currency';
import type { BillCheckInPrompt } from '../../core/kerooMood';
import { translate } from '../../i18n';

export interface SpeechBubbleProps {
  prompt?: BillCheckInPrompt | null;
  title?: string;
  message?: string;
  locale?: SupportedLocale;
  currency?: SupportedCurrency;
  onPay?: (bill: RecurringBill, amountCents?: Cents) => void | Promise<void>;
  onSnooze?: (bill: RecurringBill) => void | Promise<void>;
  onEditAmount?: (bill: RecurringBill, newAmountCents: Cents) => void | Promise<void>;
  onDismiss?: () => void;
  tailPosition?: 'left' | 'right' | 'top' | 'bottom';
  className?: string;
  customActions?: React.ReactNode;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  prompt,
  title,
  message,
  locale = 'pt-BR',
  currency = 'BRL',
  onPay,
  onSnooze,
  onEditAmount,
  onDismiss,
  tailPosition = 'left',
  className = '',
  customActions,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editInput, setEditInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bill = prompt?.bill;
  const isEn = locale === 'en-US';
  // Standalone translator bound to the explicit `locale` prop (works without an I18nProvider).
  const t = (key: string) => translate(locale, key);

  // Resolved title & message
  const displayTitle =
    title ||
    (prompt
      ? prompt.urgency === 'overdue'
        ? t('speech.overdue_title')
        : prompt.urgency === 'due_today'
        ? t('speech.due_today_title')
        : t('speech.upcoming_title')
      : undefined);

  const displayMessage =
    message ||
    (prompt ? (isEn ? prompt.promptTextEn : prompt.promptTextPt) : '');

  const startEditAmount = () => {
    if (bill) {
      setEditInput(formatCurrency(bill.amountCents, currency, locale));
      setIsEditing(true);
    }
  };

  const handlePayClick = async () => {
    if (!bill || !onPay) return;
    try {
      setIsSubmitting(true);
      await onPay(bill, bill.amountCents);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSnoozeClick = async () => {
    if (!bill || !onSnooze) return;
    try {
      setIsSubmitting(true);
      await onSnooze(bill);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEditedAmount = async () => {
    if (!bill) return;
    const cents = parseCurrencyToCents(editInput, { currency, locale });
    if (cents <= 0) return;

    try {
      setIsSubmitting(true);
      if (onEditAmount) {
        await onEditAmount(bill, cents);
      }
      setIsEditing(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Tail styling classes
  const getTailClasses = () => {
    switch (tailPosition) {
      case 'left':
        return 'absolute -left-2 top-6 w-0 h-0 border-y-8 border-y-transparent border-r-8 border-r-white dark:border-r-neutral-800';
      case 'right':
        return 'absolute -right-2 top-6 w-0 h-0 border-y-8 border-y-transparent border-l-8 border-l-white dark:border-l-neutral-800';
      case 'top':
        return 'absolute left-8 -top-2 w-0 h-0 border-x-8 border-x-transparent border-b-8 border-b-white dark:border-b-neutral-800';
      case 'bottom':
      default:
        return 'absolute left-8 -bottom-2 w-0 h-0 border-x-8 border-x-transparent border-t-8 border-t-white dark:border-t-neutral-800';
    }
  };

  if (!displayMessage && !prompt) {
    return null;
  }

  return (
    <div
      data-testid="keroo-speech-bubble"
      className={`relative bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-2xl p-4 shadow-lg text-neutral-900 dark:text-neutral-100 max-w-sm transition-all duration-150 z-20 ${className}`}
    >
      {/* Speech bubble tail pointer */}
      <div className={getTailClasses()} aria-hidden="true" />

      {/* Header bar with optional title and close button */}
      <div className="flex items-start justify-between gap-2 mb-1">
        {displayTitle && (
          <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {displayTitle}
          </h4>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label={t('speech.close')}
            className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-sm ml-auto p-0.5 rounded focus:outline-none"
          >
            ✕
          </button>
        )}
      </div>

      {/* Main speech message */}
      <p className="text-sm font-medium leading-relaxed mb-3">
        {displayMessage}
      </p>

      {/* Amount highlight pill if bill present */}
      {bill && !isEditing && (
        <div className="mb-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-700/60 text-xs font-medium tabular-nums">
          <span className="text-neutral-500 dark:text-neutral-400">
            {t('speech.amount_label')}
          </span>
          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
            {formatCurrency(bill.amountCents, currency, locale)}
          </span>
        </div>
      )}

      {/* Inline Amount Editor */}
      {isEditing && (
        <div className="mb-3 p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-700/40 border border-neutral-200 dark:border-neutral-600 space-y-2">
          <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {t('speech.adjust_amount_label')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={editInput}
              onChange={(e) => setEditInput(e.target.value)}
              placeholder={formatCurrency(0, currency, locale)}
              className="w-full px-2.5 py-1.5 text-base sm:text-sm bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSaveEditedAmount}
              disabled={isSubmitting}
              className="px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap active:scale-95 transition-transform"
            >
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-2 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-lg"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {prompt && !isEditing && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-neutral-100 dark:border-neutral-700/60">
          {/* Action 1: Pay */}
          {onPay && (
            <button
              type="button"
              onClick={handlePayClick}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-semibold shadow-sm transition-transform cursor-pointer"
              data-testid="action-pay"
            >
              <span>✅</span>
              <span>{t('speech.paid')}</span>
            </button>
          )}

          {/* Action 2: Snooze */}
          {onSnooze && (
            <button
              type="button"
              onClick={handleSnoozeClick}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 active:scale-95 text-neutral-700 dark:text-neutral-200 text-xs font-medium transition-transform cursor-pointer"
              data-testid="action-snooze"
            >
              <span>⏰</span>
              <span>{t('speech.snooze')}</span>
            </button>
          )}

          {/* Action 3: Edit Amount */}
          {onEditAmount && (
            <button
              type="button"
              onClick={startEditAmount}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 active:scale-95 text-neutral-700 dark:text-neutral-200 text-xs font-medium transition-transform cursor-pointer"
              data-testid="action-edit-amount"
            >
              <span>✏️</span>
              <span>{t('speech.edit')}</span>
            </button>
          )}
        </div>
      )}

      {/* Custom Actions if provided */}
      {customActions && (
        <div className="pt-2 mt-2 border-t border-neutral-100 dark:border-neutral-700">
          {customActions}
        </div>
      )}
    </div>
  );
};
