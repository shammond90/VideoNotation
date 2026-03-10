import Papa from 'papaparse';
import { formatTime } from './formatTime';
import type { Annotation, CueFields } from '../types';
import { LOOP_CUE_TYPE } from '../types';

export function exportAnnotationsToCSV(annotations: Annotation[], videoName: string): void {
  const sorted = [...annotations]
    .filter((a) => a.cue.type !== LOOP_CUE_TYPE)
    .sort((a, b) => a.timestamp - b.timestamp);

  const data = sorted.map((a) => ({
    timestamp_seconds: a.timestamp.toFixed(3),
    timestamp_formatted: formatTime(a.timestamp),
    time_in_title: a.timeInTitle !== null ? formatTime(a.timeInTitle) : '',
    type: a.cue.type,
    cue_number: a.cue.cueNumber,
    old_cue_number: a.cue.oldCueNumber,
    cue_time: a.cue.cueTime,
    duration: a.cue.duration,
    delay: a.cue.delay,
    follow: a.cue.follow,
    hang: a.cue.hang,
    block: a.cue.block,
    assert: a.cue.assert,
    when: a.cue.when,
    what: a.cue.what,
    presets: a.cue.presets,
    colour_palette: a.cue.colourPalette,
    spot_frame: a.cue.spotFrame,
    spot_intensity: a.cue.spotIntensity,
    spot_time: a.cue.spotTime,
    cue_sheet_notes: a.cue.cueSheetNotes,
    final: a.cue.final,
    dress: a.cue.dress,
    tech: a.cue.tech,
    cueing_notes: a.cue.cueingNotes,
    standby_time: a.cue.standbyTime,
    warning_time: a.cue.warningTime,
    autofollow: a.cue.autofollow,
    follow_cue_number: a.cue.followCueNumber,
    link_cue_number: a.cue.linkCueNumber,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  }));

  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const baseName = videoName.replace(/\.[^/.]+$/, '');
  link.href = url;
  link.download = `${baseName}-cue-sheet.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

export function importAnnotationsFromCSV(file: File): Promise<Annotation[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        try {
          const annotations: Annotation[] = results.data.map((row: any) => {
            const timestamp = parseFloat(row.timestamp_seconds);
            if (isNaN(timestamp)) {
              throw new Error(`Invalid timestamp: ${row.timestamp_seconds}`);
            }
            const cue: CueFields = {
              type: row.type || '',
              cueNumber: row.cue_number || '',
              oldCueNumber: row.old_cue_number || '',
              cueTime: row.cue_time || '',
              duration: row.duration || '',
              delay: row.delay || '',
              follow: row.follow || '',
              // Support old column names (h/b/a, fade_down, color_palette) for backward compat
              hang: row.hang || row.h || '',
              block: row.block || row.b || '',
              assert: row.assert || row.a || '',
              when: row.when || '',
              what: row.what || '',
              presets: row.presets || '',
              colourPalette: row.colour_palette || row.color_palette || '',
              spotFrame: row.spot_frame || '',
              spotIntensity: row.spot_intensity || '',
              spotTime: row.spot_time || '',
              cueSheetNotes: row.cue_sheet_notes || '',
              final: row.final || '',
              dress: row.dress || '',
              tech: row.tech || '',
              cueingNotes: row.cueing_notes || '',
              standbyTime: row.standby_time || '',
              warningTime: row.warning_time || '',
              autofollow: row.autofollow || '',
              followCueNumber: row.follow_cue_number || '',
              linkCueNumber: row.link_cue_number || '',
              loopTargetTimestamp: row.loop_target_timestamp || '',
              loopTargetCueNumber: row.loop_target_cue_number || '',
            };
            const timeInTitle = row.time_in_title ? parseFloat(row.time_in_title) : null;
            return {
              id: crypto.randomUUID(),
              timestamp,
              cue,
              timeInTitle: isNaN(timeInTitle as number) ? null : timeInTitle,
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.updated_at || new Date().toISOString(),
              status: (row.status as any) || 'provisional',
              flagged: row.flagged === 'true' || row.flagged === '1',
              flagNote: row.flag_note || '',
              sort_order: row.sort_order != null ? parseInt(row.sort_order, 10) || 0 : 0,
            };
          });
          resolve(annotations);
        } catch (err) {
          reject(err);
        }
      },
      error(err) {
        reject(err);
      },
    });
  });
}
