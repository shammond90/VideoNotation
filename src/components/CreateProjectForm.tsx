import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { ConfigTemplate } from '../utils/configTemplates';
import { loadConfigTemplates } from '../utils/configTemplates';

interface CreateProjectFormProps {
  onCancel: () => void;
  onCreate: (data: {
    name: string;
    production_name?: string;
    choreographer?: string;
    venue?: string;
    year?: string;
    notes?: string;
    config_template_id?: string;
  }) => void;
}

/**
 * Full-screen form for creating a new project.
 * Includes project name (required), collapsible production details,
 * and configuration template selection.
 */
export function CreateProjectForm({ onCancel, onCreate }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [productionName, setProductionName] = useState('');
  const [choreographer, setChoreographer] = useState('');
  const [venue, setVenue] = useState('');
  const [year, setYear] = useState('');
  const [notes, setNotes] = useState('');
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('__default__');
  const [templates, setTemplates] = useState<ConfigTemplate[]>([]);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus name field on mount
  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  // Load global config templates (cueTypes category) for the dropdown
  useEffect(() => {
    loadConfigTemplates().then((all) => {
      const cueTypeTemplates = all.filter((t) => t.category === 'cueTypes');
      setTemplates(cueTypeTemplates);
    });
  }, []);

  const trimmedName = name.trim();
  const isValid = trimmedName.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    const data: Parameters<typeof onCreate>[0] = {
      name: trimmedName,
    };

    if (productionName.trim()) data.production_name = productionName.trim();
    if (choreographer.trim()) data.choreographer = choreographer.trim();
    if (venue.trim()) data.venue = venue.trim();
    if (year.trim()) data.year = year.trim();
    if (notes.trim()) data.notes = notes.trim();
    if (selectedTemplateId !== '__default__') data.config_template_id = selectedTemplateId;

    onCreate(data);
  };

  // Sort templates alphabetically by name
  const sortedTemplates = [...templates].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)", color: "var(--text)" }}>
      <div className="max-w-lg w-full">
        <form onSubmit={handleSubmit}>
          <div className="rounded-xl shadow-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            {/* Header */}
            <div className="px-6 py-5 border-b" style={{ borderColor: "var(--border)" }}>
              <h1 className="text-xl font-bold">Create New Project</h1>
              <p className="text-sm mt-1" style={{ color: "var(--text-mid)" }}>
                Set up a new cue sheet for your production.
              </p>
            </div>

            {/* Form body */}
            <div className="px-6 py-5 space-y-5">
              {/* Project Name (required) */}
              <div>
                <label htmlFor="project-name" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-mid)" }}>
                  Project Name <span className="text-red-400">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="project-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Hamlet Tech Draft"
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", caretColor: "var(--amber)" }}
                  autoComplete="off"
                />
              </div>

              {/* Configuration Template */}
              <div>
                <label htmlFor="config-template" className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-mid)" }}>
                  Configuration Template
                </label>
                <select
                  id="config-template"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none transition-colors" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)" }}
                >
                  <option value="__default__">Cuetation Standard</option>
                  {sortedTemplates.map((tpl) => (
                    <option key={tpl.id} value={tpl.id}>
                      {tpl.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
                  Sets the initial cue types and fields. You can change these later.
                </p>
              </div>

              {/* Collapsible Production Details */}
              <div>
                <button
                  type="button"
                  onClick={() => setDetailsExpanded(!detailsExpanded)}
                  className="flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: "var(--text-mid)" }}
                >
                  {detailsExpanded ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  Production Details
                  <span className="text-xs ml-1" style={{ color: 'var(--text-dim)' }}>(optional)</span>
                </button>

                {detailsExpanded && (
                  <div className="mt-3 space-y-3 pl-1 border-l-2 ml-1.5" style={{ borderColor: "var(--border)" }}>
                    <div className="pl-4">
                      <label htmlFor="prod-name" className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                        Production Name
                      </label>
                      <input
                        id="prod-name"
                        type="text"
                        value={productionName}
                        onChange={(e) => setProductionName(e.target.value)}
                        placeholder="e.g. Hamlet"
                        className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", caretColor: "var(--amber)" }}
                      />
                    </div>

                    <div className="pl-4">
                      <label htmlFor="choreographer" className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                        Choreographer
                      </label>
                      <input
                        id="choreographer"
                        type="text"
                        value={choreographer}
                        onChange={(e) => setChoreographer(e.target.value)}
                        placeholder="e.g. Jane Smith"
                        className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", caretColor: "var(--amber)" }}
                      />
                    </div>

                    <div className="pl-4 flex gap-3">
                      <div className="flex-1">
                        <label htmlFor="venue" className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                          Venue
                        </label>
                        <input
                          id="venue"
                          type="text"
                          value={venue}
                          onChange={(e) => setVenue(e.target.value)}
                          placeholder="e.g. Sydney Opera House"
                          className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", caretColor: "var(--amber)" }}
                        />
                      </div>
                      <div className="w-24">
                        <label htmlFor="year" className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                          Year
                        </label>
                        <input
                          id="year"
                          type="text"
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                          placeholder="2026"
                          className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", caretColor: "var(--amber)" }}
                        />
                      </div>
                    </div>

                    <div className="pl-4">
                      <label htmlFor="notes" className="block text-xs font-medium mb-1" style={{ color: "var(--text-dim)" }}>
                        Notes
                      </label>
                      <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Any additional notes about this production..."
                        rows={3}
                        className="w-full rounded-md px-3 py-2 text-sm outline-none transition-colors resize-none" style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text)", caretColor: "var(--amber)" }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 flex justify-end gap-3" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors" style={{ color: "var(--text-mid)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)";e.currentTarget.style.color="var(--text)"}} onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color="var(--text-mid)"}}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isValid}
                className="px-5 py-2 text-sm font-semibold text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" style={{ background: "var(--amber)" }} onMouseEnter={e=>{if(!e.currentTarget.disabled)e.currentTarget.style.background="var(--amber-hi)"}} onMouseLeave={e=>{e.currentTarget.style.background="var(--amber)"}}
              >
                Create Project
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
