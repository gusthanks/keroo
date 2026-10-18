import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useOptionalTranslation } from '../../i18n';

export type ModalMaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: ModalMaxWidth;
  className?: string;
  closeOnOutsideClick?: boolean;
}

const MAX_WIDTH_CLASSES: Record<ModalMaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
  className = '',
  closeOnOutsideClick = true,
}) => {
  const { t } = useOptionalTranslation();
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-black/40 backdrop-blur-md transition-opacity duration-200"
      onClick={(e) => {
        if (closeOnOutsideClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
      data-testid="modal-backdrop"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`w-full ${MAX_WIDTH_CLASSES[maxWidth]} bg-surface-card border border-border-subtle rounded-2xl shadow-xl overflow-hidden flex flex-col my-8 transition-transform duration-200 ${className}`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between p-5 border-b border-border-subtle bg-surface-muted/30">
            <div>
              {title && (
                <h3
                  id={titleId}
                  className="text-base font-semibold text-text-primary tracking-tight"
                >
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-1 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="p-5 flex-1 overflow-y-auto">{children}</div>

        {footer && (
          <div className="p-4 border-t border-border-subtle bg-surface-muted/20 flex items-center justify-end gap-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
