// ── NTSC 29.97 Drop-Frame Timecode ──
// Drop-frame skips frame numbers 0 and 1 at the start of every minute,
// except minutes 0, 10, 20, 30, 40, 50. This keeps timecode display
// synchronised with wall-clock time at 29.97 fps.

/** Exact NTSC frame rate (30000/1001) */
export const NTSC_FPS = 30000 / 1001; // ≈ 29.97002997

/** Nominal frames per second (display frame count 0–29) */
export const FPS = 30;

/** Duration of one frame in seconds (for frame stepping) */
export const FRAME_DURATION = 1 / NTSC_FPS;

const DROP = 2;                  // frames dropped per non-tenth minute
const FRAMES_PER_10MIN = 17982;  // 10*60*30 - 9*2
const FRAMES_PER_MIN   = 1798;   // 60*30 - 2

/**
 * Convert seconds to NTSC 29.97 drop-frame timecode: HH:MM:SS;FF
 * The semicolon before frames is the industry indicator for drop-frame.
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00;00';

  let fn = Math.round(seconds * NTSC_FPS);          // total frame count

  const d = Math.floor(fn / FRAMES_PER_10MIN);
  const m = fn % FRAMES_PER_10MIN;

  const adj = m < DROP
    ? fn + DROP * d
    : fn + DROP * d + DROP * Math.floor((m - DROP) / FRAMES_PER_MIN);

  const ff = adj % FPS;
  const ss = Math.floor(adj / FPS) % 60;
  const mm = Math.floor(adj / (FPS * 60)) % 60;
  const hh = Math.floor(adj / (FPS * 3600));

  return (
    String(hh).padStart(2, '0') + ':' +
    String(mm).padStart(2, '0') + ':' +
    String(ss).padStart(2, '0') + ';' +
    String(ff).padStart(2, '0')
  );
}

/**
 * Short form: MM:SS;FF (no hours when zero), HH:MM:SS;FF otherwise.
 */
export function formatTimeShort(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00;00';

  let fn = Math.round(seconds * NTSC_FPS);
  const d = Math.floor(fn / FRAMES_PER_10MIN);
  const m = fn % FRAMES_PER_10MIN;

  const adj = m < DROP
    ? fn + DROP * d
    : fn + DROP * d + DROP * Math.floor((m - DROP) / FRAMES_PER_MIN);

  const ff = adj % FPS;
  const ss = Math.floor(adj / FPS) % 60;
  const mm = Math.floor(adj / (FPS * 60)) % 60;
  const hh = Math.floor(adj / (FPS * 3600));

  if (hh > 0) {
    return (
      String(hh).padStart(2, '0') + ':' +
      String(mm).padStart(2, '0') + ':' +
      String(ss).padStart(2, '0') + ';' +
      String(ff).padStart(2, '0')
    );
  }
  return (
    String(mm).padStart(2, '0') + ':' +
    String(ss).padStart(2, '0') + ';' +
    String(ff).padStart(2, '0')
  );
}

/**
 * Parse a drop-frame timecode string back to seconds.
 * Accepts HH:MM:SS;FF or HH:MM:SS:FF (colon or semicolon before frames),
 * as well as HH:MM:SS and MM:SS.
 */
export function parseTime(timeStr: string): number | null {
  // Normalise semicolons to colons for splitting
  const parts = timeStr.replace(/;/g, ':').split(':').map(Number);
  if (parts.some(isNaN)) return null;

  if (parts.length === 4) {
    const [hh, mm, ss, ff] = parts;
    // Reverse drop-frame: display timecode → actual frame count
    let total = hh * FPS * 3600 + mm * FPS * 60 + ss * FPS + ff;
    const totalMinutes = hh * 60 + mm;
    total -= DROP * (totalMinutes - Math.floor(totalMinutes / 10));
    return total / NTSC_FPS;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}
