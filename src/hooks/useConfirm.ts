import { useState, useCallback, useRef } from 'react';
import type { ConfirmVariant } from '../components/ConfirmDialog';

export interface ConfirmOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  icon?: 'trash' | 'reset' | 'archive' | 'alert' | 'warning';
}

export interface ConfirmState {
  isOpen: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: ConfirmVariant;
  icon?: 'trash' | 'reset' | 'archive' | 'alert' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Hook that provides an async `showConfirm()` function.
 * Returns { confirmState, showConfirm }.
 * Render <ConfirmDialog {...confirmState} /> in your component tree.
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'danger',
    onConfirm: () => {},
    onCancel: () => {},
  });

  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const showConfirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // If there's already a pending confirm, reject it
      if (resolveRef.current) {
        resolveRef.current(false);
      }
      resolveRef.current = resolve;

      setState({
        isOpen: true,
        title: opts.title,
        message: opts.message,
        detail: opts.detail,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        cancelLabel: opts.cancelLabel ?? 'Cancel',
        variant: opts.variant ?? 'danger',
        icon: opts.icon,
        onConfirm: () => {
          setState((s) => ({ ...s, isOpen: false }));
          resolveRef.current?.(true);
          resolveRef.current = null;
        },
        onCancel: () => {
          setState((s) => ({ ...s, isOpen: false }));
          resolveRef.current?.(false);
          resolveRef.current = null;
        },
      });
    });
  }, []);

  return { confirmState: state, showConfirm };
}
