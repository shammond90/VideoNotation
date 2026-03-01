export const FPS = 25; // Standard PAL / theatrical frame rate

/**
 * Convert seconds to HH:MM:SS:FF format (frame-accurate)
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * FPS);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

/**
 * Convert seconds to short MM:SS:FF format (no hours if zero)
 */
export function formatTimeShort(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00';

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * FPS);

  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

/**
 * Parse a time string (HH:MM:SS:FF, HH:MM:SS, or MM:SS) to seconds
 */
export function parseTime(timeStr: string): number | null {
  const parts = timeStr.split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 4) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2] + parts[3] / FPS;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}
