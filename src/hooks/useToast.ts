import { useState, useCallback, useRef } from 'react';
import type { Toast } from '../types';

/** Default auto-dismiss durations by severity. */
const DEFAULT_DURATION: Record<Toast['type'], number> = {
  success: 3000,
  info: 3000,
  warning: 5000,
  error: 8000,
};

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback(
    (message: string, type: Toast['type'] = 'success', durationOrOpts?: number | { duration?: number; details?: string }) => {
      const id = crypto.randomUUID();
      let duration: number;
      let details: string | undefined;

      if (typeof durationOrOpts === 'number') {
        duration = durationOrOpts;
      } else if (durationOrOpts && typeof durationOrOpts === 'object') {
        duration = durationOrOpts.duration ?? DEFAULT_DURATION[type];
        details = durationOrOpts.details;
      } else {
        duration = DEFAULT_DURATION[type];
      }

      const toast: Toast = { id, message, type, details };
      setToasts((prev) => [...prev, toast]);

      const timeout = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timeoutsRef.current.delete(id);
      }, duration);

      timeoutsRef.current.set(id, timeout);
      return id;
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  return { toasts, addToast, removeToast };
}
