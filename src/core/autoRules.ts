/**
 * src/core/autoRules.ts
 *
 * Auto-Categorization Rules & Transaction Deduplication Hashing Engine for Keroo.
 * 1. Priority-ordered rule evaluation with multi-rule composition & first-match-stop modes.
 * 2. Accent-insensitive & case-insensitive matching across text and numeric fields.
 * 3. Brazilian bank noise cleaning & rule suggestion heuristic.
 * 4. Deterministic SHA-256 deduplication hashing (Web Crypto async + pure TS sync fallback).
 * 5. Frequency-tracking multi-key transaction deduplication.
 */

import type {
  Cents,
  ISODate,
  TransactionType,
  TransactionStatus,
  Transaction,
  AutoRuleConditionField,
  AutoRuleOperator,
  AutoRuleCondition,
  AutoRuleActionField,
  AutoRuleAction,
  AutoRule,
} from '../types';

// ============================================================================
// Types & Interfaces
// ============================================================================

// The rule shape lives in src/types/index.ts (shared with the Dexie table);
// re-exported here so engine consumers keep importing from this module.
export type {
  AutoRuleConditionField,
  AutoRuleOperator,
  AutoRuleCondition,
  AutoRuleActionField,
  AutoRuleAction,
  AutoRule,
};

export type DraftAutoRule = Omit<AutoRule, 'id'> & { id?: string };

export interface DraftTransaction {
  id?: string;
  accountId?: string;
  date: ISODate;
  amountCents: Cents;
  type?: TransactionType;
  categoryId?: string | null;
  payee: string;
  notes?: string;
  memo?: string;
  status?: TransactionStatus;
  tags?: string[];
  isExcludedFromBudget?: boolean;
  fitid?: string;
  importHash?: string;
  /** Statement format of an imported draft. FITID is trusted as identity only for 'ofx'. */
  source?: 'csv' | 'ofx';
}

export interface AppliedRuleMetadata {
  ruleId: string;
  ruleName: string;
  priority: number;
  actionsApplied: AutoRuleAction[];
}

export interface TransactionWithAppliedRules extends DraftTransaction {
  appliedRules: string[]; // List of rule IDs applied
  appliedRuleIds: string[];
  appliedRuleNames: string[];
  appliedRulesMetadata: AppliedRuleMetadata[];
}

export interface ApplyRulesOptions {
  stopOnFirstMatch?: boolean;
  preserveExistingCategory?: boolean;
}

export interface DeduplicationResult {
  unique: DraftTransaction[];
  duplicates: DraftTransaction[];
  duplicatesCount: number;
}

// ============================================================================
// Text Normalization
// ============================================================================

export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Normalization used by CONTAINS / STARTS_WITH / ENDS_WITH on BOTH sides:
 * lowercase, strip accents, collapse every run of non-alphanumerics to one space.
 * 'PAG*Mercadinho 01/01' -> 'pag mercadinho 01 01'.
 */
export function normalizeForMatch(text: string): string {
  if (!text) return '';
  return normalizeText(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ============================================================================
// Condition Evaluation
// ============================================================================

export function evaluateCondition(
  tx: DraftTransaction,
  condition: AutoRuleCondition
): boolean {
  const op = String(condition.operator).toUpperCase();
  const field = condition.field;

  let rawVal: string | number | undefined;
  if (field === 'payee') {
    rawVal = tx.payee || '';
  } else if (field === 'memo' || field === 'notes') {
    rawVal = tx.notes ?? tx.memo ?? '';
  } else if (field === 'amount' || field === 'amountCents') {
    rawVal = tx.amountCents;
  } else if (field === 'accountId') {
    rawVal = tx.accountId || '';
  } else {
    return false;
  }

  // Numeric comparisons
  if (op === 'GREATER_THAN') {
    return Number(rawVal) > Number(condition.value);
  }
  if (op === 'LESS_THAN') {
    return Number(rawVal) < Number(condition.value);
  }

  // Equality (numeric vs string)
  if (op === 'EQUALS') {
    if (typeof rawVal === 'number' || field === 'amount' || field === 'amountCents') {
      return Number(rawVal) === Number(condition.value);
    }
    return normalizeText(String(rawVal)) === normalizeText(String(condition.value));
  }

  // String comparisons (same normalization on both sides)
  const normVal = normalizeForMatch(String(rawVal));
  const normCond = normalizeForMatch(String(condition.value ?? ''));

  // An empty / whitespace / punctuation-only value must never match everything
  if ((op === 'CONTAINS' || op === 'STARTS_WITH' || op === 'ENDS_WITH') && !normCond) {
    return false;
  }

  if (op === 'CONTAINS') {
    return normVal.includes(normCond);
  }
  if (op === 'STARTS_WITH') {
    return normVal.startsWith(normCond);
  }
  if (op === 'ENDS_WITH') {
    return normVal.endsWith(normCond);
  }
  if (op === 'REGEX') {
    try {
      const re = new RegExp(String(condition.value), 'i');
      return re.test(normalizeText(String(rawVal))) || re.test(String(rawVal));
    } catch {
      return false;
    }
  }

  return false;
}

export function evaluateRuleMatches(tx: DraftTransaction, rule: AutoRule): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return false;

  if (rule.logic === 'OR') {
    return rule.conditions.some((cond) => evaluateCondition(tx, cond));
  }
  return rule.conditions.every((cond) => evaluateCondition(tx, cond));
}

// ============================================================================
// Rule Execution Engine
// ============================================================================

export function applyAutoRules(
  transaction: DraftTransaction,
  rules: AutoRule[],
  modeOrOptions?: 'all_composed' | 'first_match_stop' | ApplyRulesOptions
): TransactionWithAppliedRules {
  let stopOnFirstMatch = false;
  let preserveExistingCategory = false;

  if (typeof modeOrOptions === 'string') {
    stopOnFirstMatch = modeOrOptions === 'first_match_stop';
  } else if (modeOrOptions && typeof modeOrOptions === 'object') {
    stopOnFirstMatch = Boolean(modeOrOptions.stopOnFirstMatch);
    preserveExistingCategory = Boolean(modeOrOptions.preserveExistingCategory);
  }

  const tx: TransactionWithAppliedRules = {
    ...transaction,
    tags: transaction.tags ? [...transaction.tags] : [],
    appliedRules: [],
    appliedRuleIds: [],
    appliedRuleNames: [],
    appliedRulesMetadata: [],
  };

  const sortedRules = rules
    .filter((r) => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!evaluateRuleMatches(tx, rule)) continue;

    const appliedActions: AutoRuleAction[] = [];

    for (const action of rule.actions) {
      if (action.field === 'categoryId') {
        if (preserveExistingCategory && tx.categoryId) {
          continue;
        }
        tx.categoryId = action.value as string;
        appliedActions.push(action);
      } else if (action.field === 'payee') {
        tx.payee = String(action.value);
        appliedActions.push(action);
      } else if (action.field === 'notes' || action.field === 'memo') {
        tx.notes = String(action.value);
        tx.memo = String(action.value);
        appliedActions.push(action);
      } else if (action.field === 'tags') {
        const newTags = Array.isArray(action.value)
          ? action.value
          : String(action.value)
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean);
        tx.tags = Array.from(new Set([...(tx.tags || []), ...newTags]));
        appliedActions.push(action);
      } else if (action.field === 'isExcludedFromBudget') {
        tx.isExcludedFromBudget = Boolean(action.value);
        appliedActions.push(action);
      } else if (action.field === 'status') {
        tx.status = action.value as TransactionStatus;
        appliedActions.push(action);
      }
    }

    tx.appliedRules.push(rule.id);
    tx.appliedRuleIds.push(rule.id);
    tx.appliedRuleNames.push(rule.name);
    tx.appliedRulesMetadata.push({
      ruleId: rule.id,
      ruleName: rule.name,
      priority: rule.priority,
      actionsApplied: appliedActions,
    });

    if (stopOnFirstMatch) {
      break;
    }
  }

  return tx;
}

// ============================================================================
// Rule Suggestion & Payee Cleaning
// ============================================================================

export function cleanPayeeName(rawPayee: string): string {
  if (!rawPayee) return '';

  let cleaned = rawPayee.trim();

  // 1. Strip leading payment channel prefixes
  cleaned = cleaned.replace(
    /^(?:PAG\s*\*|PAGTO\s*\*|COMPRA\s+CARTAO\s*-\s*|COMPRA\s*-\s*|COMPRA\s+DEBITO\s*-\s*|PIX\s+TRANSF(?:ERENCIA)?\b\s*|PIX\s+ENVIADO\b\s*|PIX\s+RECEBIDO\b\s*|(?:TED|DOC|TBI)\b\s*|PAGAMENTO\s+(?:DE\s+)?)/i,
    ''
  );

  // 2. Strip common card brand tokens or gateway wrappers
  cleaned = cleaned.replace(/^(?:MP\s*\*|PAYPAL\s*\*|SUMUP\s*\*|STONE\s*\*)/i, '');

  // 3. Strip trailing terminal codes, dates, installments, URLs, and city markers
  // Domains keep their merchant label ('AMAZON.COM.BR' -> 'AMAZON') unless that
  // label already appears elsewhere ('UBER *TRIP HELP.UBER.COM' -> 'UBER *TRIP').
  const domainRe = /(?:https?:\/\/)?(?:(?:www|help)\.)?([a-z0-9-]+)\.(?:com|org|net)(?:\.br)?\b/gi;
  const otherTokens = new Set(
    cleaned.replace(domainRe, ' ').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean)
  );
  cleaned = cleaned.replace(domainRe, (_m, label: string) =>
    otherTokens.has(label.toUpperCase()) ? '' : label
  );

  cleaned = cleaned
    .replace(/\.com(?:\.br)?/gi, '')
    .replace(/\s+\d{1,2}\/\d{1,2}(?:\b|$)/g, '')
    .replace(/\s+(?:SAO PAULO|RIO DE JANEIRO|CURITIBA|BELO HORIZONTE|BRASILIA)\b/gi, '')
    .replace(/\s+(?:SP|RJ|PR|MG|DF|BR|BRA|BRASIL)\b/gi, '')
    .replace(/\s+\d{4,}\b/g, '')
    .replace(/[*_#-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.length >= 2 ? cleaned : rawPayee.trim();
}

/**
 * Returns a CONTAINS value guaranteed to match `originalPayee` under
 * normalizeForMatch: the cleaned name when it still matches, otherwise the
 * longest contiguous run of its tokens that does, otherwise the original payee.
 */
function buildMatchingContainsValue(cleaned: string, originalPayee: string): string {
  const target = normalizeForMatch(originalPayee);
  const matches = (candidate: string): boolean => {
    const norm = normalizeForMatch(candidate);
    return norm.length > 0 && target.includes(norm);
  };
  if (matches(cleaned)) return cleaned;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  let best = '';
  for (let i = 0; i < tokens.length; i++) {
    for (let j = tokens.length; j > i; j--) {
      const candidate = tokens.slice(i, j).join(' ');
      if (candidate.length > best.length && matches(candidate)) {
        best = candidate;
        break;
      }
    }
  }
  return best || originalPayee.trim();
}

export function suggestRuleFromTransaction(
  tx: Transaction | DraftTransaction
): DraftAutoRule {
  const cleaned = cleanPayeeName(tx.payee);
  const conditions: AutoRuleCondition[] = [
    {
      field: 'payee',
      operator: 'CONTAINS',
      value: buildMatchingContainsValue(cleaned, tx.payee),
    },
  ];

  const actions: AutoRuleAction[] = [];

  if (tx.categoryId) {
    actions.push({
      field: 'categoryId',
      value: tx.categoryId,
    });
  }

  if (cleaned && cleaned.toLowerCase() !== tx.payee.trim().toLowerCase()) {
    actions.push({
      field: 'payee',
      value: cleaned,
    });
  }

  return {
    name: `Auto: ${cleaned}`,
    priority: 10,
    logic: 'AND',
    conditions,
    actions,
    isActive: true,
  };
}

// ============================================================================
// Deterministic Deduplication Hashing
// ============================================================================

export function buildCanonicalTransactionString(
  date: string,
  amountCents: number,
  payee: string,
  memo?: string
): string {
  const normalizedDate = (date || '').trim().slice(0, 10);
  const normalizedAmount = Math.round(Math.abs(amountCents)).toString();
  const normalizedPayee = (payee || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const normalizedMemo = (memo || '').toLowerCase().replace(/\s+/g, ' ').trim();

  return `${normalizedDate}|${normalizedAmount}|${normalizedPayee}|${normalizedMemo}`;
}

/**
 * Standard pure TypeScript FIPS 180-4 SHA-256 for deterministic synchronous execution.
 */
export function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  const words: number[] = [];
  let hash: number[] = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const utf8Bytes: number[] = [];
  for (let b = 0; b < ascii.length; b++) {
    let charcode = ascii.charCodeAt(b);
    if (charcode < 0x80) utf8Bytes.push(charcode);
    else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
    } else {
      b++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (ascii.charCodeAt(b) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }

  const utf8BitLength = utf8Bytes.length * 8;
  utf8Bytes.push(0x80);
  while ((utf8Bytes.length % 64) !== 56) {
    utf8Bytes.push(0);
  }
  for (let shift = 56; shift >= 0; shift -= 8) {
    if (shift >= 32) utf8Bytes.push(0);
    else utf8Bytes.push((utf8BitLength >>> shift) & 0xff);
  }

  for (let w = 0; w < utf8Bytes.length; w += 4) {
    words.push(
      (utf8Bytes[w] << 24) |
      (utf8Bytes[w + 1] << 16) |
      (utf8Bytes[w + 2] << 8) |
      utf8Bytes[w + 3]
    );
  }

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    const w: number[] = [];
    for (let t = 0; t < 16; t++) w[t] = words[chunk + t];
    for (let t = 16; t < 64; t++) {
      const s0 = rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let t = 0; t < 64; t++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[t] + w[t]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  let result = '';
  for (let hIndex = 0; hIndex < 8; hIndex++) {
    result += (hash[hIndex] >>> 0).toString(16).padStart(8, '0');
  }
  return result;
}

export function computeImportHashSync(
  date: string,
  amountCents: number,
  payee: string,
  memo?: string
): string {
  const canonical = buildCanonicalTransactionString(date, amountCents, payee, memo);
  return sha256Sync(canonical);
}

export async function computeImportHash(
  date: string,
  amountCents: number,
  payee: string,
  memo?: string
): Promise<string> {
  const canonical = buildCanonicalTransactionString(date, amountCents, payee, memo);

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(canonical);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  return sha256Sync(canonical);
}

// ============================================================================
// Deduplication Filter Engine
// ============================================================================

function scopedFitidKey(accountId: string | undefined, fitid: string): string {
  return `${accountId ?? ''}:${fitid.trim()}`;
}

/**
 * The ONE dedup hash used for both existing and incoming transactions:
 * SHA-256 of 'accountId|type|' + the canonical date|amount|payee|memo string.
 */
export function computeDedupHashSync(tx: {
  accountId?: string;
  type?: TransactionType;
  date: string;
  amountCents: number;
  payee: string;
  notes?: string;
  memo?: string;
}): string {
  const canonical = buildCanonicalTransactionString(
    tx.date,
    tx.amountCents,
    tx.payee,
    tx.notes || tx.memo
  );
  return sha256Sync(`${tx.accountId ?? ''}|${tx.type ?? ''}|${canonical}`);
}

export function filterDuplicateTransactions(
  newTransactions: DraftTransaction[],
  existingTransactions: Transaction[]
): DeduplicationResult {
  if (!newTransactions || newTransactions.length === 0) {
    return { unique: [], duplicates: [], duplicatesCount: 0 };
  }

  // FITIDs are only unique within one bank account: scope them as '<accountId>:<fitid>'.
  const existingFitids = new Set<string>();
  const existingHashCounts = new Map<string, number>();

  for (const existing of existingTransactions) {
    if (existing.fitid) {
      existingFitids.add(scopedFitidKey(existing.accountId, existing.fitid));
    }
    // Stored importHash values come from the parser's own (different) scheme,
    // so both sides are always recomputed with computeDedupHashSync.
    const hash = computeDedupHashSync(existing);
    existingHashCounts.set(hash, (existingHashCounts.get(hash) || 0) + 1);
  }

  const unique: DraftTransaction[] = [];
  const duplicates: DraftTransaction[] = [];

  for (const rawDraft of newTransactions) {
    const draft: DraftTransaction = { ...rawDraft };
    const hash = computeDedupHashSync(draft);
    draft.importHash = draft.importHash || hash;

    // Check 1: FITID Match — trusted as identity only for OFX drafts
    // (CSV "id" columns are not stable bank identifiers; CSV relies on the hash).
    if (
      draft.source === 'ofx' &&
      draft.fitid &&
      existingFitids.has(scopedFitidKey(draft.accountId, draft.fitid))
    ) {
      duplicates.push(draft);
      continue;
    }

    // Check 2: Hash Frequency Match
    const remainingCount = existingHashCounts.get(hash) || 0;
    if (remainingCount > 0) {
      existingHashCounts.set(hash, remainingCount - 1);
      duplicates.push(draft);
    } else {
      unique.push(draft);
    }
  }

  return {
    unique,
    duplicates,
    duplicatesCount: duplicates.length,
  };
}
