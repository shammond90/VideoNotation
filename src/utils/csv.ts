import Papa from 'papaparse';
import { formatTime } from './formatTime';
import type { Annotation, CueFields, EMPTY_CUE_FIELDS } from '../types';
import { EMPTY_CUE_FIELDS as defaultCue } from '../types';

export function exportAnnotationsToCSV(annotations: Annotation[], videoName: string): void {
  const sorted = [...annotations].sort((a, b) => a.timestamp - b.timestamp);

  const data = sorted.map((a) => ({
    timestamp_seconds: a.timestamp.toFixed(3),
    timestamp_formatted: formatTime(a.timestamp),
    type: a.cue.type,
    cue_number: a.cue.cueNumber,
    old_cue_number: a.cue.oldCueNumber,
    cue_time: a.cue.cueTime,
    duration: a.cue.duration,
    fade_down: a.cue.fadeDown,
    h: a.cue.h,
    b: a.cue.b,
    a: a.cue.a,
    when: a.cue.when,
    what: a.cue.what,
    presets: a.cue.presets,
    color_palette: a.cue.colorPalette,
    spot_frame: a.cue.spotFrame,
    spot_intensity: a.cue.spotIntensity,
    spot_time: a.cue.spotTime,
    cue_sheet_notes: a.cue.cueSheetNotes,
    final: a.cue.final,
    dress: a.cue.dress,
    tech: a.cue.tech,
    cueing_notes: a.cue.cueingNotes,
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
              fadeDown: row.fade_down || '',
              h: row.h || '',
              b: row.b || '',
              a: row.a || '',
              when: row.when || '',
              what: row.what || '',
              presets: row.presets || '',
              colorPalette: row.color_palette || '',
              spotFrame: row.spot_frame || '',
              spotIntensity: row.spot_intensity || '',
              spotTime: row.spot_time || '',
              cueSheetNotes: row.cue_sheet_notes || '',
              final: row.final || '',
              dress: row.dress || '',
              tech: row.tech || '',
              cueingNotes: row.cueing_notes || '',
            };
            return {
              id: crypto.randomUUID(),
              timestamp,
              cue,
              createdAt: row.created_at || new Date().toISOString(),
              updatedAt: row.updated_at || new Date().toISOString(),
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
