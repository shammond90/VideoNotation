import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import type { CueFields, Annotation } from '../types';
import { EMPTY_CUE_FIELDS, CUE_FIELD_LABELS } from '../types';
import { formatTime, parseTime, FPS } from '../utils/formatTime';
import { SearchableDropdown } from './SearchableDropdown';

export type CueFormMode = 'create' | 'edit';

interface CueFormProps {
  mode: CueFormMode;
  timestamp: number;
  initialValues?: CueFields;
  timeInTitle?: number | null;
  allAnnotations?: Annotation[]; // needed for Time in Title calc in edit mode
  cueTypes: string[];           // from config
  onSave: (cue: CueFields, newTimestamp?: number) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full bg-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-500';

const readOnlyClass =
  'w-full bg-slate-800 text-slate-400 rounded px-2 py-1.5 text-xs border border-slate-700 outline-none cursor-not-allowed';

const labelClass = 'text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 block';

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  className,
  readOnly,
}: {
  label: string;
  name: keyof CueFields;
  value: string;
  onChange: (name: keyof CueFields, value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
}) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className={readOnly ? readOnlyClass : inputClass}
        readOnly={readOnly}
        tabIndex={readOnly ? -1 : undefined}
      />
    </div>
  );
}

function TextAreaField({
  label,
  name,
  value,
  onChange,
  placeholder,
  rows,
  className,
}: {
  label: string;
  name: keyof CueFields;
  value: string;
  onChange: (name: keyof CueFields, value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        rows={rows ?? 2}
        className={`${inputClass} resize-none`}
      />
    </div>
  );
}

// ── Timestamp overwrite-mode input ──

function secondsToTimecodeStr(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00:00:00';
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  const f = String(Math.floor((seconds % 1) * FPS)).padStart(2, '0');
  return `${h}:${m}:${s}:${f}`;
}

/**
 * Fixed-format timecode input that works in overwrite mode.
 * Typing a digit replaces the character at cursor position;
 * cursor advances to the next digit slot (skipping colons).
 */
function TimecodeInput({
  value,
  onChange,
  readOnly,
  className,
}: {
  value: string; // "HH:MM:SS:FF"
  onChange: (newValue: string) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const input = inputRef.current;
      if (!input || readOnly) return;

      // Allow navigation, tab, ctrl combos
      if (['Tab', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (e.ctrlKey || e.metaKey) return;

      e.preventDefault();

      if (/^\d$/.test(e.key)) {
        let pos = input.selectionStart ?? 0;
        // Skip colon positions
        while (pos < value.length && value[pos] === ':') pos++;
        if (pos >= value.length) return;

        const chars = value.split('');
        chars[pos] = e.key;
        const newValue = chars.join('');
        onChange(newValue);

        // Advance cursor past the typed digit (and any following colon)
        let nextPos = pos + 1;
        while (nextPos < newValue.length && newValue[nextPos] === ':') nextPos++;

        requestAnimationFrame(() => {
          input.setSelectionRange(nextPos, nextPos);
        });
      }

      if (e.key === 'Backspace') {
        let pos = (input.selectionStart ?? 1) - 1;
        while (pos >= 0 && value[pos] === ':') pos--;
        if (pos >= 0) {
          const chars = value.split('');
          chars[pos] = '0';
          onChange(chars.join(''));
          requestAnimationFrame(() => {
            input.setSelectionRange(pos, pos);
          });
        }
      }

      if (e.key === 'Delete') {
        let pos = input.selectionStart ?? 0;
        while (pos < value.length && value[pos] === ':') pos++;
        if (pos < value.length) {
          const chars = value.split('');
          chars[pos] = '0';
          onChange(chars.join(''));
          let nextPos = pos + 1;
          while (nextPos < value.length && value[nextPos] === ':') nextPos++;
          requestAnimationFrame(() => {
            input.setSelectionRange(nextPos, nextPos);
          });
        }
      }
    },
    [value, onChange, readOnly],
  );

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onKeyDown={handleKeyDown}
      onChange={() => {}} // all changes via onKeyDown
      readOnly={readOnly}
      className={className}
      tabIndex={readOnly ? -1 : undefined}
    />
  );
}

// ── Main CueForm ──

export function CueForm({
  mode,
  timestamp,
  initialValues,
  timeInTitle: initialTimeInTitle,
  allAnnotations,
  cueTypes,
  onSave,
  onCancel,
}: CueFormProps) {
  const [fields, setFields] = useState<CueFields>(initialValues ?? { ...EMPTY_CUE_FIELDS });
  const [timestampStr, setTimestampStr] = useState(() => secondsToTimecodeStr(timestamp));
  const [editedTimestamp, setEditedTimestamp] = useState(timestamp);

  const firstInputRef = useRef<HTMLDivElement>(null);
  const isCreate = mode === 'create';

  // Types that only get What + Cueing Notes
  const isSimplifiedType = /^(title|scene)$/i.test(fields.type);

  // Compute time in title
  const computedTimeInTitle = useMemo(() => {
    if (typeof initialTimeInTitle === 'number' && isCreate) return initialTimeInTitle;
    if (!allAnnotations) return null;
    const titleCues = allAnnotations
      .filter((a) => a.cue.type === 'TITLE' && a.timestamp <= editedTimestamp && a.id !== undefined)
      .sort((a, b) => b.timestamp - a.timestamp);
    // If the current cue IS a Title cue, find the previous Title
    if (titleCues.length === 0) return null;
    // If the first title cue has the same timestamp as us, it's probably us (in edit mode)
    // so look further
    const prevTitle = titleCues.find((a) => a.timestamp < editedTimestamp) ?? titleCues[0];
    if (!prevTitle) return null;
    return editedTimestamp - prevTitle.timestamp;
  }, [allAnnotations, editedTimestamp, initialTimeInTitle, isCreate]);

  const [timeInTitleStr, setTimeInTitleStr] = useState(() =>
    computedTimeInTitle !== null ? secondsToTimecodeStr(computedTimeInTitle) : '00:00:00:00',
  );

  // Update time in title display when computed value changes
  useEffect(() => {
    if (computedTimeInTitle !== null) {
      setTimeInTitleStr(secondsToTimecodeStr(computedTimeInTitle));
    }
  }, [computedTimeInTitle]);

  // Sync timestamp when prop changes (create mode)
  useEffect(() => {
    if (isCreate) {
      setTimestampStr(secondsToTimecodeStr(timestamp));
      setEditedTimestamp(timestamp);
    }
  }, [timestamp, isCreate]);

  // Auto-focus type dropdown
  useEffect(() => {
    const timer = setTimeout(() => {
      const input = firstInputRef.current?.querySelector('input');
      input?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (name: keyof CueFields, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  // Timestamp overwrite handler
  const handleTimestampChange = useCallback(
    (newStr: string) => {
      setTimestampStr(newStr);
      const parsed = parseTime(newStr);
      if (typeof parsed === 'number') {
        setEditedTimestamp(parsed);
      }
    },
    [],
  );

  // Time in Title overwrite handler (bidirectional with timestamp in edit mode)
  const handleTimeInTitleChange = useCallback(
    (newStr: string) => {
      setTimeInTitleStr(newStr);
      if (!isCreate && allAnnotations) {
        const titVal = parseTime(newStr);
        if (typeof titVal === 'number') {
          const titleCues = allAnnotations
            .filter((a) => a.cue.type === 'TITLE' && a.timestamp < editedTimestamp)
            .sort((a, b) => b.timestamp - a.timestamp);
          if (titleCues.length > 0) {
            const newTs = titleCues[0].timestamp + titVal;
            setEditedTimestamp(newTs);
            setTimestampStr(secondsToTimecodeStr(newTs));
          }
        }
      }
    },
    [isCreate, allAnnotations, editedTimestamp],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    // Ctrl+Enter to save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmitDirect();
    }
  };

  const handleSubmitDirect = () => {
    const hasContent = Object.values(fields).some((v) => v.trim() !== '');
    if (hasContent) {
      if (isCreate) {
        onSave(fields);
      } else {
        onSave(fields, editedTimestamp);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmitDirect();
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className="bg-slate-800 border border-indigo-500/50 rounded-lg p-4 mt-3 max-h-[60vh] overflow-y-auto annotation-scroll"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-700">
        <span className="bg-indigo-500/20 text-indigo-300 text-xs font-mono px-2 py-0.5 rounded">
          {formatTime(isCreate ? timestamp : editedTimestamp)}
        </span>
        <span className="text-slate-400 text-sm font-medium">
          {isCreate ? 'New Cue' : 'Edit Cue'}
        </span>
        <span className="ml-auto text-[10px] text-slate-600">Ctrl+Enter to save</span>
      </div>

      {/* Timestamp + Time in Title */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <label className={labelClass}>Timestamp (HH:MM:SS:FF)</label>
          <TimecodeInput
            value={timestampStr}
            onChange={handleTimestampChange}
            readOnly={isCreate}
            className={`${isCreate ? readOnlyClass : inputClass} font-mono text-center`}
          />
        </div>
        <div>
          <label className={labelClass}>Time in Title (HH:MM:SS:FF)</label>
          <TimecodeInput
            value={computedTimeInTitle !== null ? timeInTitleStr : '00:00:00:00'}
            onChange={handleTimeInTitleChange}
            readOnly={isCreate}
            className={`${isCreate ? readOnlyClass : inputClass} font-mono text-center`}
          />
        </div>
      </div>

      {/* Row 1: Type + Cue # + Old Cue # */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div ref={firstInputRef}>
          <label className={labelClass}>{CUE_FIELD_LABELS.type}</label>
          <SearchableDropdown
            options={cueTypes}
            value={fields.type}
            onChange={(val) => handleChange('type', val)}
            placeholder="— Select Type —"
            autoFocus={true}
          />
        </div>
        <Field label={CUE_FIELD_LABELS.cueNumber} name="cueNumber" value={fields.cueNumber} onChange={handleChange} placeholder="e.g. 101" />
        <Field label={CUE_FIELD_LABELS.oldCueNumber} name="oldCueNumber" value={fields.oldCueNumber} onChange={handleChange} />
      </div>

      {isSimplifiedType ? (
        /* Simplified fields for Title / Scene: What + Cueing Notes only */
        <>
          <div className="mb-2">
            <Field label={CUE_FIELD_LABELS.what} name="what" value={fields.what} onChange={handleChange} placeholder="Action description" />
          </div>
          <div className="mb-3">
            <TextAreaField
              label={CUE_FIELD_LABELS.cueingNotes}
              name="cueingNotes"
              value={fields.cueingNotes}
              onChange={handleChange}
              rows={2}
            />
          </div>
        </>
      ) : (
        /* Full field set for all other types */
        <>
          {/* Row 2: Cue Time + Duration (read-only) */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.cueTime + ' (seconds)'} name="cueTime" value={fields.cueTime} onChange={handleChange} placeholder="Time in seconds" />
            <Field label={CUE_FIELD_LABELS.duration + ' (auto, seconds)'} name="duration" value={fields.duration} onChange={handleChange} readOnly />
          </div>

          {/* Row 3: Delay + Follow */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.delay} name="delay" value={fields.delay} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.follow} name="follow" value={fields.follow} onChange={handleChange} />
          </div>

          {/* Row 4: Hang + Block + Assert */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.hang} name="hang" value={fields.hang} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.block} name="block" value={fields.block} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.assert} name="assert" value={fields.assert} onChange={handleChange} />
          </div>

          {/* Row 5: When + What */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.when} name="when" value={fields.when} onChange={handleChange} placeholder="Trigger description" />
            <Field label={CUE_FIELD_LABELS.what} name="what" value={fields.what} onChange={handleChange} placeholder="Action description" />
          </div>

          {/* Row 6: Presets + Colour Palette */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.presets} name="presets" value={fields.presets} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.colourPalette} name="colourPalette" value={fields.colourPalette} onChange={handleChange} />
          </div>

          {/* Row 7: Spot Frame + Spot Intensity + Spot Time */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.spotFrame} name="spotFrame" value={fields.spotFrame} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.spotIntensity} name="spotIntensity" value={fields.spotIntensity} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.spotTime} name="spotTime" value={fields.spotTime} onChange={handleChange} />
          </div>

          {/* Row 8: Notes from Previous Cue Sheet */}
          <div className="mb-2">
            <TextAreaField
              label={CUE_FIELD_LABELS.cueSheetNotes}
              name="cueSheetNotes"
              value={fields.cueSheetNotes}
              onChange={handleChange}
              rows={2}
            />
          </div>

          {/* Row 9: Final, Dress, Tech */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <Field label={CUE_FIELD_LABELS.final} name="final" value={fields.final} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.dress} name="dress" value={fields.dress} onChange={handleChange} />
            <Field label={CUE_FIELD_LABELS.tech} name="tech" value={fields.tech} onChange={handleChange} />
          </div>

          {/* Row 10: Cueing Notes */}
          <div className="mb-3">
            <TextAreaField
              label={CUE_FIELD_LABELS.cueingNotes}
              name="cueingNotes"
              value={fields.cueingNotes}
              onChange={handleChange}
              rows={2}
            />
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-700 transition-colors"
        >
          Cancel (Esc)
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors"
        >
          Save Cue (Ctrl+Enter)
        </button>
      </div>
    </form>
  );
}
