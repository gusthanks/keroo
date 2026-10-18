// ==========================================
// Base Primitive Types & Invariants
// ==========================================
export type Cents = number; // Integer cents strictly (e.g. 1050 = R$ 10,50)
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
  subscriptionId?: string; // FK -> Subscription.id / RecurringBill.id

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
  amountCents: Cents; // Remainder allocated strictly to index === 1
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

export interface RecurringBill {
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

// Alias for compatibility with docs/DATABASE_SCHEMA.md
export type Subscription = RecurringBill;

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

export interface KerooPetState {
  id: 'current'; // Singleton key
  nickname: string;
  mood: KerooMood;
  lastMoodReason: string;
  lastInteractionDate: ISODate;
  lastEvaluatedTimestamp: number;
}

// Alias for compatibility with docs/DATABASE_SCHEMA.md
export type KerooState = KerooPetState;

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
