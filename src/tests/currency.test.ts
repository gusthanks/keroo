import { describe, it, expect } from 'vitest';
import {
  addCents,
  subCents,
  mulCentsRatio,
  divCents,
  sumCents,
  absCents,
  minCents,
  maxCents,
  assertIntegerCents,
  assertNonNegativeCents,
  assertPositiveCents,
  isIntegerCents,
  formatCurrency,
  formatCurrencyCents,
  parseCurrencyToCents,
  parseCurrencyInputToCents,
} from '../core/currency';

describe('Currency Engine (src/core/currency.ts)', () => {
  describe('Runtime Type Guards & Invariant Assertions', () => {
    it('accepts valid integers including zero, positive, negative, and MAX_SAFE_INTEGER', () => {
      expect(() => assertIntegerCents(0)).not.toThrow();
      expect(() => assertIntegerCents(1050)).not.toThrow();
      expect(() => assertIntegerCents(-500)).not.toThrow();
      expect(() => assertIntegerCents(Number.MAX_SAFE_INTEGER)).not.toThrow();
      expect(() => assertIntegerCents(Number.MIN_SAFE_INTEGER)).not.toThrow();
      expect(isIntegerCents(100)).toBe(true);
      expect(isIntegerCents(0)).toBe(true);
    });

    it('rejects floating-point numbers, NaN, Infinity, strings, and null with TypeError', () => {
      expect(() => assertIntegerCents(10.5)).toThrow(TypeError);
      expect(() => assertIntegerCents(0.1 + 0.2)).toThrow(TypeError);
      expect(() => assertIntegerCents(NaN)).toThrow(TypeError);
      expect(() => assertIntegerCents(Infinity)).toThrow(TypeError);
      expect(() => assertIntegerCents('100' as any)).toThrow(TypeError);
      expect(() => assertIntegerCents(null as any)).toThrow(TypeError);
      expect(isIntegerCents(10.5)).toBe(false);
      expect(isIntegerCents('100')).toBe(false);
    });

    it('enforces non-negative cents constraint', () => {
      expect(() => assertNonNegativeCents(0)).not.toThrow();
      expect(() => assertNonNegativeCents(100)).not.toThrow();
      expect(() => assertNonNegativeCents(-1)).toThrow(RangeError);
      expect(() => assertNonNegativeCents(-1050)).toThrow(RangeError);
    });

    it('enforces strictly positive cents constraint', () => {
      expect(() => assertPositiveCents(1)).not.toThrow();
      expect(() => assertPositiveCents(1000)).not.toThrow();
      expect(() => assertPositiveCents(0)).toThrow(RangeError);
      expect(() => assertPositiveCents(-50)).toThrow(RangeError);
    });
  });

  describe('Integer Cents Arithmetic', () => {
    it('adds cents with strict integer verification', () => {
      expect(addCents(1050, 2025)).toBe(3075);
      expect(addCents(0, 500)).toBe(500);
      expect(addCents(-500, 500)).toBe(0);
      expect(addCents(-100, -200)).toBe(-300);
    });

    it('subtracts cents with strict integer verification', () => {
      expect(subCents(5000, 1250)).toBe(3750);
      expect(subCents(100, 200)).toBe(-100);
      expect(subCents(0, 500)).toBe(-500);
    });

    it('multiplies cents by integer ratio with BigInt half-up rounding', () => {
      // 10000 / 3 = 3333.3333... -> 3333
      expect(mulCentsRatio(10000, 1, 3, 'half-up')).toBe(3333);

      // 1000 / 2 = 500 -> 500
      expect(mulCentsRatio(1000, 1, 2, 'half-up')).toBe(500);

      // 1050 / 4 = 262.5 -> 263 (half-up)
      expect(mulCentsRatio(1050, 1, 4, 'half-up')).toBe(263);

      // Negative cents: -1050 / 4 = -262.5 -> -263 (half-up away from zero)
      expect(mulCentsRatio(-1050, 1, 4, 'half-up')).toBe(-263);

      // Negative ratio
      expect(mulCentsRatio(1050, -1, 4, 'half-up')).toBe(-263);
    });

    it('multiplies cents by integer ratio with BigInt half-even (Banker) rounding', () => {
      // 1050 / 4 = 262.5 -> 262 is even, rounds to 262
      expect(mulCentsRatio(1050, 1, 4, 'half-even')).toBe(262);

      // 1054: 1054 * 1 / 4 = 263.5 -> 264 is even, rounds to 264
      expect(mulCentsRatio(1054, 1, 4, 'half-even')).toBe(264);

      // -1050 / 4 = -262.5 -> -262
      expect(mulCentsRatio(-1050, 1, 4, 'half-even')).toBe(-262);
    });

    it('handles trivial zeros and throws RangeError on division by zero', () => {
      expect(mulCentsRatio(0, 5, 10)).toBe(0);
      expect(mulCentsRatio(100, 0, 10)).toBe(0);
      expect(() => mulCentsRatio(100, 1, 0)).toThrow(RangeError);
      expect(() => divCents(100, 0)).toThrow(RangeError);
    });

    it('divides cents using divCents', () => {
      expect(divCents(1000, 2)).toBe(500);
      expect(divCents(1050, 4, 'half-up')).toBe(263);
      expect(divCents(1050, 4, 'half-even')).toBe(262);
    });

    it('computes sum, absolute value, min, and max correctly', () => {
      expect(sumCents([100, 250, 350, 400])).toBe(1100);
      expect(sumCents([])).toBe(0);
      expect(absCents(-1500)).toBe(1500);
      expect(absCents(1500)).toBe(1500);
      expect(minCents(100, 50, 200, -10)).toBe(-10);
      expect(maxCents(100, 50, 200, -10)).toBe(200);
      expect(() => minCents()).toThrow(TypeError);
      expect(() => maxCents()).toThrow(TypeError);
    });
  });

  describe('Currency Formatting', () => {
    it('formats BRL currency in pt-BR locale', () => {
      const formatted = formatCurrency(125050, 'BRL', 'pt-BR');
      expect(formatted).toContain('1.250,50');
      expect(formatted).toContain('R$');
    });

    it('formats zero correctly', () => {
      const formatted = formatCurrency(0, 'BRL', 'pt-BR');
      expect(formatted).toContain('0,00');
    });

    it('formats negative amounts with minus sign', () => {
      const formatted = formatCurrency(-1050, 'BRL', 'pt-BR');
      expect(formatted).toContain('10,50');
      expect(formatted).toMatch(/[-–]/);
    });

    it('prepends plus sign when showSign is enabled for positive amounts', () => {
      const formatted = formatCurrency(1050, 'BRL', 'pt-BR', { showSign: true });
      expect(formatted.startsWith('+')).toBe(true);
      expect(formatted).toContain('10,50');
    });

    it('formats USD currency in en-US locale', () => {
      const formatted = formatCurrency(125050, 'USD', 'en-US');
      expect(formatted).toBe('$1,250.50');
    });

    it('formats EUR currency across locales', () => {
      const formattedUS = formatCurrency(5000, 'EUR', 'en-US');
      expect(formattedUS).toContain('€50.00');

      const formattedBR = formatCurrency(5000, 'EUR', 'pt-BR');
      expect(formattedBR).toContain('50,00');
    });

    it('exports formatCurrencyCents alias', () => {
      expect(formatCurrencyCents).toBe(formatCurrency);
    });
  });

  describe('Currency Parsing', () => {
    it('parses formatted Brazilian currency strings into exact integer cents', () => {
      expect(parseCurrencyToCents('R$ 1.250,50')).toBe(125050);
      expect(parseCurrencyToCents('1.250,50')).toBe(125050);
      expect(parseCurrencyToCents('1250,50')).toBe(125050);
      expect(parseCurrencyToCents('12,5')).toBe(1250);
      expect(parseCurrencyToCents(',50')).toBe(50);
      expect(parseCurrencyToCents('50')).toBe(5000);
      expect(parseCurrencyToCents('R$ 0,00')).toBe(0);
    });

    it('parses formatted US currency strings into exact integer cents', () => {
      expect(parseCurrencyToCents('$1,250.50', { currency: 'USD', locale: 'en-US' })).toBe(125050);
      expect(parseCurrencyToCents('1,250.50', { currency: 'USD', locale: 'en-US' })).toBe(125050);
      expect(parseCurrencyToCents('1250.50')).toBe(125050);
      expect(parseCurrencyToCents('.50')).toBe(50);
    });

    it('eliminates IEEE 754 float rounding jitter on 10.55', () => {
      const parsed = parseCurrencyToCents('10.55');
      expect(parsed).toBe(1055);
      expect(Number.isInteger(parsed)).toBe(true);
    });

    it('parses negative formats including parentheses and leading minus', () => {
      expect(parseCurrencyToCents('-R$ 1.250,50')).toBe(-125050);
      expect(parseCurrencyToCents('R$ -1.250,50')).toBe(-125050);
      expect(parseCurrencyToCents('(1,250.50)')).toBe(-125050);
      expect(parseCurrencyToCents('-50,00')).toBe(-5000);
    });

    it('throws RangeError if allowNegative is false and negative amount is provided', () => {
      expect(() => parseCurrencyToCents('-50,00', { allowNegative: false })).toThrow(RangeError);
      expect(() => parseCurrencyToCents('(50.00)', { allowNegative: false })).toThrow(RangeError);
    });

    it('returns 0 for empty or whitespace strings', () => {
      expect(parseCurrencyToCents('')).toBe(0);
      expect(parseCurrencyToCents('   ')).toBe(0);
      expect(parseCurrencyToCents(null as any)).toBe(0);
      expect(parseCurrencyToCents(undefined as any)).toBe(0);
    });

    it('rounds 3rd fractional digit half-up', () => {
      // 10,555 -> 1056 cents
      expect(parseCurrencyToCents('10,555')).toBe(1056);
      // 10,554 -> 1055 cents
      expect(parseCurrencyToCents('10,554')).toBe(1055);
    });

    it('exports parseCurrencyInputToCents alias', () => {
      expect(parseCurrencyInputToCents).toBe(parseCurrencyToCents);
    });
  });
  describe('Regression: sign detection, -0 and safe sums', () => {
    it('never returns -0', () => {
      expect(Object.is(parseCurrencyToCents('-0,00'), -0)).toBe(false);
      expect(Object.is(parseCurrencyToCents('(0)'), -0)).toBe(false);
      expect(parseCurrencyToCents('-0,00')).toBe(0);
    });

    it('only a leading minus or a fully wrapped (...) is negative; embedded hyphens are invalid (0)', () => {
      expect(parseCurrencyToCents('10-5')).toBe(0);
      expect(parseCurrencyToCents('2026-10-18')).toBe(0);
      expect(parseCurrencyToCents('R$ 10-')).toBe(0);
      expect(parseCurrencyToCents('-R$ 10,00')).toBe(-1000);
      expect(parseCurrencyToCents('R$ -10,00')).toBe(-1000);
      expect(parseCurrencyToCents('  -  10,00')).toBe(-1000);
      expect(parseCurrencyToCents('(10,00)')).toBe(-1000);
      // An embedded hyphen is not a sign, so allowNegative:false does not throw for it.
      expect(parseCurrencyToCents('10-5', { allowNegative: false })).toBe(0);
    });

    it('sumCents throws when the total leaves the safe integer range', () => {
      expect(() => sumCents([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError);
      expect(sumCents([1, 2, -3])).toBe(0);
    });
  });
});
