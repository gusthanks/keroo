import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  hoverable?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      title,
      subtitle,
      action,
      footer,
      hoverable = false,
      children,
      className = '',
      ...rest
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-sm transition-all duration-200 ${
          hoverable ? 'hover:border-border-strong hover:shadow-md' : ''
        } ${className}`}
        {...rest}
      >
        {(title || subtitle || action) && (
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              {title && (
                <h3 className="text-base font-medium text-text-primary tracking-tight">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        )}

        {children}

        {footer && (
          <div className="mt-4 pt-4 border-t border-border-subtle text-xs text-text-secondary">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';
