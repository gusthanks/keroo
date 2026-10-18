/**
 * src/core/currency.ts
 *
 * Core Financial Precision Engine for Keroo.
 * Strict integer-cent arithmetic (C in Z) with zero floating-point drift.
 * Pure BigInt-based remainder thresholding for half-up and half-even rounding.
 */

import type { SupportedCurrency, SupportedLocale } from '../types';
export type { Cents } from '../types';

export type RoundingMode = 'half-up' | 'half-even';

export interface CurrencyFormatOptions {
  showSign?: boolean;
  useGrouping?: boolean;
  currencyDisplay?: 'symbol' | 'code' | 'name' | 'narrowSymbol';
}

export interface CurrencyParseOptions {
  currency?: SupportedCurrency;
  locale?: SupportedLocale;
  allowNegative?: boolean;
}

// ============================================================================
// Runtime Guards & Assertions
// ============================================================================

export function assertIntegerCents(cents: number, context = 'monetary operation'): void {
  if (typeof cents !== 'number') {
    throw new TypeError(
      `[CurrencyError] Invalid type in ${context}: expected number, received ${typeof cents}`
    );
  }
  if (!Number.isFinite(cents)) {
    throw new TypeError(
      `[CurrencyError] Non-finite value in ${context}: received ${cents}`
    );
  }
  if (!Number.isInteger(cents)) {
    throw new TypeError(
      `[CurrencyError] Float invariant violation in ${context}: expected integer cents, received ${cents}`
    );
  }
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(
      `[CurrencyError] Integer overflow in ${context}: value ${cents} exceeds Number.MAX_SAFE_INTEGER`
    );
  }
}

export function assertNonNegativeCents(cents: number, context = 'monetary operation'): void {
  assertIntegerCents(cents, context);
  if (cents < 0) {
    throw new RangeError(
      `[CurrencyError] Negative value violation in ${context}: expected >= 0, received ${cents}`
    );
  }
}

export function assertPositiveCents(cents: number, context = 'monetary operation'): void {
  assertIntegerCents(cents, context);
  if (cents <= 0) {
    throw new RangeError(
      `[CurrencyError] Non-positive value violation in ${context}: expected > 0, received ${cents}`
    );
  }
}

export function isIntegerCents(val: unknown): val is number {
  return typeof val === 'number' && Number.isSafeInteger(val);
}

// ============================================================================
// Exact Integer Cents Arithmetic
// ============================================================================

export function addCents(a: number, b: number): number {
  assertIntegerCents(a, 'addCents: operand a');
  assertIntegerCents(b, 'addCents: operand b');
  const result = a + b;
  assertIntegerCents(result, 'addCents: result');
  return result;
}

export function subCents(a: number, b: number): number {
  assertIntegerCents(a, 'subCents: operand a');
  assertIntegerCents(b, 'subCents: operand b');
  const result = a - b;
  assertIntegerCents(result, 'subCents: result');
  return result;
}

/**
 * Multiplies an integer cents amount by an integer ratio (numerator / denominator)
 * with deterministic BigInt-based integer rounding ('half-up' or 'half-even').
 * Zero intermediate floating-point drift.
 */
export function mulCentsRatio(
  cents: number,
  numerator: number,
  denominator: number,
  roundingMode: RoundingMode = 'half-up'
): number {
  assertIntegerCents(cents, 'mulCentsRatio: cents');
  assertIntegerCents(numerator, 'mulCentsRatio: numerator');
  assertIntegerCents(denominator, 'mulCentsRatio: denominator');

  if (denominator === 0) {
    throw new RangeError('[CurrencyError] Division by zero in mulCentsRatio');
  }

  if (cents === 0 || numerator === 0) {
    return 0;
  }

  // Use BigInt for exact precision without float rounding
  const bigP = BigInt(cents) * BigInt(numerator);
  const bigD = BigInt(denominator);

  const isNegative = (bigP < 0n) !== (bigD < 0n);
  const absP = bigP < 0n ? -bigP : bigP;
  const absD = bigD < 0n ? -bigD : bigD;

  let quotient = absP / absD;
  const remainder = absP % absD;
  const twoRemainder = 2n * remainder;

  if (twoRemainder > absD) {
    quotient += 1n;
  } else if (twoRemainder === absD) {
    if (roundingMode === 'half-up') {
      quotient += 1n;
    } else {
      // Banker's rounding (half-even): round to nearest even quotient
      if (quotient % 2n !== 0n) {
        quotient += 1n;
      }
    }
  }

  const resultBig = isNegative ? -quotient : quotient;
  const resultNum = Number(resultBig);
  assertIntegerCents(resultNum, 'mulCentsRatio: result');
  return resultNum;
}

export function divCents(
  cents: number,
  divisor: number,
  roundingMode: RoundingMode = 'half-up'
): number {
  return mulCentsRatio(cents, 1, divisor, roundingMode);
}

export function sumCents(centsArray: number[]): number {
  const total = centsArray.reduce((acc, c, idx) => {
    assertIntegerCents(c, `sumCents: element at index ${idx}`);
    return acc + c;
  }, 0);
  if (!Number.isSafeInteger(total)) {
    throw new RangeError(`[CurrencyError] sumCents: result ${total} exceeds the safe integer range`);
  }
  return total;
}

export function absCents(cents: number): number {
  assertIntegerCents(cents, 'absCents: cents');
  return Math.abs(cents);
}

export function minCents(...cents: number[]): number {
  if (cents.length === 0) {
    throw new TypeError('minCents requires at least one argument');
  }
  for (const c of cents) {
    assertIntegerCents(c, 'minCents');
  }
  return Math.min(...cents);
}

export function maxCents(...cents: number[]): number {
  if (cents.length === 0) {
    throw new TypeError('maxCents requires at least one argument');
  }
  for (const c of cents) {
    assertIntegerCents(c, 'maxCents');
  }
  return Math.max(...cents);
}

// ============================================================================
// Formatting
// ============================================================================

export function formatCurrency(
  cents: number,
  currency: SupportedCurrency = 'BRL',
  locale: SupportedLocale = 'pt-BR',
  options?: CurrencyFormatOptions
): string {
  assertIntegerCents(cents, 'formatCurrency: cents');

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: options?.useGrouping ?? true,
    currencyDisplay: options?.currencyDisplay ?? 'symbol',
  });

  const formatted = formatter.format(cents / 100);

  if (options?.showSign && cents > 0) {
    return `+${formatted}`;
  }

  return formatted;
}

export const formatCurrencyCents = formatCurrency;

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parses a user-typed amount into integer cents.
 *
 * Sign rules:
 * - Negative only for a LEADING minus, optionally preceded by a currency
 *   symbol/code and spaces ('-50,00', '-R$ 10', 'R$ -10'), or for a fully
 *   wrapped parenthetical form ('(1,250.50)').
 * - A hyphen anywhere else ('10-5', '2026-10-18') makes the input invalid and,
 *   consistent with other unparseable input (e.g. 'abc'), the result is 0.
 * - Never returns -0.
 */
export function parseCurrencyToCents(
  input: string,
  options?: CurrencyParseOptions
): number {
  if (!input || typeof input !== 'string') {
    return 0;
  }

  const trimmed = input.trim();
  if (trimmed === '') {
    return 0;
  }

  // Detect negative: leading minus (optionally after a currency symbol/spaces)
  // or a fully wrapped parenthetical form e.g. '(100)'.
  let body = trimmed;
  let isNegative = false;
  const leadingMinus = /^([^\d.,()-]*)-/.exec(trimmed);
  if (leadingMinus) {
    isNegative = true;
    body = leadingMinus[1] + trimmed.slice(leadingMinus[0].length);
  } else if (/^\(.*\)$/.test(trimmed)) {
    isNegative = true;
    body = trimmed.slice(1, -1);
  }

  // Any other hyphen ('10-5', '2026-10-18') is not a sign: invalid input -> 0.
  if (body.includes('-')) {
    return 0;
  }

  if (isNegative && options?.allowNegative === false) {
    throw new RangeError('[CurrencyError] Negative amounts are not allowed');
  }

  // Strip all non-numeric, non-separator chars
  const clean = body.replace(/[^0-9.,]/g, '');
  if (clean === '') {
    return 0;
  }

  let wholePart = '';
  let fracPart = '';

  const hasComma = clean.includes(',');
  const hasDot = clean.includes('.');

  if (hasComma && hasDot) {
    const lastComma = clean.lastIndexOf(',');
    const lastDot = clean.lastIndexOf('.');

    if (lastComma > lastDot) {
      // European / Brazilian format: 1.250.000,50
      wholePart = clean.substring(0, lastComma).replace(/\./g, '');
      fracPart = clean.substring(lastComma + 1);
    } else {
      // US format: 1,250,000.50
      wholePart = clean.substring(0, lastDot).replace(/,/g, '');
      fracPart = clean.substring(lastDot + 1);
    }
  } else if (hasComma && !hasDot) {
    const commaParts = clean.split(',');
    if (commaParts.length > 2) {
      wholePart = clean.replace(/,/g, '');
      fracPart = '';
    } else {
      const afterComma = commaParts[1];
      if (afterComma.length === 3 && (options?.currency === 'USD' || options?.locale === 'en-US')) {
        wholePart = clean.replace(/,/g, '');
        fracPart = '';
      } else {
        wholePart = commaParts[0];
        fracPart = afterComma;
      }
    }
  } else if (hasDot && !hasComma) {
    const dotParts = clean.split('.');
    if (dotParts.length > 2) {
      wholePart = clean.replace(/\./g, '');
      fracPart = '';
    } else {
      const afterDot = dotParts[1];
      if (afterDot.length === 3 && (options?.currency === 'BRL' || options?.locale === 'pt-BR')) {
        wholePart = clean.replace(/\./g, '');
        fracPart = '';
      } else {
        wholePart = dotParts[0];
        fracPart = afterDot;
      }
    }
  } else {
    wholePart = clean;
    fracPart = '';
  }

  const wholeInt = wholePart === '' ? 0 : parseInt(wholePart, 10);
  if (!Number.isSafeInteger(wholeInt)) {
    throw new RangeError('[CurrencyError] Parsed whole amount exceeds safe integer limit');
  }

  let centFraction = 0;
  if (fracPart.length === 1) {
    centFraction = parseInt(fracPart + '0', 10);
  } else if (fracPart.length === 2) {
    centFraction = parseInt(fracPart, 10);
  } else if (fracPart.length > 2) {
    const firstTwo = parseInt(fracPart.slice(0, 2), 10);
    const thirdDigit = parseInt(fracPart[2], 10);
    centFraction = thirdDigit >= 5 ? firstTwo + 1 : firstTwo;
  }

  let totalCents = wholeInt * 100 + centFraction;
  if (isNegative && totalCents !== 0) {
    totalCents = -totalCents;
  }

  assertIntegerCents(totalCents, 'parseCurrencyToCents: result');
  return totalCents;
}

export const parseCurrencyInputToCents = parseCurrencyToCents;
