import React, { useState } from 'react';
import { Sidebar, type ViewId } from './Sidebar';
import { BottomNav } from './BottomNav';
import { Header } from './Header';
import { RoamingCompanion, type RoamingCompanionProps } from '../keroo/RoamingCompanion';
import type { KerooMood, SupportedCurrency, SupportedTheme } from '../../types';
import { useTranslation } from '../../i18n';

export interface AppLayoutProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  mood?: KerooMood;
  currency?: SupportedCurrency;
  petNickname?: string;
  theme?: SupportedTheme;
  onToggleTheme?: () => void;
  onOpenCommandPalette?: () => void;
  onQuickAdd?: () => void;
  roamingPetEnabled?: boolean;
  roamingProps?: Partial<RoamingCompanionProps>;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeView,
  onNavigate,
  title,
  subtitle,
  children,
  mood = 'calm',
  currency = 'BRL',
  petNickname = 'Keroo',
  theme = 'light',
  onToggleTheme,
  onOpenCommandPalette,
  onQuickAdd,
  roamingPetEnabled = true,
  roamingProps,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { language } = useTranslation();

  return (
    <div className="min-h-screen bg-surface-canvas text-text-primary flex flex-row">
      {/* 1. Desktop Fixed Left Sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar
          activeView={activeView}
          onNavigate={onNavigate}
          onQuickAdd={onQuickAdd}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
          petNickname={petNickname}
          theme={theme}
          onToggleTheme={onToggleTheme}
        />
      </div>

      {/* 2. Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={title}
          subtitle={subtitle}
          mood={mood}
          currency={currency}
          petNickname={petNickname}
          theme={theme}
          onToggleTheme={onToggleTheme}
          onOpenCommandPalette={onOpenCommandPalette}
        />

        {/* Scrollable Main Viewport Area */}
        <main
          className="flex-1 px-4 py-6 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full pb-24 md:pb-12"
          id="main-content"
        >
          {children}
        </main>
      </div>

      {/* 3. Mobile Bottom Navigation Bar */}
      <div className="flex md:hidden">
        <BottomNav
          activeView={activeView}
          onNavigate={onNavigate}
          onQuickAdd={onQuickAdd || (() => {})}
        />
      </div>

      {/* 4. Roaming Mascot Companion Overlay Layer */}
      {roamingPetEnabled && (
        <RoamingCompanion
          mood={mood}
          enabled={roamingPetEnabled}
          currency={currency}
          locale={language}
          {...roamingProps}
        />
      )}
    </div>
  );
};
