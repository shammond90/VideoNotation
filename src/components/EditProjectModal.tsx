import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Project } from '../types';

interface EditProjectModalProps {
  project: Project;
  onSave: (projectId: string, updates: {
    name: string;
    production_name?: string;
    choreographer?: string;
    venue?: string;
    year?: string;
    notes?: string;
  }) => void;
  onCancel: () => void;
}

export function EditProjectModal({ project, onSave, onCancel }: EditProjectModalProps) {
  const [name, setName] = useState(project.name);
  const [productionName, setProductionName] = useState(project.production_name || '');
  const [choreographer, setChoreographer] = useState(project.choreographer || '');
  const [venue, setVenue] = useState(project.venue || '');
  const [year, setYear] = useState(project.year || '');
  const [notes, setNotes] = useState(project.notes || '');

  const hasDetails = !!(project.production_name || project.choreographer || project.venue || project.year || project.notes);
  const [detailsExpanded, setDetailsExpanded] = useState(hasDetails);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, []);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const updates: Parameters<typeof onSave>[1] = { name: trimmedName };
    if (productionName.trim()) updates.production_name = productionName.trim();
    if (choreographer.trim()) updates.choreographer = choreographer.trim();
    if (venue.trim()) updates.venue = venue.trim();
    if (year.trim()) updates.year = year.trim();
    if (notes.trim()) updates.notes = notes.trim();

    onSave(project.id, updates);
  };

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="max-w-lg w-full" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <form onSubmit={handleSubmit}>
          <div className="rounded-xl shadow-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            {/* Header */}
            <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--border)' }}>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Edit Project</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-mid)' }}>
                Update project name and production details.
              </p>
            </div>

            {/* Form body */}
            <div className="px-6 py-5 space-y-5">
              {/* Project Name (required) */}
              <div>
                <label htmlFor="edit-project-name" className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-mid)' }}>
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="edit-project-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hamlet Tech Draft"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                  autoComplete="off"
                />
              </div>

              {/* Collapsible Production Details */}
              <div>
                <button
                  type="button"
                  onClick={() => setDetailsExpanded(!detailsExpanded)}
                  className="flex items-center gap-1.5 text-sm font-medium transition-colors"
                  style={{ color: 'var(--text-mid)' }}
                >
                  {detailsExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Production Details
                  <span className="text-xs ml-1" style={{ color: 'var(--text-dim)' }}>(optional)</span>
                </button>

                {detailsExpanded && (
                  <div className="mt-3 space-y-3 pl-1 border-l-2 ml-1.5" style={{ borderColor: 'var(--border)' }}>
                    <div className="pl-4">
                      <label htmlFor="edit-prod-name" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>
                        Production Name
                      </label>
                      <input
                        id="edit-prod-name"
                        type="text"
                        value={productionName}
                        onChange={(e) => setProductionName(e.target.value)}
                        placeholder="e.g. Hamlet"
                        className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                      />
                    </div>

                    <div className="pl-4">
                      <label htmlFor="edit-choreographer" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>
                        Choreographer
                      </label>
                      <input
                        id="edit-choreographer"
                        type="text"
                        value={choreographer}
                        onChange={(e) => setChoreographer(e.target.value)}
                        placeholder="e.g. Jane Smith"
                        className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                      />
                    </div>

                    <div className="pl-4 flex gap-3">
                      <div className="flex-1">
                        <label htmlFor="edit-venue" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>
                          Venue
                        </label>
                        <input
                          id="edit-venue"
                          type="text"
                          value={venue}
                          onChange={(e) => setVenue(e.target.value)}
                          placeholder="e.g. Sydney Opera House"
                          className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                        />
                      </div>
                      <div className="w-24">
                        <label htmlFor="edit-year" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>
                          Year
                        </label>
                        <input
                          id="edit-year"
                          type="text"
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                          placeholder="2026"
                          className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors"
                          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                        />
                      </div>
                    </div>

                    <div className="pl-4">
                      <label htmlFor="edit-notes" className="block text-xs font-medium mb-1" style={{ color: 'var(--text-dim)' }}>
                        Notes
                      </label>
                      <textarea
                        id="edit-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any additional notes about this production..."
                        rows={3}
                        className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors resize-none"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                style={{ color: 'var(--text-mid)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid}
                className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--amber)' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--amber-hi)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--amber)'; }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
