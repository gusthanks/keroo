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
      it(`renders the approved raster art for pose "${pose}"`, () => {
        const { container, unmount } = render(<KerooMascot pose={pose} size="md" />);
        expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute('data-pose', pose);
        expect(container.querySelector('picture')).not.toBeNull();
        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringMatching(/\/mascot\/(idle\.webp|rest\.png)\?v=/));
        expect(container.querySelector('svg')).toBeNull();
        unmount();
      });
    });

    it('does not compose legacy coin props over the painted illustration', () => {
      const props: MascotCoinProp[] = ['none', 'mouth_clamp', 'flipping', 'hugging', 'polishing', 'swallowing'];
      for (const coinProp of props) {
        const { container, unmount } = render(<KerooMascot coinProp={coinProp} />);
        expect(container.querySelectorAll('img')).toHaveLength(1);
        expect(container.querySelector('img')).toHaveAttribute('src', expect.stringContaining('/mascot/idle.webp?v='));
        expect(container.querySelector('svg, canvas')).toBeNull();
        unmount();
      }
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

    it('supports keyboard activation when the mascot is interactive', () => {
      const onClick = vi.fn();
      render(<KerooMascot onClick={onClick} ariaLabel="Play with Keroo" />);
      const button = screen.getByRole('button', { name: 'Play with Keroo' });
      expect(button).toHaveAttribute('tabindex', '0');
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.keyDown(button, { key: ' ' });
      fireEvent.keyDown(button, { key: 'Escape' });
      expect(onClick).toHaveBeenCalledTimes(2);
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
    it('can be disabled and enabled on the same mounted component', () => {
      const { rerender } = render(<RoamingCompanion enabled mood="calm" />);
      rerender(<RoamingCompanion enabled={false} mood="calm" />);
      expect(screen.queryByTestId('roaming-companion-layer')).not.toBeInTheDocument();
      rerender(<RoamingCompanion enabled mood="calm" />);
      expect(screen.getByTestId('roaming-companion-layer')).toBeInTheDocument();
    });

    it('updates the pose when an external event supplies a new initialPose', () => {
      const { rerender } = render(<RoamingCompanion initialPose="default_sitting" />);
      rerender(<RoamingCompanion initialPose="coin_swallowing" />);
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute('data-pose', 'coin_swallowing');
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute('data-presentation', 'saving');
    });

    it('cycles poses from the keyboard', () => {
      render(<RoamingCompanion mood="calm" />);
      fireEvent.keyDown(screen.getByTestId('roaming-pet-avatar'), { key: 'Enter' });
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute('data-pose', 'cheeky_tongue');
    });

    it('does not treat releasing a drag as a request for a different pose', () => {
      render(<RoamingCompanion mood="calm" />);
      const avatar = screen.getByTestId('roaming-pet-avatar');
      fireEvent.mouseDown(avatar, { button: 0, clientX: 100, clientY: 100 });
      fireEvent.mouseMove(window, { clientX: 160, clientY: 140 });
      fireEvent.mouseUp(window);
      fireEvent.click(avatar);
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute('data-pose', 'default_sitting');
    });

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
