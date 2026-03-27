import { useState, useRef, useEffect, useMemo, useCallback, type MutableRefObject } from 'react';
import type { CueFields, Annotation, FieldDefinition } from '../types';
import { EMPTY_CUE_FIELDS, getDefaultFieldsForType, getFieldLabel, getFieldDef } from '../types';
import { formatTime, parseTime } from '../utils/formatTime';
import { SearchableDropdown } from './SearchableDropdown';

export type CueFormMode = 'create' | 'edit';

interface CueFormProps {
  mode: CueFormMode;
  timestamp: number;
  initialValues?: CueFields;
  timeInTitle?: number | null;
  allAnnotations?: Annotation[]; // needed for Time in Title calc in edit mode
  cueTypes: string[];           // from config
  cueTypeFields?: Record<string, string[]>; // per-type visible field overrides
  fieldDefinitions?: FieldDefinition[];
  mandatoryFields?: Record<string, string[]>; // per-type mandatory field keys
  onSave: (cue: CueFields, newTimestamp?: number) => void;
  onCancel: () => void;
  /** Optional ref that will be populated with a function to trigger save from outside */
  saveRef?: MutableRefObject<(() => void) | null>;
  /** When true, form fills its parent height (no max-height cap). Used in overlay panels. */
  fillHeight?: boolean;
}

const inputClass =
  'w-full bg-[var(--bg-input)] text-[var(--text)] rounded px-2 py-1.5 text-xs border border-[var(--border)] focus:border-[var(--amber)] focus:ring-1 focus:ring-[var(--border-focus)] outline-none placeholder-[var(--text-dim)]';

const inputErrorClass =
  'w-full bg-[var(--bg-input)] text-[var(--text)] rounded px-2 py-1.5 text-xs border border-[var(--danger)] focus:border-[var(--danger)] focus:ring-1 focus:ring-[var(--danger)] outline-none placeholder-[var(--text-dim)]';

const readOnlyClass =
  'w-full bg-[var(--bg-card)] text-[var(--text-mid)] rounded px-2 py-1.5 text-xs border border-[var(--border)] outline-none cursor-not-allowed';

const labelClass = 'text-[10px] uppercase tracking-wider text-[var(--text-mid)] mb-0.5 block font-mono';

/** Map column count to literal Tailwind grid-cols class (needed for JIT scanning) */
const gridColsClass = (n: number) =>
  ({ 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' }[n] ?? 'grid-cols-1');

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  className,
  readOnly,
  inputMode,
  mandatory,
  hasError,
  autoFocus,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  inputMode?: 'text' | 'numeric' | 'decimal';
  mandatory?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);
  return (
    <div className={className}>
      <label className={labelClass}>
        {label}
        {mandatory && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className={readOnly ? readOnlyClass : hasError ? inputErrorClass : inputClass}
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
  mandatory,
  hasError,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  mandatory?: boolean;
  hasError?: boolean;
}) {
  return (
    <div className={className}>
      <label className={labelClass}>
        {label}
        {mandatory && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        rows={rows ?? 2}
        className={`${hasError ? inputErrorClass : inputClass} resize-none`}
      />
    </div>
  );
}

function CheckboxField({
  label,
  name,
  value,
  onChange,
  className,
  mandatory,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, value: string) => void;
  className?: string;
  mandatory?: boolean;
}) {
  const checked = value === 'true';
  return (
    <div className={className}>
      <label className={`flex items-center gap-2 cursor-pointer select-none py-1.5`}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(name, e.target.checked ? 'true' : 'false')}
          className="w-3.5 h-3.5 rounded border-[var(--border)] bg-[var(--bg-input)] text-[var(--amber)] focus:ring-[var(--border-focus)] focus:ring-offset-0 cursor-pointer"
        />
        <span className={labelClass} style={{ marginBottom: 0, display: 'inline' }}>
          {label}
          {mandatory && <span className="text-red-400 ml-0.5">*</span>}
        </span>
      </label>
    </div>
  );
}

// ── Timestamp overwrite-mode input ──

/** Convert seconds to drop-frame timecode for the editable input */
function secondsToTimecodeStr(seconds: number): string {
  return formatTime(seconds);
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
  value: string; // "HH:MM:SS;FF" (drop-frame)
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
        // Skip colon and semicolon positions
        while (pos < value.length && (value[pos] === ':' || value[pos] === ';')) pos++;
        if (pos >= value.length) return;

        const chars = value.split('');
        chars[pos] = e.key;
        const newValue = chars.join('');
        onChange(newValue);

        // Advance cursor past the typed digit (and any following colon/semicolon)
        let nextPos = pos + 1;
        while (nextPos < newValue.length && (newValue[nextPos] === ':' || newValue[nextPos] === ';')) nextPos++;

        requestAnimationFrame(() => {
          input.setSelectionRange(nextPos, nextPos);
        });
      }

      if (e.key === 'Backspace') {
        let pos = (input.selectionStart ?? 1) - 1;
        while (pos >= 0 && (value[pos] === ':' || value[pos] === ';')) pos--;
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
        while (pos < value.length && (value[pos] === ':' || value[pos] === ';')) pos++;
        if (pos < value.length) {
          const chars = value.split('');
          chars[pos] = '0';
          onChange(chars.join(''));
          let nextPos = pos + 1;
          while (nextPos < value.length && (value[nextPos] === ':' || value[nextPos] === ';')) nextPos++;
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
  cueTypeFields,
  fieldDefinitions: fieldDefs,
  mandatoryFields,
  onSave,
  onCancel,
  saveRef,
  fillHeight = false,
}: CueFormProps) {
  const [fields, setFields] = useState<CueFields>(initialValues ?? { ...EMPTY_CUE_FIELDS });
  const [timestampStr, setTimestampStr] = useState(() => secondsToTimecodeStr(timestamp));
  const [editedTimestamp, setEditedTimestamp] = useState(timestamp);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const firstInputRef = useRef<HTMLDivElement>(null);
  const isCreate = mode === 'create';

  // Determine which fields are visible for the current cue type
  const visibleFields = useMemo(() => {
    const typeFields = cueTypeFields?.[fields.type];
    if (typeFields) return new Set(typeFields);
    return new Set(getDefaultFieldsForType(fields.type));
  }, [cueTypeFields, fields.type]);

  // Helper: is a given field visible?
  const showField = (key: string) => visibleFields.has(key);

  // Ordered list of "body" fields — excludes fields handled by dedicated UI sections
  const orderedBodyFields = useMemo(() => {
    // Fields rendered separately: type (always shown), cueNumber, oldCueNumber (in type row),
    // timestamp / timeInTitle (top row), linkCueNumber (special section)
    const excludedFromBody = new Set([
      'type', 'cueNumber', 'oldCueNumber', 'timestamp', 'timeInTitle',
      'linkCueNumber',
    ]);
    const typeFields = cueTypeFields?.[fields.type];
    if (typeFields) {
      // Use the explicit order, filtered to only body fields
      return typeFields.filter((k) => !excludedFromBody.has(k));
    }
    // Fall back to default order from EDITABLE_FIELD_KEYS
    return getDefaultFieldsForType(fields.type).filter((k) => !excludedFromBody.has(k));
  }, [cueTypeFields, fields.type]);

  // Mandatory field keys for the current type
  const mandatoryKeys = useMemo(() => {
    return new Set(mandatoryFields?.[fields.type] ?? []);
  }, [mandatoryFields, fields.type]);

  // ── Duplicate Cue# warning ──
  const duplicateCueWarning = useMemo(() => {
    const num = fields.cueNumber.trim();
    if (!num || !allAnnotations) return null;
    const editId = initialValues ? allAnnotations.find((a) => a.cue === initialValues)?.id : undefined;
    const dupe = allAnnotations.find((a) => a.cue.cueNumber === num && a.id !== editId);
    return dupe ? `Cue# "${num}" is already used by another cue` : null;
  }, [fields.cueNumber, allAnnotations, initialValues]);

  // ── Link Cue# state ──
  const linkEnabled = showField('linkCueNumber');
  const [linkCueNum, setLinkCueNum] = useState(fields.linkCueNumber);
  const [linkCueId, setLinkCueId] = useState(fields.linkCueId);

  // Available cue numbers for Link Cue# dropdown — same type only, sorted, prefix-filtered by SearchableDropdown
  const linkCueOptions = useMemo(() => {
    if (!linkEnabled || !allAnnotations || !fields.type) return [];
    const editId = initialValues ? allAnnotations.find((a) => a.cue === initialValues)?.id : undefined;
    const seen = new Set<string>();
    return allAnnotations
      .filter((a) =>
        a.cue.type === fields.type &&
        a.cue.cueNumber &&
        a.id !== editId &&
        !seen.has(a.cue.cueNumber) &&
        (seen.add(a.cue.cueNumber), true),
      )
      .sort((a, b) => {
        const na = parseFloat(a.cue.cueNumber);
        const nb = parseFloat(b.cue.cueNumber);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.cue.cueNumber.localeCompare(b.cue.cueNumber);
      })
      .map((a) => a.cue.cueNumber);
  }, [linkEnabled, allAnnotations, fields.type, initialValues]);

  // Handle link cue selection — resolve cue number to UUID
  const handleLinkCueChange = useCallback((cueNum: string) => {
    setLinkCueNum(cueNum);
    if (cueNum && allAnnotations) {
      const match = allAnnotations.find((a) => a.cue.type === fields.type && a.cue.cueNumber === cueNum);
      setLinkCueId(match?.id ?? '');
    } else {
      setLinkCueId('');
    }
  }, [allAnnotations, fields.type]);

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

  // Auto-focus type dropdown (only in create mode)
  useEffect(() => {
    if (!isCreate) return;
    const timer = setTimeout(() => {
      const input = firstInputRef.current?.querySelector('input');
      input?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isCreate]);

  const handleChange = (name: string, value: string) => {
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
    // ── Mandatory field validation ──
    if (mandatoryKeys.size > 0) {
      const fieldsRecord = fields as unknown as Record<string, string>;
      const emptyMandatory = [...mandatoryKeys].filter((k) => {
        const val = fieldsRecord[k] ?? '';
        return !val.trim();
      });
      if (emptyMandatory.length > 0) {
        setValidationErrors(new Set(emptyMandatory));
        const labels = emptyMandatory.map((k) => getFieldLabel(k, fieldDefs));
        setValidationMessage(`Required: ${labels.join(', ')}`);
        return;
      }
    }
    setValidationErrors(new Set());
    setValidationMessage(null);

    // Build final cue fields
    const finalFields = { ...fields };

    // Merge Link Cue#
    if (linkEnabled) {
      finalFields.linkCueNumber = linkCueNum;
      finalFields.linkCueId = linkCueId;
    }

    const hasContent = Object.values(finalFields).some((v) => v.trim() !== '');
    if (hasContent) {
      if (isCreate) {
        onSave(finalFields);
      } else {
        onSave(finalFields, editedTimestamp);
      }
    }
  };

  // Expose save function to parent via ref
  useEffect(() => {
    if (saveRef) {
      saveRef.current = handleSubmitDirect;
      return () => { saveRef.current = null; };
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmitDirect();
  };

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      className={`rounded-lg p-4 mt-3 ${fillHeight ? 'flex flex-col flex-1 min-h-0 overflow-y-auto annotation-scroll' : 'max-h-[60vh] overflow-y-auto annotation-scroll'}`}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--amber-glow)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: 'var(--amber-dim)', color: 'var(--amber)' }}>
          {formatTime(isCreate ? timestamp : editedTimestamp)}
        </span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-mid)' }}>
          {isCreate ? 'New Cue' : 'Edit Cue'}
        </span>
        <span className="ml-auto text-[10px]" style={{ color: 'var(--text-dim)' }}>Ctrl+Enter to save</span>
      </div>

      {/* Timestamp + Time in Title (only if selected for this type) */}
      {(showField('timestamp') || showField('timeInTitle')) && (
        <div className={`grid ${gridColsClass(+showField('timestamp') + +showField('timeInTitle'))} gap-2 mb-2`}>
          {showField('timestamp') && (
            <div>
              <label className={labelClass}>Timestamp (HH:MM:SS:FF)</label>
              <TimecodeInput
                value={timestampStr}
                onChange={handleTimestampChange}
                readOnly={isCreate}
                className={`${isCreate ? readOnlyClass : inputClass} font-mono text-center`}
              />
            </div>
          )}
          {showField('timeInTitle') && (
            <div>
              <label className={labelClass}>Time in Title (HH:MM:SS:FF)</label>
              <TimecodeInput
                value={computedTimeInTitle !== null ? timeInTitleStr : '00:00:00:00'}
                onChange={handleTimeInTitleChange}
                readOnly={isCreate}
                className={`${isCreate ? readOnlyClass : inputClass} font-mono text-center`}
              />
            </div>
          )}
        </div>
      )}

      {/* Type (always shown) + Cue # + Old Cue # */}
      {(() => {
        const showCueNumHere = showField('cueNumber');
        const showOldCueNum = showField('oldCueNumber');
        const typeRow = [
          true, // type is always shown
          showCueNumHere,
          showOldCueNum,
        ];
        const cols = typeRow.filter(Boolean).length;
        return (
          <div className={`grid ${gridColsClass(cols)} gap-2 mb-2`}>
            <div ref={firstInputRef}>
              <label className={labelClass}>{getFieldLabel('type', fieldDefs)}</label>
              <SearchableDropdown
                options={cueTypes}
                value={fields.type}
                onChange={(val) => handleChange('type', val)}
                placeholder="Cue Type"
                autoFocus={isCreate}
              />
            </div>
            {showCueNumHere && (
              <Field label={getFieldLabel('cueNumber', fieldDefs)} name="cueNumber" value={fields.cueNumber} onChange={handleChange} placeholder="e.g. 101" autoFocus={!isCreate} />
            )}
            {showOldCueNum && (
              <Field label={getFieldLabel('oldCueNumber', fieldDefs)} name="oldCueNumber" value={fields.oldCueNumber} onChange={handleChange} />
            )}
          </div>
        );
      })()}

      {/* Duplicate Cue# soft warning */}
      {duplicateCueWarning && (
        <div className="mb-2 px-2 py-1.5 bg-yellow-900/40 border border-yellow-500/50 rounded text-yellow-300 text-xs">
          {duplicateCueWarning}
        </div>
      )}

      {/* ── Link Cue# ── */}
      {linkEnabled && (
        <div className="mb-2">
          <label className={labelClass}>Link Cue#</label>
          <SearchableDropdown
            options={linkCueOptions}
            value={linkCueNum}
            onChange={handleLinkCueChange}
            placeholder="— Select Cue# to link —"
            filterMode="prefix"
          />
        </div>
      )}

      {/* ── Ordered body fields ── */}
      {(() => {
        // Labels with suffixes for certain fields
        const labelSuffixes: Record<string, string> = {
          cueTime: ' (seconds)',
          duration: ' (auto, seconds)',
          standbyTime: ' (secs)',
          warningTime: ' (secs)',
        };
        const readOnlyFields = new Set(['duration']);
        const placeholders: Record<string, string> = {
          cueTime: 'Time in seconds',
          standbyTime: 'e.g. 30',
          warningTime: 'e.g. 10',
          when: 'Trigger description',
          what: 'Action description',
        };

        // Determine field size from fieldDefinitions sizeHint, falling back to hardcoded
        const getSize = (key: string): 'small' | 'medium' | 'large' => {
          const def = getFieldDef(key, fieldDefs);
          if (def) return def.sizeHint;
          // Legacy fallback
          if (key === 'cueSheetNotes' || key === 'cueingNotes') return 'large';
          if (key === 'when' || key === 'what') return 'medium';
          return 'small';
        };

        const getInputMode = (key: string): 'text' | 'numeric' | 'decimal' | undefined => {
          const def = getFieldDef(key, fieldDefs);
          if (!def || def.inputType !== 'number') return undefined;
          return def.numberPrecision === 'decimal' ? 'decimal' : 'numeric';
        };

        const isCheckbox = (key: string): boolean => {
          const def = getFieldDef(key, fieldDefs);
          return def?.inputType === 'checkbox';
        };

        const getLabel = (key: string): string => {
          const base = getFieldLabel(key, fieldDefs);
          return base + (labelSuffixes[key] || '');
        };

        // Access field value safely (supports custom field keys not in CueFields interface)
        const getVal = (key: string): string => (fields as unknown as Record<string, string>)[key] ?? '';

        // Render fields in order, grouping consecutive small fields into rows of 2
        const elements: React.ReactNode[] = [];
        let i = 0;
        while (i < orderedBodyFields.length) {
          const key = orderedBodyFields[i];
          const isMand = mandatoryKeys.has(key);
          const hasErr = validationErrors.has(key);

          // Checkbox fields always render as a small toggle
          if (isCheckbox(key)) {
            // Try to pair with next checkbox or small field
            const rowKeys: string[] = [key];
            if (
              i + 1 < orderedBodyFields.length &&
              (isCheckbox(orderedBodyFields[i + 1]) || getSize(orderedBodyFields[i + 1]) === 'small')
            ) {
              rowKeys.push(orderedBodyFields[i + 1]);
            }
            elements.push(
              <div key={rowKeys.join('-')} className={`grid ${gridColsClass(rowKeys.length)} gap-2 mb-2`}>
                {rowKeys.map((rk) =>
                  isCheckbox(rk) ? (
                    <CheckboxField
                      key={rk}
                      label={getLabel(rk)}
                      name={rk}
                      value={getVal(rk)}
                      onChange={handleChange}
                      mandatory={mandatoryKeys.has(rk)}
                    />
                  ) : (
                    <Field
                      key={rk}
                      label={getLabel(rk)}
                      name={rk}
                      value={getVal(rk)}
                      onChange={handleChange}
                      readOnly={readOnlyFields.has(rk)}
                      placeholder={placeholders[rk]}
                      inputMode={getInputMode(rk)}
                      mandatory={mandatoryKeys.has(rk)}
                      hasError={validationErrors.has(rk)}
                    />
                  )
                )}
              </div>,
            );
            i += rowKeys.length;
            continue;
          }

          const size = getSize(key);

          if (size === 'large') {
            // Textarea fields get their own full-width row
            elements.push(
              <div key={key} className="mb-2">
                <TextAreaField
                  label={getLabel(key)}
                  name={key}
                  value={getVal(key)}
                  onChange={handleChange}
                  rows={2}
                  mandatory={isMand}
                  hasError={hasErr}
                />
              </div>,
            );
            i++;
          } else if (size === 'medium') {
            // Medium fields get their own full-width row (single-line input)
            elements.push(
              <div key={key} className="mb-2">
                <Field
                  label={getLabel(key)}
                  name={key}
                  value={getVal(key)}
                  onChange={handleChange}
                  readOnly={readOnlyFields.has(key)}
                  placeholder={placeholders[key]}
                  inputMode={getInputMode(key)}
                  mandatory={isMand}
                  hasError={hasErr}
                />
              </div>,
            );
            i++;
          } else {
            // Collect up to 2 consecutive small fields for a grid row
            const rowKeys: string[] = [key];
            if (
              i + 1 < orderedBodyFields.length &&
              getSize(orderedBodyFields[i + 1]) === 'small' &&
              !isCheckbox(orderedBodyFields[i + 1])
            ) {
              rowKeys.push(orderedBodyFields[i + 1]);
            }
            elements.push(
              <div key={rowKeys.join('-')} className={`grid ${gridColsClass(rowKeys.length)} gap-2 mb-2`}>
                {rowKeys.map((rk) => (
                  <Field
                    key={rk}
                    label={getLabel(rk)}
                    name={rk}
                    value={getVal(rk)}
                    onChange={handleChange}
                    readOnly={readOnlyFields.has(rk)}
                    placeholder={placeholders[rk]}
                    inputMode={getInputMode(rk)}
                    mandatory={mandatoryKeys.has(rk)}
                    hasError={validationErrors.has(rk)}
                  />
                ))}
              </div>,
            );
            i += rowKeys.length;
          }
        }
        return elements;
      })()}

      {/* Mandatory field validation error */}
      {validationMessage && (
        <div className="mb-2 px-2 py-1.5 bg-red-900/40 border border-red-500/50 rounded text-red-300 text-xs">
          {validationMessage}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs rounded-md transition-colors"
          style={{ color: 'var(--text-mid)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
        >
          Cancel (Esc)
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 text-xs text-white rounded-md transition-colors"
          style={{ background: 'var(--amber)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--amber-hi)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--amber)')}
        >
          Save Cue (Ctrl+Enter)
        </button>
      </div>
    </form>
  );
}
