import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { CueForm } from './CueForm';
import type { Annotation, CueFields, FieldDefinition } from '../types';

interface SlideEditPanelProps {
  annotation: Annotation;
  allAnnotations: Annotation[];
  cueTypes: string[];
  cueTypeFields: Record<string, string[]>;
  fieldDefinitions?: FieldDefinition[];
  mandatoryFields?: Record<string, string[]>;
  onSave: (id: string, cue: CueFields, newTimestamp?: number) => void;
  onClose: () => void;
}

export function SlideEditPanel({
  annotation,
  allAnnotations,
  cueTypes,
  cueTypeFields,
  fieldDefinitions: fieldDefs,
  mandatoryFields,
  onSave,
  onClose,
}: SlideEditPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the click that opened the panel
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="absolute inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Slide-in panel from right */}
      <div
        ref={panelRef}
        className="absolute top-0 right-0 bottom-0 z-50 flex flex-col border-l shadow-2xl overflow-hidden"
        style={{
          width: 'min(420px, 90%)',
          background: 'var(--bg-raised)',
          borderColor: 'var(--border)',
          animation: 'slideInRight 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Edit Cue
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-dim)'; }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-4">
          <CueForm
            mode="edit"
            timestamp={annotation.timestamp}
            initialValues={annotation.cue}
            timeInTitle={annotation.timeInTitle}
            allAnnotations={allAnnotations}
            cueTypes={cueTypes}
            cueTypeFields={cueTypeFields}
            fieldDefinitions={fieldDefs}
            mandatoryFields={mandatoryFields}
            onSave={(cue, newTimestamp) => {
              onSave(annotation.id, cue, newTimestamp);
              onClose();
            }}
            onCancel={onClose}
          />
        </div>
      </div>

      {/* Animation keyframe */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}
