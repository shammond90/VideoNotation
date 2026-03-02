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
 */
export function recalculateAllDurations(
  annotations: Annotation[],
  videoDuration: number,
): Annotation[] {
  return annotations.map((a) => ({
    ...a,
    cue: {
      ...a.cue,
      duration: String(Math.round(calculateDuration(a, annotations, videoDuration))),
    },
    timeInTitle: calculateTimeInTitle(a, annotations),
  }));
}
