import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import type { Toast as ToastType } from '../types';

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200',
  error: 'bg-red-900/90 border-red-500/50 text-red-200',
  info: 'bg-blue-900/90 border-blue-500/50 text-blue-200',
};

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg
              animate-in slide-in-from-right fade-in duration-200
              ${colors[toast.type]}
            `}
          >
            <Icon className="w-5 h-5 shrink-0" />
            <span className="text-sm flex-1">{toast.message}</span>
            <button type="button" onClick={() => onRemove(toast.id)} className="shrink-0 hover:opacity-70">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
