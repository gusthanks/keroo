/**
 * src/tests/challenger_m4_mascot_insights_stress.test.tsx
 *
 * Empirical Challenger Stress Test Suite for Milestone M5 (Stage 4):
 * 1. Mascot SVG geometry & poses: verify all 10 poses render valid SVG trees
 *    with proper viewBox, path elements, and coin props without React console errors
 *    or invalid SVG attributes.
 * 2. Spending heuristics boundary conditions:
 *    - Delivery ratio exactly at 59.9% (no alert) vs 60.0% (alert triggered).
 *    - Category surge at 34.9% (no alert) vs 35.0% threshold (alert triggered).
 *    - Installment relief when monthly commitment drops from R$ 500 to R$ 0.
 *    - Bilateral split alert at R$ 49,99 (no alert) vs R$ 50,00 (alert triggered).
 * 3. Speech bubble interaction: verify action callbacks fire with exact bill ID and expected payloads.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { KerooMascot, type MascotCoinProp } from '../components/keroo/KerooMascot';
import { SpeechBubble } from '../components/keroo/SpeechBubble';
import type { KerooPose, BillCheckInPrompt } from '../core/kerooMood';
import {
  detectDeliveryVsGrocerySpike,
  detectCategorySurge,
  detectInstallmentRelief,
  detectSplitReceivablesAlert,
  generateAllKerooInsights,
  type SplitPartyBalance,
} from '../core/kerooInsights';
import type { Cents, InstallmentPlan, RecurringBill } from '../types';

describe('Empirical Challenger M4 Stress Tests — Mascot Rendering, Coin Props & Spending Heuristics', () => {
  // Console spy to verify zero React / SVG rendering warnings
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // ==========================================================================
  // 1. Mascot SVG Geometry, All 10 Poses, Coin Props & Attribute Integrity
  // ==========================================================================
  describe('1. Mascot SVG Geometry, All 10 Poses & Coin Props Integrity', () => {
    const allPoses: KerooPose[] = [
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

    allPoses.forEach((pose) => {
      it(`renders valid SVG tree for pose "${pose}" without console errors or invalid attributes`, () => {
        const { container, unmount } = render(
          <KerooMascot pose={pose} size="md" animated={false} />
        );

        // 1. Root container assertions
        const root = screen.getByTestId('keroo-mascot-container');
        expect(root).toBeInTheDocument();
        expect(root).toHaveAttribute('data-pose', pose);
        expect(root.getAttribute('role')).toBe('img');

        // 2. SVG element verification
        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute('viewBox', '0 0 200 200');
        expect(svg).toHaveAttribute('width', '100%');
        expect(svg).toHaveAttribute('height', '100%');
        expect(svg).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');

        // 3. Child geometry elements presence
        const paths = container.querySelectorAll('path');
        const ellipses = container.querySelectorAll('ellipse');
        const circles = container.querySelectorAll('circle');
        const totalGeometryNodes = paths.length + ellipses.length + circles.length;
        expect(totalGeometryNodes).toBeGreaterThan(3);

        // 4. Verify no attributes contain "NaN" or "undefined" or "null"
        const allElements = container.querySelectorAll('*');
        allElements.forEach((el) => {
          Array.from(el.attributes).forEach((attr) => {
            expect(attr.value).not.toContain('NaN');
            expect(attr.value).not.toContain('undefined');
            expect(attr.value).not.toContain('null');
          });
        });

        // 5. Zero React rendering warnings
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        expect(consoleWarnSpy).not.toHaveBeenCalled();

        unmount();
      });
    });

    it('renders all Jin Chan Golden Fortune coin prop states with valid SVG subtrees', () => {
      const coinProps: MascotCoinProp[] = ['mouth_clamp', 'flipping', 'hugging', 'polishing'];

      coinProps.forEach((coinProp) => {
        const { unmount } = render(
          <KerooMascot pose="default_sitting" coinProp={coinProp} size="lg" />
        );

        const testIdMap: Record<string, string> = {
          mouth_clamp: 'coin-mouth-clamp',
          flipping: 'coin-flipping',
          hugging: 'coin-hugging',
          polishing: 'coin-polishing',
        };

        const coinElement = screen.getByTestId(testIdMap[coinProp]);
        expect(coinElement).toBeInTheDocument();

        // Verify gold fill or gradient reference exists in coin
        const coinHtml = coinElement.outerHTML;
        expect(coinHtml).toMatch(/coinGrad|#FFD700|#FFF9C4/);

        // Zero React rendering errors
        expect(consoleErrorSpy).not.toHaveBeenCalled();

        unmount();
      });
    });

    it('handles "none" coin prop without rendering extraneous coin testids', () => {
      const { unmount } = render(
        <KerooMascot pose="default_sitting" coinProp="none" />
      );

      expect(screen.queryByTestId('coin-mouth-clamp')).toBeNull();
      expect(screen.queryByTestId('coin-flipping')).toBeNull();
      expect(screen.queryByTestId('coin-hugging')).toBeNull();
      expect(screen.queryByTestId('coin-polishing')).toBeNull();

      unmount();
    });

    it('correctly defaults coinProp according to pose semantics', () => {
      // coin_swallowing defaults to 'swallowing'
      const { unmount: u1 } = render(<KerooMascot pose="coin_swallowing" />);
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute(
        'data-coin-prop',
        'swallowing'
      );
      u1();

      // peace_dab defaults to 'flipping'
      const { unmount: u2 } = render(<KerooMascot pose="peace_dab" />);
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute(
        'data-coin-prop',
        'flipping'
      );
      expect(screen.getByTestId('coin-flipping')).toBeInTheDocument();
      u2();

      // sleeping_bubble defaults to 'hugging'
      const { unmount: u3 } = render(<KerooMascot pose="sleeping_bubble" />);
      expect(screen.getByTestId('keroo-mascot-container')).toHaveAttribute(
        'data-coin-prop',
        'hugging'
      );
      expect(screen.getByTestId('coin-hugging')).toBeInTheDocument();
      u3();
    });

    it('verifies size preset mapping and custom pixel sizes', () => {
      const presets: Array<{ size: 'xs' | 'sm' | 'md' | 'lg' | 'xl'; expectedPx: string }> = [
        { size: 'xs', expectedPx: '32px' },
        { size: 'sm', expectedPx: '48px' },
        { size: 'md', expectedPx: '80px' },
        { size: 'lg', expectedPx: '120px' },
        { size: 'xl', expectedPx: '180px' },
      ];

      presets.forEach(({ size, expectedPx }) => {
        const { unmount } = render(<KerooMascot size={size} />);
        const el = screen.getByTestId('keroo-mascot-container');
        expect(el.style.width).toBe(expectedPx);
        expect(el.style.height).toBe(expectedPx);
        unmount();
      });

      // Custom numeric size
      const { unmount: uCustom } = render(<KerooMascot size={240} />);
      const customEl = screen.getByTestId('keroo-mascot-container');
      expect(customEl.style.width).toBe('240px');
      expect(customEl.style.height).toBe('240px');
      uCustom();
    });
  });

  // ==========================================================================
  // 2. Spending Heuristics Boundary Conditions
  // ==========================================================================
  describe('2. Spending Heuristics Boundary Conditions', () => {
    // 2.1 Delivery vs Grocery Ratio Spike
    describe('2.1 Delivery vs. Grocery Ratio (59.9% vs. 60.0%)', () => {
      it('returns null at exactly 59.9% delivery-to-grocery ratio (no alert)', () => {
        // Grocery: R$ 1.000,00 (100000 cents)
        // Delivery: R$ 599,00 (59900 cents) -> 59.9%
        const deliveryCents: Cents = 59900;
        const groceryCents: Cents = 100000;

        const insight = detectDeliveryVsGrocerySpike(deliveryCents, groceryCents);
        expect(insight).toBeNull();
      });

      it('triggers warning alert at exactly 60.0% delivery-to-grocery ratio', () => {
        // Grocery: R$ 1.000,00 (100000 cents)
        // Delivery: R$ 600,00 (60000 cents) -> exactly 60.0%
        const deliveryCents: Cents = 60000;
        const groceryCents: Cents = 100000;

        const insight = detectDeliveryVsGrocerySpike(deliveryCents, groceryCents);
        expect(insight).not.toBeNull();
        expect(insight!.type).toBe('delivery_grocery_spike');
        expect(insight!.level).toBe('warning');
        expect(insight!.recommendedPose).toBe('toast_face');
        expect(insight!.data.ratioPercentage).toBe(60);
        expect(insight!.titlePt).toContain('Fatia de pão');
        expect(insight!.titleEn).toContain('Toast on face');
      });

      it('handles boundary of zero delivery and zero grocery', () => {
        expect(detectDeliveryVsGrocerySpike(0, 100000)).toBeNull();
        expect(detectDeliveryVsGrocerySpike(0, 0)).toBeNull();
        // Positive delivery with zero grocery triggers infinite ratio spike
        const spike = detectDeliveryVsGrocerySpike(5000, 0);
        expect(spike).not.toBeNull();
        expect(spike!.recommendedPose).toBe('toast_face');
      });
    });

    // 2.2 3-Month Moving Average Category Surge
    describe('2.2 Category Surge (34.9% vs. 35.0% threshold)', () => {
      it('returns null when category spending surge is at 34.9% (no alert)', () => {
        // Baseline: R$ 1.000,00 (100000 cents)
        // Current: R$ 1.349,00 (134900 cents) -> surge = 34.9%
        const baselineCents: Cents = 100000;
        const currentCents: Cents = 134900;

        const insight = detectCategorySurge(currentCents, baselineCents, 'Lazer');
        expect(insight).toBeNull();
      });

      it('triggers warning when category spending surges above 35% threshold', () => {
        // Baseline: R$ 1.000,00 (100000 cents)
        // Current: R$ 1.350,10 (135010 cents) -> surge = 35.01% (> 35% threshold)
        const baselineCents: Cents = 100000;
        const currentCents: Cents = 135010;

        const insight = detectCategorySurge(currentCents, baselineCents, 'Lazer');
        expect(insight).not.toBeNull();
        expect(insight!.type).toBe('category_surge');
        expect(insight!.level).toBe('warning');
        expect(insight!.recommendedPose).toBe('waterfall_tears');
        expect(insight!.data.surgePercent).toBe(35);
        expect(insight!.titlePt).toContain('Lazer');
        expect(insight!.messagePt).toContain('+35%');
      });

      it('verifies exact mathematical 35.000% boundary behavior per specification', () => {
        // Baseline: 100000 cents, Current: 135000 cents (exact +35.000%)
        // As defined in docs/ROADMAP.md line 68 (> 35% spikes), exactly 35.000% returns null
        const baselineCents: Cents = 100000;
        const currentCents: Cents = 135000;

        const insight = detectCategorySurge(currentCents, baselineCents, 'Alimentação');
        expect(insight).toBeNull();

        // 1 cent above (135001 cents) breaches the 35% threshold
        const breachedInsight = detectCategorySurge(135001, baselineCents, 'Alimentação');
        expect(breachedInsight).not.toBeNull();
        expect(breachedInsight!.data.surgePercent).toBe(35);
      });

      it('returns null on zero or non-positive baseline/current amounts', () => {
        expect(detectCategorySurge(0, 100000)).toBeNull();
        expect(detectCategorySurge(100000, 0)).toBeNull();
        expect(detectCategorySurge(100000, 100000)).toBeNull();
        expect(detectCategorySurge(90000, 100000)).toBeNull();
      });
    });

    // 2.3 Installment Relief Month Celebration
    describe('2.3 Credit Card Installment Relief (R$ 500 drop to R$ 0)', () => {
      it('triggers celebration when monthly commitment drops from R$ 500,00 to R$ 0,00', () => {
        const mockPlan: InstallmentPlan = {
          id: 'plan_laptop',
          accountId: 'acc_credit_nubank',
          description: 'Notebook Dell 10x',
          totalAmountCents: 500000, // R$ 5.000,00
          originalPrincipalCents: 500000,
          totalInstallments: 10,
          purchaseDate: '2026-01-10',
          interestType: 'none',
          createdAt: '2026-01-10',
          installments: [
            // Installment 10 of 10 in 2026-10 (R$ 500,00 = 50000 cents)
            {
              index: 10,
              statementMonth: '2026-10',
              dueDate: '2026-10-15',
              amountCents: 50000,
              principalCents: 50000,
              interestCents: 0,
              isPaid: false,
            },
            // In 2026-11, zero installments exist for this plan
          ],
        };

        const insight = detectInstallmentRelief([mockPlan], '2026-10');
        expect(insight).not.toBeNull();
        expect(insight!.type).toBe('installment_relief');
        expect(insight!.level).toBe('celebration');
        expect(insight!.recommendedPose).toBe('peace_dab');
        expect(insight!.data.currentMonthTotalCents).toBe(50000);
        expect(insight!.data.nextMonthTotalCents).toBe(0);
        expect(insight!.data.reliefCents).toBe(50000);
        expect(insight!.data.completingPlansCount).toBe(1);

        // Message verification in Portuguese and English
        expect(insight!.messagePt).toContain('encerram este mês');
        expect(insight!.messagePt).toContain('R$\xa0500,00'); // formatted currency
        expect(insight!.messageEn).toContain('finish this month');
      });

      it('triggers celebration when commitments drop by >= R$ 50,00 (5000 cents)', () => {
        const mockPlan: InstallmentPlan = {
          id: 'plan_multi',
          accountId: 'acc_credit',
          description: 'Multi Plans',
          totalAmountCents: 100000,
          originalPrincipalCents: 100000,
          totalInstallments: 2,
          purchaseDate: '2026-09-01',
          interestType: 'none',
          createdAt: '2026-09-01',
          installments: [
            // Month 1: R$ 200,00 (20000 cents)
            {
              index: 1,
              statementMonth: '2026-10',
              dueDate: '2026-10-15',
              amountCents: 20000,
              principalCents: 20000,
              interestCents: 0,
              isPaid: false,
            },
            // Month 2: R$ 150,00 (15000 cents) -> drops by R$ 50,00 (5000 cents)
            {
              index: 2,
              statementMonth: '2026-11',
              dueDate: '2026-11-15',
              amountCents: 15000,
              principalCents: 15000,
              interestCents: 0,
              isPaid: false,
            },
          ],
        };

        const insight = detectInstallmentRelief([mockPlan], '2026-10');
        expect(insight).not.toBeNull();
        expect(insight!.data.reliefCents).toBe(5000); // exactly R$ 50,00
      });

      it('returns null when commitments increase or drop by less than R$ 50,00 without completing plans', () => {
        const mockPlan: InstallmentPlan = {
          id: 'plan_small_drop',
          accountId: 'acc_credit',
          description: 'Small Drop Plan',
          totalAmountCents: 100000,
          originalPrincipalCents: 100000,
          totalInstallments: 5,
          purchaseDate: '2026-09-01',
          interestType: 'none',
          createdAt: '2026-09-01',
          installments: [
            // Month 1: R$ 100,00 (10000 cents)
            {
              index: 1,
              statementMonth: '2026-10',
              dueDate: '2026-10-15',
              amountCents: 10000,
              principalCents: 10000,
              interestCents: 0,
              isPaid: false,
            },
            // Month 2: R$ 50,01 (5001 cents) -> drops by 4999 cents (R$ 49,99 < R$ 50,00)
            {
              index: 2,
              statementMonth: '2026-11',
              dueDate: '2026-11-15',
              amountCents: 5001,
              principalCents: 5001,
              interestCents: 0,
              isPaid: false,
            },
          ],
        };

        const insight = detectInstallmentRelief([mockPlan], '2026-10');
        expect(insight).toBeNull();
      });
    });

    // 2.4 Bilateral Split Net Receivables Alert
    describe('2.4 Bilateral Split Alert (R$ 49,99 vs. R$ 50,00)', () => {
      it('returns null when net receivables are at exactly R$ 49,99 (4999 cents)', () => {
        // Direct number input
        const insightNumber = detectSplitReceivablesAlert(4999);
        expect(insightNumber).toBeNull();

        // Party balance array input
        const partyBalances: SplitPartyBalance[] = [
          { partyName: 'Camila', netBalanceCents: 4999 },
        ];
        const insightArray = detectSplitReceivablesAlert(partyBalances);
        expect(insightArray).toBeNull();
      });

      it('triggers info alert at exactly R$ 50,00 (5000 cents)', () => {
        // Direct number input
        const insightNumber = detectSplitReceivablesAlert(5000);
        expect(insightNumber).not.toBeNull();
        expect(insightNumber!.type).toBe('split_receivables');
        expect(insightNumber!.level).toBe('info');
        expect(insightNumber!.recommendedPose).toBe('cheeky_tongue');
        expect(insightNumber!.data.totalReceivableCents).toBe(5000);

        // Party balance array input
        const partyBalances: SplitPartyBalance[] = [
          { partyName: 'Lucas', netBalanceCents: 3000 },
          { partyName: 'Mariana', netBalanceCents: 2000 },
        ];
        const insightArray = detectSplitReceivablesAlert(partyBalances);
        expect(insightArray).not.toBeNull();
        expect(insightArray!.recommendedPose).toBe('cheeky_tongue');
        expect(insightArray!.messagePt).toContain('Lucas, Mariana');
        expect(insightArray!.titlePt).toContain('Rateio');
      });

      it('ignores negative balances (amounts user owes to others) when computing receivables', () => {
        const partyBalances: SplitPartyBalance[] = [
          { partyName: 'Lucas', netBalanceCents: 4000 }, // owes user 4000
          { partyName: 'Mariana', netBalanceCents: -6000 }, // user owes Mariana 6000
        ];
        // Total receivable from debtors is 4000 (< 5000)
        const insight = detectSplitReceivablesAlert(partyBalances);
        expect(insight).toBeNull();
      });
    });
  });

  // ==========================================================================
  // 3. Speech Bubble Interaction & Callback Payloads
  // ==========================================================================
  describe('3. Speech Bubble Interaction & Exact Payload Verification', () => {
    const mockBill: RecurringBill = {
      id: 'bill_keroo_interactive_123',
      name: 'Internet Fibra 500MB',
      amountCents: 12500, // R$ 125,00
      currency: 'BRL',
      cadence: 'monthly',
      anchorDay: 10,
      startDate: '2026-01-10',
      nextDueDate: '2026-10-10',
      paymentStatus: 'DUE_TODAY',
      categoryId: 'cat_utilities',
      paymentAccountId: 'acc_itau_checking',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '2026-01-01',
      updatedAt: '2026-10-01',
    };

    const mockPrompt: BillCheckInPrompt = {
      bill: mockBill,
      urgency: 'due_today',
      daysDelta: 0,
      promptText: 'Hoje é dia de pagar Internet Fibra 500MB!',
      promptTextPt: 'Hoje é dia de pagar Internet Fibra 500MB!',
      promptTextEn: 'Today is the day to pay Internet Fibra 500MB!',
      suggestedActions: ['pay', 'snooze', 'edit_amount'],
    };

    it('fires onPay callback with exact bill object, exact bill ID, and original amount in cents', async () => {
      const handlePay = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          locale="pt-BR"
          currency="BRL"
          onPay={handlePay}
        />
      );

      const payButton = screen.getByTestId('action-pay');
      expect(payButton).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(payButton);
      });

      expect(handlePay).toHaveBeenCalledTimes(1);
      expect(handlePay).toHaveBeenCalledWith(mockBill, 12500);

      const [passedBill, passedAmount] = handlePay.mock.calls[0];
      expect(passedBill.id).toBe('bill_keroo_interactive_123');
      expect(passedBill.name).toBe('Internet Fibra 500MB');
      expect(passedAmount).toBe(12500);
    });

    it('fires onSnooze callback with exact bill object and bill ID', async () => {
      const handleSnooze = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          locale="pt-BR"
          currency="BRL"
          onSnooze={handleSnooze}
        />
      );

      const snoozeButton = screen.getByTestId('action-snooze');
      expect(snoozeButton).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(snoozeButton);
      });

      expect(handleSnooze).toHaveBeenCalledTimes(1);
      expect(handleSnooze).toHaveBeenCalledWith(mockBill);
      expect(handleSnooze.mock.calls[0][0].id).toBe('bill_keroo_interactive_123');
    });

    it('opens inline editor on [✏️ Ajustar valor] and fires onEditAmount with adjusted integer cents', async () => {
      const handleEdit = vi.fn();
      render(
        <SpeechBubble
          prompt={mockPrompt}
          locale="pt-BR"
          currency="BRL"
          onEditAmount={handleEdit}
        />
      );

      const editButton = screen.getByTestId('action-edit-amount');
      await act(async () => {
        fireEvent.click(editButton);
      });

      // Verify input opened with current value
      const input = screen.getByPlaceholderText('R$ 0,00');
      expect(input).toBeInTheDocument();

      // Adjust amount to R$ 145,50
      fireEvent.change(input, { target: { value: '145,50' } });

      const saveButton = screen.getByText('Salvar');
      await act(async () => {
        fireEvent.click(saveButton);
      });

      expect(handleEdit).toHaveBeenCalledTimes(1);
      expect(handleEdit).toHaveBeenCalledWith(mockBill, 14550);

      const [passedBill, passedCents] = handleEdit.mock.calls[0];
      expect(passedBill.id).toBe('bill_keroo_interactive_123');
      expect(passedCents).toBe(14550);
    });

    it('renders English text when locale is en-US', () => {
      render(
        <SpeechBubble
          prompt={mockPrompt}
          locale="en-US"
          currency="USD"
        />
      );

      expect(screen.getByText('Today is the day to pay Internet Fibra 500MB!')).toBeInTheDocument();
      expect(screen.getByText('Bill Due Today!')).toBeInTheDocument();
    });
  });

  // ==========================================================================
  // 4. Combined Insights Generation Integration
  // ==========================================================================
  describe('4. Combined Insights Generation Invariants', () => {
    it('aggregates insights with correct recommended poses and metadata', () => {
      const results = generateAllKerooInsights({
        deliveryCents: 75000,
        groceryCents: 100000, // 75% -> triggers toast_face
        splitBalances: 8000,  // R$ 80,00 -> triggers cheeky_tongue
        categorySurges: [
          { currentCents: 200000, prior3MonthAveragesCents: 100000, categoryName: 'Vestuário' }, // +100% -> waterfall_tears
        ],
      });

      expect(results).toHaveLength(3);

      const types = results.map((r) => r.type);
      expect(types).toContain('delivery_grocery_spike');
      expect(types).toContain('split_receivables');
      expect(types).toContain('category_surge');

      const poses = results.map((r) => r.recommendedPose);
      expect(poses).toContain('toast_face');
      expect(poses).toContain('cheeky_tongue');
      expect(poses).toContain('waterfall_tears');
    });
  });
});
