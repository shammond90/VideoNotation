import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { Annotation, CueFields } from '../types';
import { LOOP_CUE_TYPE } from '../types';
import { formatTime } from '../utils/formatTime';
import { loadAnnotations, saveAnnotations } from '../utils/storage';
import { recalculateAllDurations } from '../utils/duration';

/**
 * Propagate timestamp changes to autofollow children.
 * When a parent cue's timestamp or follow time changes,
 * all cues whose followCueNumber matches the parent's cueNumber
 * get their timestamps recalculated: parentTimestamp + parseFloat(parentFollow).
 * This propagates recursively (depth-first) in case of chained autofollows.
 */
function propagateAutofollow(annotations: Annotation[], parent: Annotation): Annotation[] {
  const parentCueNum = parent.cue.cueNumber;
  if (!parentCueNum) return annotations;

  const parentFollow = parseFloat(parent.cue.follow) || 0;
  const childTimestamp = parent.timestamp + parentFollow;

  let result = annotations;
  for (let i = 0; i < result.length; i++) {
    const a = result[i];
    if (a.cue.autofollow === 'true' && a.cue.followCueNumber === parentCueNum) {
      if (a.timestamp !== childTimestamp) {
        const updated = { ...a, timestamp: childTimestamp, updatedAt: new Date().toISOString() };
        result = [...result.slice(0, i), updated, ...result.slice(i + 1)];
        // Recursively propagate to any children of this child
        result = propagateAutofollow(result, updated);
      }
    }
  }
  return result;
}

export function useAnnotations(fileName: string, fileSize: number, videoDuration: number) {
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Determine storage key: use no-video key if fileName is empty
  const effectiveFileName = fileName || 'no-video';
  const effectiveFileSize = fileName ? fileSize : 0;

  // Load annotations when file changes
  useEffect(() => {
    let cancelled = false;
    loadAnnotations(effectiveFileName, effectiveFileSize).then((loaded) => {
      if (cancelled) return;
      const recalculated = recalculateAllDurations(loaded, videoDuration);
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
      const newAnnotation: Annotation = {
        id: crypto.randomUUID(),
        timestamp,
        cue,
        timeInTitle: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setAnnotations((prev) => {
        let withNew = [...prev, newAnnotation].sort((a, b) => a.timestamp - b.timestamp);
        // Bidirectional link sync on create
        if (cue.linkCueNumber && cue.cueNumber) {
          withNew = withNew.map((a) =>
            a.cue.type === cue.type && a.cue.cueNumber === cue.linkCueNumber
              ? { ...a, cue: { ...a.cue, linkCueNumber: cue.cueNumber }, updatedAt: new Date().toISOString() }
              : a,
          );
        }
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

        // ── Back-propagate follow time to parent when autofollow cue timestamp changes ──
        if (
          updatedCue &&
          updatedCue.cue.autofollow === 'true' &&
          updatedCue.cue.followCueNumber &&
          typeof newTimestamp === 'number'
        ) {
          const parentIdx = modified.findIndex(
            (a) => a.cue.cueNumber === updatedCue.cue.followCueNumber,
          );
          if (parentIdx !== -1) {
            const parent = modified[parentIdx];
            const newFollow = (newTimestamp - parent.timestamp).toFixed(2).replace(/\.?0+$/, '');
            modified = [
              ...modified.slice(0, parentIdx),
              {
                ...parent,
                cue: { ...parent.cue, follow: newFollow },
                updatedAt: new Date().toISOString(),
              },
              ...modified.slice(parentIdx + 1),
            ];
          }
        }

        // ── Autofollow propagation ──
        // After updating, cascade timestamp changes to any cues that follow the updated cue
        if (updatedCue) {
          modified = propagateAutofollow(modified, updatedCue);
        }

        // ── Bidirectional Link Cue# sync ──
        if (updatedCue) {
          const oldCue = prev.find((a) => a.id === id);
          const oldLink = oldCue?.cue.linkCueNumber ?? '';
          const newLink = updatedCue.cue.linkCueNumber ?? '';
          const cueType = updatedCue.cue.type;
          const cueNum = updatedCue.cue.cueNumber;

          // If the old link changed or was removed, clear the old partner's link
          if (oldLink && oldLink !== newLink) {
            modified = modified.map((a) =>
              a.cue.type === cueType && a.cue.cueNumber === oldLink && a.cue.linkCueNumber === cueNum
                ? { ...a, cue: { ...a.cue, linkCueNumber: '' }, updatedAt: new Date().toISOString() }
                : a,
            );
          }

          // If there's a new link, set the partner's linkCueNumber to this cue's number
          if (newLink && cueNum) {
            modified = modified.map((a) =>
              a.cue.type === cueType && a.cue.cueNumber === newLink
                ? { ...a, cue: { ...a.cue, linkCueNumber: cueNum }, updatedAt: new Date().toISOString() }
                : a,
            );
          }
        }

        // ── Loop sync: bidirectional LOOP FROM ↔ LOOP TO ──
        if (updatedCue?.cue.type === LOOP_CUE_TYPE) {
          if (updatedCue.cue.cueNumber === 'LOOP TO' && typeof newTimestamp === 'number') {
            // LOOP TO timestamp changed → update LOOP FROM's loopTargetTimestamp and what
            const loopFromIdx = modified.findIndex(
              (a) => a.cue.type === LOOP_CUE_TYPE && a.cue.cueNumber === 'LOOP FROM',
            );
            if (loopFromIdx !== -1) {
              const loopFrom = modified[loopFromIdx];
              const targetCueNum = loopFrom.cue.loopTargetCueNumber;
              modified = [
                ...modified.slice(0, loopFromIdx),
                {
                  ...loopFrom,
                  cue: {
                    ...loopFrom.cue,
                    loopTargetTimestamp: String(newTimestamp),
                    what: `→ ${formatTime(newTimestamp)}${targetCueNum ? ' (Cue#' + targetCueNum + ')' : ''}`,
                  },
                  updatedAt: new Date().toISOString(),
                },
                ...modified.slice(loopFromIdx + 1),
              ];
            }
          } else if (updatedCue.cue.cueNumber === 'LOOP FROM') {
            // LOOP FROM updated → sync LOOP TO's timestamp and what
            const targetTs = parseFloat(updatedCue.cue.loopTargetTimestamp);
            const loopToIdx = modified.findIndex(
              (a) => a.cue.type === LOOP_CUE_TYPE && a.cue.cueNumber === 'LOOP TO',
            );
            if (loopToIdx !== -1) {
              const loopTo = modified[loopToIdx];
              const updates: Partial<typeof loopTo> = { updatedAt: new Date().toISOString() };
              const cueUpdates: Partial<typeof loopTo.cue> = {
                what: `← ${formatTime(updatedCue.timestamp)}`,
              };
              if (!isNaN(targetTs)) {
                updates.timestamp = targetTs;
              }
              modified = [
                ...modified.slice(0, loopToIdx),
                {
                  ...loopTo,
                  ...updates,
                  cue: { ...loopTo.cue, ...cueUpdates },
                },
                ...modified.slice(loopToIdx + 1),
              ];
            }
          }
        }

        const sorted = modified.sort((a, b) => a.timestamp - b.timestamp);
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

        // When deleting a LOOP cue, also remove its partner (LOOP FROM ↔ LOOP TO)
        if (toDelete?.cue.type === LOOP_CUE_TYPE) {
          remaining = remaining.filter((a) => a.cue.type !== LOOP_CUE_TYPE);
        }

        // Clear bidirectional link partner if any
        if (toDelete?.cue.linkCueNumber && toDelete.cue.cueNumber) {
          remaining = remaining.map((a) =>
            a.cue.type === toDelete.cue.type &&
            a.cue.cueNumber === toDelete.cue.linkCueNumber &&
            a.cue.linkCueNumber === toDelete.cue.cueNumber
              ? { ...a, cue: { ...a.cue, linkCueNumber: '' }, updatedAt: new Date().toISOString() }
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

  /**
   * Compute the set of annotation IDs that are "skipped" due to linked cue ranges.
   * When two cues of the same type are linked (A.linkCueNumber === B.cueNumber),
   * all cues of that same type whose timestamps fall strictly between A and B are skipped.
   */
  const skippedIds = useMemo(() => {
    const ids = new Set<string>();
    // Build a map of cueNumber→annotation for quick lookup
    const byCueNum = new Map<string, Annotation[]>();
    for (const a of annotations) {
      if (!a.cue.cueNumber) continue;
      const key = `${a.cue.type}::${a.cue.cueNumber}`;
      const arr = byCueNum.get(key);
      if (arr) arr.push(a);
      else byCueNum.set(key, [a]);
    }

    // For each annotation with a link, find the linked pair and mark everything between as skipped
    const processed = new Set<string>();
    for (const a of annotations) {
      if (!a.cue.linkCueNumber || !a.cue.cueNumber) continue;
      const pairKey = [a.cue.type, a.cue.cueNumber, a.cue.linkCueNumber].sort().join('::');
      if (processed.has(pairKey)) continue;
      processed.add(pairKey);

      // Find the partner
      const partnerArr = byCueNum.get(`${a.cue.type}::${a.cue.linkCueNumber}`);
      if (!partnerArr || partnerArr.length === 0) continue;
      const partner = partnerArr[0];

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

  /** The single active LOOP FROM annotation, if any. */
  const loopAnnotation = useMemo(() => {
    return annotations.find((a) => a.cue.type === LOOP_CUE_TYPE && a.cue.cueNumber === 'LOOP FROM') ?? null;
  }, [annotations]);

  return {
    annotations,
    activeId,
    skippedIds,
    loopAnnotation,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    replaceAll,
    mergeAnnotations,
    updateActiveAnnotation,
    renameCueType,
  };
}
