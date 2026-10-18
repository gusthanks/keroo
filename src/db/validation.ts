/**
 * src/db/validation.ts
 *
 * Database Boundary Protection & Monetary Field Integrity Hooks for Dexie.js.
 * Validates all 18 monetary fields across tables on create and update.
 * Guarantees that zero floating-point cents ever enter IndexedDB (C in Z).
 */

import type Dexie from 'dexie';
import { assertIntegerCents } from '../core/currency';

export interface MonetaryFieldRule {
  field: string;
  allowNegative?: boolean;
  strictlyPositive?: boolean;
}

export interface TableMonetaryConfig {
  rootFields?: MonetaryFieldRule[];
  nestedArrayFields?: {
    arrayKey: string;
    rules: MonetaryFieldRule[];
  }[];
}

/**
 * Registry of all 18 monetary fields across the 14 tables:
 * 1. accounts: initialBalanceCents (>= 0), currentBalanceCents (signed), creditLimitCents (>= 0)
 * 2. monthly_envelopes: assignedCents (signed), activityCents (signed), availableCents (signed)
 * 3. transactions: amountCents (> 0 strictly)
 * 4. installment_plans: totalAmountCents (> 0), originalPrincipalCents (> 0)
 *    nested installments: amountCents (> 0), principalCents (>= 0), interestCents (>= 0)
 * 5. recurring_bills: amountCents (> 0)
 * 6. split_expenses: totalAmountCents (> 0)
 *    nested shares: shareCents (>= 0)
 * 7. split_settlements: amountCents (> 0)
 * 8. piggy_banks: targetCents (>= 0), savedCents (>= 0)
 */
export const MONETARY_RULES: Record<string, TableMonetaryConfig> = {
  accounts: {
    rootFields: [
      { field: 'initialBalanceCents', allowNegative: false },
      { field: 'currentBalanceCents', allowNegative: true },
      { field: 'creditLimitCents', allowNegative: false },
    ],
  },
  monthly_envelopes: {
    rootFields: [
      { field: 'assignedCents', allowNegative: true },
      { field: 'activityCents', allowNegative: true },
      { field: 'availableCents', allowNegative: true },
    ],
  },
  transactions: {
    rootFields: [
      { field: 'amountCents', allowNegative: false, strictlyPositive: true },
    ],
  },
  installment_plans: {
    rootFields: [
      { field: 'totalAmountCents', strictlyPositive: true },
      { field: 'originalPrincipalCents', strictlyPositive: true },
    ],
    nestedArrayFields: [
      {
        arrayKey: 'installments',
        rules: [
          { field: 'amountCents', strictlyPositive: true },
          { field: 'principalCents', allowNegative: false },
          { field: 'interestCents', allowNegative: false },
        ],
      },
    ],
  },
  recurring_bills: {
    rootFields: [
      { field: 'amountCents', strictlyPositive: true },
    ],
  },
  split_expenses: {
    rootFields: [
      { field: 'totalAmountCents', strictlyPositive: true },
    ],
    nestedArrayFields: [
      {
        arrayKey: 'shares',
        rules: [
          { field: 'shareCents', allowNegative: false },
        ],
      },
    ],
  },
  split_settlements: {
    rootFields: [
      { field: 'amountCents', strictlyPositive: true },
    ],
  },
  piggy_banks: {
    rootFields: [
      { field: 'targetCents', allowNegative: false },
      { field: 'savedCents', allowNegative: false },
    ],
  },
};

export function validateEntityMonetary(tableName: string, obj: any): void {
  const tableConfig = MONETARY_RULES[tableName];
  if (!tableConfig || !obj || typeof obj !== 'object') return;

  // 1. Root fields validation
  if (tableConfig.rootFields) {
    for (const rule of tableConfig.rootFields) {
      if (rule.field in obj && obj[rule.field] !== undefined && obj[rule.field] !== null) {
        const val = obj[rule.field];
        assertIntegerCents(val, `${tableName}.${rule.field}`);
        if (!rule.allowNegative && val < 0) {
          throw new RangeError(
            `[DbValidationError] ${tableName}.${rule.field} cannot be negative (received ${val})`
          );
        }
        if (rule.strictlyPositive && val <= 0) {
          throw new RangeError(
            `[DbValidationError] ${tableName}.${rule.field} must be > 0 (received ${val})`
          );
        }
      }
    }
  }

  // 2. Nested array fields validation (e.g. installments, split shares)
  if (tableConfig.nestedArrayFields) {
    for (const nested of tableConfig.nestedArrayFields) {
      const arr = obj[nested.arrayKey];
      if (Array.isArray(arr)) {
        for (let i = 0; i < arr.length; i++) {
          const item = arr[i];
          if (item && typeof item === 'object') {
            for (const rule of nested.rules) {
              if (rule.field in item && item[rule.field] !== undefined && item[rule.field] !== null) {
                const val = item[rule.field];
                assertIntegerCents(val, `${tableName}.${nested.arrayKey}[${i}].${rule.field}`);
                if (!rule.allowNegative && val < 0) {
                  throw new RangeError(
                    `[DbValidationError] ${tableName}.${nested.arrayKey}[${i}].${rule.field} cannot be negative`
                  );
                }
                if (rule.strictlyPositive && val <= 0) {
                  throw new RangeError(
                    `[DbValidationError] ${tableName}.${nested.arrayKey}[${i}].${rule.field} must be > 0`
                  );
                }
              }
            }
          }
        }
      }
    }
  }
}

/**
 * Attaches creating and updating hooks across all tables in a Dexie instance.
 */
export function attachMonetaryHooks(db: Dexie): void {
  for (const tableName of Object.keys(MONETARY_RULES)) {
    const table = db.table(tableName);
    if (!table) continue;

    table.hook('creating', function (_primKey, obj) {
      validateEntityMonetary(tableName, obj);
    });

    table.hook('updating', function (modifications, _primKey, obj) {
      const merged = { ...obj, ...modifications };
      validateEntityMonetary(tableName, merged);
    });
  }
}
