/**
 * src/core/split.ts
 *
 * Bilateral Zero-Sum Utility & IOU Split Ledger Engine for Keroo.
 * Implements:
 * 1. 50/50 utility splits with odd-cent absorption by payer (Invariant 7).
 * 2. Multi-party equal splits and custom percentage splits with integer-cent remainder allocation.
 * 3. Continuous zero-sum bilateral debt offsetting between parties.
 * 4. Running IOU balances & atomic settlement reconciliation to R$ 0,00.
 */

import type {
  Cents,
  ISODate,
  SplitExpense,
  SplitMethod,
  SplitSettlement,
  SplitShare,
  SupportedCurrency,
} from '../types';
import { assertIntegerCents, assertNonNegativeCents, assertPositiveCents } from './currency';

// ============================================================================
// Types
// ============================================================================

export interface CreateSplitExpenseParams {
  id?: string;
  description: string;
  totalAmountCents: Cents;
  currency?: SupportedCurrency;
  date: ISODate;
  paidByPartyId: string; // 'USER' or partyId
  splitMethod: SplitMethod;
  shares?: SplitShare[]; // Required for 'exact_amounts', optional for others
  counterpartPartyId?: string; // Shortcut for 50/50 bilateral split
  partyPercentages?: { partyId: string; percentage: number }[]; // For 'percentages'
  partyIds?: string[]; // For 'equal_50_50' with custom party list
  categoryId?: string;
  linkedTransactionId?: string;
  notes?: string;
  createdAt?: string;
}

export interface BilateralSummary {
  partyAId: string;
  partyBId: string;
  netBalanceCents: number; // >0: B owes A; <0: A owes B; 0: settled
  aPaidForBCents: Cents;
  bPaidForACents: Cents;
  bSettledToACents: Cents;
  aSettledToBCents: Cents;
  direction: 'A_OWES_B' | 'B_OWES_A' | 'SETTLED';
  settlementAmountCents: Cents; // abs(netBalanceCents)
}

// ============================================================================
// Split Algorithms (Invariants 3 & 7)
// ============================================================================

/**
 * Bilateral 50/50 Split with Odd-Cent Payer Absorption (Invariant 7).
 * In a 50/50 bilateral split of an odd cent total A (A % 2 !== 0),
 * the paying party absorbs the odd cent remainder:
 *   share_payer = ceil(A / 2) = floor(A / 2) + (A % 2)
 *   share_counterpart = floor(A / 2)
 *   share_payer + share_counterpart === A
 */
export function split50_50(
  totalAmountCents: Cents,
  payerPartyId: string,
  counterpartPartyId: string
): SplitShare[] {
  assertNonNegativeCents(totalAmountCents, 'split50_50: totalAmountCents');

  if (!payerPartyId || !counterpartPartyId) {
    throw new TypeError('[SplitError] Both payerPartyId and counterpartPartyId must be provided');
  }
  if (payerPartyId === counterpartPartyId) {
    throw new RangeError('[SplitError] payerPartyId and counterpartPartyId must be different parties');
  }

  const payerShare = Math.ceil(totalAmountCents / 2);
  const counterpartShare = Math.floor(totalAmountCents / 2);

  // Invariant verification
  if (payerShare + counterpartShare !== totalAmountCents) {
    throw new Error('[SplitError] Invariant violation: 50/50 shares do not conserve total amount');
  }

  return [
    { partyId: payerPartyId, shareCents: payerShare, percentage: 50 },
    { partyId: counterpartPartyId, shareCents: counterpartShare, percentage: 50 },
  ];
}

/**
 * General equal split across P parties with payer-first remainder distribution.
 * For total A and P parties:
 *   base = floor(A / P)
 *   remainder = A % P
 * Remainder cents are distributed 1 cent each starting at the paying party.
 * Guaranteed exact integer conservation: sum(shares) === A.
 */
export function splitEqual(
  totalAmountCents: Cents,
  partyIds: string[],
  payerPartyId: string
): SplitShare[] {
  assertNonNegativeCents(totalAmountCents, 'splitEqual: totalAmountCents');

  if (!Array.isArray(partyIds) || partyIds.length === 0) {
    throw new TypeError('[SplitError] partyIds must be a non-empty array');
  }

  const P = partyIds.length;
  const baseCents = Math.floor(totalAmountCents / P);
  let remainderCents = totalAmountCents % P;

  // Order parties so that payer gets first remainder cent if present
  const orderedPartyIds = [...partyIds];
  const payerIndex = orderedPartyIds.indexOf(payerPartyId);
  if (payerIndex > 0) {
    // Move payer to front for remainder allocation
    orderedPartyIds.splice(payerIndex, 1);
    orderedPartyIds.unshift(payerPartyId);
  }

  const shares: SplitShare[] = [];
  for (let i = 0; i < P; i++) {
    const partyId = orderedPartyIds[i];
    let shareCents = baseCents;
    if (remainderCents > 0) {
      shareCents += 1;
      remainderCents -= 1;
    }
    shares.push({
      partyId,
      shareCents,
    });
  }

  return shares;
}

/**
 * Custom percentage split with exact integer cent conservation.
 * Uses largest-fraction remainder thresholding starting at the paying party.
 */
export function splitByPercentages(
  totalAmountCents: Cents,
  partyPercentages: { partyId: string; percentage: number }[],
  payerPartyId?: string
): SplitShare[] {
  assertNonNegativeCents(totalAmountCents, 'splitByPercentages: totalAmountCents');

  if (!Array.isArray(partyPercentages) || partyPercentages.length === 0) {
    throw new TypeError('[SplitError] partyPercentages must be a non-empty array');
  }

  for (const p of partyPercentages) {
    if (!Number.isFinite(p.percentage) || p.percentage < 0 || p.percentage > 100) {
      throw new RangeError(
        `[SplitError] Each percentage must be a finite number within [0, 100], received ${p.percentage} for ${p.partyId}`
      );
    }
  }

  const totalPercent = partyPercentages.reduce((sum, p) => sum + p.percentage, 0);
  // Allow slight float imprecision around 100%
  if (Math.abs(totalPercent - 100) > 0.001) {
    throw new RangeError(
      `[SplitError] Percentages must sum to 100, received sum: ${totalPercent}`
    );
  }

  // Calculate base integer cents and fractional remainders
  const allocations = partyPercentages.map((p) => {
    const exact = (totalAmountCents * p.percentage) / 100;
    const base = Math.floor(exact);
    const fraction = exact - base;
    return {
      partyId: p.partyId,
      percentage: p.percentage,
      baseCents: base,
      fraction,
      isPayer: p.partyId === payerPartyId,
    };
  });

  let allocatedSum = allocations.reduce((sum, a) => sum + a.baseCents, 0);
  let remainder = totalAmountCents - allocatedSum;

  // Sort candidates for remainder: payer first if tied, then by highest fractional part
  allocations.sort((a, b) => {
    if (Math.abs(b.fraction - a.fraction) > 0.000001) {
      return b.fraction - a.fraction;
    }
    if (a.isPayer) return -1;
    if (b.isPayer) return 1;
    return 0;
  });

  for (let i = 0; i < allocations.length && remainder > 0; i++) {
    allocations[i].baseCents += 1;
    remainder -= 1;
  }

  const shares: SplitShare[] = allocations.map((a) => ({
    partyId: a.partyId,
    shareCents: a.baseCents,
    percentage: a.percentage,
  }));

  // Verify total conservation
  const finalSum = shares.reduce((sum, s) => sum + s.shareCents, 0);
  if (finalSum !== totalAmountCents) {
    throw new Error('[SplitError] Invariant violation: percentage shares sum mismatch');
  }

  return shares;
}

/**
 * Validates and wraps explicit exact-amount shares, enforcing total conservation.
 */
export function splitByExactAmounts(
  totalAmountCents: Cents,
  exactShares: { partyId: string; shareCents: Cents }[]
): SplitShare[] {
  assertPositiveCents(totalAmountCents, 'splitByExactAmounts: totalAmountCents');

  if (!Array.isArray(exactShares) || exactShares.length === 0) {
    throw new TypeError('[SplitError] exactShares must be a non-empty array');
  }

  let sum = 0;
  for (const s of exactShares) {
    assertNonNegativeCents(s.shareCents, `splitByExactAmounts: party ${s.partyId}`);
    sum += s.shareCents;
  }

  if (sum !== totalAmountCents) {
    throw new RangeError(
      `[SplitError] Split Conservation Invariant violated: sum of exact shares (${sum}) !== totalAmountCents (${totalAmountCents})`
    );
  }

  return exactShares.map((s) => ({
    partyId: s.partyId,
    shareCents: s.shareCents,
  }));
}

// ============================================================================
// Split Expense Factory
// ============================================================================

/**
 * Creates a fully validated SplitExpense record with exact shares conservation.
 */
export function createSplitExpense(params: CreateSplitExpenseParams): SplitExpense {
  const {
    id = `split_exp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    description,
    totalAmountCents,
    currency = 'BRL',
    date,
    paidByPartyId,
    splitMethod,
    shares,
    counterpartPartyId,
    partyPercentages,
    partyIds,
    categoryId,
    linkedTransactionId,
    notes,
    createdAt = new Date().toISOString(),
  } = params;

  assertPositiveCents(totalAmountCents, 'createSplitExpense: totalAmountCents');

  let resolvedShares: SplitShare[];

  if (splitMethod === 'equal_50_50') {
    if (counterpartPartyId) {
      resolvedShares = split50_50(totalAmountCents, paidByPartyId, counterpartPartyId);
    } else if (partyIds && partyIds.length > 0) {
      // Bilateral ledger: partyIds must be exactly { payer, one other party }.
      const distinct = Array.from(new Set(partyIds));
      const others = distinct.filter((p) => p !== paidByPartyId);
      if (!distinct.includes(paidByPartyId) || others.length !== 1 || distinct.length !== partyIds.length) {
        throw new RangeError(
          '[SplitError] equal_50_50 partyIds must contain paidByPartyId plus exactly one other distinct party'
        );
      }
      resolvedShares = split50_50(totalAmountCents, paidByPartyId, others[0]);
    } else {
      throw new TypeError('[SplitError] equal_50_50 requires counterpartPartyId or partyIds');
    }
  } else if (splitMethod === 'percentages') {
    if (!partyPercentages || partyPercentages.length === 0) {
      throw new TypeError('[SplitError] percentages split requires partyPercentages');
    }
    resolvedShares = splitByPercentages(totalAmountCents, partyPercentages, paidByPartyId);
  } else if (splitMethod === 'exact_amounts') {
    if (!shares || shares.length === 0) {
      throw new TypeError('[SplitError] exact_amounts split requires explicit shares');
    }
    resolvedShares = splitByExactAmounts(totalAmountCents, shares);
  } else {
    const _exhaustive: never = splitMethod;
    throw new Error(`[SplitError] Unsupported splitMethod: ${_exhaustive}`);
  }

  // Final sanity check of invariant
  const totalSharesCents = resolvedShares.reduce((acc, s) => acc + s.shareCents, 0);
  if (totalSharesCents !== totalAmountCents) {
    throw new Error(
      `[SplitError] Conservation Invariant failed: totalAmountCents=${totalAmountCents}, sum(shares)=${totalSharesCents}`
    );
  }

  return {
    id,
    description,
    totalAmountCents,
    currency,
    date,
    paidByPartyId,
    splitMethod,
    shares: resolvedShares,
    categoryId,
    linkedTransactionId,
    notes,
    createdAt,
  };
}

// ============================================================================
// Bilateral Debt Netting & Continuous Offsetting
// ============================================================================

/**
 * Calculates continuous bilateral net balance between partyA and partyB:
 *   netBalance(A, B) =
 *       sum(B's share of expenses paid by A)
 *     - sum(A's share of expenses paid by B)
 *     - sum(Settlements from B to A)
 *     + sum(Settlements from A to B)
 *
 * Interpretation:
 *   > 0: Party B owes Party A (Party A has a receivable of +netBalance).
 *   < 0: Party A owes Party B (Party A has a debt of |netBalance|).
 *   === 0: Settled up completely.
 *
 * Mathematical Invariant:
 *   netBalance(B, A) === -netBalance(A, B) (Anti-symmetric / Zero-sum).
 */
export function calculateBilateralNetBalance(
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  partyAId: string,
  partyBId: string
): number {
  if (partyAId === partyBId) return 0;

  let balance = 0;

  // 1. Process Expenses
  for (const exp of expenses) {
    if (exp.paidByPartyId === partyAId) {
      // Party A paid: check if Party B had a share
      const bShare = exp.shares.find((s) => s.partyId === partyBId);
      if (bShare) {
        balance += bShare.shareCents;
      }
    } else if (exp.paidByPartyId === partyBId) {
      // Party B paid: check if Party A had a share
      const aShare = exp.shares.find((s) => s.partyId === partyAId);
      if (aShare) {
        balance -= aShare.shareCents;
      }
    }
  }

  // 2. Process Settlements
  for (const set of settlements) {
    if (set.fromPartyId === partyBId && set.toPartyId === partyAId) {
      // B paid A: reduces B's debt to A
      balance -= set.amountCents;
    } else if (set.fromPartyId === partyAId && set.toPartyId === partyBId) {
      // A paid B: reduces A's debt to B (increases A's balance)
      balance += set.amountCents;
    }
  }

  assertIntegerCents(balance, 'calculateBilateralNetBalance: balance');
  return balance;
}

/**
 * Returns a complete bilateral breakdown between partyA and partyB.
 */
export function calculateBilateralSummary(
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  partyAId: string,
  partyBId: string
): BilateralSummary {
  let aPaidForB = 0;
  let bPaidForA = 0;
  let bSettledToA = 0;
  let aSettledToB = 0;

  for (const exp of expenses) {
    if (exp.paidByPartyId === partyAId) {
      const bShare = exp.shares.find((s) => s.partyId === partyBId);
      if (bShare) aPaidForB += bShare.shareCents;
    } else if (exp.paidByPartyId === partyBId) {
      const aShare = exp.shares.find((s) => s.partyId === partyAId);
      if (aShare) bPaidForA += aShare.shareCents;
    }
  }

  for (const set of settlements) {
    if (set.fromPartyId === partyBId && set.toPartyId === partyAId) {
      bSettledToA += set.amountCents;
    } else if (set.fromPartyId === partyAId && set.toPartyId === partyBId) {
      aSettledToB += set.amountCents;
    }
  }

  const netBalanceCents = (aPaidForB - bPaidForA) - (bSettledToA - aSettledToB);

  let direction: BilateralSummary['direction'];
  if (netBalanceCents > 0) {
    direction = 'B_OWES_A';
  } else if (netBalanceCents < 0) {
    direction = 'A_OWES_B';
  } else {
    direction = 'SETTLED';
  }

  return {
    partyAId,
    partyBId,
    netBalanceCents,
    aPaidForBCents: aPaidForB,
    bPaidForACents: bPaidForA,
    bSettledToACents: bSettledToA,
    aSettledToBCents: aSettledToB,
    direction,
    settlementAmountCents: Math.abs(netBalanceCents),
  };
}

// ============================================================================
// Settlement Reconciliation
// ============================================================================

/**
 * Creates a SplitSettlement record representing payment from one party to another.
 */
export function createSettlement(
  fromPartyId: string,
  toPartyId: string,
  amountCents: Cents,
  date: ISODate,
  notes?: string,
  id?: string
): SplitSettlement {
  assertPositiveCents(amountCents, 'createSettlement: amountCents');

  if (fromPartyId === toPartyId) {
    throw new TypeError('[SplitError] fromPartyId cannot be the same as toPartyId');
  }

  return {
    id: id || `split_settle_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    fromPartyId,
    toPartyId,
    amountCents,
    date,
    notes,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Creates a settlement that nets the running IOU balance between partyA and partyB exactly to 0.
 * Returns null if the parties are already settled up (balance === 0).
 */
export function createFullSettlement(
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  partyAId: string,
  partyBId: string,
  date: ISODate,
  notes?: string
): SplitSettlement | null {
  const balance = calculateBilateralNetBalance(expenses, settlements, partyAId, partyBId);

  if (balance === 0) {
    return null;
  }

  if (balance > 0) {
    // B owes A: B pays A
    return createSettlement(partyBId, partyAId, balance, date, notes);
  }

  // balance < 0: A owes B: A pays B
  return createSettlement(partyAId, partyBId, Math.abs(balance), date, notes);
}

// ============================================================================
// Multi-Party Portfolio Balances
// ============================================================================

/**
 * Calculates net balances between the user ('USER') and all counterparties present
 * in the expenses and settlements ledger.
 * Returns a map of partyId -> netBalance (positive = they owe user, negative = user owes them).
 */
export function calculateAllPartiesBalances(
  expenses: SplitExpense[],
  settlements: SplitSettlement[],
  userPartyId = 'USER'
): Map<string, number> {
  const parties = new Set<string>();

  for (const exp of expenses) {
    if (exp.paidByPartyId !== userPartyId) parties.add(exp.paidByPartyId);
    for (const share of exp.shares) {
      if (share.partyId !== userPartyId) parties.add(share.partyId);
    }
  }

  for (const set of settlements) {
    if (set.fromPartyId !== userPartyId) parties.add(set.fromPartyId);
    if (set.toPartyId !== userPartyId) parties.add(set.toPartyId);
  }

  const result = new Map<string, number>();
  for (const partyId of parties) {
    const net = calculateBilateralNetBalance(expenses, settlements, userPartyId, partyId);
    result.set(partyId, net);
  }

  return result;
}
