import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Pencil, Trash2, X, Download, Upload, Clock } from 'lucide-react';
import { formatTime, parseTime } from '../utils/formatTime';
import { CueForm } from './CueForm';
import type { Annotation, CueFields } from '../types';

interface AnnotationPanelProps {
  annotations: Annotation[];
  activeId: string | null;
  onSeek: (time: number) => void;
  onEdit: (id: string, cue: CueFields) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: () => void;
}

/** Show a non-empty cue field as a tiny label:value chip */
function CueChip({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] bg-slate-700/60 rounded px-1.5 py-0.5">
      <span className="text-slate-500 uppercase">{label}</span>
      <span className="text-slate-300">{value}</span>
    </span>
  );
}

export function AnnotationPanel({
  annotations,
  activeId,
  onSeek,
  onEdit,
  onDelete,
  onExport,
  onImport,
}: AnnotationPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Filter annotations
  const filteredAnnotations = useMemo(() => {
    if (!searchQuery.trim()) return annotations;
    const query = searchQuery.trim().toLowerCase();

    // Check if query looks like a timestamp
    const queryTime = parseTime(query);

    return annotations.filter((a) => {
      // Search across all cue fields
      const cueValues = Object.values(a.cue).join(' ').toLowerCase();
      if (cueValues.includes(query)) return true;
      if (queryTime !== null) {
        return Math.abs(a.timestamp - queryTime) < 5;
      }
      const formatted = formatTime(a.timestamp);
      return formatted.includes(query);
    });
  }, [annotations, searchQuery]);

  // Auto-scroll to active note
  useEffect(() => {
    if (activeId && activeRef.current && !isUserScrolling && !editingId) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeId, isUserScrolling, editingId]);

  // Track user scrolling
  const handleScroll = useCallback(() => {
    setIsUserScrolling(true);
    clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  }, []);

  /** Build a compact summary line from cue fields */
  const cueSummary = (cue: CueFields) => {
    const parts: string[] = [];
    if (cue.type) parts.push(cue.type);
    if (cue.cueNumber) parts.push(`#${cue.cueNumber}`);
    if (cue.when) parts.push(cue.when);
    if (cue.what) parts.push(cue.what);
    if (cue.cueingNotes) parts.push(cue.cueingNotes);
    return parts.join(' · ') || '(empty cue)';
  };

  return (
    <div className="flex flex-col h-full bg-slate-850 rounded-lg border border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Cue Sheet
          </h2>
          <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
            {annotations.length} cue{annotations.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search cues, types, timestamps..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-700 text-sm text-slate-200 pl-9 pr-8 py-2 rounded-lg border border-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none placeholder-slate-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cue list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto annotation-scroll p-3 space-y-2"
      >
        {filteredAnnotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            {annotations.length === 0 ? (
              <>
                <Clock className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">No cues yet</p>
                <p className="text-xs mt-1">Press Space to add your first cue</p>
              </>
            ) : (
              <>
                <Search className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">No matching results</p>
              </>
            )}
          </div>
        ) : (
          filteredAnnotations.map((annotation) => {
            const isActive = annotation.id === activeId;
            const isEditing = annotation.id === editingId;
            const isDeleting = annotation.id === deletingId;
            const cue = annotation.cue;

            return (
              <div
                key={annotation.id}
                ref={isActive ? activeRef : undefined}
                className={`
                  group rounded-lg p-3 border transition-all duration-200
                  ${isActive
                    ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                    : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'}
                `}
              >
                {isEditing ? (
                  <CueForm
                    timestamp={annotation.timestamp}
                    initialValues={cue}
                    onSave={(updated) => {
                      onEdit(annotation.id, updated);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    {/* Top row: timestamp + type badge + actions */}
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onSeek(annotation.timestamp)}
                          className={`
                            text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors cursor-pointer
                            ${isActive
                              ? 'bg-indigo-500/30 text-indigo-300 hover:bg-indigo-500/40'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'}
                          `}
                        >
                          {formatTime(annotation.timestamp)}
                        </button>
                        {cue.type && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase">
                            {cue.type}
                          </span>
                        )}
                        {cue.cueNumber && (
                          <span className="text-[10px] font-mono text-slate-400">
                            #{cue.cueNumber}
                          </span>
                        )}
                      </div>

                      {!isDeleting && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => setEditingId(annotation.id)}
                            className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingId(annotation.id)}
                            className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Cue detail chips */}
                    <div className="flex flex-wrap gap-1 mb-1">
                      <CueChip label="Time" value={cue.cueTime} />
                      <CueChip label="D" value={cue.duration} />
                      <CueChip label="F" value={cue.fadeDown} />
                      <CueChip label="H" value={cue.h} />
                      <CueChip label="B" value={cue.b} />
                      <CueChip label="A" value={cue.a} />
                      <CueChip label="Preset" value={cue.presets} />
                      <CueChip label="Color" value={cue.colorPalette} />
                      <CueChip label="Sp.Frame" value={cue.spotFrame} />
                      <CueChip label="Sp.Int" value={cue.spotIntensity} />
                      <CueChip label="Sp.Time" value={cue.spotTime} />
                    </div>

                    {/* When / What */}
                    {(cue.when || cue.what) && (
                      <div className="text-xs text-slate-300 mb-1 space-y-0.5">
                        {cue.when && (
                          <p>
                            <span className="text-slate-500 uppercase text-[10px] mr-1">When:</span>
                            {cue.when}
                          </p>
                        )}
                        {cue.what && (
                          <p>
                            <span className="text-slate-500 uppercase text-[10px] mr-1">What:</span>
                            {cue.what}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Notes rows */}
                    {(cue.cueSheetNotes || cue.cueingNotes || cue.final || cue.dress || cue.tech) && (
                      <div className="text-[11px] text-slate-400 space-y-0.5 mt-1 pt-1 border-t border-slate-700/50">
                        {cue.cueSheetNotes && <p className="italic">{cue.cueSheetNotes}</p>}
                        {cue.cueingNotes && <p>{cue.cueingNotes}</p>}
                        <div className="flex gap-2">
                          {cue.final && <CueChip label="Final" value={cue.final} />}
                          {cue.dress && <CueChip label="Dress" value={cue.dress} />}
                          {cue.tech && <CueChip label="Tech" value={cue.tech} />}
                        </div>
                      </div>
                    )}

                    {/* Delete confirmation */}
                    {isDeleting && (
                      <div className="flex items-center gap-2 text-sm mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-red-400 text-xs">Delete this cue?</span>
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(annotation.id);
                            setDeletingId(null);
                          }}
                          className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t border-slate-700 flex gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={annotations.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-1 justify-center"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
        <button
          type="button"
          onClick={onImport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-slate-700 text-slate-300 rounded-md hover:bg-slate-600 transition-colors flex-1 justify-center"
        >
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </button>
      </div>
    </div>
  );
}
