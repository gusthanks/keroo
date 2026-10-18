import React from 'react';

export type BadgeVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'brand'
  | 'coin';

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  pill?: boolean;
  dot?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, { container: string; dot: string }> = {
  neutral: {
    container: 'bg-surface-muted text-text-secondary border-border-subtle',
    dot: 'bg-text-muted',
  },
  success: {
    container: 'bg-success-subtle text-success border-success/20',
    dot: 'bg-success',
  },
  warning: {
    container: 'bg-warning-subtle text-warning border-warning/20',
    dot: 'bg-warning',
  },
  danger: {
    container: 'bg-danger-subtle text-danger border-danger/20',
    dot: 'bg-danger',
  },
  info: {
    container: 'bg-info-subtle text-info border-info/20',
    dot: 'bg-info',
  },
  brand: {
    container: 'bg-brand-subtle text-brand-text border-brand-border',
    dot: 'bg-brand',
  },
  coin: {
    container: 'bg-coin-subtle text-coin-text border-coin/30',
    dot: 'bg-coin',
  },
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'sm',
  pill = true,
  dot = false,
  children,
  className = '',
  ...rest
}) => {
  const styles = VARIANT_CLASSES[variant];

  return (
    <span
      className={`inline-flex items-center font-medium border tabular-nums select-none ${
        pill ? 'rounded-full' : 'rounded-lg'
      } ${SIZE_CLASSES[size]} ${styles.container} ${className}`}
      {...rest}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />}
      {children}
    </span>
  );
};
