export * from '../types';

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
