import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leadingIcon,
      trailingIcon,
      id,
      className = '',
      disabled,
      required,
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-xs font-medium text-text-primary flex items-center justify-between"
          >
            <span>
              {label}
              {required && <span className="text-danger ml-0.5">*</span>}
            </span>
          </label>
        )}

        <div className="relative flex items-center">
          {leadingIcon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-text-muted">
              {leadingIcon}
            </div>
          )}

          {/* 
            MANDATORY 16px Mobile Input Floor Rule:
            text-base on mobile (<640px) prevents iOS Safari auto-zoom.
            sm:text-sm restores refined 14px scale on desktop.
          */}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={`w-full bg-surface-card border rounded-xl px-3.5 py-2 text-base sm:text-sm text-text-primary placeholder:text-text-muted transition-colors outline-none ${
              leadingIcon ? 'pl-9' : ''
            } ${trailingIcon ? 'pr-9' : ''} ${
              error
                ? 'border-danger focus:border-danger focus:ring-1 focus:ring-danger'
                : 'border-border-subtle focus:border-brand focus:ring-1 focus:ring-brand'
            } ${disabled ? 'opacity-50 cursor-not-allowed bg-surface-muted/50' : ''} ${className}`}
            {...rest}
          />

          {trailingIcon && (
            <div className="absolute right-3 flex items-center text-text-muted">
              {trailingIcon}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} className="text-xs text-danger font-medium mt-0.5" role="alert">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-text-secondary mt-0.5">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
