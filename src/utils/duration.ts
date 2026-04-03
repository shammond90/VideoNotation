import type { Annotation } from '../types';

/**
 * Floor a timestamp to whole seconds (frames round down to 0).
 */
export function floorTimestamp(seconds: number): number {
  return Math.floor(seconds);
}

/**
 * Calculate the duration of a cue in seconds.
 *
 * Duration = (next cue of same type's (Timestamp + CueTime)) − current cue's Timestamp.
 * Timestamps have frames floored to 0.
 * If there is no next cue of the same type, duration = videoDuration − floorTimestamp(currentCue.timestamp).
 */
export function calculateDuration(
  currentCue: Annotation,
  allAnnotations: Annotation[],
  videoDuration: number,
): number {
  const cueType = currentCue.cue.type;
  if (!cueType) return 0;

  // Find all cues of the same type, sorted by timestamp
  const sameType = allAnnotations
    .filter((a) => a.cue.type === cueType && a.id !== currentCue.id)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Find the next cue of the same type (timestamp > current)
  const nextCue = sameType.find((a) => a.timestamp > currentCue.timestamp);

  if (nextCue) {
    const nextCueTime = parseFloat(nextCue.cue.cueTime) || 0;
    return (floorTimestamp(nextCue.timestamp) + nextCueTime) - floorTimestamp(currentCue.timestamp);
  }

  // No next cue of same type — duration runs to end of video
  return videoDuration - floorTimestamp(currentCue.timestamp);
}

/**
 * Calculate "Time in Title" — difference between current cue's timestamp
 * and the most recent cue with type "Title" that comes before it.
 */
export function calculateTimeInTitle(
  currentCue: Annotation,
  allAnnotations: Annotation[],
): number | null {
  // Find the most recent "Title" cue before this one
  const titleCues = allAnnotations
    .filter((a) => a.cue.type === 'TITLE' && a.timestamp <= currentCue.timestamp && a.id !== currentCue.id)
    .sort((a, b) => b.timestamp - a.timestamp); // most recent first

  if (titleCues.length === 0) {
    // If the current cue IS a Title, there's no previous Title
    return null;
  }

  return currentCue.timestamp - titleCues[0].timestamp;
}

/**
 * Recalculate duration and timeInTitle for ALL annotations.
 * Returns a new array with updated values.
 *
 * Pre-groups annotations by cue type and pre-sorts TITLE cues
 * to avoid O(n²) filtering on every annotation.
 */
export function recalculateAllDurations(
  annotations: Annotation[],
  videoDuration: number,
): Annotation[] {
  // Pre-group sorted annotations by type for O(1) lookup of next-cue
  const byType = new Map<string, Annotation[]>();
  for (const a of annotations) {
    const t = a.cue.type;
    if (!t) continue;
    let list = byType.get(t);
    if (!list) { list = []; byType.set(t, list); }
    list.push(a);
  }
  // Ensure each group is sorted by timestamp
  for (const list of byType.values()) {
    list.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Pre-sort title cues descending for efficient "most recent before" lookup
  const titleCuesSorted = (byType.get('TITLE') ?? []).slice().sort(
    (a, b) => a.timestamp - b.timestamp,
  );

  // Build index map: annotationId → position in its type group (for next-cue lookup)
  const posInGroup = new Map<string, { list: Annotation[]; idx: number }>();
  for (const [, list] of byType) {
    for (let i = 0; i < list.length; i++) {
      posInGroup.set(list[i].id, { list, idx: i });
    }
  }

  return annotations.map((a) => {
    // --- Duration ---
    let duration = 0;
    const pos = posInGroup.get(a.id);
    if (pos) {
      const { list, idx } = pos;
      if (idx < list.length - 1) {
        const nextCue = list[idx + 1];
        const nextCueTime = parseFloat(nextCue.cue.cueTime) || 0;
        duration = (floorTimestamp(nextCue.timestamp) + nextCueTime) - floorTimestamp(a.timestamp);
      } else {
        duration = videoDuration - floorTimestamp(a.timestamp);
      }
    }

    // --- Time in Title ---
    let timeInTitle: number | null = null;
    if (titleCuesSorted.length > 0) {
      // Binary search for the last title cue with timestamp <= a.timestamp
      let lo = 0, hi = titleCuesSorted.length - 1, best = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        if (titleCuesSorted[mid].timestamp <= a.timestamp && titleCuesSorted[mid].id !== a.id) {
          best = mid;
          lo = mid + 1;
        } else if (titleCuesSorted[mid].timestamp > a.timestamp) {
          hi = mid - 1;
        } else {
          // Same id — skip and search left
          hi = mid - 1;
        }
      }
      if (best >= 0) {
        timeInTitle = a.timestamp - titleCuesSorted[best].timestamp;
      }
    }

    return {
      ...a,
      cue: {
        ...a.cue,
        duration: String(Math.round(duration)),
      },
      timeInTitle,
    };
  });
}
