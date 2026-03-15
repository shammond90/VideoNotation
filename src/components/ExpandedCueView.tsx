import type { Annotation, CueFields, ColumnConfig } from '../types';
import { CUE_FIELD_LABELS } from '../types';
import { formatTime } from '../utils/formatTime';

interface ExpandedCueViewProps {
  annotation: Annotation;
  columns: ColumnConfig[];
  onEdit: () => void;
}

/** Fields already shown in the standard row — skip in expanded detail */
const STANDARD_ROW_FIELDS = new Set(['type', 'cueNumber', 'timestamp']);

/** Fields that should not be repeated in expanded view */
const SKIP_FIELDS = new Set([
  ...STANDARD_ROW_FIELDS,
  'standbyTime', 'warningTime', // Timers, not display fields
  'linkCueId', // Internal UUID reference
]);

export function ExpandedCueView({ annotation, columns, onEdit }: ExpandedCueViewProps) {
  const cue = annotation.cue;

  // Gather visible fields with values, in column order, excluding standard row fields
  // Also show status/flag info
  const fields: { label: string; value: string; isNotes?: boolean }[] = [];

  // Status (shown first if not provisional)
  if (annotation.status && annotation.status !== 'provisional') {
    fields.push({
      label: 'Status',
      value: annotation.status === 'confirmed' ? 'Confirmed' : annotation.status === 'tbc' ? 'TBC' : 'Cut',
    });
  }

  // Flag note
  if (annotation.flagged && annotation.flagNote) {
    fields.push({ label: 'Flag Note', value: annotation.flagNote });
  }

  // Time in title
  if (annotation.timeInTitle != null) {
    fields.push({ label: 'Time in Title', value: formatTime(annotation.timeInTitle) });
  }

  // Cue fields from column config order
  const orderedKeys = columns
    .filter((c) => c.visible && !SKIP_FIELDS.has(c.key))
    .map((c) => c.key);

  // Notes field should always be last
  let notesValue = '';

  for (const key of orderedKeys) {
    if (key === 'timestamp' || key === 'timeInTitle') continue; // Virtual columns handled above
    const val = (cue as any)[key];
    if (!val) continue;

    if (key === 'cueingNotes' || key === 'cueSheetNotes') {
      notesValue = val;
      continue;
    }

    fields.push({
      label: CUE_FIELD_LABELS[key as keyof CueFields] || key,
      value: val,
    });
  }

  // Add any non-visible-column cue fields that have values (catch-all)
  const allCueKeys = Object.keys(cue) as (keyof CueFields)[];
  for (const key of allCueKeys) {
    if (SKIP_FIELDS.has(key)) continue;
    if (orderedKeys.includes(key)) continue;
    const val = cue[key];
    if (!val) continue;
    if (key === 'cueingNotes' || key === 'cueSheetNotes') {
      if (!notesValue) notesValue = val;
      continue;
    }
    fields.push({
      label: CUE_FIELD_LABELS[key] || key,
      value: val,
    });
  }

  // Notes always last
  if (notesValue) {
    fields.push({ label: 'Notes', value: notesValue, isNotes: true });
  }

  if (fields.length === 0 && !notesValue) {
    fields.push({ label: '', value: 'No additional fields' });
  }

  return (
    <div
      className="overflow-hidden transition-all duration-150 ease-out"
      style={{ borderTop: '1px solid var(--border)' }}
    >
      {/* Field list */}
      <div className="px-3 py-2 space-y-1.5">
        {fields.map((field, i) => (
          <div key={i} className="flex gap-3" style={{ alignItems: 'flex-start' }}>
            {field.label && (
              <span
                className="shrink-0 uppercase font-mono"
                style={{
                  fontSize: 9,
                  letterSpacing: '0.09em',
                  color: 'var(--text-dim)',
                  width: 110,
                  paddingTop: 2,
                }}
              >
                {field.label}
              </span>
            )}
            <span
              className="flex-1 min-w-0"
              style={{
                fontSize: 12,
                color: 'var(--text-mid)',
                whiteSpace: field.isNotes ? 'pre-wrap' : 'normal',
                wordBreak: 'break-word',
              }}
            >
              {field.value}
            </span>
          </div>
        ))}
      </div>

      {/* Edit button */}
      <div className="px-3 pb-2 pt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="text-xs font-medium px-3 py-1.5 rounded transition-colors"
          style={{
            color: 'var(--text-mid)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-panel)'; e.currentTarget.style.color = 'var(--text-mid)'; }}
        >
          Edit cue
        </button>
      </div>
    </div>
  );
}
