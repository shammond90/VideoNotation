import ExcelJS from 'exceljs';
import { formatTime } from './formatTime';
import type { Annotation, ExportTemplateColumn, ExportColorOverrides } from '../types';

/** Options for the XLSX export. */
export interface XlsxExportOptions {
  annotations: Annotation[];
  columns: ExportTemplateColumn[];
  colorOverrides: ExportColorOverrides;
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  skippedIds: Set<string>;
  includeSkipped: boolean;
  videoName: string;
  hiddenCueTypes?: string[];
}

/** Resolve the value for a given field key on an annotation row. */
function resolveFieldValue(key: string, annotation: Annotation): string {
  if (key === 'timestamp') return formatTime(annotation.timestamp);
  if (key === 'timeInTitle') return annotation.timeInTitle !== null ? formatTime(annotation.timeInTitle) : '';
  const val = (annotation.cue as unknown as Record<string, string>)[key];
  return val ?? '';
}

/** Build cell value for a column that may hold multiple fields. */
function buildCellValue(column: ExportTemplateColumn, annotation: Annotation): string {
  const values: string[] = [];
  for (const key of column.fieldKeys) {
    const v = resolveFieldValue(key, annotation);
    if (v) values.push(v);
  }
  return values.join('\n');
}

/**
 * Lighten a hex colour towards white by the given factor (0 = no change, 1 = white).
 */
function lightenHex(hex: string, factor: number): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return [lr, lg, lb].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/**
 * Determine whether black or white text has better contrast on the given bg colour.
 */
function contrastTextColor(hex: string): string {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? '000000' : 'FFFFFF';
}

/** Thin border style reused for every cell. */
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
};

/** Generate and download an XLSX file. */
export async function exportAnnotationsToXlsx(options: XlsxExportOptions): Promise<void> {
  const {
    annotations,
    columns,
    colorOverrides,
    cueTypeColors,
    cueTypeShortCodes,
    skippedIds,
    includeSkipped,
    videoName,
    hiddenCueTypes,
  } = options;

  const hiddenSet = new Set(hiddenCueTypes ?? []);

  // Sort chronologically
  let sorted = [...annotations]
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!includeSkipped) {
    sorted = sorted.filter((a) => !skippedIds.has(a.id));
  }
  // Filter out hidden cue types
  if (hiddenSet.size > 0) {
    sorted = sorted.filter((a) => !hiddenSet.has(a.cue.type));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Master Cue List', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
  });

  // ── Header row ──
  const headerRow = ws.addRow(columns.map((col) => col.name));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF333333' },
    };
    cell.border = THIN_BORDER;
  });

  // ── Data rows ──
  for (let ri = 0; ri < sorted.length; ri++) {
    const annotation = sorted[ri];
    const cueType = annotation.cue.type;
    const isSkipped = skippedIds.has(annotation.id);
    const baseColor = colorOverrides[cueType] || cueTypeColors[cueType];

    const rowValues = columns.map((col) => {
      if (col.fieldKeys.length === 1 && col.fieldKeys[0] === 'type') {
        const t = annotation.cue.type;
        return cueTypeShortCodes[t] || t;
      }
      return buildCellValue(col, annotation);
    });

    const row = ws.addRow(rowValues);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const ci = colNumber - 1; // 0-based
      const col = columns[ci];

      // Force timecode fields to text so Excel doesn't parse them as dates/numbers
      if (col && (col.fieldKeys.includes('timestamp') || col.fieldKeys.includes('timeInTitle'))) {
        cell.numFmt = '@';
      }

      // Font
      const font: Partial<ExcelJS.Font> = { size: 10 };
      if (isSkipped) font.italic = true;

      // Row colour
      if (baseColor) {
        const isTypeCol = col && col.fieldKeys.length === 1 && col.fieldKeys[0] === 'type';
        if (isTypeCol) {
          const argb = 'FF' + baseColor.replace('#', '').toUpperCase();
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb },
          };
          font.color = { argb: 'FF' + contrastTextColor(baseColor) };
          font.bold = true;
        } else {
          const lightened = lightenHex(baseColor, 0.82);
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF' + lightened },
          };
          font.color = { argb: 'FF222222' };
        }
      }

      cell.font = font;
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = THIN_BORDER;
    });
  }

  // ── Auto-fit column widths ──
  ws.columns.forEach((wsCol, ci) => {
    const col = columns[ci];
    if (!col) return;
    let maxLen = col.name.length;
    for (const annotation of sorted) {
      let val: string;
      if (col.fieldKeys.length === 1 && col.fieldKeys[0] === 'type') {
        val = cueTypeShortCodes[annotation.cue.type] || annotation.cue.type;
      } else {
        val = buildCellValue(col, annotation);
      }
      const lines = val.split('\n');
      for (const line of lines) {
        if (line.length > maxLen) maxLen = line.length;
      }
    }
    wsCol.width = Math.min(maxLen + 4, 60);
  });

  // ── Generate filename and download ──
  const baseName = videoName.replace(/\.[^/.]+$/, '');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `${baseName}_CueList_${dateStr}.xlsx`;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
