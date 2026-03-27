import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Trash2, RotateCcw, Archive, AlertCircle } from 'lucide-react';

export type ConfirmVariant = 'danger' | 'warning' | 'neutral';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  /** Optional secondary detail text (smaller, dimmer). */
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  /** Optional icon override. Defaults based on variant. */
  icon?: 'trash' | 'reset' | 'archive' | 'alert' | 'warning';
  /** If set, the user must type this exact string before the confirm button enables. */
  requireText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles: Record<ConfirmVariant, { bg: string; hoverBg: string; border: string }> = {
  danger: { bg: 'var(--danger)', hoverBg: 'var(--danger-hi)', border: 'var(--danger-hi)' },
  warning: { bg: 'var(--amber)', hoverBg: 'var(--amber-hi)', border: 'var(--amber)' },
  neutral: { bg: 'var(--bg-panel)', hoverBg: 'var(--bg-hover)', border: 'var(--border-hi)' },
};

const iconMap = {
  trash: Trash2,
  reset: RotateCcw,
  archive: Archive,
  alert: AlertCircle,
  warning: AlertTriangle,
};

function defaultIcon(variant: ConfirmVariant): keyof typeof iconMap {
  switch (variant) {
    case 'danger': return 'alert';
    case 'warning': return 'warning';
    case 'neutral': return 'alert';
  }
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  detail,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  icon,
  requireText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typedText, setTypedText] = useState('');

  // Reset typed text when dialog opens/closes
  useEffect(() => {
    if (!isOpen) setTypedText('');
  }, [isOpen]);

  const isConfirmDisabled = requireText ? typedText !== requireText : false;

  // Focus the cancel button when the dialog opens (safe default)
  useEffect(() => {
    if (isOpen) {
      // Short delay to let the animation start
      requestAnimationFrame(() => cancelRef.current?.focus());
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onCancel();
    },
    [onCancel],
  );

  if (!isOpen) return null;

  const style = variantStyles[variant];
  const IconComponent = iconMap[icon ?? defaultIcon(variant)];
  const iconColor = variant === 'danger' ? 'var(--danger)' : variant === 'warning' ? 'var(--amber)' : 'var(--text-mid)';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center backdrop-blur-sm"
      style={{ background: 'var(--overlay)' }}
      onClick={handleBackdropClick}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 fade-in duration-150"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: variant === 'danger' ? 'var(--red-dim)' : variant === 'warning' ? 'var(--amber-dim)' : 'var(--bg-panel)' }}
          >
            <IconComponent className="w-5 h-5" style={{ color: iconColor }} />
          </div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>

        {/* Message */}
        <p className="text-sm mb-1 leading-relaxed" style={{ color: 'var(--text-mid)', marginLeft: 52 }}>
          {message}
        </p>
        {detail && (
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-dim)', marginLeft: 52 }}>
            {detail}
          </p>
        )}

        {/* Type-to-confirm input */}
        {requireText && (
          <div className="mt-4" style={{ marginLeft: 52 }}>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--text-dim)' }}>
              Type <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{requireText}</span> to confirm
            </label>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={requireText}
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-1.5 text-sm rounded-md outline-none"
              style={{
                background: 'var(--bg-panel)',
                color: 'var(--text)',
                border: '1px solid var(--border-hi)',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = variant === 'danger' ? 'var(--danger)' : 'var(--amber)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-hi)'; }}
            />
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{
              background: 'var(--bg-panel)',
              color: 'var(--text-mid)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-panel)'; }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: isConfirmDisabled ? 'var(--bg-panel)' : style.bg,
              border: `1px solid ${isConfirmDisabled ? 'var(--border)' : style.border}`,
            }}
            onMouseEnter={(e) => { if (!isConfirmDisabled) e.currentTarget.style.background = style.hoverBg; }}
            onMouseLeave={(e) => { if (!isConfirmDisabled) e.currentTarget.style.background = style.bg; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
