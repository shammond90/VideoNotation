import { useState } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, ChevronDown, ChevronRight } from 'lucide-react';
import type { Toast as ToastType } from '../types';

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const borderColors: Record<ToastType['type'], string> = {
  success: 'var(--emerald, #10b981)',
  error: '#ef4444',
  warning: 'var(--amber, #bf5700)',
  info: '#3b82f6',
};

const iconColors: Record<ToastType['type'], string> = {
  success: '#34d399',
  error: '#f87171',
  warning: '#fbbf24',
  info: '#60a5fa',
};

function ToastItem({ toast, onRemove }: { toast: ToastType; onRemove: (id: string) => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const Icon = icons[toast.type];

  return (
    <div
      className="flex flex-col rounded-lg shadow-lg animate-in slide-in-from-right fade-in duration-200 cursor-pointer"
      style={{
        background: 'var(--bg-card, #1a1a1f)',
        border: '1px solid var(--border, #2a2a30)',
        borderLeftWidth: 3,
        borderLeftColor: borderColors[toast.type],
        minWidth: 280,
        maxWidth: 380,
      }}
      onClick={() => onRemove(toast.id)}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" style={{ color: iconColors[toast.type] }} />
        <span className="text-sm flex-1" style={{ color: 'var(--text, #e5e5e5)' }}>{toast.message}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(toast.id); }}
          className="shrink-0 p-0.5 rounded transition-colors"
          style={{ color: 'var(--text-dim, #666)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text, #e5e5e5)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim, #666)'; }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {toast.details && (
        <div
          className="px-4 pb-2"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="flex items-center gap-1 text-[10px] transition-colors"
            style={{ color: 'var(--text-dim, #666)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-mid, #999)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim, #666)'; }}
          >
            {detailsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Details
          </button>
          {detailsOpen && (
            <pre
              className="mt-1 text-[10px] font-mono p-2 rounded overflow-x-auto"
              style={{
                background: 'var(--bg-panel, #141418)',
                color: 'var(--text-dim, #666)',
                border: '1px solid var(--border, #2a2a30)',
                maxHeight: 100,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {toast.details}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2" style={{ maxWidth: 380 }}>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}
