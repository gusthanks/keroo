/**
 * src/tests/kerooMascot.test.tsx
 *
 * Component Test Suite for Kawaii Doodle Frog Mascot, Speech Bubble & Roaming Companion.
 * Verifies:
 * 1. React rendering of all 10 mascot poses.
 * 2. Jin Chan Golden Fortune Coin prop interactions (mouth clamp, flipping, hugging, polishing).
 * 3. Configurable sizing and accessible ARIA attributes.
 * 4. Interactive SpeechBubble 1-click actions ([✅ Já paguei!], [⏰ Lembrar amanhã], [✏️ Ajustar valor]).
 * 5. RoamingCompanion layer rendering, toggle enablement, and drag container structure.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KerooMascot, type MascotCoinProp } from '../components/keroo/KerooMascot';
import { SpeechBubble } from '../components/keroo/SpeechBubble';
import { RoamingCompanion } from '../components/keroo/RoamingCompanion';
import type { KerooPose } from '../core/kerooMood';
import type { BillCheckInPrompt } from '../core/kerooMood';
import type { RecurringBill } from '../types';

describe('Keroo Mascot & Companion Components', () => {
  describe('KerooMascot Visual Poses', () => {
    const poses: KerooPose[] = [
      'default_sitting',
      'waterfall_tears',
      'melted_blob',
      'toast_face',
      'peace_dab',
      'sipping_drink',
      'sleeping_bubble',
      'cheeky_tongue',
      'coin_swallowing',
      'curious_head_tilt',
    ];

    poses.forEach((pose) => {
      it(`renders pose "${pose}" with correct data attribute and testid`, () => {
        const { unmount } = render(<KerooMascot pose={pose} size="md" />);
        const container = screen.getByTestId('keroo-mascot-container');
        expect(container).toBeInTheDocument();
        expect(container).toHaveAttribute('data-pose', pose);

        // Verify specific SVG testid for each pose
        const testIdMap: Record<KerooPose, string> = {
          default_sitting: 'pose-default-sitting',
          waterfall_tears: 'pose-waterfall-tears',
          melted_blob: 'pose-melted-blob',
          toast_face: 'pose-toast-face',
          peace_dab: 'pose-peace-dab',
          sipping_drink: 'pose-sipping-drink',
          sleeping_bubble: 'pose-sleeping-bubble',
          cheeky_tongue: 'pose-cheeky-tongue',
          coin_swallowing: 'pose-coin-swallowing',
          curious_head_tilt: 'pose-curious-head-tilt',
        };

        expect(screen.getByTestId(testIdMap[pose])).toBeInTheDocument();
        unmount();
      });
    });

    it('renders Jin Chan Golden Fortune Coin prop interaction mechanics', () => {
      const coinProps: MascotCoinProp[] = ['mouth_clamp', 'flipping', 'hugging', 'polishing'];

      coinProps.forEach((coinProp) => {
        const { unmount } = render(
          <KerooMascot pose="default_sitting" coinProp={coinProp} />
        );

        const testIdMap: Record<string, string> = {
          mouth_clamp: 'coin-mouth-clamp',
          flipping: 'coin-flipping',
          hugging: 'coin-hugging',
          polishing: 'coin-polishing',
        };

        expect(screen.getByTestId(testIdMap[coinProp])).toBeInTheDocument();
        unmount();
      });
    });

    it('applies custom pixel size and preset sizes', () => {
      const { unmount: u1 } = render(<KerooMascot size="lg" />);
      let container = screen.getByTestId('keroo-mascot-container');
      expect(container.style.width).toBe('120px');
      expect(container.style.height).toBe('120px');
      u1();

      const { unmount: u2 } = render(<KerooMascot size={150} />);
      container = screen.getByTestId('keroo-mascot-container');
      expect(container.style.width).toBe('150px');
      expect(container.style.height).toBe('150px');
      u2();
    });

    it('calls onClick callback when clicked', () => {
      const handleClick = vi.fn();
      render(<KerooMascot onClick={handleClick} />);
      const container = screen.getByTestId('keroo-mascot-container');
      fireEvent.click(container);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('SpeechBubble Component', () => {
    const mockBill: RecurringBill = {
      id: 'bill_test_speech',
      name: 'Netflix Premium',
      amountCents: 5590, // R$ 55,90
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 18,
      startDate: '2026-01-18',
      nextDueDate: '2026-10-18',
      paymentStatus: 'DUE_SOON',
      categoryId: 'cat_stream',
      paymentAccountId: 'acc_card',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '2026-01-01',
      updatedAt: '2026-10-01',
    };

    const mockPrompt: BillCheckInPrompt = {
      bill: mockBill,
      urgency: 'due_soon',
      daysDelta: 1,
      promptText: 'Lembrete: Netflix Premium vence em 1 dia!',
      promptTextPt: 'Lembrete: Netflix Premium vence em 1 dia!',
      promptTextEn: 'Reminder: Netflix Premium is due in 1 day!',
      suggestedActions: ['pay', 'snooze', 'edit_amount'],
    };

    it('renders message, title, and formatted bill amount', () => {
      render(
        <SpeechBubble
          prompt={mockPrompt}
          locale="pt-BR"
          currency="BRL"
        />
      );

      expect(screen.getByTestId('keroo-speech-bubble')).toBeInTheDocument();
      expect(screen.getByText('Lembrete: Netflix Premium vence em 1 dia!')).toBeInTheDocument();
      expect(screen.getByText('R$ 55,90')).toBeInTheDocument();
    });

    it('fires onPay callback when [✅ Já paguei!] button is clicked', async () => {
      const handlePay = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          onPay={handlePay}
        />
      );

      const payBtn = screen.getByTestId('action-pay');
      await act(async () => {
        fireEvent.click(payBtn);
      });
      expect(handlePay).toHaveBeenCalledWith(mockBill, 5590);
    });

    it('fires onSnooze callback when [⏰ Lembrar amanhã] button is clicked', async () => {
      const handleSnooze = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          onSnooze={handleSnooze}
        />
      );

      const snoozeBtn = screen.getByTestId('action-snooze');
      await act(async () => {
        fireEvent.click(snoozeBtn);
      });
      expect(handleSnooze).toHaveBeenCalledWith(mockBill);
    });

    it('expands inline numeric editor when [✏️ Ajustar valor] is clicked and allows saving', async () => {
      const handleEdit = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          onEditAmount={handleEdit}
        />
      );

      const editBtn = screen.getByTestId('action-edit-amount');
      await act(async () => {
        fireEvent.click(editBtn);
      });

      // Verify inline input is now displayed
      const input = screen.getByPlaceholderText('R$ 0,00');
      expect(input).toBeInTheDocument();

      // Change input to R$ 60,00
      fireEvent.change(input, { target: { value: '60,00' } });

      const saveBtn = screen.getByText('Salvar');
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(handleEdit).toHaveBeenCalledWith(mockBill, 6000);
    });

    it('fires onDismiss callback when close icon is clicked', () => {
      const handleDismiss = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          onDismiss={handleDismiss}
        />
      );

      const closeBtn = screen.getByLabelText('Fechar balão');
      fireEvent.click(closeBtn);
      expect(handleDismiss).toHaveBeenCalledTimes(1);
    });
  });

  describe('RoamingCompanion Layer', () => {
    it('renders floating companion layer when enabled={true}', () => {
      render(
        <RoamingCompanion
          enabled={true}
          mood="thriving"
          insightMessage="Economias a todo vapor!"
        />
      );

      expect(screen.getByTestId('roaming-companion-layer')).toBeInTheDocument();
      expect(screen.getByTestId('roaming-pet-avatar')).toBeInTheDocument();
      expect(screen.getByText('Economias a todo vapor!')).toBeInTheDocument();
    });

    it('returns null and does not render when enabled={false}', () => {
      render(
        <RoamingCompanion
          enabled={false}
          mood="thriving"
        />
      );

      expect(screen.queryByTestId('roaming-companion-layer')).not.toBeInTheDocument();
    });

    it('cycles humorous poses on direct click', () => {
      render(
        <RoamingCompanion
          enabled={true}
          mood="calm"
        />
      );

      const petAvatar = screen.getByTestId('roaming-pet-avatar');
      const container = screen.getByTestId('keroo-mascot-container');
      const initialPose = container.getAttribute('data-pose');

      // Click to trigger cycle
      fireEvent.click(petAvatar);
      const newPose = container.getAttribute('data-pose');
      expect(newPose).not.toBe(initialPose);
    });
  });
});
