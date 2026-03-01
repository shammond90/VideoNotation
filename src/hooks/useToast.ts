import { useState, useCallback, useRef } from 'react';
import type { Toast } from '../types';

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const addToast = useCallback((message: string, type: Toast['type'] = 'success', duration = 3000) => {
    const id = crypto.randomUUID();
    const toast: Toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    const timeout = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timeoutsRef.current.delete(id);
    }, duration);

    timeoutsRef.current.set(id, timeout);
    return id;
  }, []);

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
