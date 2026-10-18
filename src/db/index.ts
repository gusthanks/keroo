import Dexie, { type Table } from 'dexie';
import {
  KEROO_DB_SCHEMA_V1,
  type Account,
  type CategoryGroup,
  type Category,
  type MonthlyEnvelope,
  type Transaction,
  type AutoRule,
  type InstallmentPlan,
  type RecurringBill,
  type SplitParty,
  type SplitExpense,
  type SplitSettlement,
  type PiggyBank,
  type KerooPetState,
  type UserSettings,
} from './schema';
import { attachMonetaryHooks } from './validation';

export class KerooDatabase extends Dexie {
  accounts!: Table<Account, string>;
  category_groups!: Table<CategoryGroup, string>;
  categories!: Table<Category, string>;
  monthly_envelopes!: Table<MonthlyEnvelope, string>;
  transactions!: Table<Transaction, string>;
  auto_rules!: Table<AutoRule, string>;
  installment_plans!: Table<InstallmentPlan, string>;
  recurring_bills!: Table<RecurringBill, string>;
  split_parties!: Table<SplitParty, string>;
  split_expenses!: Table<SplitExpense, string>;
  split_settlements!: Table<SplitSettlement, string>;
  piggy_banks!: Table<PiggyBank, string>;
  keroo_state!: Table<KerooPetState, string>;
  user_settings!: Table<UserSettings, string>;

  constructor(databaseName: string = 'keroo_db') {
    super(databaseName);
    this.version(1).stores(KEROO_DB_SCHEMA_V1);
    attachMonetaryHooks(this);
  }
}

export const db = new KerooDatabase();
export * from './schema';
export * from './validation';
