import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nProvider } from '../i18n';
import { db } from '../db';
import { seedDemoData } from '../db/seed';
import { BottomNav } from '../components/layout/BottomNav';
import { CommandPalette } from '../components/command/CommandPalette';
import { PiggyBanksView } from '../views/PiggyBanksView';
import { App } from '../App';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { Input } from '../components/common/Input';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { ProgressBar } from '../components/common/ProgressBar';

describe('Common Craft UI Components', () => {
  describe('Button Component', () => {
    it('renders with children and handles click events', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Salvar</Button>);

      const btn = screen.getByRole('button', { name: /salvar/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('renders loading spinner and disables button when isLoading is true', () => {
      const handleClick = vi.fn();
      render(
        <Button isLoading onClick={handleClick}>
          Processando
        </Button>
      );

      const btn = screen.getByRole('button', { name: /processando/i });
      expect(btn).toBeDisabled();
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('applies variant classes correctly', () => {
      const { rerender } = render(<Button variant="danger">Excluir</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-danger');

      rerender(<Button variant="secondary">Voltar</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-surface-muted');

      rerender(<Button variant="outline">Cancelar</Button>);
      expect(screen.getByRole('button')).toHaveClass('bg-transparent');
    });

    it('renders leading and trailing icons', () => {
      render(
        <Button
          leadingIcon={<span data-testid="lead-icon">←</span>}
          trailingIcon={<span data-testid="trail-icon">→</span>}
        >
          Navegar
        </Button>
      );

      expect(screen.getByTestId('lead-icon')).toBeInTheDocument();
      expect(screen.getByTestId('trail-icon')).toBeInTheDocument();
    });
  });

  describe('Card Component', () => {
    it('renders title, subtitle, action, content and footer', () => {
      render(
        <Card
          title="Título do Cartão"
          subtitle="Subtítulo descritivo"
          action={<button>Ação</button>}
          footer={<span>Rodapé informativo</span>}
        >
          <p>Conteúdo interno do card</p>
        </Card>
      );

      expect(screen.getByText('Título do Cartão')).toBeInTheDocument();
      expect(screen.getByText('Subtítulo descritivo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Ação' })).toBeInTheDocument();
      expect(screen.getByText('Conteúdo interno do card')).toBeInTheDocument();
      expect(screen.getByText('Rodapé informativo')).toBeInTheDocument();
    });

    it('applies concentric radius and subtle border styling', () => {
      const { container } = render(<Card>Card Concentric</Card>);
      const cardEl = container.firstChild as HTMLElement;
      expect(cardEl).toHaveClass('rounded-2xl');
      expect(cardEl).toHaveClass('border-border-subtle');
    });
  });

  describe('Input Component (16px Mobile Floor Rule)', () => {
    it('strictly satisfies the MANDATORY 16px Mobile Input Floor Rule (text-base sm:text-sm)', () => {
      render(<Input placeholder="Digite o valor..." />);
      const inputEl = screen.getByPlaceholderText('Digite o valor...');
      expect(inputEl).toHaveClass('text-base');
      expect(inputEl).toHaveClass('sm:text-sm');
    });

    it('renders label with required asterisk when required=true', () => {
      render(<Input label="Nome Completo" required />);
      expect(screen.getByText('Nome Completo')).toBeInTheDocument();
      expect(screen.getByText('*')).toHaveClass('text-danger');
    });

    it('renders error message with accessible ARIA attributes', () => {
      render(<Input label="E-mail" error="Endereço de e-mail inválido" />);
      const inputEl = screen.getByRole('textbox');
      expect(inputEl).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('alert')).toHaveTextContent('Endereço de e-mail inválido');
    });

    it('renders helper text when no error exists', () => {
      render(<Input label="CPF" helperText="Apenas números" />);
      expect(screen.getByText('Apenas números')).toBeInTheDocument();
    });
  });

  describe('Modal Component', () => {
    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()} title="Modal Fechado">
          Conteúdo
        </Modal>
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true with backdrop and title', () => {
      render(
        <Modal isOpen={true} onClose={vi.fn()} title="Modal Aberto">
          <p>Conteúdo do Modal</p>
        </Modal>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByText('Modal Aberto')).toBeInTheDocument();
      expect(screen.getByText('Conteúdo do Modal')).toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Teste Close">
          Corpo
        </Modal>
      );

      // Rendered without an I18nProvider, the Modal falls back to the en-US default ("Close").
      const closeBtn = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Teste Esc">
          Corpo
        </Modal>
      );

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when clicking outside on backdrop', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Teste Backdrop">
          Corpo
        </Modal>
      );

      const backdrop = screen.getByTestId('modal-backdrop');
      fireEvent.click(backdrop);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('Badge Component', () => {
    it('renders with semantic variants and pill shape', () => {
      const { rerender } = render(<Badge variant="success">Pago</Badge>);
      expect(screen.getByText('Pago')).toHaveClass('text-success');

      rerender(<Badge variant="danger">Atrasado</Badge>);
      expect(screen.getByText('Atrasado')).toHaveClass('text-danger');

      rerender(<Badge variant="brand">Keroo</Badge>);
      expect(screen.getByText('Keroo')).toHaveClass('text-brand-text');
    });

    it('renders dot indicator when dot is true', () => {
      const { container } = render(
        <Badge variant="warning" dot>
          Alerta
        </Badge>
      );
      const dot = container.querySelector('.rounded-full.shrink-0');
      expect(dot).toBeInTheDocument();
      expect(dot).toHaveClass('bg-warning');
    });
  });

  describe('ProgressBar Component', () => {
    it('calculates width percentage and accessibility attributes correctly', () => {
      render(<ProgressBar value={75} max={100} showLabel label="Meta" />);
      const pb = screen.getByRole('progressbar');
      expect(pb).toHaveAttribute('aria-valuenow', '75');
      expect(pb).toHaveAttribute('aria-valuemin', '0');
      expect(pb).toHaveAttribute('aria-valuemax', '100');
      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('Meta')).toBeInTheDocument();
    });

    it('clamps percentage to 100% when value exceeds max', () => {
      render(<ProgressBar value={150} max={100} showLabel />);
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    it('clamps percentage to 0% when value is negative', () => {
      render(<ProgressBar value={-20} max={100} showLabel />);
      expect(screen.getByText('0%')).toBeInTheDocument();
    });
  });
});

describe('Regression: navigation, palette, theme and piggy bank fixes', () => {
  // The app is English-first; these regressions assert the Portuguese labels, so start clean
  // and opt into pt-BR explicitly wherever <App /> owns its own I18nProvider.
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  const withI18n = (ui: React.ReactElement) =>
    render(<I18nProvider initialLanguage="pt-BR">{ui}</I18nProvider>);

  it('BottomNav "Mais" sheet reaches Cartões, Cofrinhos, Divisão and Configurações', () => {
    const onNavigate = vi.fn();
    withI18n(<BottomNav activeView="dashboard" onNavigate={onNavigate} onQuickAdd={() => {}} />);
    expect(screen.getByTestId('mobile-bottom-nav')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('mobile-more-tab'));
    const sheet = screen.getByTestId('mobile-more-sheet');
    expect(within(sheet).getAllByRole('menuitem')).toHaveLength(4);
    expect(within(sheet).getByText('Cartões & Parcelas')).toBeInTheDocument();
    expect(within(sheet).getByText('Divisão & Amigos')).toBeInTheDocument();
    expect(within(sheet).getByText('Configurações')).toBeInTheDocument();

    fireEvent.click(within(sheet).getByText('Cofrinhos'));
    expect(onNavigate).toHaveBeenCalledWith('piggy_banks');
    expect(screen.queryByTestId('mobile-more-sheet')).toBeNull();

    // Escape closes
    fireEvent.click(screen.getByTestId('mobile-more-tab'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('mobile-more-sheet')).toBeNull();

    // Backdrop closes
    fireEvent.click(screen.getByTestId('mobile-more-tab'));
    fireEvent.click(screen.getByTestId('mobile-more-backdrop'));
    expect(screen.queryByTestId('mobile-more-sheet')).toBeNull();
  });

  it('BottomNav highlights "Mais" when one of its views is active', () => {
    withI18n(<BottomNav activeView="split" onNavigate={() => {}} onQuickAdd={() => {}} />);
    expect(screen.getByTestId('mobile-more-tab').className).toContain('text-brand');
  });

  it('CommandPalette hides demo/reset items when their handlers are not wired', async () => {
    const { unmount } = withI18n(
      <CommandPalette isOpen onClose={() => {}} onNavigate={() => {}} currency="BRL" />
    );
    expect(screen.queryByText(/Carregar Dados de Demonstração/i)).toBeNull();
    expect(screen.queryByText(/Resetar Dados \(Clean Slate\)/i)).toBeNull();
    unmount();

    withI18n(
      <CommandPalette
        isOpen
        onClose={() => {}}
        onNavigate={() => {}}
        onLoadDemoData={() => {}}
        onResetCleanSlate={() => {}}
        currency="BRL"
      />
    );
    expect(screen.getByText(/Carregar Dados de Demonstração/i)).toBeInTheDocument();
    expect(screen.getByText(/Resetar Dados \(Clean Slate\)/i)).toBeInTheDocument();
  });

  it('header theme button toggles the theme instead of writing the click event to IndexedDB', async () => {
    await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo', { theme: 'light' });
    localStorage.setItem('keroo_language', 'pt-BR');
    render(<App />);
    const header = await screen.findByTestId('app-header');
    fireEvent.click(within(header).getByLabelText('Alternar tema'));

    // Wait for both: the row is written before the live query re-renders the app,
    // so the <html> class can lag one render behind the database.
    await waitFor(async () => {
      const settings = await db.user_settings.get('global');
      expect(settings?.theme).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  it('PiggyBanksView rejects a withdrawal larger than the saved amount and records deposits as transfers', async () => {
    await seedDemoData(db, 'pt-BR', 'BRL', 'Keroo');
    const before = await db.piggy_banks.get('piggy_viagem_japao'); // R$ 4.500,00 saved
    const accBefore = await db.accounts.get('acc_itau_reserva');
    withI18n(<PiggyBanksView currency="BRL" />);

    // Withdraw R$ 9.999,00 from the Japan trip piggy (only R$ 4.500,00 saved)
    const withdrawButtons = await screen.findAllByRole('button', { name: /Resgatar/i });
    fireEvent.click(withdrawButtons[1]);
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '9999,00' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Resgate/i }));

    expect(await screen.findByTestId('piggy-movement-error')).toBeInTheDocument();
    expect((await db.piggy_banks.get('piggy_viagem_japao'))?.savedCents).toBe(before?.savedCents);
    expect((await db.accounts.get('acc_itau_reserva'))?.currentBalanceCents).toBe(
      accBefore?.currentBalanceCents
    );
    expect(await db.transactions.where('type').equals('transfer').count()).toBe(0);

    // A valid withdrawal of R$ 500,00 is recorded as a transfer (not income)
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '500,00' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar Resgate/i }));
    await waitFor(async () => {
      expect((await db.piggy_banks.get('piggy_viagem_japao'))?.savedCents).toBe(
        (before?.savedCents ?? 0) - 50000
      );
    });
    const transfers = await db.transactions.where('type').equals('transfer').toArray();
    expect(transfers).toHaveLength(1);
    expect(transfers[0].categoryId).toBeNull();
    expect(transfers[0].amountCents).toBe(50000);
    expect((await db.accounts.get('acc_itau_reserva'))?.currentBalanceCents).toBe(
      (accBefore?.currentBalanceCents ?? 0) + 50000
    );
  });
});
