import { describe, it, expect } from 'vitest';
import {
  split50_50,
  splitEqual,
  splitByPercentages,
  splitByExactAmounts,
  createSplitExpense,
  calculateBilateralNetBalance,
  calculateBilateralSummary,
  createSettlement,
  createFullSettlement,
  calculateAllPartiesBalances,
} from '../core/split';
import type { SplitExpense } from '../types';

describe('Bilateral Split & IOU Ledger Engine (src/core/split.ts)', () => {
  describe('Odd-Cent Payer Absorption Invariant (Invariant 7)', () => {
    it('absorbs odd cent by payer on 1 cent total', () => {
      // 1 cent: payer = ceil(1/2) = 1, counterpart = floor(1/2) = 0
      const shares = split50_50(1, 'USER', 'party_camila');
      expect(shares).toEqual([
        { partyId: 'USER', shareCents: 1, percentage: 50 },
        { partyId: 'party_camila', shareCents: 0, percentage: 50 },
      ]);
      expect(shares[0].shareCents + shares[1].shareCents).toBe(1);
    });

    it('absorbs odd cent by payer on 3 cents total', () => {
      // 3 cents: payer = ceil(3/2) = 2, counterpart = floor(3/2) = 1
      const shares = split50_50(3, 'USER', 'party_camila');
      expect(shares).toEqual([
        { partyId: 'USER', shareCents: 2, percentage: 50 },
        { partyId: 'party_camila', shareCents: 1, percentage: 50 },
      ]);
      expect(shares[0].shareCents + shares[1].shareCents).toBe(3);
    });

    it('absorbs odd cent by payer on 10001 cents (R$ 100,01) total', () => {
      // 10001 cents: payer = ceil(10001/2) = 5001, counterpart = floor(10001/2) = 5000
      const shares = split50_50(10001, 'USER', 'party_camila');
      expect(shares).toEqual([
        { partyId: 'USER', shareCents: 5001, percentage: 50 },
        { partyId: 'party_camila', shareCents: 5000, percentage: 50 },
      ]);
      expect(shares[0].shareCents + shares[1].shareCents).toBe(10001);
    });

    it('splits even cent amounts exactly 50/50', () => {
      // 100 cents (R$ 1,00): 50 and 50
      const shares = split50_50(100, 'USER', 'party_camila');
      expect(shares).toEqual([
        { partyId: 'USER', shareCents: 50, percentage: 50 },
        { partyId: 'party_camila', shareCents: 50, percentage: 50 },
      ]);

      // 240000 cents (R$ 2.400,00): 120000 and 120000
      const rentShares = split50_50(240000, 'USER', 'party_camila');
      expect(rentShares).toEqual([
        { partyId: 'USER', shareCents: 120000, percentage: 50 },
        { partyId: 'party_camila', shareCents: 120000, percentage: 50 },
      ]);
    });

    it('distributes remainder cents starting with payer across P parties in splitEqual', () => {
      // 10 cents across 3 parties: 10 / 3 = 3 remainder 1 -> payer gets 4, others 3
      const shares3 = splitEqual(10, ['party_A', 'party_B', 'party_C'], 'party_B');
      // Payer is party_B -> gets 4 cents
      const shareB = shares3.find((s) => s.partyId === 'party_B');
      const shareA = shares3.find((s) => s.partyId === 'party_A');
      const shareC = shares3.find((s) => s.partyId === 'party_C');

      expect(shareB?.shareCents).toBe(4);
      expect(shareA?.shareCents).toBe(3);
      expect(shareC?.shareCents).toBe(3);

      const sum3 = shares3.reduce((acc, s) => acc + s.shareCents, 0);
      expect(sum3).toBe(10);
    });
  });

  describe('Custom Percentage & Exact Amount Splits', () => {
    it('splits by custom percentages with cent conservation: 70/30 split on R$ 100,00', () => {
      const shares = splitByPercentages(
        10000,
        [
          { partyId: 'USER', percentage: 70 },
          { partyId: 'party_camila', percentage: 30 },
        ],
        'USER'
      );

      expect(shares).toEqual([
        { partyId: 'USER', shareCents: 7000, percentage: 70 },
        { partyId: 'party_camila', shareCents: 3000, percentage: 30 },
      ]);
      expect(shares[0].shareCents + shares[1].shareCents).toBe(10000);
    });

    it('splits by custom percentages with remainder: 60/40 split on R$ 33,33 (3333 cents)', () => {
      // 3333 * 0.6 = 1999.8 -> base 1999, fraction 0.8 -> gets +1 cent -> 2000
      // 3333 * 0.4 = 1333.2 -> base 1333, fraction 0.2 -> 1333
      const shares = splitByPercentages(
        3333,
        [
          { partyId: 'USER', percentage: 60 },
          { partyId: 'party_camila', percentage: 40 },
        ],
        'USER'
      );

      expect(shares.find((s) => s.partyId === 'USER')?.shareCents).toBe(2000);
      expect(shares.find((s) => s.partyId === 'party_camila')?.shareCents).toBe(1333);
      const sum = shares.reduce((a, b) => a + b.shareCents, 0);
      expect(sum).toBe(3333);
    });

    it('validates exact amounts split ensuring sum equals totalAmountCents', () => {
      const valid = splitByExactAmounts(5000, [
        { partyId: 'USER', shareCents: 3200 },
        { partyId: 'party_camila', shareCents: 1800 },
      ]);
      expect(valid).toHaveLength(2);

      // Throws on sum mismatch
      expect(() =>
        splitByExactAmounts(5000, [
          { partyId: 'USER', shareCents: 3000 },
          { partyId: 'party_camila', shareCents: 1500 }, // sum 4500 !== 5000
        ])
      ).toThrow(RangeError);
    });
  });

  describe('Split Expense Factory', () => {
    it('creates a validated SplitExpense with 50/50 bilateral method', () => {
      const exp = createSplitExpense({
        description: 'Supermarket weekly run',
        totalAmountCents: 25001, // odd amount
        date: '2026-10-16',
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        counterpartPartyId: 'party_camila',
      });

      expect(exp.totalAmountCents).toBe(25001);
      expect(exp.paidByPartyId).toBe('USER');
      expect(exp.shares).toHaveLength(2);
      expect(exp.shares[0]).toEqual({ partyId: 'USER', shareCents: 12501, percentage: 50 });
      expect(exp.shares[1]).toEqual({ partyId: 'party_camila', shareCents: 12500, percentage: 50 });
    });
  });

  describe('Bilateral Netting Invariance & Continuous Offsetting', () => {
    it('satisfies zero-sum anti-symmetry: netBalance(A, B) === -netBalance(B, A)', () => {
      const exp1: SplitExpense = {
        id: 'e1',
        description: 'Dinner',
        totalAmountCents: 20000,
        currency: 'BRL',
        date: '2026-10-10',
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        shares: [
          { partyId: 'USER', shareCents: 10000 },
          { partyId: 'party_camila', shareCents: 10000 },
        ],
        createdAt: '',
      };

      const exp2: SplitExpense = {
        id: 'e2',
        description: 'Groceries',
        totalAmountCents: 6000,
        currency: 'BRL',
        date: '2026-10-12',
        paidByPartyId: 'party_camila',
        splitMethod: 'equal_50_50',
        shares: [
          { partyId: 'USER', shareCents: 3000 },
          { partyId: 'party_camila', shareCents: 3000 },
        ],
        createdAt: '',
      };

      // USER paid 20000 (Camila owes 10000)
      // Camila paid 6000 (USER owes 3000)
      // Net for USER: +10000 - 3000 = +7000 (Camila owes USER R$ 70,00)
      const balanceUser = calculateBilateralNetBalance([exp1, exp2], [], 'USER', 'party_camila');
      const balanceCamila = calculateBilateralNetBalance([exp1, exp2], [], 'party_camila', 'USER');

      expect(balanceUser).toBe(7000);
      expect(balanceCamila).toBe(-7000);
      expect(balanceUser).toBe(-balanceCamila);
    });

    it('offsets mutual expenses and settlements continuously', () => {
      // USER pays electricity: R$ 300,00 -> Camila owes 15000
      const exp1 = createSplitExpense({
        description: 'Electricity bill',
        totalAmountCents: 30000,
        date: '2026-10-01',
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        counterpartPartyId: 'party_camila',
      });

      // Camila pays water: R$ 100,00 -> USER owes 5000
      const exp2 = createSplitExpense({
        description: 'Water bill',
        totalAmountCents: 10000,
        date: '2026-10-05',
        paidByPartyId: 'party_camila',
        splitMethod: 'equal_50_50',
        counterpartPartyId: 'USER',
      });

      // Net balance before settlement: 15000 - 5000 = 10000 (Camila owes USER R$ 100,00)
      let net = calculateBilateralNetBalance([exp1, exp2], [], 'USER', 'party_camila');
      expect(net).toBe(10000);

      // Camila sends partial PIX of R$ 60,00 (6000 cents) to USER
      const partialSettlement = createSettlement('party_camila', 'USER', 6000, '2026-10-08', 'Partial PIX');

      // Net balance after partial settlement: 10000 - 6000 = 4000 (Camila still owes 4000 cents)
      net = calculateBilateralNetBalance([exp1, exp2], [partialSettlement], 'USER', 'party_camila');
      expect(net).toBe(4000);

      // Provide detailed summary
      const summary = calculateBilateralSummary(
        [exp1, exp2],
        [partialSettlement],
        'USER',
        'party_camila'
      );
      expect(summary.netBalanceCents).toBe(4000);
      expect(summary.aPaidForBCents).toBe(15000);
      expect(summary.bPaidForACents).toBe(5000);
      expect(summary.bSettledToACents).toBe(6000);
      expect(summary.aSettledToBCents).toBe(0);
      expect(summary.direction).toBe('B_OWES_A');
      expect(summary.settlementAmountCents).toBe(4000);
    });

    it('reconciles net balance exactly to R$ 0,00 via createFullSettlement', () => {
      const exp1 = createSplitExpense({
        description: 'Rent & Condo',
        totalAmountCents: 240000,
        date: '2026-10-01',
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        counterpartPartyId: 'party_camila',
      });

      // Camila owes USER 120000 cents
      const initialBalance = calculateBilateralNetBalance([exp1], [], 'USER', 'party_camila');
      expect(initialBalance).toBe(120000);

      // Generate full settlement
      const fullSettlement = createFullSettlement([exp1], [], 'USER', 'party_camila', '2026-10-16', 'PIX Quitação Total');
      expect(fullSettlement).not.toBeNull();
      expect(fullSettlement?.fromPartyId).toBe('party_camila');
      expect(fullSettlement?.toPartyId).toBe('USER');
      expect(fullSettlement?.amountCents).toBe(120000);

      // Adding the full settlement to the ledger nets balance to 0
      const reconciledBalance = calculateBilateralNetBalance(
        [exp1],
        [fullSettlement!],
        'USER',
        'party_camila'
      );
      expect(reconciledBalance).toBe(0);

      // Calling createFullSettlement when already settled returns null
      const noOpSettlement = createFullSettlement(
        [exp1],
        [fullSettlement!],
        'USER',
        'party_camila',
        '2026-10-16'
      );
      expect(noOpSettlement).toBeNull();
    });

    it('computes portfolio balances against multiple parties accurately', () => {
      // USER paid for Camila (Camila owes 5000)
      const expCamila = createSplitExpense({
        description: 'Groceries with Camila',
        totalAmountCents: 10000,
        date: '2026-10-01',
        paidByPartyId: 'USER',
        splitMethod: 'equal_50_50',
        counterpartPartyId: 'party_camila',
      });

      // Lucas paid for USER (USER owes Lucas 4000)
      const expLucas = createSplitExpense({
        description: 'Pizza with Lucas',
        totalAmountCents: 8000,
        date: '2026-10-05',
        paidByPartyId: 'party_lucas',
        splitMethod: 'equal_50_50',
        counterpartPartyId: 'USER',
      });

      const balances = calculateAllPartiesBalances([expCamila, expLucas], [], 'USER');

      expect(balances.get('party_camila')).toBe(5000); // Camila owes USER 5000
      expect(balances.get('party_lucas')).toBe(-4000); // USER owes Lucas 4000
    });
  });
  describe('Regression: party and percentage validation', () => {
    const base = {
      description: 'Pizza',
      totalAmountCents: 5001,
      date: '2026-10-16',
      paidByPartyId: 'USER',
      splitMethod: 'equal_50_50' as const,
    };

    it('rejects payer === counterpart', () => {
      expect(() => split50_50(1000, 'USER', 'USER')).toThrow(RangeError);
      expect(() => createSplitExpense({ ...base, counterpartPartyId: 'USER' })).toThrow(RangeError);
    });

    it('partyIds must be exactly payer + one other distinct party', () => {
      const ok = createSplitExpense({ ...base, partyIds: ['party_camila', 'USER'] });
      expect(ok.shares.map((s) => s.partyId)).toEqual(['USER', 'party_camila']);
      expect(ok.shares[0].shareCents + ok.shares[1].shareCents).toBe(5001);

      expect(() => createSplitExpense({ ...base, partyIds: ['a', 'b'] })).toThrow(RangeError);
      expect(() => createSplitExpense({ ...base, partyIds: ['USER', 'USER'] })).toThrow(RangeError);
      expect(() => createSplitExpense({ ...base, partyIds: ['USER', 'a', 'b'] })).toThrow(RangeError);
      expect(() => createSplitExpense({ ...base, partyIds: ['USER'] })).toThrow(RangeError);
    });

    it('splitByPercentages rejects non-finite or out-of-range percentages', () => {
      expect(() => splitByPercentages(1000, [{ partyId: 'a', percentage: 150 }, { partyId: 'b', percentage: -50 }])).toThrow(RangeError);
      expect(() => splitByPercentages(1000, [{ partyId: 'a', percentage: NaN }, { partyId: 'b', percentage: 100 }])).toThrow(RangeError);
      expect(() => splitByPercentages(1000, [{ partyId: 'a', percentage: Infinity }])).toThrow(RangeError);
    });
  });
});
