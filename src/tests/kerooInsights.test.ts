/**
 * src/tests/kerooInsights.test.ts
 *
 * Comprehensive Test Suite for Statistical Spending Heuristics Engine.
 * Verifies:
 * 1. Delivery vs. Grocery Ratio Spike Heuristic (>= 60%).
 * 2. 3-Month Moving Average Category Surge Heuristic (> 35%).
 * 3. Credit Card Installment Relief Month Celebration.
 * 4. Annualized Subscription Cost Summary.
 * 5. Bilateral Split Net Receivables Alert (>= R$ 50,00).
 * 6. Combined insights generation.
 */

import { describe, it, expect } from 'vitest';
import {
  detectDeliveryVsGrocerySpike,
  detectCategorySurge,
  detectInstallmentRelief,
  calculateAnnualizedSubscriptionsImpact,
  detectSplitReceivablesAlert,
  generateAllKerooInsights,
} from '../core/kerooInsights';
import type { InstallmentPlan, RecurringBill } from '../types';

describe('Statistical Spending Heuristics (Keroo Insights)', () => {
  describe('1. Delivery vs. Grocery Ratio Spike Heuristic', () => {
    it('triggers warning when delivery is >= 60% of grocery spending', () => {
      // Delivery = R$ 600,00 (60000 cents), Grocery = R$ 1.000,00 (100000 cents) -> ratio 60%
      const insight = detectDeliveryVsGrocerySpike(60000, 100000);
      expect(insight).not.toBeNull();
      expect(insight!.type).toBe('delivery_grocery_spike');
      expect(insight!.level).toBe('warning');
      expect(insight!.recommendedPose).toBe('toast_face');
      expect(insight!.titlePt).toContain('Fatia de pão');
      expect(insight!.data.ratioPercentage).toBe(60);
    });

    it('returns null when delivery is strictly below 60% of grocery spending', () => {
      // Delivery = R$ 590,00 (59000 cents), Grocery = R$ 1.000,00 (100000 cents) -> ratio 59%
      const insight = detectDeliveryVsGrocerySpike(59000, 100000);
      expect(insight).toBeNull();
    });

    it('returns null when delivery spending is zero', () => {
      const insight = detectDeliveryVsGrocerySpike(0, 50000);
      expect(insight).toBeNull();
    });

    it('triggers warning when grocery is zero but delivery spending exists', () => {
      const insight = detectDeliveryVsGrocerySpike(15000, 0);
      expect(insight).not.toBeNull();
      expect(insight!.recommendedPose).toBe('toast_face');
    });

    it('returns null when both delivery and grocery spending are zero', () => {
      const insight = detectDeliveryVsGrocerySpike(0, 0);
      expect(insight).toBeNull();
    });
  });

  describe('2. 3-Month Moving Average Category Surge Heuristic', () => {
    it('triggers warning when current spending surges > 35% above historical baseline', () => {
      // Baseline = R$ 1.000,00 (100000 cents), Current = R$ 1.360,00 (136000 cents) -> +36%
      const insight = detectCategorySurge(136000, 100000, 'Restaurantes');
      expect(insight).not.toBeNull();
      expect(insight!.type).toBe('category_surge');
      expect(insight!.level).toBe('warning');
      expect(insight!.recommendedPose).toBe('waterfall_tears');
      expect(insight!.titlePt).toContain('Restaurantes');
      expect(insight!.data.surgePercent).toBe(36);
    });

    it('returns null when spending increase is <= 35%', () => {
      // Baseline = R$ 1.000,00 (100000 cents), Current = R$ 1.350,00 (135000 cents) -> +35% (not > 35%)
      const insight = detectCategorySurge(135000, 100000, 'Restaurantes');
      expect(insight).toBeNull();
    });

    it('returns null when spending is below or equal to baseline', () => {
      expect(detectCategorySurge(90000, 100000)).toBeNull();
      expect(detectCategorySurge(100000, 100000)).toBeNull();
    });

    it('returns null on zero inputs', () => {
      expect(detectCategorySurge(0, 50000)).toBeNull();
      expect(detectCategorySurge(50000, 0)).toBeNull();
    });
  });

  describe('3. Credit Card Installment Relief Month Celebration', () => {
    const mockPlans: InstallmentPlan[] = [
      {
        id: 'plan_iphone',
        accountId: 'acc_cc',
        description: 'iPhone 12x',
        totalAmountCents: 600000,
        originalPrincipalCents: 600000,
        totalInstallments: 3,
        purchaseDate: '2026-08-01',
        interestType: 'none',
        createdAt: '2026-08-01',
        installments: [
          {
            index: 1,
            statementMonth: '2026-08',
            dueDate: '2026-08-10',
            amountCents: 200000,
            principalCents: 200000,
            interestCents: 0,
            isPaid: true,
          },
          {
            index: 2,
            statementMonth: '2026-09',
            dueDate: '2026-09-10',
            amountCents: 200000,
            principalCents: 200000,
            interestCents: 0,
            isPaid: true,
          },
          {
            index: 3,
            statementMonth: '2026-10', // Final installment concludes in 2026-10!
            dueDate: '2026-10-10',
            amountCents: 200000,
            principalCents: 200000,
            interestCents: 0,
            isPaid: false,
          },
        ],
      },
    ];

    it('detects installment completion and debt drop in the upcoming month', () => {
      // In 2026-10, current is 200000 (R$ 2.000,00). Next month 2026-11 is 0 -> relief of R$ 2.000,00!
      const insight = detectInstallmentRelief(mockPlans, '2026-10');
      expect(insight).not.toBeNull();
      expect(insight!.type).toBe('installment_relief');
      expect(insight!.level).toBe('celebration');
      expect(insight!.recommendedPose).toBe('peace_dab');
      expect(insight!.messagePt).toContain('encerram este mês');
    });

    it('returns null when monthly obligations increase next month', () => {
      const increasingPlans: InstallmentPlan[] = [
        {
          id: 'plan_new',
          accountId: 'acc_cc',
          description: 'Notebook',
          totalAmountCents: 300000,
          originalPrincipalCents: 300000,
          totalInstallments: 3,
          purchaseDate: '2026-10-15',
          interestType: 'none',
          createdAt: '2026-10-15',
          installments: [
            // No installments in 2026-10
            {
              index: 1,
              statementMonth: '2026-11',
              dueDate: '2026-11-10',
              amountCents: 100000,
              principalCents: 100000,
              interestCents: 0,
              isPaid: false,
            },
          ],
        },
      ];

      const insight = detectInstallmentRelief(increasingPlans, '2026-10');
      expect(insight).toBeNull();
    });

    it('returns null on empty plans list', () => {
      expect(detectInstallmentRelief([], '2026-10')).toBeNull();
    });
  });

  describe('4. Annualized Subscription Cost Summary', () => {
    const mockBills: RecurringBill[] = [
      {
        id: 'bill_spotify',
        name: 'Spotify',
        amountCents: 3500, // R$ 35,00 / month -> 42000 / year
        currency: 'BRL',
        cadence: 'monthly',
        anchorDay: 1,
        startDate: '2026-01-01',
        nextDueDate: '2026-11-01',
        paymentStatus: 'UPCOMING_SAFE',
        categoryId: 'cat_entertainment',
        paymentAccountId: 'acc_nu',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'bill_amazon',
        name: 'Amazon Prime',
        amountCents: 19900, // R$ 199,00 / year -> 19900 / year
        currency: 'BRL',
        cadence: 'annually',
        anchorDay: 15,
        startDate: '2026-03-15',
        nextDueDate: '2027-03-15',
        paymentStatus: 'UPCOMING_SAFE',
        categoryId: 'cat_entertainment',
        paymentAccountId: 'acc_nu',
        isActive: true,
        autoRenew: true,
        reminderDaysBefore: 3,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    it('accurately calculates annualized impact and normalized monthly equivalent', () => {
      // Spotify: 3500 * 12 = 42000
      // Amazon Prime: 19900 * 1 = 19900
      // Total annual: 61900 cents (R$ 619,00)
      const insight = calculateAnnualizedSubscriptionsImpact(mockBills);
      expect(insight).toBeDefined();
      expect(insight.type).toBe('annualized_subscriptions');
      expect(insight.level).toBe('info');
      expect(insight.data.totalAnnualCents).toBe(61900);
      expect(insight.data.activeCount).toBe(2);
      expect(insight.recommendedPose).toBe('curious_head_tilt');
    });

    it('safely handles empty bill collections', () => {
      const insight = calculateAnnualizedSubscriptionsImpact([]);
      expect(insight.data.totalAnnualCents).toBe(0);
      expect(insight.data.activeCount).toBe(0);
    });
  });

  describe('5. Bilateral Split Net Receivables Alert', () => {
    it('triggers alert when net receivables are >= R$ 50,00 (5000 cents)', () => {
      const insight = detectSplitReceivablesAlert(6500); // R$ 65,00
      expect(insight).not.toBeNull();
      expect(insight!.type).toBe('split_receivables');
      expect(insight!.level).toBe('info');
      expect(insight!.recommendedPose).toBe('cheeky_tongue');
      expect(insight!.data.totalReceivableCents).toBe(6500);
    });

    it('triggers alert with debtor names when passed an array of balances', () => {
      const balances = [
        { partyName: 'Lucas Roommate', netBalanceCents: 4000 },
        { partyName: 'Camila', netBalanceCents: 2500 },
      ];
      // Total = 6500 cents >= 5000
      const insight = detectSplitReceivablesAlert(balances);
      expect(insight).not.toBeNull();
      expect(insight!.messagePt).toContain('Lucas Roommate, Camila');
      expect(insight!.data.totalReceivableCents).toBe(6500);
    });

    it('returns null when net receivables are strictly below R$ 50,00', () => {
      expect(detectSplitReceivablesAlert(4900)).toBeNull();
      expect(
        detectSplitReceivablesAlert([{ partyName: 'Lucas', netBalanceCents: 3000 }])
      ).toBeNull();
    });

    it('returns null when net balance is zero or negative (user is debtor)', () => {
      expect(detectSplitReceivablesAlert(0)).toBeNull();
      expect(detectSplitReceivablesAlert(-8000)).toBeNull();
    });
  });

  describe('6. generateAllKerooInsights', () => {
    it('collects all triggered insights in a single batch', () => {
      const insights = generateAllKerooInsights({
        deliveryCents: 70000,
        groceryCents: 100000,
        categorySurges: [
          { currentCents: 150000, prior3MonthAveragesCents: 100000, categoryName: 'Lazer' },
        ],
        splitBalances: 8000,
      });

      expect(insights.length).toBe(3);
      const types = insights.map((i) => i.type);
      expect(types).toContain('delivery_grocery_spike');
      expect(types).toContain('category_surge');
      expect(types).toContain('split_receivables');
    });
  });
  describe('7. Regression: currency follows the user, ids are deterministic', () => {
    it('formats both languages with the injected currency (no hardcoded BRL/USD)', () => {
      const usd = detectDeliveryVsGrocerySpike(60000, 100000, 'USD')!;
      expect(usd.messagePt).toContain('US$');
      expect(usd.messageEn).toContain('$600.00');

      const brl = detectDeliveryVsGrocerySpike(60000, 100000, 'BRL')!;
      expect(brl.messagePt).toContain('R$');
      expect(brl.messageEn).toContain('R$');
      expect(brl.messageEn).not.toMatch(/(^|[^R])\$600/);

      // No currency passed: the locale-neutral default is USD.
      const fallback = detectDeliveryVsGrocerySpike(60000, 100000)!;
      expect(fallback.messageEn).toContain('$600.00');
      expect(fallback.messagePt).not.toContain('R$');
    });

    it('generates unique, stable ids for multiple category surges and injects createdAt', () => {
      const params = {
        categorySurges: [
          { currentCents: 200000, prior3MonthAveragesCents: 100000, categoryName: 'Mercado' },
          { currentCents: 200000, prior3MonthAveragesCents: 100000, categoryName: 'Transporte' },
        ],
        currentYearMonth: '2026-10',
        currency: 'EUR' as const,
        now: 1_700_000_000_000,
      };
      const a = generateAllKerooInsights(params);
      const b = generateAllKerooInsights(params);
      const ids = a.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(b.map((i) => i.id));
      expect(ids).toContain('insight_category_surge_mercado_2026-10');
      expect(a.every((i) => i.createdAt === 1_700_000_000_000)).toBe(true);
      expect(a[0].messageEn).toContain('€');
    });
  });

  describe('8. Regression: dashboard insights honour the user currency', () => {
    // Same call shape DashboardView uses: installment plans + recurring bills + currency.
    const plan: InstallmentPlan = {
      id: 'plan_tv',
      accountId: 'acc_cc',
      description: 'TV 2x',
      totalAmountCents: 100001,
      originalPrincipalCents: 100001,
      totalInstallments: 2,
      purchaseDate: '2026-09-01',
      interestType: 'none',
      createdAt: '2026-09-01',
      installments: [
        {
          index: 1,
          statementMonth: '2026-09',
          dueDate: '2026-09-10',
          amountCents: 50001, // remainder cent on the 1st installment
          principalCents: 50001,
          interestCents: 0,
          isPaid: true,
        },
        {
          index: 2,
          statementMonth: '2026-10', // last installment -> relief next month
          dueDate: '2026-10-10',
          amountCents: 50000,
          principalCents: 50000,
          interestCents: 0,
          isPaid: false,
        },
      ],
    };

    const bill: RecurringBill = {
      id: 'bill_netflix',
      name: 'Netflix',
      amountCents: 1599,
      currency: 'USD',
      cadence: 'monthly',
      anchorDay: 5,
      startDate: '2026-01-05',
      nextDueDate: '2026-11-05',
      paymentStatus: 'UPCOMING_SAFE',
      categoryId: 'cat_entertainment',
      paymentAccountId: 'acc_chase',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };

    it('formats every money-bearing insight with $ and never R$ when currency is USD', () => {
      const insights = generateAllKerooInsights({
        installmentPlans: [plan],
        currentYearMonth: '2026-10',
        bills: [bill],
        currency: 'USD',
      });

      const types = insights.map((i) => i.type);
      expect(types).toContain('installment_relief');
      expect(types).toContain('annualized_subscriptions');

      const texts = insights.flatMap((i) => [
        i.title,
        i.titlePt,
        i.titleEn,
        i.message,
        i.messagePt,
        i.messageEn,
      ]);
      expect(texts.some((text) => text.includes('$'))).toBe(true);
      expect(texts.some((text) => text.includes('R$'))).toBe(false);

      // 1599 * 12 = 19188 cents -> $191.88 in the English copy
      const annual = insights.find((i) => i.type === 'annualized_subscriptions')!;
      expect(annual.messageEn).toContain('$191.88');
    });
  });
});
