/**
 * src/core/importParser.ts
 *
 * Zero-dependency, local-first Bank Statement Ingestion Engine for Keroo.
 * Supports:
 * 1. CSV parser with auto-delimiter detection (;, ,, \t, |), RFC 4180 tokenizer,
 *    preamble skipping, header fuzzy normalization (Nubank, Inter, Itaú, YNAB, Generic),
 *    date normalization (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD), and exact string integer cents.
 * 2. OFX 1.0 (SGML with unclosed leaf tags) and OFX 2.0 (XML) statement parser.
 * 3. Unified parseImportFile entry point with deterministic deduplication hashing
 *    and non-catastrophic row-level warning streams.
 *
 * Invariant: All monetary values are strictly positive integer Cents (C in Z).
 */

import type { Cents, ISODate, TransactionType, TransactionStatus, SupportedCurrency } from '../types';
import { isValidISODate } from './dates';

export type ImportWarningCode =
  | 'INVALID_DATE'
  | 'INVALID_AMOUNT'
  | 'MISSING_PAYEE'
  | 'UNRECOGNIZED_DELIMITER'
  | 'UNKNOWN_HEADER'
  | 'INCOMPLETE_ROW'
  | 'SKIPPED_PREAMBLE_ROW'
  | 'ZERO_AMOUNT'
  | 'UNPARSED_TAGS'
  | 'AMBIGUOUS_DATE_FORMAT'
  | 'AMBIGUOUS_AMOUNT';

/** Values a UI needs to render a warning in the user's language (e.g. `{row}`, `{value}`). */
export type ImportWarningParams = Record<string, string | number>;

/**
 * A non-fatal, row-level import problem.
 *
 * The parser is locale-free: code (plus params) is the contract a UI translates (key
 * accounts.import_warn.<code> with params). message is an English, developer-facing
 * fallback only and must never be shown to users as-is.
 */
export interface ImportRowWarning {
  rowIndex: number;
  rawRow: string;
  code: ImportWarningCode;
  message: string;
  params?: ImportWarningParams;
}

/** Options shared by every parser entry point. */
export interface ImportParseOptions {
  /**
   * Payee used when a row has neither a description nor a memo. Callers pass a translated
   * label (e.g. `t('accounts.import_no_description')`); defaults to DEFAULT_FALLBACK_PAYEE.
   */
  fallbackPayee?: string;
}

/** Locale-free default payee for rows without any description. */
export const DEFAULT_FALLBACK_PAYEE = 'No description';

const resolveFallbackPayee = (options?: ImportParseOptions): string =>
  options?.fallbackPayee?.trim() || DEFAULT_FALLBACK_PAYEE;

export interface ImportTransactionDraft {
  id: string;
  accountId: string;
  date: ISODate;
  amountCents: Cents;
  type: TransactionType;
  payee: string;
  notes: string;
  status: TransactionStatus;
  categoryId: string | null;
  fitid?: string;
  importHash: string;
  rawSource: string;
  /** Statement format the draft came from; dedup trusts FITID only for 'ofx'. */
  source?: 'csv' | 'ofx';
}

export interface ParsedImportMetadata {
  fileType: 'csv' | 'ofx';
  detectedDelimiter?: string;
  detectedDateFormat?: string;
  /** True when the date format could not be proven from the data (defaulted to DD/MM/YYYY). */
  dateFormatAmbiguous?: boolean;
  /** File-level decimal separator inferred from ',dd' / '.dd' endings (absent when none found). */
  detectedDecimalSeparator?: DecimalSeparator;
  /** How lone 'x.ddd' / 'x,ddd' amounts were read, when the file had any. */
  ambiguousAmountsResolvedAs?: 'decimal' | 'thousands';
  ambiguousAmountsCount?: number;
  bankName?: string;
  accountNumber?: string;
  currency?: SupportedCurrency;
  totalRowsProcessed: number;
  validRowsCount: number;
  invalidRowsCount: number;
}

export interface ParsedImportResult {
  transactions: ImportTransactionDraft[];
  warnings: ImportRowWarning[];
  metadata: ParsedImportMetadata;
  success: boolean;
}

// ============================================================================
// Hashing & Unique ID Helpers
// ============================================================================

export function computeDeterministicHash(str: string): string {
  let hash1 = 0x811c9dc5;
  let hash2 = 0xcbf29ce4;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash1 = Math.imul(hash1 ^ char, 0x01000193);
    hash2 = Math.imul(hash2 ^ char, 0x100000001b3);
  }
  return (
    ('0000000' + (hash1 >>> 0).toString(16)).slice(-8) +
    ('0000000' + (hash2 >>> 0).toString(16)).slice(-8)
  );
}

export function generateTransactionImportHash(
  accountId: string,
  date: ISODate,
  amountCents: Cents,
  type: TransactionType,
  fitid?: string,
  payee?: string
): string {
  const identifier = fitid?.trim() || payee?.toLowerCase().replace(/\s+/g, ' ').trim() || 'no_id';
  const rawKey = `${accountId}:${date}:${amountCents}:${type}:${identifier}`;
  return computeDeterministicHash(rawKey);
}

function generateTempDraftId(): string {
  return 'draft_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ============================================================================
// Exact String-Based Amount & Date Parsers
// ============================================================================

export type DecimalSeparator = ',' | '.';

export interface ParseAmountOptions {
  /**
   * File-level decimal style. Used ONLY to resolve a lone separator followed by
   * exactly 3 digits ('1.234' / '1,234'): when it equals that separator the value
   * is decimal, otherwise it is a thousands group. null/undefined -> thousands.
   */
  decimalHint?: DecimalSeparator | null;
}

const DC_TOKEN_SOURCE = '(D[EÉ]BITO|DEBIT|DEB|D|CR[EÉ]DITO|CREDIT|CRED|C)';
const TRAILING_DC_RE = new RegExp(`^(.*[\\d)])\\s*${DC_TOKEN_SOURCE}\\.?$`, 'i');
const LEADING_DC_RE = new RegExp(`^${DC_TOKEN_SOURCE}\\.?(?=[\\s\\d+\\-(])\\s*(.*)$`, 'i');

function dcTokenIsDebit(token: string): boolean {
  return token.toUpperCase().startsWith('D');
}

function stripAccentsUpper(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/**
 * True when the amount has exactly one separator kind, used once, followed by
 * exactly 3 digits (e.g. '1.234' or '1,234') — the only case where the
 * decimal-vs-thousands decision depends on the file-level style.
 */
export function isAmbiguousSeparatorAmount(rawStr: string): boolean {
  if (!rawStr || typeof rawStr !== 'string') return false;
  const digitsAndSeps = rawStr.replace(/[^\d.,]/g, '');
  const commas = (digitsAndSeps.match(/,/g) || []).length;
  const dots = (digitsAndSeps.match(/\./g) || []).length;
  if (commas + dots !== 1) return false;
  return /^\d+[.,]\d{3}$/.test(digitsAndSeps);
}

/**
 * Detects the file-level decimal separator from a set of raw amount strings:
 * counts values ending in ',dd' vs '.dd'. Returns null when no value has a
 * two-digit decimal ending.
 */
export function detectDecimalStyle(samples: string[]): DecimalSeparator | null {
  let commaHits = 0;
  let dotHits = 0;
  for (const raw of samples) {
    if (!raw || typeof raw !== 'string') continue;
    const tail = raw.replace(/[^\d.,]+$/, '');
    if (/,\d{2}$/.test(tail)) commaHits++;
    else if (/\.\d{2}$/.test(tail)) dotHits++;
  }
  if (commaHits === 0 && dotHits === 0) return null;
  return commaHits >= dotHits ? ',' : '.';
}

export function parseAmountToCents(
  rawStr: string,
  dOrCFlag?: string,
  options?: ParseAmountOptions
): { cents: Cents; type: 'expense' | 'income' } | null {
  if (!rawStr || typeof rawStr !== 'string') return null;

  let str = rawStr.trim();
  if (!str) return null;

  // D/C Flag override hint
  let flagNegative: boolean | null = null;
  if (dOrCFlag) {
    const flag = stripAccentsUpper(dOrCFlag.trim());
    if (flag === 'D' || flag === 'DEB' || flag === 'DEBITO' || flag === 'DEBIT') {
      flagNegative = true;
    } else if (flag === 'C' || flag === 'CRED' || flag === 'CREDITO' || flag === 'CREDIT') {
      flagNegative = false;
    }
  }

  // Inline D/C token ('1.234,56 D', 'C 10,00') must be read BEFORE currency
  // letters are stripped, otherwise the 'D' is silently dropped as a letter.
  let inlineNegative: boolean | null = null;
  const trailing = TRAILING_DC_RE.exec(str);
  if (trailing) {
    inlineNegative = dcTokenIsDebit(trailing[2]);
    str = trailing[1].trim();
  } else {
    const leading = LEADING_DC_RE.exec(str);
    if (leading) {
      inlineNegative = dcTokenIsDebit(leading[1]);
      str = leading[2].trim();
    }
  }

  // Strip currency tokens and whitespace, keeping digits, commas, dots, minus, parens
  str = str.replace(/R\$|US\$|BRL|USD|EUR|[$€£]|\s/gi, '');
  if (!str || !/\d/.test(str)) return null;

  // Detect negative indicators
  let isNegative = false;
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.slice(1, -1).trim();
  } else if (str.endsWith('-')) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  } else if (str.includes('-')) {
    isNegative = true;
    str = str.replace(/-/g, '').trim();
  }

  if (flagNegative !== null) {
    isNegative = flagNegative;
  } else if (inlineNegative !== null) {
    isNegative = inlineNegative;
  }

  let intPart = '';
  let decPart = '';

  const commaCount = (str.match(/,/g) || []).length;
  const dotCount = (str.match(/\./g) || []).length;
  const hasComma = commaCount > 0;
  const hasDot = dotCount > 0;

  if (hasComma !== hasDot) {
    // Exactly one separator kind present.
    const sep: DecimalSeparator = hasComma ? ',' : '.';
    const count = hasComma ? commaCount : dotCount;
    const lastSep = str.lastIndexOf(sep);
    const after = str.slice(lastSep + 1).replace(/\D/g, '');
    let isThousands: boolean;
    if (count > 1) {
      // Repeated separator is always a thousands group: '1,234,567' / '1.234.567'
      isThousands = true;
    } else if (after.length === 3) {
      // Ambiguous: decide by the file-level decimal style (default: thousands)
      isThousands = options?.decimalHint !== sep;
    } else {
      isThousands = false;
    }
    if (isThousands) {
      intPart = str.split(sep).join('');
      decPart = '00';
    } else {
      intPart = str.slice(0, lastSep);
      decPart = str.slice(lastSep + 1);
    }
  } else if (hasComma && hasDot) {
    const lastComma = str.lastIndexOf(',');
    const lastDot = str.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Brazilian format: 1.250,50
      intPart = str.slice(0, lastComma).replace(/\./g, '');
      decPart = str.slice(lastComma + 1);
    } else {
      // US format: 1,250.50
      intPart = str.slice(0, lastDot).replace(/,/g, '');
      decPart = str.slice(lastDot + 1);
    }
  } else {
    intPart = str;
    decPart = '00';
  }

  intPart = intPart.replace(/\D/g, '') || '0';
  decPart = decPart.replace(/\D/g, '');

  let fractionCents = 0;
  if (decPart.length === 0) {
    fractionCents = 0;
  } else if (decPart.length === 1) {
    fractionCents = parseInt(decPart, 10) * 10;
  } else if (decPart.length === 2) {
    fractionCents = parseInt(decPart, 10);
  } else {
    // 3+ digits: mathematical half-up rounding on 3rd digit
    const firstTwo = parseInt(decPart.slice(0, 2), 10);
    const thirdDigit = parseInt(decPart[2], 10);
    fractionCents = thirdDigit >= 5 ? firstTwo + 1 : firstTwo;
  }

  const baseUnits = parseInt(intPart, 10);
  if (isNaN(baseUnits) || isNaN(fractionCents)) return null;

  const totalCents = baseUnits * 100 + fractionCents;

  return {
    cents: totalCents,
    type: isNegative ? 'expense' : 'income',
  };
}

export type DateFormatPattern = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY';

export function detectDateFormat(sampleDates: string[]): DateFormatPattern {
  return detectDateFormatDetailed(sampleDates).format;
}

/**
 * Scans EVERY sample (callers pass all data rows, not a window).
 * `ambiguous` is true when no sample proves the day/month order (all parts <= 12)
 * or when samples contradict each other; the format then defaults to DD/MM/YYYY.
 */
export function detectDateFormatDetailed(
  sampleDates: string[]
): { format: DateFormatPattern; ambiguous: boolean } {
  let hasDayGreaterThan12 = false;
  let hasMonthGreaterThan12 = false;
  let sawCandidate = false;

  for (const dateStr of sampleDates) {
    if (!dateStr || typeof dateStr !== 'string') continue;
    const clean = dateStr.trim().split(/[\sT]/)[0];
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(clean)) {
      return { format: 'YYYY-MM-DD', ambiguous: false };
    }
    const parts = clean.split(/[-/.]/).map((p) => parseInt(p, 10));
    if (parts.length === 3 && !parts.some(isNaN)) {
      sawCandidate = true;
      if (parts[0] > 12) hasDayGreaterThan12 = true;
      if (parts[1] > 12) hasMonthGreaterThan12 = true;
    }
  }

  if (hasDayGreaterThan12 && !hasMonthGreaterThan12) return { format: 'DD/MM/YYYY', ambiguous: false };
  if (hasMonthGreaterThan12 && !hasDayGreaterThan12) return { format: 'MM/DD/YYYY', ambiguous: false };
  return { format: 'DD/MM/YYYY', ambiguous: sawCandidate };
}

export function parseDate(dateStr: string, formatHint: DateFormatPattern = 'DD/MM/YYYY'): ISODate | null {
  if (!dateStr || typeof dateStr !== 'string') return null;

  const clean = dateStr.trim().split(/[\sT]/)[0];
  if (!clean) return null;

  // Direct ISO match
  const isoMatch = clean.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10);
    const d = parseInt(isoMatch[3], 10);
    const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isValidISODate(isoDate) ? isoDate : null;
  }

  const parts = clean.split(/[-/.]/).map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;

  let y: number, m: number, d: number;

  if (formatHint === 'MM/DD/YYYY') {
    m = parts[0];
    d = parts[1];
    y = parts[2];
  } else {
    // Default: DD/MM/YYYY
    d = parts[0];
    m = parts[1];
    y = parts[2];
  }

  // 2-digit year normalization
  if (y < 100) {
    y = y <= 50 ? 2000 + y : 1900 + y;
  }

  if (y < 1970 || y > 2100) {
    return null;
  }

  // Rejects impossible calendar dates (31/02, 31/04, month 13, day 0)
  const isoDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(isoDate) ? isoDate : null;
}

// ============================================================================
// CSV Tokenizer & Delimiter Detector
// ============================================================================

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countDelimitersOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  let fieldPrefix = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') i++;
        else inQuotes = false;
      }
      fieldPrefix += char;
    } else if (char === delimiter) {
      count++;
      fieldPrefix = '';
    } else {
      // Only a quote at the start of a field opens quoted mode
      if (char === '"' && fieldPrefix.trim() === '') inQuotes = true;
      fieldPrefix += char;
    }
  }
  return count;
}

export function detectDelimiter(lines: string[]): string {
  const candidates = [';', ',', '\t', '|'];
  const sample = lines.filter((l) => l.trim().length > 0).slice(0, 15);
  if (sample.length === 0) return ',';

  let bestDelimiter = ',';
  let bestScore = -1;

  for (const delimiter of candidates) {
    const counts = sample.map((line) => countDelimitersOutsideQuotes(line, delimiter)).filter((c) => c > 0);
    if (counts.length === 0) continue;

    const frequency = new Map<number, number>();
    for (const c of counts) {
      frequency.set(c, (frequency.get(c) || 0) + 1);
    }

    let maxFreq = 0;
    for (const freq of frequency.values()) {
      if (freq > maxFreq) maxFreq = freq;
    }

    const totalOccurrences = counts.reduce((a, b) => a + b, 0);
    const score = maxFreq * 100 + totalOccurrences;

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

export function parseCsvRows(content: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xfeff) {
    cleanContent = cleanContent.slice(1);
  }

  while (i < cleanContent.length) {
    const char = cleanContent[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < cleanContent.length && cleanContent[i + 1] === '"') {
          currentField += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"' && currentField.trim() === '') {
        // A quote opens quoted mode only at the very start of a field
        // (leading whitespace is discarded); mid-field quotes are literal.
        currentField = '';
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
      } else if (char === '\r') {
        if (i + 1 < cleanContent.length && cleanContent[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        currentField = '';
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

interface HeaderMapping {
  dateIndex: number;
  amountIndex: number;
  outflowIndex: number;
  inflowIndex: number;
  payeeIndex: number;
  notesIndex: number;
  fitidIndex: number;
  categoryIndex: number;
  dcFlagIndex: number;
}

function matchHeaderTokens(headers: string[]): HeaderMapping {
  const mapping: HeaderMapping = {
    dateIndex: -1,
    amountIndex: -1,
    outflowIndex: -1,
    inflowIndex: -1,
    payeeIndex: -1,
    notesIndex: -1,
    fitidIndex: -1,
    categoryIndex: -1,
    dcFlagIndex: -1,
  };

  headers.forEach((raw, idx) => {
    const norm = normalizeHeader(raw);

    // Date
    if (/^(data|data lancamento|data do lancamento|data transacao|dt lancamento|data movimento|dt movimento|data operacao|date|transaction date|posted date)/.test(norm)) {
      if (mapping.dateIndex === -1) mapping.dateIndex = idx;
    }
    // Outflow / Debit
    else if (/^(debito|saida|saidas|despesa|valor debito|debit|outflow|spent|withdrawal)/.test(norm)) {
      if (mapping.outflowIndex === -1) mapping.outflowIndex = idx;
    }
    // Inflow / Credit
    else if (/^(credito|entrada|entradas|receita|valor credito|credit|inflow|deposit)/.test(norm)) {
      if (mapping.inflowIndex === -1) mapping.inflowIndex = idx;
    }
    // Amount
    else if (/^(valor|valor r|quantia|montante|amount|total|net amount)/.test(norm)) {
      if (mapping.amountIndex === -1) mapping.amountIndex = idx;
    }
    // FITID / Identificador
    else if (/^(identificador|id transacao|id|documento|num doc|numero documento|autenticacao|fitid|transaction id|ref number)/.test(norm)) {
      if (mapping.fitidIndex === -1) mapping.fitidIndex = idx;
    }
    // Payee / Description / Title
    else if (/^(descricao|historico|lancamento|estabelecimento|titulo|favorecido|nome|payee|description|title|merchant)/.test(norm)) {
      if (mapping.payeeIndex === -1) mapping.payeeIndex = idx;
    }
    // Notes / Memo
    else if (/^(memo|observacao|observacoes|obs|detalhes|notes|note|comment)/.test(norm)) {
      if (mapping.notesIndex === -1) mapping.notesIndex = idx;
    }
    // Category
    else if (/^(categoria|classificacao|category)/.test(norm)) {
      if (mapping.categoryIndex === -1) mapping.categoryIndex = idx;
    }
    // D/C Flag
    else if (/^(d c|dc|deb cred|natureza|tipo)/.test(norm)) {
      if (mapping.dcFlagIndex === -1) mapping.dcFlagIndex = idx;
    }
  });

  return mapping;
}

export function parseCsv(
  fileContent: string,
  defaultAccountId: string,
  options?: ImportParseOptions
): ParsedImportResult {
  const fallbackPayee = resolveFallbackPayee(options);
  const lines = fileContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = detectDelimiter(lines);
  const allRows = parseCsvRows(fileContent, delimiter);

  const warnings: ImportRowWarning[] = [];
  const transactions: ImportTransactionDraft[] = [];

  if (allRows.length === 0) {
    return {
      transactions: [],
      warnings: [{ rowIndex: 0, rawRow: '', code: 'INCOMPLETE_ROW', message: 'No records found in the CSV file.' }],
      metadata: { fileType: 'csv', detectedDelimiter: delimiter, totalRowsProcessed: 0, validRowsCount: 0, invalidRowsCount: 0 },
      success: false,
    };
  }

  // Locate Header Row (handling preambles)
  let headerRowIndex = -1;
  let mapping: HeaderMapping | null = null;

  for (let r = 0; r < Math.min(allRows.length, 10); r++) {
    const candidateMapping = matchHeaderTokens(allRows[r]);
    const hasDate = candidateMapping.dateIndex !== -1;
    const hasValue = candidateMapping.amountIndex !== -1 || candidateMapping.outflowIndex !== -1 || candidateMapping.inflowIndex !== -1;
    const hasPayee = candidateMapping.payeeIndex !== -1 || candidateMapping.notesIndex !== -1;

    if (hasDate && (hasValue || hasPayee)) {
      headerRowIndex = r;
      mapping = candidateMapping;
      break;
    }
  }

  if (headerRowIndex === -1 || !mapping) {
    return {
      transactions: [],
      warnings: [
        {
          rowIndex: 1,
          rawRow: allRows[0]?.join(delimiter) || '',
          code: 'UNKNOWN_HEADER',
          message: 'CSV column headers were not recognized.',
          params: { header: allRows[0]?.join(delimiter) || '' },
        },
      ],
      metadata: { fileType: 'csv', detectedDelimiter: delimiter, totalRowsProcessed: allRows.length, validRowsCount: 0, invalidRowsCount: allRows.length },
      success: false,
    };
  }

  const dataRows = allRows.slice(headerRowIndex + 1);
  const sampleDates = dataRows.map((row) => row[mapping!.dateIndex]).filter(Boolean);
  const dateDetection = detectDateFormatDetailed(sampleDates);
  const dateFormat = dateDetection.format;
  if (dateDetection.ambiguous) {
    warnings.push({
      rowIndex: 0,
      rawRow: '',
      code: 'AMBIGUOUS_DATE_FORMAT',
      message: 'Ambiguous date format; assuming DD/MM/YYYY. Please check the dates.',
    });
  }

  // File-level decimal style (',dd' vs '.dd' endings across ALL amount columns)
  const amountColumns = [mapping.amountIndex, mapping.outflowIndex, mapping.inflowIndex].filter((i) => i !== -1);
  const amountSamples: string[] = [];
  for (const row of dataRows) {
    for (const col of amountColumns) {
      if (row[col]) amountSamples.push(row[col]);
    }
  }
  const decimalHint = detectDecimalStyle(amountSamples);
  const amountOptions: ParseAmountOptions = { decimalHint };
  let ambiguousAsDecimal = 0;
  let ambiguousAsThousands = 0;
  let firstAmbiguousRow = -1;

  let validCount = 0;
  let invalidCount = 0;

  for (let r = headerRowIndex + 1; r < allRows.length; r++) {
    const row = allRows[r];
    const rawLine = row.join(delimiter);

    if (row.length === 0 || (row.length === 1 && !row[0])) continue;

    const rawDate = row[mapping.dateIndex];
    const parsedDate = parseDate(rawDate, dateFormat);
    if (!parsedDate) {
      const isSummary = /total|saldo|resumo/i.test(rawLine);
      if (isSummary) {
        warnings.push({
          rowIndex: r + 1,
          rawRow: rawLine,
          code: 'SKIPPED_PREAMBLE_ROW',
          message: 'Summary/footer row skipped.',
          params: { row: r + 1 },
        });
      } else {
        warnings.push({
          rowIndex: r + 1,
          rawRow: rawLine,
          code: 'INVALID_DATE',
          message: `Invalid date "${rawDate ?? ''}". Row skipped.`,
          params: { row: r + 1, value: rawDate ?? '' },
        });
        invalidCount++;
      }
      continue;
    }

    let amountResult: { cents: Cents; type: 'expense' | 'income' } | null = null;
    let usedAmountRaw = '';

    if (mapping.outflowIndex !== -1 && row[mapping.outflowIndex]) {
      const outflow = parseAmountToCents(row[mapping.outflowIndex], undefined, amountOptions);
      if (outflow && outflow.cents > 0) {
        amountResult = { cents: outflow.cents, type: 'expense' };
        usedAmountRaw = row[mapping.outflowIndex];
      }
    }

    if (!amountResult && mapping.inflowIndex !== -1 && row[mapping.inflowIndex]) {
      const inflow = parseAmountToCents(row[mapping.inflowIndex], undefined, amountOptions);
      if (inflow && inflow.cents > 0) {
        amountResult = { cents: inflow.cents, type: 'income' };
        usedAmountRaw = row[mapping.inflowIndex];
      }
    }

    if (!amountResult && mapping.amountIndex !== -1 && row[mapping.amountIndex]) {
      const dcFlag = mapping.dcFlagIndex !== -1 ? row[mapping.dcFlagIndex] : undefined;
      amountResult = parseAmountToCents(row[mapping.amountIndex], dcFlag, amountOptions);
      usedAmountRaw = row[mapping.amountIndex];
    }

    if (amountResult && isAmbiguousSeparatorAmount(usedAmountRaw)) {
      const sep: DecimalSeparator = usedAmountRaw.includes(',') ? ',' : '.';
      if (decimalHint === sep) ambiguousAsDecimal++;
      else ambiguousAsThousands++;
      if (firstAmbiguousRow === -1) firstAmbiguousRow = r + 1;
    }

    if (!amountResult) {
      warnings.push({
        rowIndex: r + 1,
        rawRow: rawLine,
        code: 'INVALID_AMOUNT',
        message: 'Invalid or missing amount. Row skipped.',
        params: { row: r + 1, value: usedAmountRaw },
      });
      invalidCount++;
      continue;
    }

    if (amountResult.cents === 0) {
      warnings.push({
        rowIndex: r + 1,
        rawRow: rawLine,
        code: 'ZERO_AMOUNT',
        message: 'Zero-amount transaction skipped.',
        params: { row: r + 1 },
      });
      continue;
    }

    let payee = mapping.payeeIndex !== -1 ? row[mapping.payeeIndex] || '' : '';
    let notes = mapping.notesIndex !== -1 ? row[mapping.notesIndex] || '' : '';

    if (!payee && notes) {
      payee = notes;
      notes = '';
    }
    if (!payee) {
      payee = fallbackPayee;
    }

    const fitid = mapping.fitidIndex !== -1 ? row[mapping.fitidIndex]?.trim() : undefined;

    const importHash = generateTransactionImportHash(
      defaultAccountId,
      parsedDate,
      amountResult.cents,
      amountResult.type,
      fitid,
      payee
    );

    transactions.push({
      id: generateTempDraftId(),
      accountId: defaultAccountId,
      date: parsedDate,
      amountCents: amountResult.cents,
      type: amountResult.type,
      payee,
      notes,
      status: 'cleared',
      categoryId: null,
      fitid: fitid || undefined,
      importHash,
      rawSource: rawLine,
      source: 'csv',
    });

    validCount++;
  }

  // Ambiguous 'x.ddd' amounts are read as decimal only when the file's own
  // decimal style uses that separator; otherwise as a thousands group.
  const ambiguousAmountsCount = ambiguousAsDecimal + ambiguousAsThousands;
  let ambiguousAmountsResolvedAs: 'decimal' | 'thousands' | undefined;
  if (ambiguousAmountsCount > 0) {
    ambiguousAmountsResolvedAs = ambiguousAsDecimal > ambiguousAsThousands ? 'decimal' : 'thousands';
    warnings.push({
      rowIndex: firstAmbiguousRow,
      rawRow: allRows[firstAmbiguousRow - 1]?.join(delimiter) || '',
      code: 'AMBIGUOUS_AMOUNT',
      message: `${ambiguousAmountsCount} amount(s) with 3 digits after a single separator: ${ambiguousAsDecimal} read as decimal, ${ambiguousAsThousands} as thousands (file decimal separator: ${decimalHint ?? 'none'}).`,
      params: {
        row: firstAmbiguousRow,
        count: ambiguousAmountsCount,
        asDecimal: ambiguousAsDecimal,
        asThousands: ambiguousAsThousands,
        // Locale-free: the separator character itself, or an em dash when the file shows none.
        separator: decimalHint ?? '—',
      },
    });
  }

  return {
    transactions,
    warnings,
    metadata: {
      fileType: 'csv',
      detectedDelimiter: delimiter,
      detectedDateFormat: dateFormat,
      dateFormatAmbiguous: dateDetection.ambiguous,
      ...(decimalHint ? { detectedDecimalSeparator: decimalHint } : {}),
      ...(ambiguousAmountsResolvedAs ? { ambiguousAmountsResolvedAs, ambiguousAmountsCount } : {}),
      totalRowsProcessed: allRows.length - (headerRowIndex + 1),
      validRowsCount: validCount,
      invalidRowsCount: invalidCount,
    },
    success: transactions.length > 0,
  };
}

// ============================================================================
// OFX 1.0 (SGML) & OFX 2.0 (XML) Parser
// ============================================================================

function extractOfxTag(block: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?(?:<\\/${tagName}>|(?=<)|[\\r\\n])`, 'i');
  const match = block.match(regex);
  if (!match || !match[1]) return null;

  return decodeOfxEntities(match[1]).trim();
}

const OFX_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Single-pass entity decoding: '&amp;lt;' -> '&lt;' (never double-decoded to '<'). */
export function decodeOfxEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/gi, (_whole, name: string) => OFX_NAMED_ENTITIES[name.toLowerCase()]);
}

export function parseOfxDate(dateStr: string): ISODate | null {
  if (!dateStr || dateStr.length < 8) return null;
  const match = dateStr.trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;

  const y = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const d = parseInt(match[3], 10);

  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const isoDate = `${match[1]}-${match[2]}-${match[3]}`;
  return isValidISODate(isoDate) ? isoDate : null;
}

export function parseOfx(
  fileContent: string,
  defaultAccountId: string,
  options?: ImportParseOptions
): ParsedImportResult {
  const fallbackPayee = resolveFallbackPayee(options);
  const warnings: ImportRowWarning[] = [];
  const transactions: ImportTransactionDraft[] = [];

  if (!fileContent || !/<STMTTRN/i.test(fileContent)) {
    return {
      transactions: [],
      warnings: [{ rowIndex: 0, rawRow: '', code: 'INCOMPLETE_ROW', message: 'No <STMTTRN> transactions found in the OFX file.' }],
      metadata: { fileType: 'ofx', totalRowsProcessed: 0, validRowsCount: 0, invalidRowsCount: 0 },
      success: false,
    };
  }

  const currency = (extractOfxTag(fileContent, 'CURDEF') as SupportedCurrency) || undefined;
  const bankId = extractOfxTag(fileContent, 'BANKID') || undefined;
  const acctId = extractOfxTag(fileContent, 'ACCTID') || undefined;
  const org = extractOfxTag(fileContent, 'ORG') || undefined;

  const transactionBlocks: string[] = [];
  const blockRegex = /<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTTRNRS>|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(fileContent)) !== null) {
    if (match[1] && match[1].trim()) {
      transactionBlocks.push(match[1]);
    }
  }

  let validCount = 0;
  let invalidCount = 0;

  // OFX never uses thousands grouping: a lone separator is the decimal mark.
  // The file-level style still wins when the file shows ',dd' / '.dd' endings.
  const ofxDecimalStyle = detectDecimalStyle(
    transactionBlocks.map((b) => extractOfxTag(b, 'TRNAMT') || '')
  );

  transactionBlocks.forEach((block, idx) => {
    const trnType = extractOfxTag(block, 'TRNTYPE') || '';
    const dtPosted = extractOfxTag(block, 'DTPOSTED') || '';
    const trnAmt = extractOfxTag(block, 'TRNAMT') || '';
    const fitid = extractOfxTag(block, 'FITID') || '';
    const name = extractOfxTag(block, 'NAME') || '';
    const memo = extractOfxTag(block, 'MEMO') || '';
    const checkNum = extractOfxTag(block, 'CHECKNUM') || '';

    const parsedDate = parseOfxDate(dtPosted);
    if (!parsedDate) {
      warnings.push({
        rowIndex: idx + 1,
        rawRow: block.slice(0, 100),
        code: 'INVALID_DATE',
        message: `Invalid OFX date "${dtPosted}".`,
        params: { row: idx + 1, value: dtPosted },
      });
      invalidCount++;
      return;
    }

    const amountResult = parseAmountToCents(trnAmt, undefined, {
      decimalHint: ofxDecimalStyle ?? (trnAmt.includes(',') ? ',' : '.'),
    });
    if (!amountResult) {
      warnings.push({
        rowIndex: idx + 1,
        rawRow: block.slice(0, 100),
        code: 'INVALID_AMOUNT',
        message: `Invalid OFX amount "${trnAmt}".`,
        params: { row: idx + 1, value: trnAmt },
      });
      invalidCount++;
      return;
    }

    let type: TransactionType = amountResult.type;
    const isDebitType = /^(debit|pos|fee|srvchg|check|payment)/i.test(trnType);
    const isCreditType = /^(credit|dep|directdep)/i.test(trnType);

    if (isDebitType) {
      type = 'expense';
    } else if (isCreditType) {
      type = 'income';
    }

    let payee = name;
    let notes = memo;

    if (name && memo && name === memo) {
      payee = name;
      notes = '';
    } else if (
      name &&
      memo &&
      /^(compra|pagamento|transf|pix|debito|credito|ted|doc)/i.test(name) &&
      memo.length > name.length
    ) {
      payee = memo;
      notes = name;
    } else if (!name && memo) {
      payee = memo;
      notes = '';
    } else if (!payee) {
      payee = fallbackPayee;
    }

    if (checkNum && !notes.includes(checkNum)) {
      notes = notes ? `${notes} (Doc: ${checkNum})` : `Doc: ${checkNum}`;
    }

    const importHash = generateTransactionImportHash(
      defaultAccountId,
      parsedDate,
      amountResult.cents,
      type,
      fitid || undefined,
      payee
    );

    transactions.push({
      id: generateTempDraftId(),
      accountId: defaultAccountId,
      date: parsedDate,
      amountCents: amountResult.cents,
      type,
      payee,
      notes,
      status: 'cleared',
      categoryId: null,
      fitid: fitid || undefined,
      importHash,
      rawSource: `<STMTTRN>${block.slice(0, 120)}...`,
      source: 'ofx',
    });

    validCount++;
  });

  return {
    transactions,
    warnings,
    metadata: {
      fileType: 'ofx',
      ...(ofxDecimalStyle ? { detectedDecimalSeparator: ofxDecimalStyle } : {}),
      bankName: org || (bankId ? `Banco ${bankId}` : undefined),
      accountNumber: acctId,
      currency,
      totalRowsProcessed: transactionBlocks.length,
      validRowsCount: validCount,
      invalidRowsCount: invalidCount,
    },
    success: transactions.length > 0,
  };
}

// ============================================================================
// Unified Ingestion Entry Point
// ============================================================================

export async function parseImportFile(
  fileContent: string,
  fileType: 'csv' | 'ofx' | 'auto',
  defaultAccountId: string,
  options?: ImportParseOptions
): Promise<ParsedImportResult> {
  if (!fileContent || !fileContent.trim()) {
    return {
      transactions: [],
      warnings: [{ rowIndex: 0, rawRow: '', code: 'INCOMPLETE_ROW', message: 'The imported file is empty.' }],
      metadata: { fileType: fileType === 'auto' ? 'csv' : fileType, totalRowsProcessed: 0, validRowsCount: 0, invalidRowsCount: 0 },
      success: false,
    };
  }

  const resolvedType =
    fileType === 'auto'
      ? /<OFX|OFXHEADER|<STMTTRN/i.test(fileContent)
        ? 'ofx'
        : 'csv'
      : fileType;

  if (resolvedType === 'ofx') {
    return parseOfx(fileContent, defaultAccountId, options);
  } else {
    return parseCsv(fileContent, defaultAccountId, options);
  }
}
