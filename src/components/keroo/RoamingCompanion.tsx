/**
 * src/components/keroo/RoamingCompanion.tsx
 *
 * "Pet que passeia pelo app" — Roaming Companion Layer.
 *
 * Features (docs/ARCHITECTURE.md Section 4.4 & DESIGN_SYSTEM.md Section 6.4):
 * - Animated floating companion layer with card perching & screen hopping.
 * - Interactive drag-and-drop physics with smooth spring docking to viewport edges/cards.
 * - Persistent toggle support via `roamingPetEnabled` setting.
 * - Interactive speech bubble check-ins & click-to-pose reactions.
 * - Performance & battery isolation suspending animations on background tabs.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Cents, RecurringBill, SupportedCurrency, SupportedLocale } from '../../types';
import type { KerooMood, KerooPose } from '../../core/kerooMood';
import type { BillCheckInPrompt } from '../../core/kerooMood';
import { KerooMascot } from './KerooMascot';
import { SpeechBubble } from './SpeechBubble';
import { translate } from '../../i18n';

export interface RoamingCompanionProps {
  mood?: KerooMood;
  initialPose?: KerooPose;
  checkInPrompt?: BillCheckInPrompt | null;
  insightMessage?: string;
  enabled?: boolean; // Controlled via user_settings.roamingPetEnabled
  locale?: SupportedLocale;
  currency?: SupportedCurrency;
  onPayBill?: (bill: RecurringBill, amountCents?: Cents) => void | Promise<void>;
  onSnoozeBill?: (bill: RecurringBill) => void | Promise<void>;
  onEditAmountBill?: (bill: RecurringBill, newAmountCents: Cents) => void | Promise<void>;
  onToggleEnabled?: (enabled: boolean) => void;
  className?: string;
}

export const RoamingCompanion: React.FC<RoamingCompanionProps> = ({
  mood = 'calm',
  initialPose,
  checkInPrompt,
  insightMessage,
  enabled = true,
  locale = 'en-US',
  currency = 'BRL',
  onPayBill,
  onSnoozeBill,
  onEditAmountBill,
  onToggleEnabled,
  className = '',
}) => {
  // Derive initial pose from mood if not provided
  const getPoseForMood = (m: KerooMood): KerooPose => {
    switch (m) {
      case 'thriving':
        return 'peace_dab';
      case 'sweating':
        return 'waterfall_tears';
      case 'sleepy':
        return 'sleeping_bubble';
      case 'alert':
        return 'curious_head_tilt';
      case 'calm':
      default:
        return 'default_sitting';
    }
  };

  const [currentPose, setCurrentPose] = useState<KerooPose>(
    initialPose || getPoseForMood(mood)
  );
  const [showSpeech, setShowSpeech] = useState<boolean>(true);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPageVisible, setIsPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const dragMovedRef = useRef(false);

  // Position state (bottom-right dock by default)
  const [position, setPosition] = useState<{ x: number; y: number }>({
    x: typeof window !== 'undefined' ? window.innerWidth - 130 : 500,
    y: typeof window !== 'undefined' ? window.innerHeight - 150 : 500,
  });

  const dragStartRef = useRef<{ startX: number; startY: number; petX: number; petY: number }>({
    startX: 0,
    startY: 0,
    petX: 0,
    petY: 0,
  });

  const petRef = useRef<HTMLDivElement>(null);

  // Synchronize pose when external mood changes
  useEffect(() => {
    setCurrentPose(initialPose || getPoseForMood(mood));
  }, [mood, initialPose]);

  // Adjust position on window resize to keep within bounds
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = Math.max(20, window.innerWidth - 110);
        const maxY = Math.max(20, window.innerHeight - 110);
        return {
          x: Math.min(Math.max(20, prev.x), maxX),
          y: Math.min(Math.max(20, prev.y), maxY),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Performance isolation: listen to visibilitychange
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Drag interaction
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only drag with left mouse button
    if (e.button !== 0) return;
    dragMovedRef.current = false;
    setIsDragging(true);
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      petX: position.x,
      petY: position.y,
    };
  }, [position]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragMovedRef.current = false;
      setIsDragging(true);
      dragStartRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        petX: position.x,
        petY: position.y,
      };
    }
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.startX;
      const dy = e.clientY - dragStartRef.current.startY;
      if (Math.hypot(dx, dy) > 5) dragMovedRef.current = true;
      const newX = dragStartRef.current.petX + dx;
      const newY = dragStartRef.current.petY + dy;

      setPosition({
        x: Math.min(Math.max(10, newX), window.innerWidth - 100),
        y: Math.min(Math.max(10, newY), window.innerHeight - 100),
      });
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        const dx = e.touches[0].clientX - dragStartRef.current.startX;
        const dy = e.touches[0].clientY - dragStartRef.current.startY;
        if (Math.hypot(dx, dy) > 5) dragMovedRef.current = true;
        const newX = dragStartRef.current.petX + dx;
        const newY = dragStartRef.current.petY + dy;

        setPosition({
          x: Math.min(Math.max(10, newX), window.innerWidth - 100),
          y: Math.min(Math.max(10, newY), window.innerHeight - 100),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      // Spring docking to nearest edge or card border
      setPosition((prev) => {
        const screenW = window.innerWidth;
        const screenH = window.innerHeight;
        // Snap to right edge if in right half, else left edge
        const snapX = prev.x > screenW / 2 ? screenW - 120 : 24;
        const clampedY = Math.min(Math.max(60, prev.y), screenH - 120);
        return { x: snapX, y: clampedY };
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging]);

  // Click mascot to cycle funny poses or trigger cheeky tongue
  const handlePetClick = () => {
    if (isDragging || dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }

    const funnyPoses: KerooPose[] = [
      'cheeky_tongue',
      'peace_dab',
      'toast_face',
      'sipping_drink',
      'coin_swallowing',
      'sleeping_bubble',
      'default_sitting',
    ];

    const nextIndex = (funnyPoses.indexOf(currentPose) + 1) % funnyPoses.length;
    setCurrentPose(funnyPoses[nextIndex]);


    // Ensure speech bubble is visible on tap
    setShowSpeech(true);
  };

  const isNearRightEdge = position.x > (typeof window !== 'undefined' ? window.innerWidth / 2 : 300);

  if (!enabled) return null;

  return (
    <aside
      aria-label={translate(locale, 'pet.roaming_aria')}
      data-testid="roaming-companion-layer"
      className={`fixed z-50 group select-none pointer-events-auto transition-transform ${
        isDragging ? 'cursor-grabbing duration-0' : 'cursor-grab duration-300'
      } ${className}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate3d(0, 0, 0)',
      }}
      ref={petRef}
    >
      {/* Speech bubble positioned intelligently based on edge proximity */}
      {showSpeech && (checkInPrompt || insightMessage) && (
        <div
          className={`absolute bottom-full mb-3 ${
            isNearRightEdge ? 'right-0' : 'left-0'
          }`}
          style={{ width: '280px' }}
        >
          <SpeechBubble
            prompt={checkInPrompt}
            message={insightMessage}
            locale={locale}
            currency={currency}
            onPay={onPayBill}
            onSnooze={onSnoozeBill}
            onEditAmount={onEditAmountBill}
            onDismiss={() => setShowSpeech(false)}
            tailPosition={isNearRightEdge ? 'bottom' : 'bottom'}
          />
        </div>
      )}

      {/* The Draggable Kawaii Frog Mascot */}
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handlePetClick}
        role="button"
        tabIndex={0}
        aria-label={translate(locale, 'pet.play')}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handlePetClick();
          }
        }}
        className="relative p-1 rounded-xl touch-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
        data-testid="roaming-pet-avatar"
      >
        <KerooMascot
          pose={currentPose}
          size={84}
          animated={!isDragging && isPageVisible}
        />
      </div>

        {/* Hover drag hint pill */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-900/80 text-white text-[10px] whitespace-nowrap shadow-sm">
          <span>{translate(locale, 'pet.drag_me')}</span>
          {onToggleEnabled && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleEnabled(false);
              }}
              className="ml-1 text-neutral-400 hover:text-white pointer-events-auto"
              title={translate(locale, 'pet.disable_roaming')}
            >
              ✕
            </button>
          )}
        </div>
    </aside>
  );
};
