import { describe, it, expect } from 'vitest';
import {
  parsePercentInput,
  parseDayOfMonth,
  getCurrencySymbol,
  getCadenceLabel,
  selectRadarBills,
} from '../core/accountForms';
import type { RecurringBill } from '../types';

const bill = (id: string, nextDueDate: string, isActive = true): RecurringBill => ({
  id,
  name: id,
  amountCents: 1000,
  currency: 'BRL',
  cadence: 'monthly',
  anchorDay: 1,
  startDate: nextDueDate,
  nextDueDate,
  paymentStatus: 'UPCOMING_SAFE',
  categoryId: '',
  paymentAccountId: '',
  isActive,
  autoRenew: true,
  reminderDaysBefore: 3,
  createdAt: '',
  updatedAt: '',
});

describe('accountForms helpers', () => {
  it('parsePercentInput accepts decimal comma and dot, rejects garbage', () => {
    expect(parsePercentInput('1,99')).toBe(1.99);
    expect(parsePercentInput('1.99')).toBe(1.99);
    expect(parsePercentInput(' 2 % ')).toBe(2);
    expect(parsePercentInput('0')).toBe(0);
    expect(parsePercentInput('')).toBeNull();
    expect(parsePercentInput('abc')).toBeNull();
    expect(parsePercentInput('1,2,3')).toBeNull();
    expect(parsePercentInput('-1')).toBeNull();
  });

  it('parseDayOfMonth only accepts integers 1..31', () => {
    expect(parseDayOfMonth('1')).toBe(1);
    expect(parseDayOfMonth('31')).toBe(31);
    expect(parseDayOfMonth(15)).toBe(15);
    expect(parseDayOfMonth('0')).toBeNull();
    expect(parseDayOfMonth('32')).toBeNull();
    expect(parseDayOfMonth('1.5')).toBeNull();
    expect(parseDayOfMonth('')).toBeNull();
  });

  it('getCurrencySymbol and getCadenceLabel are locale-aware', () => {
    expect(getCurrencySymbol('BRL', 'pt-BR')).toBe('R$');
    expect(getCurrencySymbol('USD', 'en-US')).toBe('$');
    expect(getCadenceLabel('monthly', 'pt-BR')).toBe('Mensal');
    expect(getCadenceLabel('annually', 'en-US')).toBe('Annually');
  });

  it('selectRadarBills keeps active bills overdue or due within the window, sorted ascending', () => {
    const today = '2026-10-18';
    const result = selectRadarBills(
      [
        bill('far', '2026-10-25'),
        bill('soon', '2026-10-21'),
        bill('today', '2026-10-18'),
        bill('overdue', '2026-10-10'),
        bill('inactive', '2026-10-17', false),
        bill('edge', '2026-10-22'),
      ],
      today,
      3
    );
    expect(result.map((r) => r.bill.id)).toEqual(['overdue', 'today', 'soon']);
    expect(result.map((r) => r.status)).toEqual(['OVERDUE', 'DUE_TODAY', 'DUE_SOON']);
  });
});
