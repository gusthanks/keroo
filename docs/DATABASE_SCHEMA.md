# Database Schema Specification — Keroo

This document provides the authoritative Dexie.js / IndexedDB schema definitions, entity interfaces, compound indexes, integrity rules, and clean-slate seed structures for **Keroo**.

---

## 1. Database Identification & Architecture

- **Database Name**: `keroo_db`
- **Engine**: IndexedDB (accessed via **Dexie.js v4**)
- **Version**: `1`
- **Total Tables**: 14 IndexedDB tables (12 domain entity tables + 2 singleton configuration tables).
- **Storage Paradigm**: 100% Local-first, client-side only. Zero remote database synchronization, zero telemetry, and zero cloud backups.
- **Data Invariant**: Every currency value is stored strictly as an integer representing cents ($C \in \mathbb{Z}$). Floating-point values are strictly prohibited.

---

## 2. Table Declarations & Dexie Index Syntax

Dexie.js uses a concise schema syntax where:
- The first field listed is the **Primary Key** (`id` or composite `[fieldA+fieldB]`).
- Subsequent fields are indexed for fast querying, filtering, and ordering.
- Compound indexes are declared inside brackets (e.g., `[accountId+date]`).

The schema defines **14 IndexedDB tables (12 domain entity tables + 2 singleton configuration tables)**:

```typescript
export const KEROO_DB_SCHEMA_V1 = {
  // 1. Core Financial Accounts
  accounts: 'id, name, type, currency, isArchived, createdAt',

  // 2. Budget Category Groups & Categories
  category_groups: 'id, name, sortOrder, isArchived',
  categories: 'id, groupId, name, sortOrder, isArchived',

  // 3. Monthly Envelope Budgets
  monthly_envelopes: 'id, categoryId, yearMonth, [categoryId+yearMonth]',

  // 4. Financial Transaction Ledger
  transactions: 'id, accountId, categoryId, date, type, status, installmentPlanId, subscriptionId, splitExpenseId, transferAccountId, importHash, [accountId+date], [categoryId+date]',

  // 5. Auto-Categorization & Payee Normalization Rules
  auto_rules: 'id, name, priority, isActive',

  // 6. Credit Card Installment Plans (1x-24x)
  installment_plans: 'id, accountId, totalInstallments, purchaseDate, createdAt',

  // 7. Subscriptions & Recurring Bills Radar
  recurring_bills: 'id, name, categoryId, paymentAccountId, nextDueDate, cadence, paymentStatus, isActive, [paymentStatus+nextDueDate]',

  // 8. Split / IOU Ledger
  split_parties: 'id, name, relationship, isArchived',
  split_expenses: 'id, date, paidByPartyId, categoryId, linkedTransactionId',
  split_settlements: 'id, fromPartyId, toPartyId, date',

  // 9. Piggy Banks (Cofrinhos) Savings Goals
  piggy_banks: 'id, name, targetDate, createdAt',

  // 10. Keroo Mascot Companion State (Singleton)
  keroo_state: 'id, nickname, mood, lastEvaluatedTimestamp',

  // 11. User Preferences & Settings (Singleton)
  user_settings: 'id, language, currency, theme, onboardingCompleted, petNickname'
};
```

---

## 3. Entity TypeScript Interfaces

```typescript
// ==========================================
// Base Primitive Types
// ==========================================
export type Cents = number; // Integer cents (e.g. 1050 = R$ 10,50)
export type YearMonth = string; // Format: 'YYYY-MM' (e.g. '2026-10')
export type ISODate = string; // Format: 'YYYY-MM-DD' (e.g. '2026-10-16')
export type SupportedCurrency = 'BRL' | 'USD' | 'EUR';
export type SupportedLocale = 'pt-BR' | 'en-US';
export type SupportedTheme = 'light' | 'dark' | 'system';

// ==========================================
// 1. Account Entity
// ==========================================
export type AccountType =
  | 'checking'     // Conta Corrente
  | 'savings'      // Poupança / Reserva de Emergência
  | 'credit_card'  // Cartão de Crédito
  | 'cash'         // Dinheiro Físico / Carteira
  | 'investment';  // Investimentos / Corretora

export interface Account {
  id: string; // UUID v4
  name: string; // e.g. "Nubank", "Itaú", "Chase Checking"
  type: AccountType;
  currency: SupportedCurrency;
  initialBalanceCents: Cents;
  currentBalanceCents: Cents;
  isArchived: boolean;
  color?: string; // OKLCH or hex token
  icon?: string; // Lucide icon name

  // Specific for Credit Cards
  creditLimitCents?: Cents;
  closingDay?: number; // 1 to 31
  dueDay?: number;     // 1 to 31
  linkedPaymentAccountId?: string; // Account used to pay statement

  createdAt: string; // ISO DateTime
  updatedAt: string;
}

// ==========================================
// 2. Budget Category Groups & Categories
// ==========================================
export interface CategoryGroup {
  id: string;
  name: string; // e.g., "Gastos Fixos & Moradia", "Estilo de Vida"
  sortOrder: number;
  isArchived: boolean;
}

export interface Category {
  id: string;
  groupId: string; // FK -> CategoryGroup.id
  name: string; // e.g., "Aluguel", "Supermercado", "Restaurantes"
  icon?: string;
  color?: string;
  sortOrder: number;
  isArchived: boolean;
  rolloverMode: 'rollover_negative' | 'reset_zero'; // Default: 'rollover_negative'
}

// ==========================================
// 3. Monthly Envelope Budgets
// ==========================================
export interface MonthlyEnvelope {
  id: string; // Composite key: `${categoryId}_${yearMonth}`
  categoryId: string; // FK -> Category.id
  yearMonth: YearMonth;
  assignedCents: Cents;   // Budgeted by user this month
  activityCents: Cents;   // Net expenditure in this month
  availableCents: Cents;  // Rollover + Assigned - Activity
  notes?: string;
}

// ==========================================
// 4. Transaction Entity
// ==========================================
export type TransactionType =
  | 'expense'
  | 'income'
  | 'transfer'
  | 'cc_installment'
  | 'split_share';

export type TransactionStatus = 'cleared' | 'uncleared' | 'reconciled';

export interface Transaction {
  id: string; // UUID v4
  accountId: string; // FK -> Account.id
  date: ISODate;
  amountCents: Cents; // Always positive integer; sign determined by type
  type: TransactionType;
  categoryId: string | null; // FK -> Category.id (null for transfers)
  payee: string; // Merchant, employer, or recipient
  notes: string;
  status: TransactionStatus;

  // Credit Card Installment metadata
  installmentPlanId?: string; // FK -> InstallmentPlan.id
  installmentIndex?: number;  // e.g. 1 (for "1/10")
  totalInstallments?: number; // e.g. 10

  // Subscription metadata
  subscriptionId?: string; // FK -> Subscription.id

  // Split / IOU metadata
  splitExpenseId?: string; // FK -> SplitExpense.id

  // Linked transfer metadata
  transferAccountId?: string;     // Counterpart account
  transferTransactionId?: string; // Counterpart transaction ID

  // Statement import deduplication
  importHash?: string; // SHA-256 or composite hash
  fitid?: string;      // Financial Institution Transaction ID from OFX

  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 5. Auto-Categorization Rule Entity
// ==========================================
export type RuleField = 'payee' | 'notes' | 'amountCents' | 'accountId';
export type RuleOperator =
  | 'contains'
  | 'equals'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'greater_than'
  | 'less_than';

export interface RuleCondition {
  field: RuleField;
  operator: RuleOperator;
  value: string | number;
}

export interface RuleAction {
  field: 'categoryId' | 'payee' | 'notes' | 'status';
  value: string | boolean;
}

export interface AutoRule {
  id: string;
  name: string;
  priority: number; // 1 = highest, executed first
  logic: 'AND' | 'OR';
  conditions: RuleCondition[];
  actions: RuleAction[];
  isActive: boolean;
}

// ==========================================
// 6. Credit Card Installment Plan Entity (1x-24x)
// ==========================================
export type InterestType = 'none' | 'compound_monthly' | 'flat_surcharge';

export interface InstallmentScheduleItem {
  index: number; // 1 to totalInstallments
  statementMonth: YearMonth;
  dueDate: ISODate;
  amountCents: Cents; // Remainder allocated to index === 1
  principalCents: Cents;
  interestCents: Cents;
  isPaid: boolean;
  transactionId?: string;
}

export interface InstallmentPlan {
  id: string;
  accountId: string; // FK -> Account.id (must be type 'credit_card')
  description: string; // e.g., "Notebook Dell 3x"
  totalAmountCents: Cents; // Total sum including fees
  originalPrincipalCents: Cents;
  totalInstallments: number; // 1 to 24
  purchaseDate: ISODate;
  interestType: InterestType;
  interestRateMonthly?: number; // e.g. 0.0199 for 1.99%/mo
  installments: InstallmentScheduleItem[];
  createdAt: string;
}

// ==========================================
// 7. Subscriptions & Recurring Bills Entity
// ==========================================
export type SubscriptionCadence =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semi_annually'
  | 'annually';

export type SubscriptionPaymentStatus =
  | 'PAID_OK'
  | 'UPCOMING_SAFE'
  | 'DUE_SOON'
  | 'DUE_TODAY'
  | 'OVERDUE';

export interface Subscription {
  id: string;
  name: string; // e.g., "Netflix", "Aluguel", "Spotify"
  amountCents: Cents;
  currency: SupportedCurrency;
  cadence: SubscriptionCadence;
  anchorDay: number; // 1..31
  startDate: ISODate;
  nextDueDate: ISODate;
  lastPaymentDate?: ISODate;
  snoozedUntilDate?: ISODate;
  paymentStatus: SubscriptionPaymentStatus;
  categoryId: string; // FK -> Category.id
  paymentAccountId: string; // FK -> Account.id
  isActive: boolean;
  autoRenew: boolean;
  reminderDaysBefore: number; // Default: 3
  urlOrNotes?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 8. Split / IOU Ledger Entities
// ==========================================
export interface SplitParty {
  id: string;
  name: string; // e.g., "Camila", "Lucas Roommate"
  email?: string;
  phoneOrPix?: string;
  relationship: 'household_partner' | 'roommate' | 'friend' | 'family' | 'other';
  isArchived: boolean;
  createdAt: string;
}

export type SplitMethod = 'equal_50_50' | 'exact_amounts' | 'percentages';

export interface SplitShare {
  partyId: string; // 'USER' or SplitParty.id
  shareCents: Cents;
  percentage?: number;
}

export interface SplitExpense {
  id: string;
  description: string;
  totalAmountCents: Cents;
  currency: SupportedCurrency;
  date: ISODate;
  paidByPartyId: string; // 'USER' or SplitParty.id
  splitMethod: SplitMethod;
  shares: SplitShare[];
  categoryId?: string;
  linkedTransactionId?: string;
  notes?: string;
  createdAt: string;
}

export interface SplitSettlement {
  id: string;
  fromPartyId: string;
  toPartyId: string;
  amountCents: Cents;
  date: ISODate;
  notes?: string;
  createdAt: string;
}

// ==========================================
// 9. Piggy Banks (Cofrinhos) Savings Goals
// ==========================================
export interface PiggyBank {
  id: string;
  name: string; // e.g., "Reserva de Emergência", "Viagem Japão"
  targetCents: Cents;
  savedCents: Cents;
  targetDate?: ISODate;
  color: string;
  icon: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// 10. Keroo Mascot Companion State (Singleton)
// ==========================================
export type KerooMood = 'thriving' | 'calm' | 'alert' | 'sweating' | 'sleepy';

export interface KerooState {
  id: 'current'; // Singleton key
  nickname: string;
  mood: KerooMood;
  lastMoodReason: string;
  lastInteractionDate: ISODate;
  lastEvaluatedTimestamp: number;
}

// ==========================================
// 11. User Preferences & Global Settings (Singleton)
// ==========================================
export interface UserSettings {
  id: 'global'; // Singleton key
  language: SupportedLocale; // 'pt-BR' | 'en-US'
  currency: SupportedCurrency; // 'BRL' | 'USD' | 'EUR'
  theme: SupportedTheme; // 'light' | 'dark' | 'system'
  onboardingCompleted: boolean;
  petNickname: string;
  roamingPetEnabled: boolean; // Enables Kawaii Doodle Frog wandering across screen
  rolloverModeDefault: 'rollover_negative' | 'reset_zero';
  createdAt: string;
  updatedAt: string;
}
```

---

## 4. Integrity Constraints & Foreign Key Rules

1. **Integer Non-Negativity**:
   - `amountCents`, `initialBalanceCents`, `targetCents`, and `savedCents` MUST be non-negative integers ($\ge 0$).
   - Current balance and available balance can be negative (representing debt or overspending), but MUST remain integers.
2. **First-Installment Remainder Invariant**:
   - For any `InstallmentPlan` with $N$ installments ($1 \le N \le 24$) and total cents $A \ge N$:
     $$\text{installments}[0].\text{amountCents} = \lfloor A / N \rfloor + (A \pmod N)$$
     $$\text{installments}[k].\text{amountCents} = \lfloor A / N \rfloor \quad (\text{for } 1 \le k < N)$$
     $$\sum_{k=0}^{N-1} \text{installments}[k].\text{amountCents} \equiv A$$
   - Remainder cents are allocated strictly and entirely to installment 0 (`index === 1`).
3. **Split Conservation Invariant**:
   - For every `SplitExpense`:
     $$\sum_{s \in \text{shares}} s.\text{shareCents} \equiv \text{totalAmountCents}$$
4. **Cascade Deletion Protection**:
   - Accounts with active transactions cannot be deleted; they must be marked `isArchived = true`.
   - Categories with active transactions or envelopes cannot be deleted; they must be archived.
5. **Month-End Date Clamping Invariant (Credit Cards & Installments)**:
   - For any credit card statement cycle or installment schedule with target day $D \in \{1, \dots, 31\}$, in calendar year $Y$ and month $M \in \{1, \dots, 12\}$:
     $$\text{clampedDay}(Y, M, D) = \min(D, \text{daysInMonth}(Y, M))$$
   - Statement closing date and payment due date are strictly clamped:
     $$\text{statementDate} = (Y, M, \min(\text{closingDay}, \text{daysInMonth}(Y, M)))$$
     $$\text{dueDate} = (Y_{\text{due}}, M_{\text{due}}, \min(\text{dueDay}, \text{daysInMonth}(Y_{\text{due}}, M_{\text{due}})))$$
   - Date clamping prevents standard JavaScript calendar overflow (e.g., February 31 mutating to March 3).
6. **Subscription & Recurring Bill `anchorDay` Preservation Invariant**:
   - For any recurring subscription with cadence interval $\Delta M$ months and immutable $\text{anchorDay} \in \{1, \dots, 31\}$, the $k$-th future cycle due date MUST be evaluated as:
     $$(Y_k, M_k) = (Y_0, M_0) \oplus (k \times \Delta M)$$
     $$\text{dueDate}_k = (Y_k, M_k, \min(\text{anchorDay}, \text{daysInMonth}(Y_k, M_k)))$$
   - $\text{anchorDay}$ is immutable: intermediate clamping in short months (e.g. February 28) MUST NEVER mutate $\text{anchorDay}$. Subsequent 31-day months automatically restore to day 31, preventing multi-day schedule drift.
7. **Bilateral Split Odd-Cent Payer Absorption Invariant**:
   - In 50/50 bilateral splits of an odd cent total $A$ ($A \pmod 2 \ne 0$), the paying party (`paidByPartyId`) absorbs the odd cent remainder:
     $$\text{share}_{\text{payer}} = \lfloor A / 2 \rfloor + (A \pmod 2) = \lceil A / 2 \rceil$$
     $$\text{share}_{\text{counterpart}} = \lfloor A / 2 \rfloor$$
     $$\text{share}_{\text{payer}} + \text{share}_{\text{counterpart}} \equiv A$$
   - For general equal splits across $P$ parties, remainder cents $R = A \pmod P$ are distributed 1 cent each starting at the paying party, ensuring exact integer conservation with zero floating-point cents.

---

## 5. Clean-Slate Default Seed Data

When the user completes the onboarding wizard without demo data, the database is seeded with standard category groups and categories:

```typescript
export const CLEAN_SLATE_SEED_CATEGORIES = [
  {
    group: 'Moradia & Contas Fixas',
    groupEn: 'Housing & Fixed Bills',
    categories: ['Aluguel / Condomínio', 'Energia Elétrica', 'Água & Saneamento', 'Internet Fibra', 'Gás']
  },
  {
    group: 'Alimentação & Mercado',
    groupEn: 'Food & Groceries',
    categories: ['Supermercado', 'Restaurantes & Cafés', 'Delivery (iFood / Takeout)', 'Padaria & Lanches']
  },
  {
    group: 'Transporte & Mobilidade',
    groupEn: 'Transportation & Mobility',
    categories: ['Combustível', 'Transporte Público / Metrô', 'Uber / Táxi', 'Seguro & Manutenção Auto']
  },
  {
    group: 'Estilo de Vida & Lazer',
    groupEn: 'Lifestyle & Leisure',
    categories: ['Assinaturas & Streaming', 'Compras & Vestuário', 'Viagens & Passeios', 'Cinema & Cultura']
  },
  {
    group: 'Saúde & Cuidados',
    groupEn: 'Health & Personal Care',
    categories: ['Farmácia & Medicamentos', 'Plano de Saúde', 'Academia & Esportes', 'Barbearia & Salão']
  },
  {
    group: 'Metas & Investimentos',
    groupEn: 'Goals & Investments',
    categories: ['Reserva de Emergência', 'Aportes em Investimentos', 'Poupança Viagem']
  }
];
```

---

## 6. One-Click Rich Demo Dataset

When the user selects **"Carregar Dados de Demonstração / Load Demo Data"**, the following deterministic dataset is seeded:

1. **Accounts**:
   - `Nubank Conta` (Checking, initial: R$ 3.450,00, current: R$ 3.450,00, currency: BRL).
   - `Nubank Ultravioleta` (Credit Card, limit: R$ 15.000,00, closing day: 20, due day: 27).
   - `Itaú Reserva` (Savings, initial: R$ 8.000,00, current: R$ 8.000,00).
2. **Credit Card Installments**:
   - `Notebook Dell Inspiron`: 3x installments of R$ 800,00 (Total R$ 2.400,00). Statement months: 1/3 (Due current month), 2/3 (Next month), 3/3 (Subsequent month).
3. **Recurring Subscriptions**:
   - `Netflix Premium`: R$ 55,90 / month, anchor day: 15, status: `PAID_OK`.
   - `Spotify Family`: R$ 34,90 / month, anchor day: 22, status: `DUE_SOON` (due in 2 days).
   - `Internet Fibra Claro`: R$ 129,90 / month, anchor day: 5, status: `UPCOMING_SAFE`.
4. **Piggy Banks (Cofrinhos)**:
   - `Reserva de Emergência`: Target R$ 15.000,00 | Saved R$ 8.000,00 (53%).
   - `Viagem Japão 2027`: Target R$ 20.000,00 | Saved R$ 4.500,00 (22%).
5. **Split / IOU Ledger**:
   - Contact: `Camila (Parceira)` (household_partner).
   - Shared Expense: `Aluguel & Condomínio` (R$ 2.400,00 split 50/50, User paid, Camila owes R$ 1.200,00).
   - Net balance: Camila owes User +R$ 1.200,00.
6. **Keroo Companion**:
   - Nickname: `Keroo`.
   - Mood: `ALERT` (due to Spotify bill due in 2 days).
   - Speech Bubble: Prompting check-in on the upcoming Spotify bill.
