import { useState, useCallback, useRef, useEffect } from 'react';
import type { Annotation, CueFields } from '../types';
import { loadAnnotations, saveAnnotations } from '../utils/storage';
import { recalculateAllDurations } from '../utils/duration';

export function useAnnotations(fileName: string, fileSize: number, videoDuration: number) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Determine storage key: use no-video key if fileName is empty
  const effectiveFileName = fileName || 'no-video';
  const effectiveFileSize = fileName ? fileSize : 0;

  // Load annotations when file changes
  useEffect(() => {
    const loaded = loadAnnotations(effectiveFileName, effectiveFileSize);
    // Recalculate durations on load
    const recalculated = recalculateAllDurations(loaded, videoDuration);
    setAnnotations(recalculated);
  }, [effectiveFileName, effectiveFileSize, videoDuration]);

  // Debounced save
  const debouncedSave = useCallback(
    (updated: Annotation[]) => {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveAnnotations(effectiveFileName, effectiveFileSize, updated);
      }, 300);
    },
    [effectiveFileName, effectiveFileSize],
  );

  const addAnnotation = useCallback(
    (timestamp: number, cue: CueFields) => {
      const newAnnotation: Annotation = {
        id: crypto.randomUUID(),
        timestamp,
        cue,
        timeInTitle: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setAnnotations((prev) => {
        const withNew = [...prev, newAnnotation].sort((a, b) => a.timestamp - b.timestamp);
        const updated = recalculateAllDurations(withNew, videoDuration);
        debouncedSave(updated);
        return updated;
      });
      return newAnnotation;
    },
    [debouncedSave, videoDuration],
  );

  const updateAnnotation = useCallback(
    (id: string, cue: CueFields, newTimestamp?: number) => {
      setAnnotations((prev) => {
        const modified = prev
          .map((a) =>
            a.id === id
              ? {
                  ...a,
                  cue,
                  timestamp: typeof newTimestamp === 'number' ? newTimestamp : a.timestamp,
                  updatedAt: new Date().toISOString(),
                }
              : a,
          )
          .sort((a, b) => a.timestamp - b.timestamp);
        const updated = recalculateAllDurations(modified, videoDuration);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave, videoDuration],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const filtered = prev.filter((a) => a.id !== id);
        const updated = recalculateAllDurations(filtered, videoDuration);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave, videoDuration],
  );

  const replaceAll = useCallback(
    (newAnnotations: Annotation[]) => {
      const sorted = [...newAnnotations].sort((a, b) => a.timestamp - b.timestamp);
      const updated = recalculateAllDurations(sorted, videoDuration);
      setAnnotations(updated);
      debouncedSave(updated);
    },
    [debouncedSave, videoDuration],
  );

  const mergeAnnotations = useCallback(
    (incoming: Annotation[]) => {
      setAnnotations((prev) => {
        const existingTimestamps = new Set(prev.map((a) => a.timestamp.toFixed(3)));
        const newOnes = incoming.filter((a) => !existingTimestamps.has(a.timestamp.toFixed(3)));
        const merged = [...prev, ...newOnes].sort((a, b) => a.timestamp - b.timestamp);
        const updated = recalculateAllDurations(merged, videoDuration);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave, videoDuration],
  );

  // Update active annotation based on current time
  // Active = cue where videoTime < cue.timestamp + cue.duration (parsed)
  const updateActiveAnnotation = useCallback(
    (currentTime: number) => {
      if (annotations.length === 0) {
        setActiveId(null);
        return;
      }
      // Find the latest annotation whose timestamp <= currentTime and is still active
      // (currentTime < timestamp + duration)
      let closest: Annotation | null = null;
      for (const a of annotations) {
        const dur = parseFloat(a.cue.duration) || 0;
        if (a.timestamp <= currentTime && currentTime < a.timestamp + dur) {
          closest = a;
        }
      }
      // Fallback: if no active cue found, use closest past cue
      if (!closest) {
        for (const a of annotations) {
          if (a.timestamp <= currentTime + 0.5) {
            closest = a;
          } else {
            break;
          }
        }
      }
      setActiveId(closest?.id ?? null);
    },
    [annotations],
  );

  const renameCueType = useCallback(
    (oldType: string, newType: string) => {
      setAnnotations((prev) => {
        const updated = prev.map((a) =>
          a.cue.type === oldType
            ? { ...a, cue: { ...a.cue, type: newType }, updatedAt: new Date().toISOString() }
            : a,
        );
        const recalculated = recalculateAllDurations(updated, videoDuration);
        debouncedSave(recalculated);
        return recalculated;
      });
    },
    [debouncedSave, videoDuration],
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
    renameCueType,
  };
}
