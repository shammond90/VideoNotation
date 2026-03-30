import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Annotation, CueFields, CueStatus } from '../types';
import { loadAnnotations, saveAnnotations } from '../utils/storage';
import { recalculateAllDurations } from '../utils/duration';

/** Silent migration: ensure every annotation has the new F2.7/F2.13/F2.14 fields */
function migrateAnnotation(a: any): Annotation {
  return {
    ...a,
    status: a.status ?? 'provisional',
    flagged: a.flagged ?? false,
    flagNote: a.flagNote ?? '',
    sort_order: a.sort_order ?? 0,
  };
}

/** Structural priority: TITLE first, then SCENE, then regular cues */
function structuralPriority(type: string): number {
  if (type === 'TITLE') return -2;
  if (type === 'SCENE') return -1;
  return 0;
}

/** Sort comparator: primary = timestamp, secondary = structural type, tertiary = sort_order */
function sortAnnotations(list: Annotation[]): Annotation[] {
  return [...list].sort((a, b) => {
    const dt = a.timestamp - b.timestamp;
    if (dt !== 0) return dt;
    const sp = structuralPriority(a.cue.type) - structuralPriority(b.cue.type);
    if (sp !== 0) return sp;
    return a.sort_order - b.sort_order;
  });
}

export function useAnnotations(fileName: string, fileSize: number, videoDuration: number) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Determine storage key: use no-video key if fileName is empty
  const effectiveFileName = fileName || 'no-video';
  const effectiveFileSize = fileName ? fileSize : 0;

  // Load annotations when file changes (with silent migration)
  useEffect(() => {
    let cancelled = false;
    loadAnnotations(effectiveFileName, effectiveFileSize).then((loaded) => {
      if (cancelled) return;
      const migrated = loaded.map(migrateAnnotation);
      const recalculated = recalculateAllDurations(migrated, videoDuration);
      setAnnotations(recalculated);
    });
    return () => { cancelled = true; };
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
      let createdAnnotation: Annotation | null = null;
      setAnnotations((prev) => {
        // Determine sort_order for the new cue (place last in its tie group)
        const tieCount = prev.filter((a) => a.timestamp === timestamp).length;
        const newAnnotation: Annotation = {
          id: crypto.randomUUID(),
          timestamp,
          cue,
          timeInTitle: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: 'provisional' as CueStatus,
          flagged: false,
          flagNote: '',
          sort_order: tieCount,
          version: 1,
          deleted: false,
        };
        createdAnnotation = newAnnotation;
        let withNew = sortAnnotations([...prev, newAnnotation]);
        // Bidirectional link sync on create — use UUID-based linkCueId
        if (cue.linkCueId) {
          withNew = withNew.map((a) =>
            a.id === cue.linkCueId
              ? { ...a, cue: { ...a.cue, linkCueId: newAnnotation.id, linkCueNumber: cue.cueNumber }, updatedAt: new Date().toISOString() }
              : a,
          );
        }
        const updated = recalculateAllDurations(withNew, videoDuration);
        debouncedSave(updated);
        return updated;
      });
      return createdAnnotation!;
    },
    [debouncedSave, videoDuration],
  );

  const updateAnnotation = useCallback(
    (id: string, cue: CueFields, newTimestamp?: number) => {
      setAnnotations((prev) => {
        let modified = prev
          .map((a) =>
            a.id === id
              ? {
                  ...a,
                  cue,
                  timestamp: typeof newTimestamp === 'number' ? newTimestamp : a.timestamp,
                  updatedAt: new Date().toISOString(),
                }
              : a,
          );

        const updatedCue = modified.find((a) => a.id === id);

        // ── Bidirectional Link sync (UUID-based) ──
        if (updatedCue) {
          const oldCue = prev.find((a) => a.id === id);
          const oldLinkId = oldCue?.cue.linkCueId ?? '';
          const newLinkId = updatedCue.cue.linkCueId ?? '';
          const cueNum = updatedCue.cue.cueNumber;

          // If the old link changed or was removed, clear the old partner's link
          if (oldLinkId && oldLinkId !== newLinkId) {
            modified = modified.map((a) =>
              a.id === oldLinkId
                ? { ...a, cue: { ...a.cue, linkCueId: '', linkCueNumber: '' }, updatedAt: new Date().toISOString() }
                : a,
            );
          }

          // If there's a new link, set the partner's linkCueId/linkCueNumber to this cue
          if (newLinkId) {
            modified = modified.map((a) =>
              a.id === newLinkId
                ? { ...a, cue: { ...a.cue, linkCueId: id, linkCueNumber: cueNum }, updatedAt: new Date().toISOString() }
                : a,
            );
          }

          // If cueNumber was renamed, update the partner's display linkCueNumber too
          if (oldCue && oldCue.cue.cueNumber !== cueNum && newLinkId) {
            // Already handled above — the partner's linkCueNumber is set to the new cueNum
          }
        }

        const sorted = sortAnnotations(modified);
        const updated = recalculateAllDurations(sorted, videoDuration);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave, videoDuration],
  );

  const deleteAnnotation = useCallback(
    (id: string) => {
      setAnnotations((prev) => {
        const toDelete = prev.find((a) => a.id === id);
        let remaining = prev.filter((a) => a.id !== id);


        // Clear bidirectional link partner if any (UUID-based)
        if (toDelete?.cue.linkCueId) {
          remaining = remaining.map((a) =>
            a.id === toDelete.cue.linkCueId
              ? { ...a, cue: { ...a.cue, linkCueId: '', linkCueNumber: '' }, updatedAt: new Date().toISOString() }
              : a,
          );
        }
        const updated = recalculateAllDurations(remaining, videoDuration);
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave, videoDuration],
  );

  const replaceAll = useCallback(
    (newAnnotations: Annotation[]) => {
      const migrated = newAnnotations.map(migrateAnnotation);
      const sorted = sortAnnotations(migrated);
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
        const newOnes = incoming.filter((a) => !existingTimestamps.has(a.timestamp.toFixed(3))).map(migrateAnnotation);
        const merged = sortAnnotations([...prev, ...newOnes]);
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

  /**
   * Compute the set of annotation IDs that are "skipped" due to linked cue ranges.
   * When two cues of the same type are linked (A.linkCueId === B.id),
   * all cues of that same type whose timestamps fall strictly between A and B are skipped.
   */
  const skippedIds = useMemo(() => {
    const ids = new Set<string>();
    // Build a map of id→annotation for quick lookup
    const byId = new Map<string, Annotation>();
    for (const a of annotations) {
      byId.set(a.id, a);
    }

    // For each annotation with a link, find the linked pair and mark everything between as skipped
    const processed = new Set<string>();
    for (const a of annotations) {
      if (!a.cue.linkCueId) continue;
      const pairKey = [a.id, a.cue.linkCueId].sort().join('::');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      // Find the partner by UUID
      const partner = byId.get(a.cue.linkCueId);
      if (!partner) continue;

      const lo = Math.min(a.timestamp, partner.timestamp);
      const hi = Math.max(a.timestamp, partner.timestamp);

      // Mark all cues of same type strictly between lo and hi as skipped
      for (const c of annotations) {
        if (c.id === a.id || c.id === partner.id) continue;
        if (c.cue.type !== a.cue.type) continue;
        if (c.timestamp > lo && c.timestamp < hi) {
          ids.add(c.id);
        }
      }
    }
    return ids;
  }, [annotations]);

  // ── F2.13 — Set cue status ──
  const setAnnotationStatus = useCallback(
    (id: string, status: CueStatus) => {
      setAnnotations((prev) => {
        const updated = prev.map((a) =>
          a.id === id ? { ...a, status, updatedAt: new Date().toISOString() } : a,
        );
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave],
  );

  // ── F2.14 — Toggle flag / set flag note ──
  const setAnnotationFlag = useCallback(
    (id: string, flagged: boolean, flagNote?: string) => {
      setAnnotations((prev) => {
        const updated = prev.map((a) =>
          a.id === id
            ? { ...a, flagged, flagNote: flagNote ?? (flagged ? a.flagNote : ''), updatedAt: new Date().toISOString() }
            : a,
        );
        debouncedSave(updated);
        return updated;
      });
    },
    [debouncedSave],
  );

  // ── F2.7 — Duplicate cue ──
  const duplicateAnnotation = useCallback(
    (id: string): Annotation | null => {
      let duplicated: Annotation | null = null;
      setAnnotations((prev) => {
        const source = prev.find((a) => a.id === id);
        if (!source) return prev;
        // Determine sort_order: place after source in tie group
        const tieGroup = prev.filter((a) => a.timestamp === source.timestamp);
        const maxOrder = Math.max(...tieGroup.map((a) => a.sort_order), 0);
        duplicated = {
          ...source,
          id: crypto.randomUUID(),
          cue: { ...source.cue, cueNumber: source.cue.cueNumber ? `${source.cue.cueNumber} (copy)` : '' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sort_order: maxOrder + 1,
          flagged: false,
          flagNote: '',
        };
        const updated = recalculateAllDurations(sortAnnotations([...prev, duplicated]), videoDuration);
        debouncedSave(updated);
        return updated;
      });
      return duplicated;
    },
    [debouncedSave, videoDuration],
  );

  // ── F2.7 — Reorder within tie group ──
  const reorderInTieGroup = useCallback(
    (cueIds: string[]) => {
      setAnnotations((prev) => {
        const updated = prev.map((a) => {
          const idx = cueIds.indexOf(a.id);
          if (idx !== -1) {
            return { ...a, sort_order: idx, updatedAt: new Date().toISOString() };
          }
          return a;
        });
        const sorted = sortAnnotations(updated);
        debouncedSave(sorted);
        return sorted;
      });
    },
    [debouncedSave],
  );

  return {
    annotations,
    activeId,
    skippedIds,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    replaceAll,
    mergeAnnotations,
    updateActiveAnnotation,
    renameCueType,
    setAnnotationStatus,
    setAnnotationFlag,
    duplicateAnnotation,
    reorderInTieGroup,
  };
}
