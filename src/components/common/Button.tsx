import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand hover:bg-brand-hover text-surface-card font-medium border border-transparent shadow-sm',
  secondary:
    'bg-surface-muted hover:bg-surface-hover text-text-primary font-medium border border-border-subtle',
  outline:
    'bg-transparent hover:bg-surface-hover text-text-primary font-medium border border-border-subtle hover:border-border-strong',
  ghost:
    'bg-transparent hover:bg-surface-hover text-text-secondary hover:text-text-primary font-medium border border-transparent',
  danger:
    'bg-danger hover:opacity-90 text-surface-card font-medium border border-transparent shadow-sm',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5 min-h-[32px]',
  md: 'px-4 py-2 text-sm rounded-xl gap-2 min-h-[40px]',
  lg: 'px-5 py-2.5 text-base rounded-xl gap-2.5 min-h-[48px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leadingIcon,
      trailingIcon,
      disabled = false,
      children,
      className = '',
      type = 'button',
      ...rest
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`inline-flex items-center justify-center font-medium transition-all duration-150 select-none ${
          SIZE_CLASSES[size]
        } ${VARIANT_CLASSES[variant]} ${
          isDisabled
            ? 'opacity-50 cursor-not-allowed pointer-events-none'
            : 'active:scale-[0.98] cursor-pointer'
        } ${className}`}
        {...rest}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-0.5 mr-2 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
            data-testid="loading-spinner"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!isLoading && leadingIcon && <span className="shrink-0">{leadingIcon}</span>}
        {children && <span>{children}</span>}
        {!isLoading && trailingIcon && <span className="shrink-0">{trailingIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';
