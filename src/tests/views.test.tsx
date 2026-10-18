import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { db } from '../db';
import { seedDemoData } from '../db/seed';
import { DashboardView } from '../views/DashboardView';
import { AccountsView } from '../views/AccountsView';
import { CreditCardsView } from '../views/CreditCardsView';
import { SubscriptionsView } from '../views/SubscriptionsView';
import { PiggyBanksView } from '../views/PiggyBanksView';
import { SplitView } from '../views/SplitView';
import { SettingsView } from '../views/SettingsView';
import { App } from '../App';
import { getLocalTodayISO, addDaysISO } from '../core/dates';
import type { RecurringBill } from '../types';

const makeBill = (id: string, name: string, nextDueDate: string, isActive = true): RecurringBill => ({
  id,
  name,
  amountCents: 1990,
  currency: 'BRL',
  cadence: 'monthly',
  anchorDay: Number(nextDueDate.slice(8, 10)),
  startDate: nextDueDate,
  nextDueDate,
  paymentStatus: 'UPCOMING_SAFE',
  categoryId: '',
  paymentAccountId: '',
  isActive,
  autoRenew: true,
  reminderDaysBefore: 3,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

describe('Keroo Application Views Suite', () => {
  beforeEach(async () => {
    localStorage.clear();
    await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo');
  });

  afterEach(() => {
    localStorage.clear();
  });

  const renderWithI18n = (ui: React.ReactElement) => {
    return render(<I18nProvider initialLanguage="pt-BR">{ui}</I18nProvider>);
  };

  it('renders DashboardView with live Keroo mascot, KPIs, and bills radar', async () => {
    renderWithI18n(<DashboardView currency="BRL" />);

    // Check Mascot presence
    expect(await screen.findByTestId('keroo-mascot-container')).toBeInTheDocument();

    // Check KPI titles
    expect(screen.getByText(/Patrimônio Líquido/i)).toBeInTheDocument();
    expect(screen.getByText(/Receitas do Mês/i)).toBeInTheDocument();
    expect(screen.getByText(/Despesas do Mês/i)).toBeInTheDocument();
    expect(screen.getByText(/Saldo Líquido Imediato/i)).toBeInTheDocument();

    // Check Radar & Recent transactions cards
    expect(screen.getByText(/Radar de Boletos & Contas/i)).toBeInTheDocument();
    expect(screen.getByText(/Últimas Transações/i)).toBeInTheDocument();
  });

  it('regression: bills radar lists only active bills overdue or due within 3 days, overdue first', async () => {
    const today = getLocalTodayISO();
    await db.recurring_bills.clear();
    await db.recurring_bills.bulkAdd([
      makeBill('r-far', 'Radar Far Bill', addDaysISO(today, 10)),
      makeBill('r-soon', 'Radar Soon Bill', addDaysISO(today, 2)),
      makeBill('r-over', 'Radar Overdue Bill', addDaysISO(today, -3)),
      makeBill('r-today', 'Radar Today Bill', today),
      makeBill('r-inactive', 'Radar Inactive Bill', addDaysISO(today, -1), false),
    ]);

    renderWithI18n(<DashboardView currency="BRL" />);
    const radar = await screen.findByTestId('bills-radar');
    await within(radar).findByText('Radar Soon Bill');

    expect(within(radar).queryByText('Radar Far Bill')).toBeNull();
    expect(within(radar).queryByText('Radar Inactive Bill')).toBeNull();

    const text = radar.textContent || '';
    const iOver = text.indexOf('Radar Overdue Bill');
    const iToday = text.indexOf('Radar Today Bill');
    const iSoon = text.indexOf('Radar Soon Bill');
    expect(iOver).toBeGreaterThanOrEqual(0);
    expect(iOver).toBeLessThan(iToday);
    expect(iToday).toBeLessThan(iSoon);

    expect(within(radar).getByText('Atrasado')).toBeInTheDocument();
    expect(within(radar).getByText('Vence Hoje')).toBeInTheDocument();
    expect(within(radar).getByText('Vence Breve')).toBeInTheDocument();
    // Localized cadence label, never the raw enum
    expect(within(radar).queryByText(/monthly/)).toBeNull();
  });

  it('regression: bills radar shows the empty state when no bill is overdue or due within 3 days', async () => {
    const today = getLocalTodayISO();
    await db.recurring_bills.clear();
    await db.recurring_bills.add(makeBill('r-far-only', 'Radar Far Only', addDaysISO(today, 15)));

    renderWithI18n(<DashboardView currency="BRL" />);
    expect(await screen.findByTestId('bills-radar-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('bills-radar')).toBeNull();
  });

  it('regression: re-importing the same statement skips duplicates instead of double-counting', async () => {
    const firstAcc = (await db.accounts.toArray())[0];
    const csv1 = `Date,Payee,Outflow,Inflow\n2026-10-10,Mercado Regressao,120.50,\n2026-10-12,Salario Regressao,,3500.00`;
    const csv2 = `${csv1}\n2026-10-13,Padaria Regressao,15.00,`;

    renderWithI18n(<AccountsView currency="BRL" />);
    await screen.findAllByText(firstAcc.name);
    const countBefore = await db.transactions.where('accountId').equals(firstAcc.id).count();

    // First import: both rows are new
    fireEvent.click(screen.getByText(/Importar Extrato/i));
    fireEvent.change(screen.getByPlaceholderText(/Cole aqui o texto/i), { target: { value: csv1 } });
    fireEvent.click(screen.getByText(/Processar Prévia/i));
    fireEvent.click(await screen.findByText(/Confirmar e Salvar 2 Transações/i));
    await waitFor(() => expect(screen.queryByPlaceholderText(/Cole aqui o texto/i)).toBeNull());
    expect(await db.transactions.where('accountId').equals(firstAcc.id).count()).toBe(countBefore + 2);

    // Second import: same two rows + one new row → only the new one is kept
    fireEvent.click(screen.getByText(/Importar Extrato/i));
    fireEvent.change(screen.getByPlaceholderText(/Cole aqui o texto/i), { target: { value: csv2 } });
    fireEvent.click(screen.getByText(/Processar Prévia/i));
    expect(await screen.findByText(/Confirmar e Salvar 1 Transações/i)).toBeInTheDocument();
    expect(screen.getByTestId('import-stats').textContent).toMatch(/2 duplicadas ignoradas/);
    fireEvent.click(screen.getByText(/Confirmar e Salvar 1 Transações/i));
    await waitFor(() => expect(screen.queryByPlaceholderText(/Cole aqui o texto/i)).toBeNull());
    expect(await db.transactions.where('accountId').equals(firstAcc.id).count()).toBe(countBefore + 3);

    // Third import of the original file: everything is a duplicate → inline message, nothing saved
    fireEvent.click(screen.getByText(/Importar Extrato/i));
    fireEvent.change(screen.getByPlaceholderText(/Cole aqui o texto/i), { target: { value: csv1 } });
    fireEvent.click(screen.getByText(/Processar Prévia/i));
    expect(await screen.findByText(/Todas as 2 transações já existem/i)).toBeInTheDocument();
    expect(await db.transactions.where('accountId').equals(firstAcc.id).count()).toBe(countBefore + 3);
  });

  it('regression: a negative initial balance shows an inline error instead of throwing', async () => {
    renderWithI18n(<AccountsView currency="BRL" />);
    fireEvent.click(await screen.findByText(/Nova Conta/i));
    const countBefore = await db.accounts.count();
    fireEvent.change(screen.getByPlaceholderText(/Nubank, Itaú Corrente/i), { target: { value: 'Conta Negativa' } });
    fireEvent.change(screen.getByLabelText(/Saldo Inicial/i), { target: { value: '-50,00' } });
    fireEvent.click(screen.getByText(/Criar Conta/i));
    expect(await screen.findByText(/não pode ser negativo/i)).toBeInTheDocument();
    expect(await db.accounts.count()).toBe(countBefore);
  });

  it('renders AccountsView with accounts grid, ledger, and action buttons', async () => {
    renderWithI18n(<AccountsView currency="BRL" />);

    // Header & Actions
    expect(await screen.findByRole('heading', { level: 2, name: /contas/i })).toBeInTheDocument();
    expect(screen.getByText(/Importar Extrato/i)).toBeInTheDocument();
    expect(screen.getByText(/Nova Conta/i)).toBeInTheDocument();
    expect(screen.getByText(/Nova Transação/i)).toBeInTheDocument();
    expect(screen.getByText(/Todas as Contas/i)).toBeInTheDocument();
  });

  it('renders CreditCardsView with limits and installment timeline projection', async () => {
    renderWithI18n(<CreditCardsView currency="BRL" />);

    expect(await screen.findByRole('heading', { level: 2, name: /cartões/i })).toBeInTheDocument();
    expect(screen.getByText(/Novo Parcelamento/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Linha do Tempo de Parcelamentos Futuros/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Planos de Parcelamento Ativos/i)).toBeInTheDocument();
  });

  it('renders SubscriptionsView with annual impact banner and bill items', async () => {
    renderWithI18n(<SubscriptionsView currency="BRL" />);

    expect(await screen.findByRole('heading', { level: 2, name: /assinaturas/i })).toBeInTheDocument();
    expect(screen.getByText(/Impacto Anualizado Total/i)).toBeInTheDocument();
    expect(screen.getByText(/Equivalente Mensal Médio/i)).toBeInTheDocument();
    expect(screen.getByText(/Nova Assinatura \/ Boleto/i)).toBeInTheDocument();
  });

  it('renders PiggyBanksView with savings targets, progress bars and actions', async () => {
    renderWithI18n(<PiggyBanksView currency="BRL" />);

    expect(await screen.findByRole('heading', { level: 2, name: /cofrinhos/i })).toBeInTheDocument();
    expect(screen.getByText(/Total Acumulado/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Meta Global/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Novo Cofrinho/i)).toBeInTheDocument();
  });

  it('renders SplitView with bilateral contact balances and settlement trigger', async () => {
    renderWithI18n(<SplitView currency="BRL" />);

    expect(await screen.findByRole('heading', { level: 2, name: /divisão/i })).toBeInTheDocument();
    expect(screen.getByText(/Novo Amigo \/ Contato/i)).toBeInTheDocument();
    expect(screen.getByText(/Dividir Despesa/i)).toBeInTheDocument();

    // Check Camila contact from demo
    expect((await screen.findAllByText(/Camila/i))[0]).toBeInTheDocument();
  });

  it('renders SettingsView with language, currency, theme, and data reset buttons', async () => {
    renderWithI18n(<SettingsView currency="BRL" />);

    expect(await screen.findByText(/Idioma da Interface/i)).toBeInTheDocument();
    expect(screen.getByText(/Moeda Principal do Aplicativo/i)).toBeInTheDocument();
    expect(screen.getByText(/Tema & Aparência/i)).toBeInTheDocument();
    expect(screen.getByText(/Mascote Keroo & Roaming Companion/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Carregar Dados Demo/i)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/Resetar Tudo \(Clean Slate\)/i)[0]).toBeInTheDocument();
  });

  it('renders complete App with Sidebar navigation and switches active views', async () => {
    // <App /> owns its I18nProvider (English-first); opt into pt-BR to keep the Portuguese labels.
    localStorage.setItem('keroo_language', 'pt-BR');
    render(<App />);

    // Find desktop sidebar
    const sidebar = await screen.findByTestId('desktop-sidebar');
    expect(sidebar).toBeInTheDocument();

    // Navigate to Contas / Accounts
    const accountsNavBtn = within(sidebar).getByRole('button', { name: /contas/i });
    fireEvent.click(accountsNavBtn);

    const header = await screen.findByTestId('app-header');
    expect(within(header).getByRole('heading', { level: 2, name: /contas/i })).toBeInTheDocument();

    // Navigate to Cartões
    const cardsNavBtn = within(sidebar).getByRole('button', { name: /cartões/i });
    fireEvent.click(cardsNavBtn);

    expect(within(header).getByRole('heading', { level: 2, name: /cartões/i })).toBeInTheDocument();
  });
});
