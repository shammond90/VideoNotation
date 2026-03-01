import { useState, useRef, useEffect } from 'react';
import type { CueFields } from '../types';
import { CUE_TYPES, EMPTY_CUE_FIELDS } from '../types';
import { formatTime } from '../utils/formatTime';

interface CueFormProps {
  timestamp: number;
  initialValues?: CueFields;
  onSave: (cue: CueFields) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full bg-slate-700 text-slate-200 rounded px-2 py-1.5 text-xs border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-500';

const labelClass = 'text-[10px] uppercase tracking-wider text-slate-500 mb-0.5 block';

function Field({
  label,
  name,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  name: keyof CueFields;
  value: string;
  onChange: (name: keyof CueFields, value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelClass}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        placeholder={placeholder}
        className={inputClass}
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

export function CueForm({ timestamp, initialValues, onSave, onCancel }: CueFormProps) {
  const [fields, setFields] = useState<CueFields>(initialValues ?? { ...EMPTY_CUE_FIELDS });
  const firstInputRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      firstInputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (name: keyof CueFields, value: string) => {
    setFields((prev) => ({ ...prev, [name]: value }));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Require at least one field to be filled
    const hasContent = Object.values(fields).some((v) => v.trim() !== '');
    if (hasContent) {
      onSave(fields);
    }
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
          {formatTime(timestamp)}
        </span>
        <span className="text-slate-400 text-sm font-medium">New Cue</span>
      </div>

      {/* Row 1: Type + Cue# + Old Cue# */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <div>
          <label className={labelClass}>Type</label>
          <select
            ref={firstInputRef}
            value={fields.type}
            onChange={(e) => handleChange('type', e.target.value)}
            className={inputClass}
          >
            <option value="">— Select —</option>
            {CUE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <Field label="Cue #" name="cueNumber" value={fields.cueNumber} onChange={handleChange} placeholder="e.g. 101" />
        <Field label="Old Cue #" name="oldCueNumber" value={fields.oldCueNumber} onChange={handleChange} />
      </div>

      {/* Row 2: Cue Time + Duration + Fade Down */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Field label="Cue Time" name="cueTime" value={fields.cueTime} onChange={handleChange} placeholder="Fade up" />
        <Field label="D (Duration)" name="duration" value={fields.duration} onChange={handleChange} />
        <Field label="F (Fade Down)" name="fadeDown" value={fields.fadeDown} onChange={handleChange} />
      </div>

      {/* Row 3: H, B, A */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Field label="H" name="h" value={fields.h} onChange={handleChange} />
        <Field label="B" name="b" value={fields.b} onChange={handleChange} />
        <Field label="A" name="a" value={fields.a} onChange={handleChange} />
      </div>

      {/* Row 4: When + What */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="When" name="when" value={fields.when} onChange={handleChange} placeholder="Trigger description" />
        <Field label="What" name="what" value={fields.what} onChange={handleChange} placeholder="Action description" />
      </div>

      {/* Row 5: Presets + Color Palette */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Field label="Presets" name="presets" value={fields.presets} onChange={handleChange} />
        <Field label="Color Palette" name="colorPalette" value={fields.colorPalette} onChange={handleChange} />
      </div>

      {/* Row 6: Spot Frame + Spot Intensity + Spot Time */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Field label="Spot Frame" name="spotFrame" value={fields.spotFrame} onChange={handleChange} />
        <Field label="Spot Intensity" name="spotIntensity" value={fields.spotIntensity} onChange={handleChange} />
        <Field label="Spot Time" name="spotTime" value={fields.spotTime} onChange={handleChange} />
      </div>

      {/* Row 7: Notes from Cue Sheet */}
      <div className="mb-2">
        <TextAreaField
          label="Notes from 2026 Cue Sheet"
          name="cueSheetNotes"
          value={fields.cueSheetNotes}
          onChange={handleChange}
          rows={2}
        />
      </div>

      {/* Row 8: Final, Dress, Tech */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Field label="Final" name="final" value={fields.final} onChange={handleChange} />
        <Field label="Dress" name="dress" value={fields.dress} onChange={handleChange} />
        <Field label="Tech" name="tech" value={fields.tech} onChange={handleChange} />
      </div>

      {/* Row 9: Cueing Notes */}
      <div className="mb-3">
        <TextAreaField
          label="Cueing Notes"
          name="cueingNotes"
          value={fields.cueingNotes}
          onChange={handleChange}
          rows={2}
        />
      </div>

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
          Save Cue
        </button>
      </div>
    </form>
  );
}
