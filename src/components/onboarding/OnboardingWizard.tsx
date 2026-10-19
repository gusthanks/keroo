import React, { useState } from 'react';
import { db } from '../../db';
import { seedCleanSlate, seedDemoData } from '../../db/seed';
import { useTranslation } from '../../i18n';
import { defaultCurrencyFor } from '../../core/currency';
import { requestPersistentStorage } from '../../core/backup';
import type { SupportedCurrency } from '../../types';
import { Sparkles, ArrowRight, ArrowLeft, Check, Coins, Globe, Heart } from 'lucide-react';
import { KerooMascot } from '../keroo/KerooMascot';

export interface OnboardingWizardProps {
  onComplete: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({ onComplete }) => {
  const { t, language, setLanguage } = useTranslation();

  const [step, setStep] = useState<number>(1);
  // The currency follows the active language (pt-BR -> BRL, otherwise USD)
  // until the user explicitly taps a currency in step 2 ("currency touched").
  // A non-null value is that explicit choice and no longer tracks the language.
  const [touchedCurrency, setTouchedCurrency] = useState<SupportedCurrency | null>(null);
  const selectedCurrency: SupportedCurrency = touchedCurrency ?? defaultCurrencyFor(language);
  const currencyOptions: SupportedCurrency[] =
    language === 'pt-BR' ? ['BRL', 'USD', 'EUR'] : ['USD', 'EUR', 'BRL'];
  const [petNickname, setPetNickname] = useState<string>('Keroo');
  const [loadDemo, setLoadDemo] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      if (loadDemo) {
        await seedDemoData(db, language, selectedCurrency, petNickname);
      } else {
        await seedCleanSlate(db, language, selectedCurrency, petNickname);
      }
      // Ask once (not on every boot) to exempt Keroo's IndexedDB from automatic eviction.
      // Firefox may prompt; Chromium decides silently. Guarded and never rejects.
      try {
        if (typeof navigator !== 'undefined') void requestPersistentStorage();
      } catch {
        // Persistent storage is a best-effort hint; onboarding continues regardless.
      }
      onComplete();
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-surface-canvas/90 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface-card border border-border-subtle rounded-2xl shadow-xl overflow-hidden flex flex-col">
        {/* Top Progress Header */}
        <div className="p-6 border-b border-border-subtle bg-surface-muted/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <KerooMascot size="sm" animated={false} />
              <h2 className="text-lg font-semibold text-text-primary tracking-tight">
                {t('onboarding.wizard_title')}
              </h2>
            </div>
            <span className="text-xs font-medium text-text-secondary tabular-nums">
              {step} / 4
            </span>
          </div>

          {/* Stepper bar */}
          <div className="w-full bg-border-subtle h-1.5 rounded-full overflow-hidden flex">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`flex-1 h-full transition-all duration-300 ${
                  s <= step ? 'bg-brand' : 'bg-transparent'
                } ${s > 1 ? 'border-l border-surface-card' : ''}`}
              />
            ))}
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6 flex-1 min-h-[300px] flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand">
                <Globe className="w-5 h-5" />
                <h3 className="text-base font-medium text-text-primary">
                  {t('onboarding.step1_title')}
                </h3>
              </div>
              <p className="text-sm text-text-secondary">
                {t('onboarding.step1_desc')}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLanguage('pt-BR')}
                  className={`p-4 rounded-xl border text-left btn-tactile transition-colors flex items-center justify-between ${
                    language === 'pt-BR'
                      ? 'border-brand bg-brand-subtle text-brand-text font-medium'
                      : 'border-border-subtle hover:border-border-strong text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🇧🇷</span>
                    <span>{t('onboarding.lang_pt')}</span>
                  </div>
                  {language === 'pt-BR' && <Check className="w-4 h-4 text-brand" />}
                </button>

                <button
                  type="button"
                  onClick={() => setLanguage('en-US')}
                  className={`p-4 rounded-xl border text-left btn-tactile transition-colors flex items-center justify-between ${
                    language === 'en-US'
                      ? 'border-brand bg-brand-subtle text-brand-text font-medium'
                      : 'border-border-subtle hover:border-border-strong text-text-primary'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">🇺🇸</span>
                    <span>{t('onboarding.lang_en')}</span>
                  </div>
                  {language === 'en-US' && <Check className="w-4 h-4 text-brand" />}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-coin">
                <Coins className="w-5 h-5" />
                <h3 className="text-base font-medium text-text-primary">
                  {t('onboarding.step2_title')}
                </h3>
              </div>
              <p className="text-sm text-text-secondary">
                {t('onboarding.step2_desc')}
              </p>

              <div className="space-y-2 pt-2">
                {currencyOptions.map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setTouchedCurrency(cur)}
                    className={`w-full p-3.5 rounded-xl border text-left btn-tactile transition-colors flex items-center justify-between ${
                      selectedCurrency === cur
                        ? 'border-brand bg-brand-subtle text-brand-text font-medium'
                        : 'border-border-subtle hover:border-border-strong text-text-primary'
                    }`}
                  >
                    <span>
                      {cur === 'BRL' && t('onboarding.curr_brl')}
                      {cur === 'USD' && t('onboarding.curr_usd')}
                      {cur === 'EUR' && t('onboarding.curr_eur')}
                    </span>
                    {selectedCurrency === cur && <Check className="w-4 h-4 text-brand" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand">
                <Heart className="w-5 h-5" />
                <h3 className="text-base font-medium text-text-primary">
                  {t('onboarding.step3_title')}
                </h3>
              </div>
              <p className="text-sm text-text-secondary">
                {t('onboarding.step3_desc')}
              </p>

              <div className="pt-2">
                <label className="block text-xs font-medium text-text-secondary mb-1.5 uppercase tracking-wider">
                  {t('onboarding.pet_nickname_label')}
                </label>
                {/* 16px mobile input floor rule applied via text-base sm:text-sm */}
                <input
                  type="text"
                  value={petNickname}
                  onChange={(e) => setPetNickname(e.target.value)}
                  placeholder={t('onboarding.pet_nickname_placeholder')}
                  className="w-full px-4 py-3 text-base sm:text-sm rounded-xl border border-border-strong bg-surface-canvas text-text-primary focus:outline-none focus:ring-2 focus:ring-brand"
                  maxLength={24}
                />
              </div>

              <div className="p-3 bg-surface-muted rounded-xl flex items-center gap-3">
                <KerooMascot size={96} className="shrink-0" />
                <p className="text-xs text-text-secondary">
                  {t('onboarding.pet_promise', { name: petNickname || 'Keroo' })}
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-brand">
                <Sparkles className="w-5 h-5" />
                <h3 className="text-base font-medium text-text-primary">
                  {t('onboarding.step4_title')}
                </h3>
              </div>
              <p className="text-sm text-text-secondary">
                {t('onboarding.step4_desc')}
              </p>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => setLoadDemo(false)}
                  className={`w-full p-4 rounded-xl border text-left btn-tactile transition-colors ${
                    !loadDemo
                      ? 'border-brand bg-brand-subtle text-brand-text'
                      : 'border-border-subtle hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary">
                      {t('onboarding.mode_clean')}
                    </span>
                    {!loadDemo && <Check className="w-4 h-4 text-brand" />}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {t('onboarding.mode_clean_desc')}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setLoadDemo(true)}
                  className={`w-full p-4 rounded-xl border text-left btn-tactile transition-colors ${
                    loadDemo
                      ? 'border-brand bg-brand-subtle text-brand-text'
                      : 'border-border-subtle hover:border-border-strong'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-text-primary">
                      {t('onboarding.mode_demo')}
                    </span>
                    {loadDemo && <Check className="w-4 h-4 text-brand" />}
                  </div>
                  <p className="text-xs text-text-secondary">
                    {t('onboarding.mode_demo_desc')}
                  </p>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="p-4 border-t border-border-subtle bg-surface-muted/20 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary btn-tactile flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('common.back')}
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep(step + 1)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-brand text-text-inverse hover:bg-brand-hover btn-tactile flex items-center gap-1.5 shadow-sm"
            >
              {t('common.next')}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl text-sm font-medium bg-brand text-text-inverse hover:bg-brand-hover btn-tactile flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? t('common.loading') : t('onboarding.get_started')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
