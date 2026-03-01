import { useState, useCallback, useRef, useEffect } from 'react';
import type { Annotation, CueFields } from '../types';
import { loadAnnotations, saveAnnotations } from '../utils/storage';

export function useAnnotations(fileName: string, fileSize: number) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load annotations when file changes
  useEffect(() => {
    if (!fileName) {
      setAnnotations([]);
      return;
    }
    const loaded = loadAnnotations(fileName, fileSize);
    setAnnotations(loaded);
  }, [fileName, fileSize]);

  // Debounced save
  const debouncedSave = useCallback(
    (updated: Annotation[]) => {
      if (!fileName) return;
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveAnnotations(fileName, fileSize, updated);
      }, 300);
    },
    [fileName, fileSize],
  );

  const addAnnotation = useCallback(
    (timestamp: number, cue: CueFields) => {
      const newAnnotation: Annotation = {
        id: crypto.randomUUID(),
        timestamp,
        cue,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setAnnotations((prev) => {
        const updated = [...prev, newAnnotation].sort((a, b) => a.timestamp - b.timestamp);
        debouncedSave(updated);
        return updated;
      });
      return newAnnotation;
    },
    [debouncedSave],
  );

  const updateAnnotation = useCallback(
    (id: string, cue: CueFields) => {
      setAnnotations((prev) => {
        const updated = prev.map((a) =>
          a.id === id ? { ...a, cue, updatedAt: new Date().toISOString() } : a,
        );
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const updated = prev.filter((a) => a.id !== id);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave],
  );

  const replaceAll = useCallback(
    (newAnnotations: Annotation[]) => {
      const sorted = [...newAnnotations].sort((a, b) => a.timestamp - b.timestamp);
      setAnnotations(sorted);
      debouncedSave(sorted);
    },
    [debouncedSave],
  );

  const mergeAnnotations = useCallback(
    (incoming: Annotation[]) => {
      setAnnotations((prev) => {
        const existingTimestamps = new Set(prev.map((a) => a.timestamp.toFixed(3)));
        const newOnes = incoming.filter((a) => !existingTimestamps.has(a.timestamp.toFixed(3)));
        const merged = [...prev, ...newOnes].sort((a, b) => a.timestamp - b.timestamp);
        debouncedSave(merged);
        return merged;
      });
    },
    [debouncedSave],
  );

  // Update active annotation based on current time
  const updateActiveAnnotation = useCallback(
    (currentTime: number) => {
      if (annotations.length === 0) {
        setActiveId(null);
        return;
      }
      let closest: Annotation | null = null;
      for (const a of annotations) {
        if (a.timestamp <= currentTime + 0.5) {
          closest = a;
        } else {
          break;
        }
      }
      setActiveId(closest?.id ?? null);
    },
    [annotations],
  );

  return {
    annotations,
    activeId,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    replaceAll,
    mergeAnnotations,
    updateActiveAnnotation,
  };
}
