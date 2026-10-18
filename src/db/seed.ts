import { KerooDatabase } from './index';
import type {
  Account,
  InstallmentPlan,
  RecurringBill,
  PiggyBank,
  SplitParty,
  SplitExpense,
  Transaction,
  MonthlyEnvelope,
  SupportedLocale,
  SupportedCurrency,
  SupportedTheme,
} from './schema';
import { addDaysISO, getLocalTodayISO, getLocalYearMonth } from '../core/dates';

/** Settings that a reset / demo load must keep from the current user_settings row. */
export interface SeedPreserveOptions {
  theme?: SupportedTheme;
  roamingPetEnabled?: boolean;
}

export interface SeedCategoryGroup {
  group: string;
  groupEn: string;
  categories: string[];
  categoriesEn: string[];
}

export const CLEAN_SLATE_SEED_CATEGORIES: SeedCategoryGroup[] = [
  {
    group: 'Moradia & Contas Fixas',
    groupEn: 'Housing & Fixed Bills',
    categories: ['Aluguel / Condomínio', 'Energia Elétrica', 'Água & Saneamento', 'Internet Fibra', 'Gás'],
    categoriesEn: ['Rent / Mortgage', 'Electricity', 'Water & Sewer', 'Fiber Internet', 'Gas'],
  },
  {
    group: 'Alimentação & Mercado',
    groupEn: 'Food & Groceries',
    categories: ['Supermercado', 'Restaurantes & Cafés', 'Delivery (iFood / Takeout)', 'Padaria & Lanches'],
    categoriesEn: ['Groceries', 'Restaurants & Cafes', 'Delivery & Takeout', 'Bakery & Snacks'],
  },
  {
    group: 'Transporte & Mobilidade',
    groupEn: 'Transportation & Mobility',
    categories: ['Combustível', 'Transporte Público / Metrô', 'Uber / Táxi', 'Seguro & Manutenção Auto'],
    categoriesEn: ['Fuel / Gas', 'Public Transit / Metro', 'Rideshare / Taxi', 'Auto Insurance & Maintenance'],
  },
  {
    group: 'Estilo de Vida & Lazer',
    groupEn: 'Lifestyle & Leisure',
    categories: ['Assinaturas & Streaming', 'Compras & Vestuário', 'Viagens & Passeios', 'Cinema & Cultura'],
    categoriesEn: ['Subscriptions & Streaming', 'Shopping & Clothing', 'Travel & Trips', 'Cinema & Culture'],
  },
  {
    group: 'Saúde & Cuidados',
    groupEn: 'Health & Personal Care',
    categories: ['Farmácia & Medicamentos', 'Plano de Saúde', 'Academia & Esportes', 'Barbearia & Salão'],
    categoriesEn: ['Pharmacy & Medicine', 'Health Insurance', 'Gym & Fitness', 'Barber & Salon'],
  },
  {
    group: 'Metas & Investimentos',
    groupEn: 'Goals & Investments',
    categories: ['Reserva de Emergência', 'Aportes em Investimentos', 'Poupança Viagem'],
    categoriesEn: ['Emergency Fund', 'Investments', 'Travel Savings'],
  },
];

/**
 * Seeds a pristine clean-slate database with default category groups,
 * categories, initial user settings, and Keroo mascot state.
 */
export async function seedCleanSlate(
  db: KerooDatabase,
  lang: SupportedLocale = 'en-US',
  currency: SupportedCurrency = 'USD',
  petNickname: string = 'Keroo',
  preserve?: SeedPreserveOptions
): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await writeCleanSlate(db, lang, currency, petNickname, preserve);
  });
}

/**
 * Clean-slate body. MUST be called inside an open `db.transaction('rw', db.tables, ...)`
 * so callers (seedCleanSlate / seedDemoData) stay atomic.
 */
async function writeCleanSlate(
  db: KerooDatabase,
  lang: SupportedLocale,
  currency: SupportedCurrency,
  petNickname: string,
  preserve?: SeedPreserveOptions
): Promise<void> {
  const isEn = lang === 'en-US';
  const nowIso = new Date().toISOString();
  const today = getLocalTodayISO();
  const nickname = (petNickname && petNickname.trim()) || 'Keroo';

  {
    // Clear all 14 tables to guarantee zero leftover state
    await Promise.all(db.tables.map((table) => table.clear()));

    // Seed Groups and Categories
    for (let gIdx = 0; gIdx < CLEAN_SLATE_SEED_CATEGORIES.length; gIdx++) {
      const gDef = CLEAN_SLATE_SEED_CATEGORIES[gIdx];
      const groupId = `grp_${gIdx + 1}`;
      const groupName = isEn ? gDef.groupEn : gDef.group;

      await db.category_groups.add({
        id: groupId,
        name: groupName,
        sortOrder: gIdx,
        isArchived: false,
      });

      const catList = isEn ? gDef.categoriesEn : gDef.categories;
      for (let cIdx = 0; cIdx < catList.length; cIdx++) {
        const catName = catList[cIdx];
        const categoryId = `cat_${gIdx + 1}_${cIdx + 1}`;

        await db.categories.add({
          id: categoryId,
          groupId,
          name: catName,
          sortOrder: cIdx,
          isArchived: false,
          rolloverMode: 'rollover_negative',
        });
      }
    }

    // Seed Singleton UserSettings
    await db.user_settings.put({
      id: 'global',
      language: lang,
      currency,
      theme: preserve?.theme ?? 'system',
      onboardingCompleted: true,
      petNickname: nickname,
      roamingPetEnabled: preserve?.roamingPetEnabled ?? true,
      rolloverModeDefault: 'rollover_negative',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Seed Singleton KerooPetState
    await db.keroo_state.put({
      id: 'current',
      nickname,
      mood: 'thriving',
      lastMoodReason: isEn
        ? 'All set to start your financial journey!'
        : 'Tudo pronto para começar sua jornada financeira!',
      lastInteractionDate: today,
      lastEvaluatedTimestamp: Date.now(),
    });
  }
}

/**
 * Seeds a rich, realistic demo dataset matching docs/DATABASE_SCHEMA.md Section 6.
 * Contains checking, credit card with installments, savings, recurring bills,
 * piggy banks, split tab with partner, and alert Keroo companion state.
 */
export async function seedDemoData(
  db: KerooDatabase,
  lang: SupportedLocale = 'en-US',
  currency: SupportedCurrency = 'USD',
  petNickname: string = 'Keroo',
  preserve?: SeedPreserveOptions
): Promise<void> {
  const isEn = lang === 'en-US';
  const nowIso = new Date().toISOString();
  // Every demo date derives from the user's LOCAL calendar (never UTC).
  const today = getLocalTodayISO();
  const currentYearMonth = getLocalYearMonth();
  const todayDay = Number(today.slice(8, 10));
  const nickname = (petNickname && petNickname.trim()) || 'Keroo';

  // 'YYYY-MM' shifted by whole months (integer math on the local year-month).
  const getFutureYearMonth = (offsetMonths: number): string => {
    const y = Number(currentYearMonth.slice(0, 4));
    const m = Number(currentYearMonth.slice(5, 7)) - 1 + offsetMonths;
    const year = y + Math.floor(m / 12);
    const month = (((m % 12) + 12) % 12) + 1;
    return `${year}-${String(month).padStart(2, '0')}`;
  };
  // Day of the current month, clamped to today so no demo movement lands in the future.
  const pastDayThisMonth = (day: number): string =>
    `${currentYearMonth}-${String(Math.min(day, todayDay)).padStart(2, '0')}`;

  // One atomic transaction: clear + clean-slate seed + demo rows (all or nothing).
  await db.transaction('rw', db.tables, async () => {
    // 1. Establish clean slate categories first
    await writeCleanSlate(db, lang, currency, nickname, preserve);

    // 2. Core Financial Accounts
    const accountChecking: Account = {
      id: 'acc_nubank_conta',
      name: isEn ? 'Chase Checking' : 'Nubank Conta',
      type: 'checking',
      currency,
      // initial + salary (600000) - groceries (45000) - rent (240000) = 345000
      initialBalanceCents: 30000, // R$ 300,00
      currentBalanceCents: 345000, // R$ 3.450,00
      isArchived: false,
      color: '#820ad1',
      icon: 'Wallet',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const accountCredit: Account = {
      id: 'acc_nubank_ultravioleta',
      name: isEn ? 'Chase Sapphire' : 'Nubank Ultravioleta',
      type: 'credit_card',
      currency,
      initialBalanceCents: 0,
      // Open installment debt (3 x R$ 800,00), same convention as CreditCardsView.
      currentBalanceCents: -240000,
      creditLimitCents: 1500000, // R$ 15.000,00
      closingDay: 20,
      dueDay: 27,
      linkedPaymentAccountId: 'acc_nubank_conta',
      isArchived: false,
      color: '#111111',
      icon: 'CreditCard',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const accountSavings: Account = {
      id: 'acc_itau_reserva',
      name: isEn ? 'High Yield Savings' : 'Itaú Reserva',
      type: 'savings',
      currency,
      initialBalanceCents: 800000, // R$ 8.000,00
      currentBalanceCents: 800000,
      isArchived: false,
      color: '#ec7000',
      icon: 'PiggyBank',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.accounts.bulkAdd([accountChecking, accountCredit, accountSavings]);

    // 3. Credit Card Installments: Notebook Dell 3x of R$ 800,00 (Total R$ 2.400,00)
    const installmentPlan: InstallmentPlan = {
      id: 'inst_dell_notebook',
      accountId: 'acc_nubank_ultravioleta',
      description: 'Notebook Dell Inspiron',
      totalAmountCents: 240000, // R$ 2.400,00
      originalPrincipalCents: 240000,
      totalInstallments: 3,
      purchaseDate: today,
      interestType: 'none',
      installments: [
        {
          index: 1,
          statementMonth: currentYearMonth,
          dueDate: `${currentYearMonth}-27`,
          amountCents: 80000, // R$ 800,00
          principalCents: 80000,
          interestCents: 0,
          isPaid: false,
        },
        {
          index: 2,
          statementMonth: getFutureYearMonth(1),
          dueDate: `${getFutureYearMonth(1)}-27`,
          amountCents: 80000,
          principalCents: 80000,
          interestCents: 0,
          isPaid: false,
        },
        {
          index: 3,
          statementMonth: getFutureYearMonth(2),
          dueDate: `${getFutureYearMonth(2)}-27`,
          amountCents: 80000,
          principalCents: 80000,
          interestCents: 0,
          isPaid: false,
        },
      ],
      createdAt: nowIso,
    };

    await db.installment_plans.add(installmentPlan);

    // 4. Recurring Subscriptions / Bills
    const netflixBill: RecurringBill = {
      id: 'bill_netflix',
      name: 'Netflix Premium',
      amountCents: 5590, // R$ 55,90
      currency,
      cadence: 'monthly',
      anchorDay: 15,
      startDate: `${getFutureYearMonth(-1)}-15`,
      nextDueDate: todayDay >= 15 ? `${getFutureYearMonth(1)}-15` : `${currentYearMonth}-15`,
      lastPaymentDate: todayDay >= 15 ? `${currentYearMonth}-15` : `${getFutureYearMonth(-1)}-15`,
      paymentStatus: 'PAID_OK',
      categoryId: 'cat_4_1', // Assinaturas & Streaming
      paymentAccountId: 'acc_nubank_ultravioleta',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Spotify bill due in 2 days
    const spotifyDueDate = addDaysISO(today, 2);
    const spotifyAnchorDay = Number(spotifyDueDate.slice(8, 10));

    const spotifyBill: RecurringBill = {
      id: 'bill_spotify',
      name: 'Spotify Family',
      amountCents: 3490, // R$ 34,90
      currency,
      cadence: 'monthly',
      anchorDay: spotifyAnchorDay,
      startDate: spotifyDueDate,
      nextDueDate: spotifyDueDate,
      paymentStatus: 'DUE_SOON',
      categoryId: 'cat_4_1', // Assinaturas & Streaming
      paymentAccountId: 'acc_nubank_ultravioleta',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const internetBill: RecurringBill = {
      id: 'bill_internet_fibra',
      name: isEn ? 'Fiber Internet' : 'Internet Fibra Claro',
      amountCents: 12990, // R$ 129,90
      currency,
      cadence: 'monthly',
      anchorDay: 5,
      startDate: `${getFutureYearMonth(-1)}-05`,
      nextDueDate: todayDay >= 5 ? `${getFutureYearMonth(1)}-05` : `${currentYearMonth}-05`,
      paymentStatus: 'UPCOMING_SAFE',
      categoryId: 'cat_1_4', // Internet Fibra
      paymentAccountId: 'acc_nubank_conta',
      isActive: true,
      autoRenew: true,
      reminderDaysBefore: 3,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.recurring_bills.bulkAdd([netflixBill, spotifyBill, internetBill]);

    // 5. Piggy Banks (Cofrinhos)
    const piggyEmergency: PiggyBank = {
      id: 'piggy_reserva',
      name: isEn ? 'Emergency Fund' : 'Reserva de Emergência',
      targetCents: 1500000, // R$ 15.000,00
      savedCents: 800000, // R$ 8.000,00 (53%)
      color: '#10B981',
      icon: 'Shield',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const piggyJapan: PiggyBank = {
      id: 'piggy_viagem_japao',
      name: isEn ? 'Japan Trip 2027' : 'Viagem Japão 2027',
      targetCents: 2000000, // R$ 20.000,00
      savedCents: 450000, // R$ 4.500,00 (22%)
      targetDate: '2027-04-01',
      color: '#F59E0B',
      icon: 'Plane',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.piggy_banks.bulkAdd([piggyEmergency, piggyJapan]);

    // 6. Split / IOU Ledger
    const splitPartyCamila: SplitParty = {
      id: 'party_camila',
      name: isEn ? 'Camila (Partner)' : 'Camila (Parceira)',
      relationship: 'household_partner',
      phoneOrPix: isEn ? 'camila@example.com' : 'camila@pix.me',
      isArchived: false,
      createdAt: nowIso,
    };

    const splitExpenseRent: SplitExpense = {
      id: 'split_exp_aluguel',
      description: isEn ? 'Rent & Condo Fee' : 'Aluguel & Condomínio',
      totalAmountCents: 240000, // R$ 2.400,00
      currency,
      date: pastDayThisMonth(1),
      paidByPartyId: 'USER',
      splitMethod: 'equal_50_50',
      shares: [
        { partyId: 'USER', shareCents: 120000, percentage: 50 },
        { partyId: 'party_camila', shareCents: 120000, percentage: 50 },
      ],
      categoryId: 'cat_1_1',
      createdAt: nowIso,
    };

    await db.split_parties.add(splitPartyCamila);
    await db.split_expenses.add(splitExpenseRent);

    // 7. Monthly Envelopes for current month
    const envelopes: MonthlyEnvelope[] = [
      {
        id: `cat_1_1_${currentYearMonth}`,
        categoryId: 'cat_1_1',
        yearMonth: currentYearMonth,
        assignedCents: 240000,
        activityCents: 240000,
        availableCents: 0,
      },
      {
        id: `cat_2_1_${currentYearMonth}`,
        categoryId: 'cat_2_1',
        yearMonth: currentYearMonth,
        assignedCents: 120000,
        activityCents: 45000,
        availableCents: 75000,
      },
      {
        id: `cat_4_1_${currentYearMonth}`,
        categoryId: 'cat_4_1',
        yearMonth: currentYearMonth,
        assignedCents: 15000,
        activityCents: 5590,
        availableCents: 9410,
      },
    ];

    await db.monthly_envelopes.bulkAdd(envelopes);

    // 8. Financial Transactions Ledger
    const transactions: Transaction[] = [
      {
        id: 'tx_salary',
        accountId: 'acc_nubank_conta',
        date: pastDayThisMonth(5),
        amountCents: 600000, // R$ 6.000,00
        type: 'income',
        categoryId: null,
        payee: isEn ? 'Tech Corp Inc' : 'Empresa Tech Ltda',
        notes: isEn ? 'Monthly Salary' : 'Salário Mensal',
        status: 'reconciled',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'tx_groceries',
        accountId: 'acc_nubank_conta',
        date: pastDayThisMonth(10),
        amountCents: 45000, // R$ 450,00
        type: 'expense',
        categoryId: 'cat_2_1', // Groceries
        payee: isEn ? 'Whole Foods Market' : 'Pão de Açúcar',
        notes: isEn ? 'Weekly groceries' : 'Compras da semana',
        status: 'cleared',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        id: 'tx_rent',
        accountId: 'acc_nubank_conta',
        date: pastDayThisMonth(1),
        amountCents: 240000, // R$ 2.400,00
        type: 'split_share',
        categoryId: 'cat_1_1',
        payee: isEn ? 'Property Manager' : 'Administradora Imóveis',
        notes: isEn ? 'Full rent payment (50% split with Camila)' : 'Pagamento integral aluguel (50% Camila)',
        status: 'cleared',
        splitExpenseId: 'split_exp_aluguel',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      {
        // Posted 1st installment of the Dell plan (mirrors CreditCardsView's purchase flow)
        id: 'tx_dell_installment_1',
        accountId: 'acc_nubank_ultravioleta',
        date: today,
        amountCents: 80000, // R$ 800,00
        type: 'cc_installment',
        categoryId: null,
        payee: 'Notebook Dell Inspiron',
        notes: isEn ? 'Installment 1/3 - Notebook Dell Inspiron' : 'Parcela 1/3 - Notebook Dell Inspiron',
        status: 'cleared',
        installmentPlanId: 'inst_dell_notebook',
        installmentIndex: 1,
        totalInstallments: 3,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    await db.transactions.bulkAdd(transactions);

    // 9. Mascot State: Alert due to upcoming Spotify bill in 2 days!
    await db.keroo_state.put({
      id: 'current',
      nickname,
      mood: 'alert',
      lastMoodReason: isEn
        ? 'Spotify Family is due in 2 days! Check your bill radar.'
        : 'Spotify Family vence em 2 dias! Confira o radar de contas.',
      lastInteractionDate: today,
      lastEvaluatedTimestamp: Date.now(),
    });
  });
}

/**
 * Resets the entire database back to a clean slate.
 */
export async function resetToCleanSlate(
  db: KerooDatabase,
  lang: SupportedLocale = 'en-US',
  currency: SupportedCurrency = 'USD',
  petNickname: string = 'Keroo',
  preserve?: SeedPreserveOptions
): Promise<void> {
  await seedCleanSlate(db, lang, currency, petNickname, preserve);
}

/**
 * Clears and populates the database with the rich demo dataset.
 */
export async function loadDemoData(
  db: KerooDatabase,
  lang: SupportedLocale = 'en-US',
  currency: SupportedCurrency = 'USD',
  petNickname: string = 'Keroo',
  preserve?: SeedPreserveOptions
): Promise<void> {
  await seedDemoData(db, lang, currency, petNickname, preserve);
}
