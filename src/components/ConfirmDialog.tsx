import { useCallback, useEffect, useRef } from 'react';
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
  onConfirm: () => void;
  onCancel: () => void;
}

const variantStyles: Record<ConfirmVariant, { bg: string; hoverBg: string; border: string }> = {
  danger: { bg: '#dc2626', hoverBg: '#b91c1c', border: '#991b1b' },
  warning: { bg: 'var(--amber, #bf5700)', hoverBg: 'var(--amber-hi, #d4690a)', border: 'var(--amber, #bf5700)' },
  neutral: { bg: 'var(--bg-panel, #1e1e24)', hoverBg: 'var(--bg-hover, #2a2a32)', border: 'var(--border-hi, #3a3a42)' },
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

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
  const iconColor = variant === 'danger' ? '#f87171' : variant === 'warning' ? '#fbbf24' : 'var(--text-mid, #999)';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div
        className="rounded-xl shadow-2xl w-full max-w-sm p-6 animate-in zoom-in-95 fade-in duration-150"
        style={{ background: 'var(--bg-card, #1a1a1f)', border: '1px solid var(--border, #2a2a30)' }}
      >
        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: variant === 'danger' ? 'rgba(239,68,68,0.12)' : variant === 'warning' ? 'rgba(251,191,36,0.12)' : 'var(--bg-panel, #141418)' }}
          >
            <IconComponent className="w-5 h-5" style={{ color: iconColor }} />
          </div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text, #e5e5e5)' }}>{title}</h2>
        </div>

        {/* Message */}
        <p className="text-sm mb-1 leading-relaxed" style={{ color: 'var(--text-mid, #999)', marginLeft: 52 }}>
          {message}
        </p>
        {detail && (
          <p className="text-xs leading-relaxed mt-1" style={{ color: 'var(--text-dim, #666)', marginLeft: 52 }}>
            {detail}
          </p>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{
              background: 'var(--bg-panel, #1e1e24)',
              color: 'var(--text-mid, #999)',
              border: '1px solid var(--border, #2a2a30)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover, #2a2a32)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-panel, #1e1e24)'; }}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors"
            style={{
              background: style.bg,
              border: `1px solid ${style.border}`,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = style.hoverBg; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = style.bg; }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
