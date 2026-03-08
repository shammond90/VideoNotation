import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Search, Pencil, Trash2, X, Download, Upload, Clock, Filter, ChevronUp, ChevronDown, Target } from 'lucide-react';
import { formatTime, parseTime } from '../utils/formatTime';
import { CueForm } from './CueForm';
import type { Annotation, CueFields, ColumnConfig } from '../types';
import { RESERVED_CUE_TYPES, LOOP_CUE_TYPE } from '../types';

/** Default colour for LOOP cue type (amber). */
const LOOP_CUE_COLOR = '#f59e0b';

interface AnnotationPanelProps {
  annotations: Annotation[];
  activeId: string | null;
  skippedIds: Set<string>;
  showSkippedCues: boolean;
  currentTime: number;
  isPlaying: boolean;
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  showShortCodes: boolean;
  expandedSearchFilter: boolean;
  onSetExpandedSearchFilter: (expanded: boolean) => void;
  showPastCues: boolean;
  distanceView: boolean;
  cueTypeFields: Record<string, string[]>;
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
 * Detect if a cue should use the "large field" layout.
 * Applies to ALL cue types when the only visible content columns
 * (excluding type, timestamp, timeInTitle) are a subset of cueNumber, what, when.
 *
 * Returns:
 *  - null if normal layout should be used
 *  - { large: 'what'|'when', small?: 'what'|'when' } describing which field(s) to show large/small
 */
function getLargeFieldMode(
  cols: ColumnConfig[],
  whatValue: string,
  whenValue: string,
): { large: 'what' | 'when'; small?: 'what' | 'when' } | null {
  // Get visible content columns, excluding virtual columns, type, and cueNumber
  const contentCols = cols.filter(
    (c) => c.visible && c.key !== 'type' && c.key !== 'timestamp' && c.key !== 'timeInTitle' && c.key !== 'cueNumber',
  );
  // All remaining visible content columns must be 'what' and/or 'when' only
  const allowedKeys = new Set(['what', 'when']);
  if (contentCols.length === 0 || contentCols.some((c) => !allowedKeys.has(c.key))) return null;

  const hasWhat = whatValue && contentCols.some((c) => c.key === 'what');
  const hasWhen = whenValue && contentCols.some((c) => c.key === 'when');

  if (hasWhat && hasWhen) {
    // Both have values — first in column order is large, second is small
    const whatIdx = cols.findIndex((c) => c.key === 'what');
    const whenIdx = cols.findIndex((c) => c.key === 'when');
    if (whatIdx < whenIdx) return { large: 'what', small: 'when' };
    return { large: 'when', small: 'what' };
  }
  if (hasWhat) return { large: 'what' };
  if (hasWhen) return { large: 'when' };
  return null;
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
  skippedIds,
  showSkippedCues,
  currentTime,
  isPlaying,
  cueTypeColors,
  cueTypeShortCodes,
  showShortCodes,
  expandedSearchFilter,
  onSetExpandedSearchFilter,
  showPastCues,
  distanceView,
  cueTypeFields,
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
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(!expandedSearchFilter);
  const [isPastCollapsed, setIsPastCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pastScrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const activeTitleRef = useRef<HTMLDivElement>(null);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Helper: get display name for a cue type (short code if enabled, otherwise full name)
  const getCueTypeDisplayName = useCallback(
    (cueType: string): string => {
      if (cueType === LOOP_CUE_TYPE) return '⟳ LOOP';
      if (showShortCodes && cueTypeShortCodes[cueType]) {
        return cueTypeShortCodes[cueType];
      }
      return cueType;
    },
    [showShortCodes, cueTypeShortCodes],
  );

  // Helper: get colour for a cue type (LOOP uses distinctive amber)
  const getCueColor = useCallback(
    (cueType: string): string => {
      if (cueType === LOOP_CUE_TYPE) return LOOP_CUE_COLOR;
      return cueTypeColors[cueType] || '#6b7280';
    },
    [cueTypeColors],
  );

  // Helper: find the most recent Title cue at or before current time
  const getActiveTitle = useMemo(() => {
    return annotations
      .filter((a) => a.cue.type === 'TITLE' && a.timestamp <= currentTime)
      .sort((a, b) => b.timestamp - a.timestamp)[0] || null;
  }, [annotations, currentTime]);

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

    // Hide skipped cues when showSkippedCues is off
    if (!showSkippedCues) {
      anns = anns.filter((a) => !skippedIds.has(a.id));
    }

    // Apply cue type filter — types NOT in the set are hidden (LOOP always passes)
    if (typeFilter.size < cueTypes.length) {
      anns = anns.filter((a) => a.cue.type === LOOP_CUE_TYPE || typeFilter.has(a.cue.type));
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
  }, [annotations, searchQuery, typeFilter, showSkippedCues, skippedIds]);

  // Split into past / active / upcoming
  const { activeCues, upcomingCues, pastCues } = useMemo(() => {
    const active: Annotation[] = [];
    const upcoming: Annotation[] = [];
    const past: Annotation[] = [];

    for (const a of filteredAnnotations) {
      const dur = parseFloat(a.cue.duration) || 0;
      if (isCueActive(a, currentTime)) {
        active.push(a);
      } else if (a.timestamp >= currentTime) {
        upcoming.push(a);
      } else if (a.timestamp + dur > currentTime) {
        upcoming.push(a);
      } else {
        past.push(a); // completely passed
      }
    }

    return { activeCues: active, upcomingCues: upcoming, pastCues: past };
  }, [filteredAnnotations, currentTime]);

  // Active + upcoming cues — TITLE first, SCENE second, then others within active group
  // In search mode returns the full filtered list instead
  const activeUpcomingAnnotations = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredAnnotations; // search mode: unified list of all matches
    }
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

  // Auto-scroll to keep active cues at top — only while playing
  useEffect(() => {
    if (!isPlaying) return;
    if (activeRef.current && !isUserScrolling && !editingId && !searchQuery.trim()) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeId, isPlaying, isUserScrolling, editingId, searchQuery]);

  // Track user scrolling
  const handleScroll = useCallback(() => {
    setIsUserScrolling(true);
    clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  }, []);

  // Jump to active title cue
  const handleJumpToActiveTitle = useCallback(() => {
    if (activeTitleRef.current) {
      activeTitleRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Auto-scroll past cues container to the bottom so the most recent are visible
  useEffect(() => {
    if (pastScrollRef.current) {
      pastScrollRef.current.scrollTop = pastScrollRef.current.scrollHeight;
    }
  }, [pastCues.length]);

  return (
    <div className="flex flex-col h-full bg-slate-850 rounded-lg border border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
            Cue Sheet
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
              {annotations.length} cue{annotations.length !== 1 ? 's' : ''}
            </span>
            {getActiveTitle && (
              <button
                type="button"
                onClick={handleJumpToActiveTitle}
                className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
                title="Jump to active title"
              >
                <Target className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const next = !isSearchCollapsed;
                setIsSearchCollapsed(next);
                onSetExpandedSearchFilter(!next);
              }}
              className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
              title={isSearchCollapsed ? 'Show search & filter' : 'Hide search & filter'}
            >
              <ChevronUp className="w-4 h-4" style={{ transform: isSearchCollapsed ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>
          </div>
        </div>

        {!isSearchCollapsed && (
          <>
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
          </>
        )}
      </div>

      {/* Cue list — past (greyed) above divider, active+upcoming below */}
      <div className="flex-1 flex flex-col min-h-0">

        {/* Past cues — chronological order, auto-scrolled to bottom so last 2 visible */}
        {!searchQuery.trim() && showPastCues && pastCues.length > 0 && (
          <>
            {/* Past section header with collapse toggle */}
            <div className="shrink-0 flex items-center gap-2 px-3 pt-2 pb-1">
              <button
                type="button"
                onClick={() => setIsPastCollapsed((p) => !p)}
                className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300 uppercase tracking-wider transition-colors"
              >
                {isPastCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                Past ({pastCues.length})
              </button>
              <div className="flex-1 h-px bg-slate-600/40" />
            </div>

            {!isPastCollapsed && (
              <div
                ref={pastScrollRef}
                className="shrink-0 max-h-24 overflow-y-auto annotation-scroll px-3 pb-1 space-y-2"
              >
                {/* Chronological: oldest first, newest last (user scrolls up for older) */}
                {pastCues.map((annotation) => {
                  const cue = annotation.cue;
                  const cols = getColumnsForType(cue.type).filter((c) => c.visible);
                  const showTimestamp = cols.some((c) => c.key === 'timestamp');
                  const isEditing = annotation.id === editingId;
                  const isDeleting = annotation.id === deletingId;
                  const isPastSkipped = skippedIds.has(annotation.id);
                  return (
                    <div
                      key={annotation.id}
                      ref={(el) => {
                        if (getActiveTitle?.id === annotation.id && el) activeTitleRef.current = el;
                      }}
                      onClick={() => { if (!isEditing) onSeek(annotation.timestamp); }}
                      className={`group rounded-lg border cursor-pointer relative transition-opacity ${
                        isPastSkipped
                          ? 'bg-slate-900/20 border-slate-700/20 opacity-25 hover:opacity-50'
                          : 'bg-slate-800/20 border-slate-700/30 opacity-50 hover:opacity-80'
                      }`}
                    >
                      {isEditing ? (
                        <div className="p-3">
                          <CueForm
                            mode="edit"
                            timestamp={annotation.timestamp}
                            initialValues={cue}
                            timeInTitle={annotation.timeInTitle}
                            allAnnotations={annotations}
                            cueTypes={cueTypes}
                            cueTypeFields={cueTypeFields}
                            onSave={(updated, newTimestamp) => { onEdit(annotation.id, updated, newTimestamp); setEditingId(null); }}
                            onCancel={() => setEditingId(null)}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 pr-2 pt-0.5 pb-0.5">
                          {cue.type && (
                            <div
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-white font-bold text-sm uppercase tracking-wide shrink-0 self-stretch"
                              style={{ backgroundColor: getCueColor(cue.type) }}
                            >
                              <span>{getCueTypeDisplayName(cue.type)}</span>
                              {cue.cueNumber && <span className="opacity-80">#{cue.cueNumber}</span>}
                            </div>
                          )}
                          {showTimestamp && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 shrink-0">
                              {formatTime(annotation.timestamp)}
                            </span>
                          )}
                          <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                            {cols.map((col) => {
                              if (col.key === 'type' || col.key === 'cueNumber' || col.key === 'timestamp') return null;
                              const val = resolveColumnValue(col, cue, annotation);
                              if (!val) return null;
                              return <CueChip key={col.key} label={col.label} value={val} />;
                            })}
                          </div>
                          {!isDeleting && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button type="button" onClick={(e) => { e.stopPropagation(); setEditingId(annotation.id); }} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-700 rounded" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(annotation.id); }} className="p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          )}
                          {isDeleting && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-red-400 text-xs">Delete?</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(annotation.id); setDeletingId(null); }} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500">Yes</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600">No</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* "Now" divider */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-1.5">
              <div className="flex-1 h-px bg-slate-600/40" />
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider select-none">Now</span>
              <div className="flex-1 h-px bg-slate-600/40" />
            </div>
          </>
        )}

        {/* Active + Upcoming */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto annotation-scroll p-3 space-y-2"
        >
          {activeUpcomingAnnotations.length === 0 ? (
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
            activeUpcomingAnnotations.map((annotation) => {
            const isSkipped = skippedIds.has(annotation.id);
            const isActive = !isSkipped && isCueActive(annotation, currentTime);
            const cue = annotation.cue;
            const isStandby = !isSkipped && !isActive && isCueStandby(annotation, currentTime);
            const isWarning = !isSkipped && !isActive && !isStandby && isCueWarning(annotation, currentTime);
            const isEditing = annotation.id === editingId;
            const isDeleting = annotation.id === deletingId;
            const isFirstActive = activeCues[0]?.id === annotation.id;
            const isActiveTitle = getActiveTitle?.id === annotation.id;

            return (
              <div
                key={annotation.id}
                ref={(el) => {
                  if (isFirstActive && el) activeRef.current = el;
                  if (isActiveTitle && el) activeTitleRef.current = el;
                }}
                onClick={() => {
                  if (!isEditing) onSeek(annotation.timestamp);
                }}
                className={`group rounded-lg border transition-all duration-200 cursor-pointer relative ${
                    isSkipped
                      ? 'bg-slate-900/40 border-slate-700/30 opacity-40'
                      : isActive
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
                    cueTypeFields={cueTypeFields}
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
                    {isSkipped && (
                      <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-slate-600 text-slate-300 tracking-wider">
                        Skipped
                      </span>
                    )}

                    {distanceView ? (
                      /* ── Distance view: large type+cue# block on left ── */
                      (() => {
                        const cols = getColumnsForType(cue.type).filter((c) => c.visible);
                        const largeMode = getLargeFieldMode(cols, cue.what, cue.when);
                        const showTimestamp = cols.some((c) => c.key === 'timestamp');

                        if (largeMode) {
                          // Large field layout: type badge on left + large/small text
                          return (
                            <div className="flex items-center gap-1.5 pr-2 pt-0.5 pb-0.5">
                              {cue.type && (
                                <div
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-white font-bold text-sm uppercase tracking-wide shrink-0 self-stretch"
                                  style={{ backgroundColor: getCueColor(cue.type) }}
                                >
                                  <span>{getCueTypeDisplayName(cue.type)}</span>
                                  {cue.cueNumber && cols.some((c) => c.key === 'cueNumber') && (
                                    <span className="opacity-80">#{cue.cueNumber}</span>
                                  )}
                                </div>
                              )}
                              <div className="flex flex-col items-center flex-1 min-w-0">
                                <span className="text-lg font-semibold text-slate-100 text-center w-full truncate">
                                  {cue[largeMode.large]}
                                </span>
                                {largeMode.small && (
                                  <span className="text-xs text-slate-400 text-center w-full truncate">
                                    {cue[largeMode.small]}
                                  </span>
                                )}
                              </div>
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
                                style={{ backgroundColor: getCueColor(cue.type) }}
                              >
                                <span>{getCueTypeDisplayName(cue.type)}</span>
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
                        const largeMode = getLargeFieldMode(cols, cue.what, cue.when);
                        const showTimestamp = cols.some((c) => c.key === 'timestamp');

                        if (largeMode) {
                          // Large field compact: overlapping badge top-left + centred large/small text
                          return (
                            <>
                              {cue.type && (
                                <span
                                  className="absolute -top-2 left-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 text-white"
                                  style={{ backgroundColor: getCueColor(cue.type) }}
                                >
                                  {getCueTypeDisplayName(cue.type)}{cue.cueNumber && cols.some((c) => c.key === 'cueNumber') ? ` #${cue.cueNumber}` : ''}
                                </span>
                              )}
                              <div className="flex items-center gap-1.5 pt-2.5 px-3 pb-2">
                                <div className="flex flex-col items-center flex-1 min-w-0">
                                  <span className="text-lg font-semibold text-slate-100 text-center w-full truncate">
                                    {cue[largeMode.large]}
                                  </span>
                                  {largeMode.small && (
                                    <span className="text-xs text-slate-400 text-center w-full truncate">
                                      {cue[largeMode.small]}
                                    </span>
                                  )}
                                </div>
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
                                style={{ backgroundColor: getCueColor(cue.type) }}
                              >
                                {getCueTypeDisplayName(cue.type)}{cue.cueNumber ? ` #${cue.cueNumber}` : ''}
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
          Export
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
