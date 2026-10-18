import React from 'react';

export type ProgressBarVariant = 'brand' | 'coin' | 'success' | 'warning' | 'danger';
export type ProgressBarSize = 'sm' | 'md' | 'lg';

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  variant?: ProgressBarVariant;
  size?: ProgressBarSize;
  showLabel?: boolean;
  label?: React.ReactNode;
}

const VARIANT_FILL: Record<ProgressBarVariant, string> = {
  brand: 'bg-brand',
  coin: 'bg-coin',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const SIZE_HEIGHT: Record<ProgressBarSize, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  variant = 'brand',
  size = 'md',
  showLabel = false,
  label,
  className = '',
  ...rest
}) => {
  const percentage = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const roundedPercent = Math.round(percentage);

  return (
    <div className={`w-full flex flex-col gap-1.5 ${className}`} {...rest}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between text-xs text-text-secondary">
          <span>{label}</span>
          {showLabel && (
            <span className="font-mono tabular-nums font-medium text-text-primary">
              {roundedPercent}%
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={Math.round(value)}
        aria-valuemin={0}
        aria-valuemax={max}
        className={`w-full bg-border-subtle rounded-full overflow-hidden ${SIZE_HEIGHT[size]}`}
      >
        <div
          className={`h-full transition-all duration-300 ease-out rounded-full ${VARIANT_FILL[variant]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
