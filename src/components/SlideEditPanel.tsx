import { useEffect, useRef, type MutableRefObject } from 'react';
import { CueForm } from './CueForm';
import type { Annotation, CueFields, FieldDefinition } from '../types';

interface SlideEditPanelProps {
  mode: 'create' | 'edit';
  title: string;
  annotation?: Annotation;
  timestamp?: number;
  allAnnotations: Annotation[];
  cueTypes: string[];
  cueTypeFields: Record<string, string[]>;
  fieldDefinitions?: FieldDefinition[];
  mandatoryFields?: Record<string, string[]>;
  onSave: (idOrCue: string | CueFields, cueOrTimestamp?: CueFields | number, newTimestamp?: number) => void;
  onClose: () => void;
  saveRef?: MutableRefObject<(() => void) | null>;
}

export function SlideEditPanel({
  mode,
  title,
  annotation,
  timestamp,
  allAnnotations,
  cueTypes,
  cueTypeFields,
  fieldDefinitions: fieldDefs,
  mandatoryFields,
  onSave,
  onClose,
  saveRef,
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

  return (
    <>
      {/* Backdrop with fade-in */}
      <div
        className="absolute inset-0 z-40 cue-overlay-backdrop"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}
        onClick={onClose}
      />

      {/* Full-width overlay panel */}
      <div
        ref={panelRef}
        className="absolute inset-0 z-50 flex flex-col cue-overlay-panel"
        style={{
          background: 'var(--bg-raised)',
        }}
      >
        {/* Touch bar header: Cancel / Title / Save */}
        <div
          className="flex items-center gap-2 flex-shrink-0 px-4 py-2.5"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
          >
            <kbd className="inline-flex items-center justify-center w-6 h-6 text-[10px] font-mono font-bold rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-dim)', border: '1px solid var(--border-hi)' }}>Esc</kbd>
            <span className="text-xs">Cancel</span>
          </button>

          <span className="flex-1 text-center text-sm font-semibold" style={{ color: 'var(--text)' }}>
            {title}
          </span>

          <button
            type="button"
            onClick={() => saveRef?.current?.()}
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors text-sm"
            style={{ background: 'var(--amber)', color: 'var(--text-inv)', border: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--amber-hi)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--amber)'; }}
          >
            <kbd className="inline-flex items-center justify-center w-6 h-6 text-[10px] font-mono font-bold rounded" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-inv)', border: '1px solid rgba(0,0,0,0.3)' }}>C-↵</kbd>
            <span className="text-xs font-medium">{mode === 'create' ? 'Save Cue' : 'Save'}</span>
          </button>
        </div>

        {/* Scrollable form content — fills remaining height */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto annotation-scroll p-4">
          {mode === 'edit' && annotation ? (
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
              }}
              onCancel={onClose}
              saveRef={saveRef}
              fillHeight
            />
          ) : (
            <CueForm
              mode="create"
              timestamp={timestamp ?? 0}
              allAnnotations={allAnnotations}
              cueTypes={cueTypes}
              cueTypeFields={cueTypeFields}
              fieldDefinitions={fieldDefs}
              mandatoryFields={mandatoryFields}
              onSave={(cue, overrideTimestamp) => {
                onSave(cue as any, overrideTimestamp as any);
              }}
              onCancel={onClose}
              saveRef={saveRef}
              fillHeight
            />
          )}
        </div>
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes cueOverlayFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cueOverlaySlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .cue-overlay-backdrop {
          animation: cueOverlayFadeIn 0.2s ease-out;
        }
        .cue-overlay-panel {
          animation: cueOverlaySlideUp 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
