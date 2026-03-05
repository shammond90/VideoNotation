import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Pencil, Trash2, X, Download, Upload, Clock, Filter } from 'lucide-react';
import { formatTime, parseTime } from '../utils/formatTime';
import { CueForm } from './CueForm';
import type { Annotation, CueFields, ColumnConfig } from '../types';
import { RESERVED_CUE_TYPES } from '../types';

interface AnnotationPanelProps {
  annotations: Annotation[];
  activeId: string | null;
  currentTime: number;
  cueTypeColors: Record<string, string>;
  distanceView: boolean;
  cueTypeAllowStandby: Record<string, boolean>;
  cueTypeAllowWarning: Record<string, boolean>;
  onSeek: (time: number) => void;
  onEdit: (id: string, cue: CueFields, newTimestamp?: number) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: () => void;
  isNoVideoMode?: boolean;
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>;
  cueTypes: string[];
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

/** Resolve a column value — handles virtual columns (timestamp, timeInTitle) */
function resolveColumnValue(
  col: ColumnConfig,
  cue: CueFields,
  annotation: Annotation,
): string {
  if (col.key === 'timestamp') return formatTime(annotation.timestamp);
  if (col.key === 'timeInTitle') {
    if (annotation.timeInTitle == null) return '';
    return formatTime(annotation.timeInTitle);
  }
  return (cue as any)[col.key] ?? '';
}

/**
 * Detect if a Title/Scene cue should use the "large What" layout:
 * only 'type' and 'what' are the visible real columns (timestamp excluded),
 * and 'what' has a value.
 */
function isLargeWhatMode(cols: ColumnConfig[], cueType: string, whatValue: string): boolean {
  if (!(RESERVED_CUE_TYPES as readonly string[]).includes(cueType)) return false;
  if (!whatValue) return false;
  // Get visible content columns, excluding virtual columns and type
  const contentCols = cols.filter(
    (c) => c.visible && c.key !== 'type' && c.key !== 'timestamp' && c.key !== 'timeInTitle',
  );
  return contentCols.length === 1 && contentCols[0].key === 'what';
}

/**
 * Determine if a cue is "active" — the video time is less than
 * the cue's timestamp + its duration.
 */
function isCueActive(annotation: Annotation, currentTime: number): boolean {
  const dur = parseFloat(annotation.cue.duration) || 0;
  return currentTime >= annotation.timestamp && currentTime < annotation.timestamp + dur;
}

/**
 * Determine if a cue is in "standby" — the video time is within
 * the cue's standbyTime seconds before its timestamp, but NOT yet active.
 * standbyTime is the SMALLER value (closer to the cue timestamp).
 * Zone: 0 < timeUntil <= standbySeconds
 */
function isCueStandby(
  annotation: Annotation,
  currentTime: number,
): boolean {
  const standbySeconds = parseFloat(annotation.cue.standbyTime) || 0;
  if (standbySeconds <= 0) return false;
  if ((RESERVED_CUE_TYPES as readonly string[]).includes(annotation.cue.type)) return false;
  const timeUntil = annotation.timestamp - currentTime;
  return timeUntil > 0 && timeUntil <= standbySeconds;
}

/**
 * Determine if a cue is in "warning" — the video time is within
 * the cue's warningTime seconds before its timestamp, but NOT yet in standby.
 * warningTime is the LARGER value (further from the cue timestamp).
 * Zone: standbySeconds < timeUntil <= warningSeconds
 */
function isCueWarning(
  annotation: Annotation,
  currentTime: number,
): boolean {
  const warningSeconds = parseFloat(annotation.cue.warningTime) || 0;
  if (warningSeconds <= 0) return false;
  if ((RESERVED_CUE_TYPES as readonly string[]).includes(annotation.cue.type)) return false;
  const timeUntil = annotation.timestamp - currentTime;
  if (timeUntil <= 0) return false;
  const standbySeconds = parseFloat(annotation.cue.standbyTime) || 0;
  return timeUntil <= warningSeconds && timeUntil > standbySeconds;
}

export function AnnotationPanel({
  annotations,
  activeId,
  currentTime,
  cueTypeColors,
  distanceView,
  cueTypeAllowStandby,
  cueTypeAllowWarning,
  onSeek,
  onEdit,
  onDelete,
  onExport,
  onImport,
  isNoVideoMode,
  visibleColumns,
  cueTypeColumns,
  cueTypes,
}: AnnotationPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set(cueTypes));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Helper: get visible columns for a specific cue type
  const getColumnsForType = useCallback(
    (cueType: string): ColumnConfig[] => {
      if (cueTypeColumns[cueType]) return cueTypeColumns[cueType];
      return visibleColumns;
    },
    [visibleColumns, cueTypeColumns],
  );

  // Keep typeFilter synced when cueTypes list changes (e.g. import adds new ones)
  useEffect(() => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      // Add any newly-appearing cue types
      for (const t of cueTypes) {
        if (!next.has(t)) next.add(t);
      }
      // Remove types that no longer exist
      for (const t of next) {
        if (!cueTypes.includes(t)) next.delete(t);
      }
      return next;
    });
  }, [cueTypes]);

  // Toggle a type in the filter
  const toggleTypeFilter = useCallback((type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Filter annotations: search + cue type filter
  const filteredAnnotations = useMemo(() => {
    let anns = annotations;

    // Apply cue type filter — types NOT in the set are hidden
    if (typeFilter.size < cueTypes.length) {
      anns = anns.filter((a) => typeFilter.has(a.cue.type));
    }

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const queryTime = parseTime(query);

      anns = anns.filter((a) => {
        const cueValues = Object.values(a.cue).join(' ').toLowerCase();
        if (cueValues.includes(query)) return true;
        if (queryTime !== null) {
          return Math.abs(a.timestamp - queryTime) < 5;
        }
        const formatted = formatTime(a.timestamp);
        return formatted.includes(query);
      });
    }

    return anns;
  }, [annotations, searchQuery, typeFilter]);

  // Split into active+upcoming vs past (for display ordering)
  const { activeCues, upcomingCues } = useMemo(() => {
    const active: Annotation[] = [];
    const upcoming: Annotation[] = [];

    for (const a of filteredAnnotations) {
      const dur = parseFloat(a.cue.duration) || 0;
      if (isCueActive(a, currentTime)) {
        active.push(a);
      } else if (a.timestamp >= currentTime) {
        upcoming.push(a);
      } else if (a.timestamp + dur > currentTime) {
        upcoming.push(a);
      }
      // Past cues (timestamp + duration < currentTime) are hidden from the auto-scroll view
      // but included when searching
    }

    return { activeCues: active, upcomingCues: upcoming };
  }, [filteredAnnotations, currentTime]);

  // When not searching, show active cues first, then upcoming
  // When searching, show all matches in timestamp order
  // Active cues are sorted: TITLE first, SCENE second, then others
  const displayedAnnotations = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredAnnotations; // show all matches in order
    }
    // Sort active cues: TITLE → SCENE → everything else (preserve timestamp order within each group)
    const sortedActive = [...activeCues].sort((a, b) => {
      const typeOrder = (t: string) => {
        if (t === 'TITLE') return 0;
        if (t === 'SCENE') return 1;
        return 2;
      };
      const diff = typeOrder(a.cue.type) - typeOrder(b.cue.type);
      if (diff !== 0) return diff;
      return a.timestamp - b.timestamp;
    });
    return [...sortedActive, ...upcomingCues];
  }, [searchQuery, filteredAnnotations, activeCues, upcomingCues]);

  // Auto-scroll to keep active cues at top
  useEffect(() => {
    if (activeRef.current && !isUserScrolling && !editingId && !searchQuery.trim()) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeId, isUserScrolling, editingId, searchQuery]);

  // Track user scrolling
  const handleScroll = useCallback(() => {
    setIsUserScrolling(true);
    clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  }, []);

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

        {/* Cue Type Filter + Distance View toggle */}
        <div className="mt-2">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                typeFilter.size < cueTypes.length
                  ? 'bg-indigo-500/20 text-indigo-300'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter by Type
              {typeFilter.size < cueTypes.length && (
                <span className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0 rounded-full">
                  {cueTypes.length - typeFilter.size} hidden
                </span>
              )}
            </button>
          </div>
          {isFilterOpen && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cueTypes.map((type) => {
                const isActive = typeFilter.has(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleTypeFilter(type)}
                    className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                      isActive
                        ? 'bg-indigo-500/30 border-indigo-500/60 text-indigo-300'
                        : 'bg-slate-700/50 border-slate-600/50 text-slate-500 line-through hover:text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
              {typeFilter.size < cueTypes.length && (
                <button
                  type="button"
                  onClick={() => setTypeFilter(new Set(cueTypes))}
                  className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded-md hover:bg-slate-700 transition-colors"
                >
                  Select all
                </button>
              )}
              {typeFilter.size > 0 && (
                <button
                  type="button"
                  onClick={() => setTypeFilter(new Set())}
                  className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded-md hover:bg-slate-700 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cue list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto annotation-scroll p-3 space-y-2"
      >
        {displayedAnnotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            {annotations.length === 0 ? (
              <>
                <Clock className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">No cues yet</p>
                <p className="text-xs mt-1">
                  Press {isNoVideoMode ? 'Enter' : 'Enter'} to add your first cue
                </p>
              </>
            ) : (
              <>
                <Search className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm font-medium">No matching results</p>
              </>
            )}
          </div>
        ) : (
          displayedAnnotations.map((annotation) => {
            const isActive = isCueActive(annotation, currentTime);
            const cue = annotation.cue;
            const isStandby = !isActive && isCueStandby(annotation, currentTime);
            const isWarning = !isActive && !isStandby && isCueWarning(annotation, currentTime);
            const isEditing = annotation.id === editingId;
            const isDeleting = annotation.id === deletingId;
            const isFirstActive = activeCues[0]?.id === annotation.id;

            return (
              <div
                key={annotation.id}
                ref={isFirstActive ? activeRef : undefined}
                onClick={() => {
                  if (!isEditing) onSeek(annotation.timestamp);
                }}
                className={`group rounded-lg border transition-all duration-200 cursor-pointer relative ${
                    isActive
                      ? 'bg-emerald-900/30 border-emerald-500/60 shadow-sm shadow-emerald-500/10'
                      : isStandby
                        ? 'bg-amber-900/20 border-amber-500/50 shadow-sm shadow-amber-500/10'
                        : isWarning
                          ? 'bg-blue-900/20 border-blue-500/50 shadow-sm shadow-blue-500/10'
                          : annotation.id === activeId
                            ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm shadow-indigo-500/10'
                            : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                  }`}
              >
                {isEditing ? (
                  /* Full-field edit: show all fields in CueForm edit mode */
                  <div className="p-3">
                  <CueForm
                    mode="edit"
                    timestamp={annotation.timestamp}
                    initialValues={cue}
                    timeInTitle={annotation.timeInTitle}
                    allAnnotations={annotations}
                    cueTypes={cueTypes}
                    cueTypeAllowStandby={cueTypeAllowStandby}
                    cueTypeAllowWarning={cueTypeAllowWarning}
                    onSave={(updated, newTimestamp) => {
                      onEdit(annotation.id, updated, newTimestamp);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                  </div>
                ) : (
                  <>
                    {/* Overlapping status flag — top right */}
                    {isActive && (
                      <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-emerald-600 text-emerald-100 tracking-wider">
                        Active
                      </span>
                    )}
                    {isWarning && (
                      <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-blue-600 text-blue-100 tracking-wider">
                        Warning
                      </span>
                    )}
                    {isStandby && (
                      <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-amber-600 text-amber-100 tracking-wider">
                        Standby
                      </span>
                    )}

                    {distanceView ? (
                      /* ── Distance view: large type+cue# block on left ── */
                      (() => {
                        const cols = getColumnsForType(cue.type).filter((c) => c.visible);
                        const largeWhat = isLargeWhatMode(cols, cue.type, cue.what);
                        const showTimestamp = cols.some((c) => c.key === 'timestamp');

                        if (largeWhat) {
                          // Title/Scene: large type badge on left + centred large text — same height as regular cues
                          return (
                            <div className="flex items-center gap-1.5 pr-2 pt-0.5 pb-0.5">
                              {cue.type && (
                                <div
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-white font-bold text-sm uppercase tracking-wide shrink-0 self-stretch"
                                  style={{ backgroundColor: cueTypeColors[cue.type] || '#6b7280' }}
                                >
                                  <span>{cue.type}</span>
                                </div>
                              )}
                              <span className="text-lg font-semibold text-slate-100 text-center flex-1 min-w-0 truncate">
                                {cue.what}
                              </span>
                              {/* Edit / Delete */}
                              {!isDeleting && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(annotation.id); }} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(annotation.id); }} className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded" title="Delete">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-center gap-1.5 pr-2 pt-0.5 pb-0.5">
                            {/* Type + Cue # badge */}
                            {cue.type && (
                              <div
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-white font-bold text-sm uppercase tracking-wide shrink-0 self-stretch"
                                style={{ backgroundColor: cueTypeColors[cue.type] || '#6b7280' }}
                              >
                                <span>{cue.type}</span>
                                {cue.cueNumber && (
                                  <span className="opacity-80">#{cue.cueNumber}</span>
                                )}
                              </div>
                            )}

                            {/* Timestamp clickable pill — only if timestamp column visible */}
                            {showTimestamp && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSeek(annotation.timestamp);
                                }}
                                className={`
                                  text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0
                                  ${isActive
                                    ? 'bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40'
                                    : isStandby
                                      ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/40'
                                      : isWarning
                                        ? 'bg-blue-500/30 text-blue-300 hover:bg-blue-500/40'
                                        : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'}
                                `}
                              >
                                {formatTime(annotation.timestamp)}
                              </button>
                            )}

                            {/* Inline chips */}
                            <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                              {cols.map((col) => {
                                if (col.key === 'type' || col.key === 'cueNumber' || col.key === 'timestamp') return null;
                                const val = resolveColumnValue(col, cue, annotation);
                                if (!val) return null;
                                return <CueChip key={col.key} label={col.label} value={val} />;
                              })}
                            </div>

                            {/* Edit / Delete actions */}
                            {!isDeleting && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(annotation.id); }} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded" title="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(annotation.id); }} className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded" title="Delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      /* ── Compact view: small overlapping type+cue# badge top-left ── */
                      (() => {
                        const cols = getColumnsForType(cue.type).filter((c) => c.visible);
                        const largeWhat = isLargeWhatMode(cols, cue.type, cue.what);
                        const showTimestamp = cols.some((c) => c.key === 'timestamp');

                        if (largeWhat) {
                          // Title/Scene compact: overlapping badge top-left + centred large text — same height as regular compact cues
                          return (
                            <>
                              {cue.type && (
                                <span
                                  className="absolute -top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 text-white"
                                  style={{ backgroundColor: cueTypeColors[cue.type] || '#6b7280' }}
                                >
                                  {cue.type}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 pt-2.5 px-3 pb-2">
                                <span className="text-lg font-semibold text-slate-100 text-center flex-1 min-w-0 truncate">
                                  {cue.what}
                                </span>
                                {!isDeleting && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(annotation.id); }} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded" title="Edit">
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(annotation.id); }} className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded" title="Delete">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          );
                        }

                        return (
                          <>
                            {cue.type && (
                              <span
                                className="absolute -top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 text-white"
                                style={{ backgroundColor: cueTypeColors[cue.type] || '#6b7280' }}
                              >
                                {cue.type}{cue.cueNumber ? ` #${cue.cueNumber}` : ''}
                              </span>
                            )}

                            <div className="flex items-center gap-1.5 pt-2.5 px-3 pb-2">
                              {/* Timestamp clickable pill — only if timestamp column visible */}
                              {showTimestamp && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSeek(annotation.timestamp);
                                  }}
                                  className={`
                                    text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0
                                    ${isActive
                                      ? 'bg-emerald-500/30 text-emerald-300 hover:bg-emerald-500/40'
                                      : isStandby
                                        ? 'bg-amber-500/30 text-amber-300 hover:bg-amber-500/40'
                                        : isWarning
                                          ? 'bg-blue-500/30 text-blue-300 hover:bg-blue-500/40'
                                          : 'bg-slate-700 text-slate-400 hover:bg-slate-600 hover:text-slate-300'}
                                  `}
                                >
                                  {formatTime(annotation.timestamp)}
                                </button>
                              )}

                              {/* Inline chips */}
                              <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                                {cols.map((col) => {
                                  if (col.key === 'type' || col.key === 'cueNumber' || col.key === 'timestamp') return null;
                                  const val = resolveColumnValue(col, cue, annotation);
                                  if (!val) return null;
                                  return <CueChip key={col.key} label={col.label} value={val} />;
                                })}
                              </div>

                              {/* Edit / Delete actions */}
                              {!isDeleting && (
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(annotation.id); }} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded" title="Edit">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(annotation.id); }} className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded" title="Delete">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        );
                      })()
                    )}

                    {/* Delete confirmation */}
                    {isDeleting && (
                      <div className="flex items-center gap-2 text-sm mt-2 pt-2 border-t border-slate-700/50">
                        <span className="text-red-400 text-xs">Delete this cue?</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(annotation.id);
                            setDeletingId(null);
                          }}
                          className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500 transition-colors"
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(null);
                          }}
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
