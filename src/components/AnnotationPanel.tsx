import { useState, useRef, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { Search, X, Download, Upload, Clock, Filter, ChevronUp, ChevronDown, ChevronRight, Navigation, Flag } from 'lucide-react';
import { formatTime, parseTime } from '../utils/formatTime';
import { CueForm } from './CueForm';
import { CueContextMenu } from './CueContextMenu';
import { SlideEditPanel } from './SlideEditPanel';
import { ExpandedCueView } from './ExpandedCueView';
import { FlagNotePopover } from './FlagNotePopover';
import type { Annotation, CueFields, ColumnConfig, CueStatus, FieldDefinition } from '../types';
import { RESERVED_CUE_TYPES, LOOP_CUE_TYPE, CUE_STATUS_COLORS, CUE_STATUSES, CUE_STATUS_LABELS } from '../types';
import { useCueGrouping, type GroupedItem } from '../hooks/useCueGrouping';

/** Default colour for LOOP cue type (amber). */
const LOOP_CUE_COLOR = '#f59e0b';

/** Design tokens for Title / Scene headers */
const TITLE_COLOR = '#5c6bc0';
const SCENE_COLOR = '#00acc1';
const TITLE_ROW_HEIGHT = 44;
const SCENE_ROW_HEIGHT = 38;

interface AnnotationPanelProps {
  annotations: Annotation[];
  activeId: string | null;
  skippedIds: Set<string>;
  showSkippedCues: boolean;
  currentTime: number;
  isPlaying: boolean;
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  cueTypeFontColors: Record<string, string>;
  showShortCodes: boolean;
  expandedSearchFilter: boolean;
  onSetExpandedSearchFilter: (expanded: boolean) => void;
  showPastCues: boolean;
  cueSheetView: 'classic' | 'production';
  theatreMode: boolean;
  cueTypeFields: Record<string, string[]>;
  fieldDefinitions?: FieldDefinition[];
  mandatoryFields?: Record<string, string[]>;
  onSeek: (time: number) => void;
  onEdit: (id: string, cue: CueFields, newTimestamp?: number) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: () => void;
  isNoVideoMode?: boolean;
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>;
  cueTypes: string[];
  projectId: string;
  onSetStatus: (id: string, status: CueStatus) => void;
  onSetFlag: (id: string, flagged: boolean, flagNote?: string) => void;
  onDuplicate: (id: string) => Annotation | null;
  onReorderTieGroup: (cueIds: string[]) => void;
}

/** Show a non-empty cue field as a tiny label:value chip */
function CueChip({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap" style={{ background: "var(--bg-panel)" }}>
      <span className="uppercase" style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ color: 'var(--text)' }}>{value}</span>
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
 * Get the What/When primary display text — ordered by column position.
 * Returns { primary, secondary } where primary is the first in column order.
 */
function getWhatWhenDisplay(
  cols: ColumnConfig[],
  cue: CueFields,
): { primary: string; secondary: string } {
  const whatVisible = cols.some((c) => c.key === 'what');
  const whenVisible = cols.some((c) => c.key === 'when');
  const whatIdx = cols.findIndex((c) => c.key === 'what');
  const whenIdx = cols.findIndex((c) => c.key === 'when');
  let primary = '';
  let secondary = '';
  if (whatVisible && cue.what && whenVisible && cue.when) {
    if (whatIdx <= whenIdx) { primary = cue.what; secondary = cue.when; }
    else { primary = cue.when; secondary = cue.what; }
  } else if (whatVisible && cue.what) { primary = cue.what; }
  else if (whenVisible && cue.when) { primary = cue.when; }
  return { primary, secondary };
}

/** Collect extra chip data — all visible columns except type, cueNumber, timestamp, what, when */
function getExtraChips(
  cols: ColumnConfig[],
  cue: CueFields,
  annotation: Annotation,
): { key: string; label: string; value: string }[] {
  return cols
    .filter((c) => !['type', 'cueNumber', 'timestamp', 'what', 'when'].includes(c.key))
    .map((col) => ({ key: col.key, label: col.label, value: resolveColumnValue(col, cue, annotation) }))
    .filter((chip) => chip.value);
}

/**
 * Responsive overflow container for the right portion of a cue row.
 * Hide priority as the panel narrows:
 *  0. Flex spacer compresses naturally
 *  1. Extra field chips are hidden (reverse column order)
 *  2. Timestamp is hidden
 *  3. Flags are hidden last
 */
function OverflowChips({ chips, showTimestamp, timestamp, onSeek, isActive, isStandby, isWarning, flagContent }: {
  chips: { key: string; label: string; value: string }[];
  showTimestamp?: boolean;
  timestamp?: number;
  onSeek?: (ts: number) => void;
  isActive?: boolean;
  isStandby?: boolean;
  isWarning?: boolean;
  flagContent?: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const children = Array.from(container.children) as HTMLElement[];
    // Reset: show all overflow-managed children
    for (const child of children) {
      if (child.dataset.overflow) child.style.display = '';
    }
    const isOverflowing = () => container.scrollWidth > container.clientWidth + 1;
    // Phase 1: hide extra chips from the end (lowest priority)
    if (isOverflowing()) {
      const chipEls = children.filter(c => c.dataset.overflow === 'chip');
      for (let i = chipEls.length - 1; i >= 0; i--) {
        if (!isOverflowing()) break;
        chipEls[i].style.display = 'none';
      }
    }
    // Phase 2: hide timestamp if still overflows
    if (isOverflowing()) {
      const tsEl = children.find(c => c.dataset.overflow === 'ts');
      if (tsEl) tsEl.style.display = 'none';
    }
    // Phase 3: hide flags if still overflows (last resort)
    if (isOverflowing()) {
      const flagEl = children.find(c => c.dataset.overflow === 'flag');
      if (flagEl) flagEl.style.display = 'none';
    }
  }, []);

  // Measure after every render (before paint) to avoid flicker
  useLayoutEffect(() => { recalc(); });

  // Handle container resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(recalc);
    observer.observe(container);
    return () => observer.disconnect();
  }, [recalc]);

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1 flex-1 min-w-0 overflow-hidden"
      style={{ flexWrap: 'nowrap' }}
    >
      {chips.map((chip) => (
        <span key={chip.key} data-overflow="chip" className="inline-flex shrink-0">
          <CueChip label={chip.label} value={chip.value} />
        </span>
      ))}
      <span className="flex-1" />
      {flagContent && (
        <span data-overflow="flag" className="inline-flex items-center gap-1 shrink-0">{flagContent}</span>
      )}
      {showTimestamp && timestamp !== undefined && (
        <span data-overflow="ts" className="inline-flex shrink-0">
          {onSeek ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSeek(timestamp); }}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded transition-colors cursor-pointer shrink-0 ${isActive ? 'bg-emerald-500/30 text-emerald-300' : isStandby ? 'bg-amber-500/30 text-amber-300' : isWarning ? 'bg-blue-500/30 text-blue-300' : 'bg-[var(--bg-panel)] text-[var(--text-mid)] hover:bg-[var(--bg-hover)] hover:text-[var(--text)]'}`}
            >
              {formatTime(timestamp)}
            </button>
          ) : (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded shrink-0" style={{ background: "var(--bg-panel)", color: "var(--text-mid)" }}>
              {formatTime(timestamp)}
            </span>
          )}
        </span>
      )}
    </div>
  );
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
  cueTypeFontColors,
  showShortCodes,
  expandedSearchFilter,
  onSetExpandedSearchFilter,
  showPastCues,
  cueSheetView,
  theatreMode,
  cueTypeFields,
  fieldDefinitions: fieldDefs,
  mandatoryFields,
  onSeek,
  onEdit,
  onDelete,
  onExport,
  onImport,
  isNoVideoMode: _isNoVideoMode,
  visibleColumns,
  cueTypeColumns,
  cueTypes,
  projectId,
  onSetStatus,
  onSetFlag,
  onDuplicate,
  onReorderTieGroup,
}: AnnotationPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [typeFilter, setTypeFilter] = useState<Set<string>>(() => new Set(cueTypes));
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set(CUE_STATUSES));
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isSearchCollapsed, setIsSearchCollapsed] = useState(!expandedSearchFilter);
  const [isPastCollapsed, setIsPastCollapsed] = useState(false);
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState('');
  const [jumpNavOpen, setJumpNavOpen] = useState(false);
  /* F2.11 — expanded cue detail */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  /* Right-click context menu */
  const [contextMenu, setContextMenu] = useState<{ annotation: Annotation; position: { x: number; y: number } } | null>(null);
  /* Flag note popover */
  const [flagNoteTarget, setFlagNoteTarget] = useState<{ id: string; note: string; anchorRect: DOMRect } | null>(null);
  /* F2.11 — slide-in edit panel */
  const [slideEditId, setSlideEditId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pastScrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const inlineEditInputRef = useRef<HTMLInputElement>(null);
  const userScrollTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Grouping hook
  const {
    groupedItems,
    toggleCollapse,
    expandToAnnotation,
    isCollapsed,
    jumpNavItems,
  } = useCueGrouping(annotations, projectId);

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

    // Apply cue type filter — types NOT in the set are hidden (LOOP/TITLE/SCENE always pass)
    if (typeFilter.size < cueTypes.length) {
      anns = anns.filter((a) => a.cue.type === LOOP_CUE_TYPE || a.cue.type === 'TITLE' || a.cue.type === 'SCENE' || typeFilter.has(a.cue.type));
    }

    // Apply status filter
    if (statusFilter.size < CUE_STATUSES.length) {
      anns = anns.filter((a) => statusFilter.has(a.status));
    }

    // Apply flagged-only filter
    if (flaggedOnly) {
      anns = anns.filter((a) => a.flagged);
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
  }, [annotations, searchQuery, typeFilter, statusFilter, flaggedOnly, showSkippedCues, skippedIds]);

  // Split into past / active / upcoming
  const { activeCues, upcomingCues: _upcomingCues, pastCues } = useMemo(() => {
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

  // Auto-scroll to keep active cues at top — only while playing
  useEffect(() => {
    if (!isPlaying) return;
    if (activeRef.current && !isUserScrolling && !editingId && !searchQuery.trim()) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeId, isPlaying, isUserScrolling, editingId, searchQuery]);

  // Auto-expand collapsed sections during standard playback
  useEffect(() => {
    if (!isPlaying || !activeId) return;
    expandToAnnotation(activeId);
  }, [activeId, isPlaying, expandToAnnotation]);

  // Inline name editing handlers
  const startInlineEdit = useCallback((ann: Annotation) => {
    setInlineEditId(ann.id);
    setInlineEditValue(ann.cue.what || '');
    setTimeout(() => inlineEditInputRef.current?.select(), 30);
  }, []);

  const commitInlineEdit = useCallback(() => {
    if (!inlineEditId) return;
    const trimmed = inlineEditValue.trim();
    const ann = annotations.find((a) => a.id === inlineEditId);
    if (ann && trimmed && trimmed !== ann.cue.what) {
      onEdit(inlineEditId, { ...ann.cue, what: trimmed });
    }
    setInlineEditId(null);
    setInlineEditValue('');
  }, [inlineEditId, inlineEditValue, annotations, onEdit]);

  const cancelInlineEdit = useCallback(() => {
    setInlineEditId(null);
    setInlineEditValue('');
  }, []);

  // Jump nav keyboard shortcut (G)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        setJumpNavOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // IDs of past (no longer active) cues — excluded from the main grouped list
  const pastCueIds = useMemo(() => new Set(pastCues.map((a) => a.id)), [pastCues]);

  // Filter grouped items: exclude past cues + apply search/type filter
  const filteredGroupedItems = useMemo((): GroupedItem[] => {
    // Build the set of IDs that should appear in the main list.
    // Start with filteredAnnotations minus past cues.
    const matchingIds = new Set(
      filteredAnnotations.filter((a) => !pastCueIds.has(a.id)).map((a) => a.id),
    );

    // When no search/type filter is active we still need to strip past cues,
    // so we always run the filter pass below.

    return groupedItems.filter((item) => {
      if (item.kind === 'title' || item.kind === 'scene') {
        // Keep a structural row if it itself is active/upcoming OR has
        // any active/upcoming descendants.
        if (matchingIds.has(item.annotation.id)) return true;
        if (item.kind === 'title') {
          return annotations.some(
            (a) =>
              matchingIds.has(a.id) &&
              a.timestamp >= item.annotation.timestamp,
          );
        }
        // Scene — keep if any upcoming/active child exists
        return true;
      }
      // Regular cue — show only if active/upcoming and passes filters
      return matchingIds.has(item.annotation.id);
    });
  }, [groupedItems, filteredAnnotations, annotations, pastCueIds]);

  // Track user scrolling
  const handleScroll = useCallback(() => {
    setIsUserScrolling(true);
    clearTimeout(userScrollTimeout.current);
    userScrollTimeout.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 3000);
  }, []);

  // Auto-scroll past cues container to the bottom so the most recent are visible
  useEffect(() => {
    if (pastScrollRef.current) {
      pastScrollRef.current.scrollTop = pastScrollRef.current.scrollHeight;
    }
  }, [pastCues.length]);

  // ── Tie group detection ──
  // Build a map: annotationId → { tieIds: string[], index: number }
  const tieGroupMap = useMemo(() => {
    const map = new Map<string, { tieIds: string[]; index: number }>();
    // Group non-reserved cues by timestamp
    const byTs = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if ((RESERVED_CUE_TYPES as readonly string[]).includes(a.cue.type)) continue;
      const list = byTs.get(a.timestamp) || [];
      list.push(a);
      byTs.set(a.timestamp, list);
    }
    for (const group of byTs.values()) {
      if (group.length < 2) continue;
      // Sort within tie group by sort_order
      const sorted = [...group].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const ids = sorted.map((a) => a.id);
      sorted.forEach((a, i) => map.set(a.id, { tieIds: ids, index: i }));
    }
    return map;
  }, [annotations]);

  // Auto-collapse expanded cue when active cue changes during playback
  useEffect(() => {
    if (!isPlaying || !activeId) return;
    if (expandedId && expandedId !== activeId) {
      setExpandedId(null);
    }
  }, [activeId, isPlaying, expandedId]);

  // ── Title row renderer ──
  const renderTitleRow = (item: GroupedItem & { kind: 'title' }) => {
    const { annotation, childCount } = item;
    const titleCollapsed = isCollapsed(annotation.id);
    const isInlineEditing = inlineEditId === annotation.id;

    // Count flagged children under this title
    const flaggedCount = annotations.filter(
      (a) =>
        a.flagged &&
        a.cue.type !== 'TITLE' &&
        a.timestamp >= annotation.timestamp &&
        !annotations.some(
          (t) =>
            t.cue.type === 'TITLE' &&
            t.id !== annotation.id &&
            t.timestamp > annotation.timestamp &&
            t.timestamp <= a.timestamp,
        ),
    ).length;

    const handleTitleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ annotation, position: { x: e.clientX, y: e.clientY } });
    };

    // ── Production view title ──
    if (cueSheetView === 'production') {
      return (
        <div
          key={annotation.id}
          id={`cue-${annotation.id}`}
          className="group"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'var(--bg-panel)',
            borderTop: `2px solid ${TITLE_COLOR}`,
            borderBottom: '1px solid var(--border)',
            height: TITLE_ROW_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 14,
            paddingRight: 14,
            cursor: 'pointer',
            gap: 8,
          }}
          onClick={() => toggleCollapse(annotation.id)}
          onContextMenu={handleTitleContextMenu}
        >
          <span style={{ color: 'var(--text-dim)', transition: 'transform 0.2s', transform: titleCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', display: 'inline-flex' }}>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
          <span
            className="font-mono text-[8px] font-medium tracking-wide uppercase shrink-0"
            style={{
              color: TITLE_COLOR,
              background: `${TITLE_COLOR}26`,
              border: `1px solid ${TITLE_COLOR}4d`,
              padding: '2px 5px',
              borderRadius: 2,
            }}
          >
            TITLE
          </span>
          {isInlineEditing ? (
            <input
              ref={inlineEditInputRef}
              type="text"
              value={inlineEditValue}
              onChange={(e) => setInlineEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); } }}
              onBlur={commitInlineEdit}
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-[13px] outline-none bg-transparent px-1 py-0.5 rounded"
              style={{ color: 'var(--text)', border: `1px solid ${TITLE_COLOR}`, minWidth: 80, letterSpacing: '-0.01em' }}
              autoFocus
            />
          ) : (
            <span className="font-semibold text-[13px] truncate flex-1" style={{ color: 'var(--text)', letterSpacing: '-0.01em' }}
              onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(annotation); }}
              title="Double-click to rename">
              {annotation.cue.what || 'Untitled'}
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-mono shrink-0" style={{ color: 'var(--flag)' }} title={`${flaggedCount} flagged cue${flaggedCount > 1 ? 's' : ''}`}>
              <Flag className="w-3 h-3" />{flaggedCount}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSeek(annotation.timestamp); }}
            className="font-mono text-[10px] shrink-0 transition-colors cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; }}
            title="Jump to this time"
          >
            {formatTime(annotation.timestamp)}
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: 10, flexShrink: 0 }}>⌄</span>
        </div>
      );
    }

    // ── Classic view title ──
    return (
      <div
        key={annotation.id}
        id={`cue-${annotation.id}`}

        className="group"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'var(--bg-raised)',
          borderTop: `2px solid ${TITLE_COLOR}`,
          borderBottom: '1px solid var(--border)',
          height: TITLE_ROW_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 12,
          paddingRight: 8,
          cursor: 'pointer',
        }}
        onClick={() => toggleCollapse(annotation.id)}
        onContextMenu={handleTitleContextMenu}
      >
        <span style={{ color: 'var(--text-dim)', marginRight: 6, transition: 'transform 0.2s', transform: titleCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', display: 'inline-flex' }}>
          <ChevronRight className="w-4 h-4" />
        </span>
        <span className="w-2.5 h-2.5 rounded-full shrink-0 mr-2" style={{ background: TITLE_COLOR }} />
        {isInlineEditing ? (
          <input
            ref={inlineEditInputRef}
            type="text"
            value={inlineEditValue}
            onChange={(e) => setInlineEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); } }}
            onBlur={commitInlineEdit}
            onClick={(e) => e.stopPropagation()}
            className="font-semibold text-sm outline-none bg-transparent px-1 py-0.5 rounded"
            style={{ color: 'var(--text)', border: `1px solid ${TITLE_COLOR}`, minWidth: 80 }}
            autoFocus
          />
        ) : (
          <span className="font-semibold text-sm truncate flex-1" style={{ color: 'var(--text)' }}
            onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(annotation); }}
            title="Double-click to rename">
            {annotation.cue.what || 'Untitled'}
          </span>
        )}
        {flaggedCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] font-mono ml-2 shrink-0" style={{ color: 'var(--flag)' }} title={`${flaggedCount} flagged cue${flaggedCount > 1 ? 's' : ''}`}>
            <Flag className="w-3 h-3" />{flaggedCount}
          </span>
        )}
        <span className="font-mono text-[10px] ml-2 shrink-0" style={{ color: 'var(--text-dim)' }}>
          {childCount > 0 && `${childCount}`}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSeek(annotation.timestamp); }}
          className="font-mono text-[10px] ml-2 shrink-0 px-1 py-0.5 rounded transition-colors cursor-pointer"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-dim)'; }}
          title="Jump to this time"
        >
          {formatTime(annotation.timestamp)}
        </button>
      </div>
    );
  };

  // ── Scene row renderer ──
  const renderSceneRow = (item: GroupedItem & { kind: 'scene' }) => {
    const { annotation, childCount, parentTitleId } = item;
    const sceneCollapsed = isCollapsed(annotation.id);
    const isInlineEditing = inlineEditId === annotation.id;
    const stickyTop = parentTitleId ? TITLE_ROW_HEIGHT : 0;

    // Count flagged children under this scene (until next scene or title)
    const sceneIdx = annotations.findIndex((a) => a.id === annotation.id);
    let flaggedCount = 0;
    for (let i = sceneIdx + 1; i < annotations.length; i++) {
      const a = annotations[i];
      if (a.cue.type === 'SCENE' || a.cue.type === 'TITLE') break;
      if (a.flagged) flaggedCount++;
    }

    const handleSceneContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ annotation, position: { x: e.clientX, y: e.clientY } });
    };

    // ── Production view scene ──
    if (cueSheetView === 'production') {
      return (
        <div
          key={annotation.id}
          id={`cue-${annotation.id}`}
          className="group"
          style={{
            position: 'sticky',
            top: stickyTop,
            zIndex: 10,
            background: 'var(--bg-raised)',
            borderBottom: '1px solid var(--border)',
            height: 34,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: parentTitleId ? 26 : 14,
            paddingRight: 14,
            cursor: 'pointer',
            gap: 8,
          }}
          onClick={() => toggleCollapse(annotation.id)}
          onContextMenu={handleSceneContextMenu}
        >
          <span style={{ color: 'var(--text-dim)', transition: 'transform 0.2s', transform: sceneCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', display: 'inline-flex' }}>
            <ChevronRight className="w-3 h-3" />
          </span>
          <span
            className="font-mono text-[8px] font-medium tracking-wide uppercase shrink-0"
            style={{
              color: SCENE_COLOR,
              background: `${SCENE_COLOR}1a`,
              border: `1px solid ${SCENE_COLOR}40`,
              padding: '2px 5px',
              borderRadius: 2,
            }}
          >
            SCENE
          </span>
          {isInlineEditing ? (
            <input
              ref={inlineEditInputRef}
              type="text"
              value={inlineEditValue}
              onChange={(e) => setInlineEditValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); } }}
              onBlur={commitInlineEdit}
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] font-medium outline-none bg-transparent px-1 py-0.5 rounded"
              style={{ color: 'var(--text)', border: `1px solid ${SCENE_COLOR}`, minWidth: 60 }}
              autoFocus
            />
          ) : (
            <span className="text-[11px] font-medium truncate flex-1" style={{ color: 'var(--text-mid)' }}
              onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(annotation); }}
              title="Double-click to rename">
              {annotation.cue.what || 'Untitled Scene'}
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-mono shrink-0" style={{ color: 'var(--flag)' }} title={`${flaggedCount} flagged cue${flaggedCount > 1 ? 's' : ''}`}>
              <Flag className="w-3 h-3" />{flaggedCount}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSeek(annotation.timestamp); }}
            className="font-mono text-[10px] shrink-0 transition-colors cursor-pointer"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; }}
            title="Jump to this time"
          >
            {formatTime(annotation.timestamp)}
          </button>
          <span style={{ color: 'var(--text-dim)', fontSize: 10, flexShrink: 0 }}>⌄</span>
        </div>
      );
    }

    // ── Classic view scene ──
    return (
      <div
        key={annotation.id}
        id={`cue-${annotation.id}`}
        className="group"
        style={{
          position: 'sticky',
          top: stickyTop,
          zIndex: 10,
          background: 'var(--bg-raised)',
          borderBottom: '1px solid var(--border)',
          height: SCENE_ROW_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: parentTitleId ? 28 : 12,
          paddingRight: 8,
          cursor: 'pointer',
        }}
        onClick={() => toggleCollapse(annotation.id)}
        onContextMenu={handleSceneContextMenu}
      >
        <span style={{ color: 'var(--text-dim)', marginRight: 6, transition: 'transform 0.2s', transform: sceneCollapsed ? 'rotate(0deg)' : 'rotate(90deg)', display: 'inline-flex' }}>
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
        <span className="w-2 h-2 rounded-full shrink-0 mr-2" style={{ background: SCENE_COLOR }} />
        {isInlineEditing ? (
          <input
            ref={inlineEditInputRef}
            type="text"
            value={inlineEditValue}
            onChange={(e) => setInlineEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitInlineEdit(); } if (e.key === 'Escape') { e.preventDefault(); cancelInlineEdit(); } }}
            onBlur={commitInlineEdit}
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-medium outline-none bg-transparent px-1 py-0.5 rounded"
            style={{ color: 'var(--text)', border: `1px solid ${SCENE_COLOR}`, minWidth: 60 }}
            autoFocus
          />
        ) : (
          <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--text-mid)' }}
            onDoubleClick={(e) => { e.stopPropagation(); startInlineEdit(annotation); }}
            title="Double-click to rename">
            {annotation.cue.what || 'Untitled Scene'}
          </span>
        )}
        {flaggedCount > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] font-mono ml-2 shrink-0" style={{ color: 'var(--flag)' }} title={`${flaggedCount} flagged cue${flaggedCount > 1 ? 's' : ''}`}>
            <Flag className="w-3 h-3" />{flaggedCount}
          </span>
        )}
        <span className="font-mono text-[10px] ml-2 shrink-0" style={{ color: 'var(--text-dim)' }}>
          {childCount > 0 && `${childCount}`}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSeek(annotation.timestamp); }}
          className="font-mono text-[10px] ml-2 shrink-0 px-1 py-0.5 rounded transition-colors cursor-pointer"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-dim)'; }}
          title="Jump to this time"
        >
          {formatTime(annotation.timestamp)}
        </button>
      </div>
    );
  };

  // ── Regular cue row renderer ──
  const renderCueRow = (item: GroupedItem & { kind: 'cue' }) => {
    const { annotation, indent } = item;
    const cue = annotation.cue;
    const isSkipped = skippedIds.has(annotation.id);
    const isActive = !isSkipped && isCueActive(annotation, currentTime);
    const isStandby = !isSkipped && !isActive && isCueStandby(annotation, currentTime);
    const isWarning = !isSkipped && !isActive && !isStandby && isCueWarning(annotation, currentTime);
    const isEditing = annotation.id === editingId;
    const isDeleting = annotation.id === deletingId;
    const isFirstActive = activeCues[0]?.id === annotation.id;
    const cols = getColumnsForType(cue.type).filter((c) => c.visible);
    const showTimestamp = cols.some((c) => c.key === 'timestamp');
    const { primary: primaryText, secondary: secondaryText } = getWhatWhenDisplay(cols, cue);
    const extraChips = getExtraChips(cols, cue, annotation);
    const indentPx = indent === 'scene' ? 42 : indent === 'title' ? 28 : 8;
    const isExpanded = expandedId === annotation.id;
    const isCut = annotation.status === 'cut';
    const isFlagged = annotation.flagged;
    const statusColor = annotation.status !== 'provisional' ? CUE_STATUS_COLORS[annotation.status] : null;
    const tieInfo = tieGroupMap.get(annotation.id);
    const isTied = !!tieInfo;
    const isFirstInTie = tieInfo?.index === 0;
    const isLastInTie = tieInfo ? tieInfo.index === tieInfo.tieIds.length - 1 : false;

    const handleClick = (e: React.MouseEvent) => {
      if (isEditing) return;
      e.stopPropagation();
      // Toggle expand only — timestamp click handles seeking
      setExpandedId((prev) => prev === annotation.id ? null : annotation.id);
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSlideEditId(annotation.id);
    };

    const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ annotation, position: { x: e.clientX, y: e.clientY } });
    };

    // ── Production view ──
    if (cueSheetView === 'production') {
      const cueColor = getCueColor(cue.type);
      // Left bar colour = live status: warning=blue, standby=amber, active=green
      const leftBarColor = isActive
        ? (theatreMode ? '#009966' : 'var(--green)')
        : isStandby
        ? (theatreMode ? '#ff9900' : 'var(--amber)')
        : isWarning
        ? (theatreMode ? '#0066ff' : 'var(--blue)')
        : 'transparent';
      const prodIndentPx = indent === 'scene' ? 40 : indent === 'title' ? 26 : 14;

      return (
        <div
          key={annotation.id}
          id={`cue-${annotation.id}`}
          ref={(el) => { if (isFirstActive && el) activeRef.current = el; }}
          style={{ borderBottom: '1px solid var(--border)' }}
        >
        <div
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          className="cursor-pointer relative transition-colors duration-100"
          style={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 48,
            paddingLeft: prodIndentPx,
            paddingRight: 14,
            background: isActive ? 'var(--bg-panel)' : undefined,
            opacity: isCut ? 0.3 : isSkipped ? 0.4 : undefined,
          }}
          onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = ''; }}
        >
          {/* Left bar — live status */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: theatreMode ? 4 : 3,
              background: leftBarColor,
              transition: 'background 0.15s',
            }}
          />

          {/* Tie group bracket */}
          {isTied && (
            <div
              style={{
                position: 'absolute',
                left: prodIndentPx - 8,
                top: isFirstInTie ? '50%' : 0,
                bottom: isLastInTie ? '50%' : 0,
                width: 2,
                background: 'var(--text-dim)',
                borderRadius: 1,
              }}
            />
          )}

          {isEditing ? (
            <div className="p-3 flex-1">
              <CueForm
                mode="edit"
                timestamp={annotation.timestamp}
                initialValues={cue}
                timeInTitle={annotation.timeInTitle}
                allAnnotations={annotations}
                cueTypes={cueTypes}
                cueTypeFields={cueTypeFields}
                fieldDefinitions={fieldDefs}
                mandatoryFields={mandatoryFields}
                onSave={(updated, newTimestamp) => { onEdit(annotation.id, updated, newTimestamp); setEditingId(null); }}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <>
              {/* Zone 1: Badge */}
              {cue.type && (() => {
                const fontColor = cueTypeFontColors[cue.type] || cueColor;
                const isShortCode = showShortCodes && !!cueTypeShortCodes[cue.type];
                return (
                <div
                  className="shrink-0 text-center font-mono mr-3"
                  style={{
                    width: 54,
                    padding: '5px 0',
                    borderRadius: 3,
                    border: `1px solid ${cueColor}33`,
                    background: `${cueColor}14`,
                    color: fontColor,
                  }}
                >
                  <div className={`${isShortCode ? (theatreMode ? 'text-[13px] font-semibold' : 'text-[11px] font-semibold') : 'text-[8px] font-medium'} tracking-wide uppercase`} style={{ opacity: isShortCode ? 1 : 0.8 }}>
                    {getCueTypeDisplayName(cue.type)}
                  </div>
                  <div className={`${theatreMode ? 'text-[15px] font-semibold' : 'text-[13px] font-medium'}${isCut ? ' line-through' : ''}`}>
                    {cue.cueNumber || '—'}
                  </div>
                </div>
                );
              })()}

              {/* Zone 2: What / When */}
              {(primaryText || secondaryText) && (
                <div className="shrink-0 flex flex-col justify-center gap-px min-w-0 mr-3 py-1.5 overflow-hidden" style={{ width: 180 }}>
                  {primaryText && (
                    <div className="text-xs font-medium truncate" style={{ color: 'var(--text)', lineHeight: 1.3 }}>
                      {primaryText}
                    </div>
                  )}
                  {secondaryText && (
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-dim)', lineHeight: 1.3 }}>
                      {secondaryText}
                    </div>
                  )}
                </div>
              )}

              {/* Zone 3: Chips */}
              <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0 overflow-hidden py-1.5">
                {extraChips.map((chip) => (
                  <span
                    key={chip.key}
                    className={`inline-flex items-baseline gap-1 font-mono ${theatreMode ? 'text-[11px]' : 'text-[10px]'} shrink-0 whitespace-nowrap`}
                    style={{
                      background: 'var(--bg-panel)',
                      border: `1px solid ${theatreMode ? 'var(--border-hi)' : 'var(--border)'}`,
                      borderRadius: 3,
                      padding: '2px 6px',
                      lineHeight: 1.4,
                    }}
                  >
                    <span className="uppercase text-[9px] tracking-wide" style={{ color: theatreMode ? 'var(--text-mid)' : 'var(--text-dim)' }}>{chip.label}</span>
                    <span style={{ color: 'var(--text-mid)' }}>{chip.value}</span>
                  </span>
                ))}
              </div>

              {/* Zone 4: Right meta — status dot · flag · timecode */}
              <div
                className="shrink-0 flex items-center gap-1.5 ml-3 pl-3"
                style={{ borderLeft: '1px solid var(--border)' }}
              >
                {statusColor && (
                  <span className={`${theatreMode ? 'w-2 h-2' : 'w-1.5 h-1.5'} rounded-full shrink-0`} style={{ background: statusColor }} title={annotation.status} />
                )}
                {isFlagged && (
                  <span title={annotation.flagNote || 'Flagged'} style={{ color: 'var(--flag)', fontSize: theatreMode ? 12 : 10, lineHeight: 1 }}>
                    <Flag className={theatreMode ? 'w-3 h-3' : 'w-2.5 h-2.5'} />
                  </span>
                )}
                {showTimestamp && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSeek(annotation.timestamp); }}
                    className={`font-mono ${theatreMode ? 'text-[11px]' : 'text-[10px]'} tracking-wide shrink-0 whitespace-nowrap transition-colors cursor-pointer`}
                    style={{ color: theatreMode ? 'var(--text-mid)' : 'var(--text-dim)', fontWeight: theatreMode ? 500 : undefined, letterSpacing: theatreMode ? '0.06em' : undefined }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = theatreMode ? 'var(--text-mid)' : 'var(--text-dim)'; }}
                  >
                    {formatTime(annotation.timestamp)}
                  </button>
                )}
              </div>
            </>
          )}

          {/* Delete confirmation */}
          {isDeleting && (
            <div className="flex items-center gap-2 text-sm ml-2">
              <span className="text-red-400 text-xs">Delete?</span>
              <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(annotation.id); setDeletingId(null); }} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500">Yes</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}>No</button>
            </div>
          )}
        </div>

          {/* Expanded detail view */}
          {isExpanded && !isEditing && (
              <ExpandedCueView
                annotation={annotation}
                columns={cols}
                onEdit={() => setSlideEditId(annotation.id)}
              />
          )}
        </div>
      );
    }

    // ── Classic view ──
    return (
      <div
        key={annotation.id}
        id={`cue-${annotation.id}`}
        ref={(el) => { if (isFirstActive && el) activeRef.current = el; }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={`group rounded-lg border transition-all duration-200 cursor-pointer relative ${
          isSkipped ? 'opacity-40'
            : isActive ? 'bg-emerald-900/30 border-emerald-500/60 shadow-sm shadow-emerald-500/10'
            : isStandby ? 'bg-amber-900/20 border-amber-500/50 shadow-sm shadow-amber-500/10'
            : isWarning ? 'bg-blue-900/20 border-blue-500/50 shadow-sm shadow-blue-500/10'
            : 'hover:border-[var(--border-hi)]'
        }`}
        style={{
          background: (isActive || isStandby || isWarning) ? undefined : 'var(--bg-card)',
          borderColor: (isActive || isStandby || isWarning) ? undefined : 'var(--border)',
          marginLeft: indentPx,
          marginRight: 8,
          marginTop: 4,
          marginBottom: 4,
          opacity: isCut ? 0.32 : undefined,
        }}
      >
        {/* Tie group bracket */}
        {isTied && (
          <div
            style={{
              position: 'absolute',
              left: -6,
              top: isFirstInTie ? '50%' : 0,
              bottom: isLastInTie ? '50%' : 0,
              width: 2,
              background: 'var(--text-dim)',
              borderRadius: 1,
            }}
          />
        )}

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
              fieldDefinitions={fieldDefs}
              mandatoryFields={mandatoryFields}
              onSave={(updated, newTimestamp) => { onEdit(annotation.id, updated, newTimestamp); setEditingId(null); }}
              onCancel={() => setEditingId(null)}
            />
          </div>
        ) : (
          <>
            {isActive && <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-emerald-600 text-emerald-100 tracking-wider">Active</span>}
            {isWarning && <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-blue-600 text-blue-100 tracking-wider">Warning</span>}
            {isStandby && <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 bg-amber-600 text-amber-100 tracking-wider">Standby</span>}
            {isSkipped && <span className="absolute -top-2 right-2 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase z-10 tracking-wider" style={{ background: 'var(--bg-hover)', color: 'var(--text-mid)' }}>Skipped</span>}

            {/* Classic view layout */}
            <div className="flex items-center gap-1.5 pr-2 pt-0.5 pb-0.5">
                {cue.type && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-l-lg text-white font-bold text-sm uppercase tracking-wide shrink-0 self-stretch" style={{ backgroundColor: getCueColor(cue.type) }}>
                    <span>{getCueTypeDisplayName(cue.type)}</span>
                    {cue.cueNumber && <span className={`opacity-80${isCut ? ' line-through' : ''}`}>#{cue.cueNumber}</span>}
                  </div>
                )}
                {primaryText && (
                  <div className="flex flex-col justify-center shrink-0 min-w-0 max-w-[50%] ml-4">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{primaryText}</span>
                    {secondaryText && <span className="text-[11px] truncate" style={{ color: 'var(--text-mid)' }}>{secondaryText}</span>}
                  </div>
                )}
                <OverflowChips
                  chips={extraChips}
                  showTimestamp={showTimestamp}
                  timestamp={annotation.timestamp}
                  onSeek={onSeek}
                  isActive={isActive}
                  isStandby={isStandby}
                  isWarning={isWarning}
                  flagContent={(isFlagged || statusColor) ? (
                    <>
                      {isFlagged && (
                        <span title={annotation.flagNote || 'Flagged'} style={{ color: 'var(--flag)' }}>
                          <Flag className="w-3 h-3" />
                        </span>
                      )}
                      {statusColor && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} title={annotation.status} />
                      )}
                    </>
                  ) : undefined}
                />
              </div>

            {isDeleting && (
              <div className="flex items-center gap-2 text-sm px-3 pb-2 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
                <span className="text-red-400 text-xs">Delete this cue?</span>
                <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(annotation.id); setDeletingId(null); }} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500">Yes</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }} onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-hover)')} onMouseLeave={e=>(e.currentTarget.style.background='var(--bg-panel)')}>No</button>
              </div>
            )}

            {/* Expanded detail view */}
            {isExpanded && !isEditing && (
              <ExpandedCueView
                annotation={annotation}
                columns={cols}
                onEdit={() => setSlideEditId(annotation.id)}
              />
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full rounded-lg border" style={{ background: 'var(--bg-raised)', borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text)" }}>
            Cue Sheet
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--bg-panel)", color: "var(--text-mid)" }}>
              {annotations.length} cue{annotations.length !== 1 ? 's' : ''}
              {annotations.filter(a => a.status === 'cut').length > 0 && ` · ${annotations.filter(a => a.status === 'cut').length} cut`}
              {annotations.filter(a => a.flagged).length > 0 && ` · ${annotations.filter(a => a.flagged).length} flagged`}
            </span>
            {jumpNavItems.length > 0 && (
              <button
                type="button"
                onClick={() => setJumpNavOpen((p) => !p)}
                className="p-1 rounded transition-colors" style={{ color: jumpNavOpen ? 'var(--amber)' : 'var(--text-mid)' }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)";e.currentTarget.style.color="var(--text)"}} onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color=jumpNavOpen?'var(--amber)':'var(--text-mid)'}}
                title="Jump navigation (G)"
              >
                <Navigation className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const next = !isSearchCollapsed;
                setIsSearchCollapsed(next);
                onSetExpandedSearchFilter(!next);
              }}
              className="p-1 rounded transition-colors" style={{ color: "var(--text-mid)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)";e.currentTarget.style.color="var(--text)"}} onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color="var(--text-mid)"}}
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-dim)' }} />
              <input
                type="text"
                placeholder="Search cues, types, timestamps..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-sm pl-9 pr-8 py-2 rounded-lg outline-none" style={{ background: "var(--bg-input)", color: "var(--text)", border: "1px solid var(--border)", caretColor: "var(--amber)" }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-dim)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Cue Type Filter */}
            <div className="mt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFilterOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                    typeFilter.size < cueTypes.length
                      ? 'bg-[var(--amber-dim)] text-[var(--amber)]'
                      : 'text-[var(--text-mid)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Filter by Type
                  {typeFilter.size < cueTypes.length && (
                    <span className="text-white text-[10px] font-bold px-1.5 py-0 rounded-full" style={{ background: "var(--amber)" }}>
                      {cueTypes.length - typeFilter.size} hidden
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsStatusFilterOpen((prev) => !prev)}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                    statusFilter.size < CUE_STATUSES.length
                      ? 'bg-violet-500/20 text-violet-400'
                      : 'text-[var(--text-mid)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  Status
                  {statusFilter.size < CUE_STATUSES.length && (
                    <span className="text-white text-[10px] font-bold px-1.5 py-0 rounded-full bg-violet-500">
                      {CUE_STATUSES.length - statusFilter.size} hidden
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setFlaggedOnly((p) => !p)}
                  className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
                    flaggedOnly
                      ? 'bg-[var(--red-dim)] text-red-400'
                      : 'text-[var(--text-mid)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" />
                  Flagged Only
                </button>
              </div>
              {isFilterOpen && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {cueTypes.filter((type) => type !== 'TITLE' && type !== 'SCENE').map((type) => {
                    const isActive = typeFilter.has(type);
                    const color = getCueColor(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleTypeFilter(type)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                          isActive
                            ? ''
                            : 'bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-dim)] line-through hover:text-[var(--text)] hover:border-[var(--border-hi)]'
                        }`}
                        style={isActive ? { background: `${color}33`, borderColor: `${color}80`, color } : undefined}
                      >
                        {type}
                      </button>
                    );
                  })}
                  {typeFilter.size < cueTypes.length && (
                    <button
                      type="button"
                      onClick={() => setTypeFilter(new Set(cueTypes))}
                      className="text-[10px] px-2 py-1 rounded-md transition-colors" style={{ color: "var(--text-dim)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)";e.currentTarget.style.color="var(--text)"}} onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color="var(--text-dim)"}}
                    >
                      Select all
                    </button>
                  )}
                  {typeFilter.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setTypeFilter(new Set())}
                      className="text-[10px] px-2 py-1 rounded-md transition-colors" style={{ color: "var(--text-dim)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)";e.currentTarget.style.color="var(--text)"}} onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color="var(--text-dim)"}}
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
              {/* Status filter dropdown */}
              {isStatusFilterOpen && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {CUE_STATUSES.map((s) => {
                    const isActive = statusFilter.has(s);
                    const color = s === 'provisional' ? 'var(--text-dim)' : CUE_STATUS_COLORS[s];
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          setStatusFilter((prev) => {
                            const next = new Set(prev);
                            if (next.has(s)) next.delete(s); else next.add(s);
                            return next;
                          });
                        }}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border transition-colors ${
                          isActive
                            ? ''
                            : 'bg-[var(--bg-panel)] border-[var(--border)] text-[var(--text-dim)] line-through hover:text-[var(--text)] hover:border-[var(--border-hi)]'
                        }`}
                        style={isActive ? { background: `${color}22`, borderColor: `${color}80`, color } : undefined}
                      >
                        {s === 'provisional' ? '●' : <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: CUE_STATUS_COLORS[s] }} />}
                        {CUE_STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                  {statusFilter.size < CUE_STATUSES.length && (
                    <button
                      type="button"
                      onClick={() => setStatusFilter(new Set(CUE_STATUSES))}
                      className="text-[10px] px-2 py-1 rounded-md transition-colors" style={{ color: "var(--text-dim)" }} onMouseEnter={e=>{e.currentTarget.style.background="var(--bg-hover)";e.currentTarget.style.color="var(--text)"}} onMouseLeave={e=>{e.currentTarget.style.background="";e.currentTarget.style.color="var(--text-dim)"}}
                    >
                      Select all
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

        {/* Jump Navigation Popover */}
        {jumpNavOpen && jumpNavItems.length > 0 && (
          <div className="shrink-0 border-b" style={{ borderColor: 'var(--border)', background: 'var(--bg-panel)', maxHeight: 200, overflowY: 'auto' }}>
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>Jump to</span>
                <button type="button" onClick={() => setJumpNavOpen(false)} className="p-0.5 rounded" style={{ color: 'var(--text-dim)' }}><X className="w-3 h-3" /></button>
              </div>
              <div className="space-y-0.5">
                {jumpNavItems.map((item) => (
                  <button
                    key={item.annotation.id}
                    type="button"
                    onClick={() => {
                      expandToAnnotation(item.annotation.id);
                      onSeek(item.annotation.timestamp);
                      setJumpNavOpen(false);
                      setTimeout(() => {
                        const el = document.getElementById(`cue-${item.annotation.id}`);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 50);
                    }}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-xs"
                    style={{ color: 'var(--text-mid)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
                  >
                    {item.indent && <span style={{ width: 16 }} />}
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: item.kind === 'title' ? TITLE_COLOR : SCENE_COLOR }}
                    />
                    <span className="font-mono text-[10px] shrink-0" style={{ color: 'var(--text-dim)' }}>
                      {formatTime(item.annotation.timestamp)}
                    </span>
                    <span className="truncate">{item.annotation.cue.what || (item.kind === 'title' ? 'Title' : 'Scene')}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Past cues — chronological order, auto-scrolled to bottom so last 2 visible */}
        {!searchQuery.trim() && showPastCues && pastCues.length > 0 && (
          <>
            {/* Past section header with collapse toggle */}
            <div className="shrink-0 flex items-center gap-2 px-3 pt-2 pb-1">
              <button
                type="button"
                onClick={() => setIsPastCollapsed((p) => !p)}
                className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors" style={{ color: "var(--text-dim)" }}
              >
                {isPastCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                Past ({pastCues.length})
              </button>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>

            {!isPastCollapsed && (
              <div
                ref={pastScrollRef}
                className={`shrink-0 max-h-24 overflow-y-auto annotation-scroll ${cueSheetView === 'production' ? 'pb-0' : 'px-3 pb-1 space-y-2'}`}
              >
                {/* Chronological: oldest first, newest last (user scrolls up for older) */}
                {pastCues.map((annotation) => {
                  const cue = annotation.cue;
                  const cols = getColumnsForType(cue.type).filter((c) => c.visible);
                  const showTimestamp = cols.some((c) => c.key === 'timestamp');
                  const { primary: pastPrimary, secondary: pastSecondary } = getWhatWhenDisplay(cols, cue);
                  const pastChips = getExtraChips(cols, cue, annotation);
                  const isEditing = annotation.id === editingId;
                  const isDeleting = annotation.id === deletingId;
                  const isPastSkipped = skippedIds.has(annotation.id);
                  const pastStatusColor = annotation.status !== 'provisional' ? CUE_STATUS_COLORS[annotation.status] : null;
                  const pastIsCut = annotation.status === 'cut';
                  const pastIsFlagged = annotation.flagged;

                  // ── Production view past cue ──
                  if (cueSheetView === 'production') {
                    const cueColor = getCueColor(cue.type);
                    return (
                      <div
                        key={annotation.id}
                        className={`cursor-pointer relative transition-opacity ${
                          isPastSkipped ? 'opacity-20 hover:opacity-40' : 'opacity-40 hover:opacity-70'
                        }`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          minHeight: 40,
                          paddingLeft: 14,
                          paddingRight: 14,
                          borderBottom: '1px solid var(--border)',
                          opacity: pastIsCut ? 0.2 : undefined,
                        }}
                      >
                        {/* Badge */}
                        {cue.type && (
                          <div
                            className="shrink-0 text-center font-mono mr-3"
                            style={{
                              width: 48,
                              padding: '3px 0',
                              borderRadius: 3,
                              border: `1px solid ${cueColor}33`,
                              background: `${cueColor}14`,
                              color: cueColor,
                            }}
                          >
                            <div className="text-[7px] font-medium tracking-wide uppercase" style={{ opacity: 0.8 }}>
                              {getCueTypeDisplayName(cue.type)}
                            </div>
                            <div className={`text-[12px] font-medium${pastIsCut ? ' line-through' : ''}`}>
                              {cue.cueNumber || '—'}
                            </div>
                          </div>
                        )}
                        {/* What/When */}
                        {pastPrimary && (
                          <div className="shrink-0 flex flex-col justify-center gap-px min-w-0 mr-3 overflow-hidden" style={{ width: 140 }}>
                            <div className="text-[11px] font-medium truncate" style={{ color: 'var(--text)' }}>{pastPrimary}</div>
                            {pastSecondary && <div className="text-[10px] truncate" style={{ color: 'var(--text-dim)' }}>{pastSecondary}</div>}
                          </div>
                        )}
                        {/* Chips */}
                        <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0 overflow-hidden">
                          {pastChips.slice(0, 2).map((chip) => (
                            <span key={chip.key} className="inline-flex items-baseline gap-1 font-mono text-[9px] shrink-0 whitespace-nowrap" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 4px' }}>
                              <span className="uppercase text-[8px]" style={{ color: 'var(--text-dim)' }}>{chip.label}</span>
                              <span style={{ color: 'var(--text-mid)' }}>{chip.value}</span>
                            </span>
                          ))}
                        </div>
                        {/* Right meta */}
                        <div className="shrink-0 flex items-center gap-1.5 ml-2 pl-2" style={{ borderLeft: '1px solid var(--border)' }}>
                          {pastStatusColor && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: pastStatusColor }} />}
                          {pastIsFlagged && <span style={{ color: 'var(--flag)', fontSize: 9 }}><Flag className="w-2.5 h-2.5" /></span>}
                          {showTimestamp && <button type="button" onClick={(e) => { e.stopPropagation(); onSeek(annotation.timestamp); }} className="font-mono text-[9px] shrink-0 cursor-pointer hover:text-[var(--text-mid)] transition-colors" style={{ color: 'var(--text-dim)', background: 'none', border: 'none', padding: 0 }}>{formatTime(annotation.timestamp)}</button>}
                        </div>
                      </div>
                    );
                  }

                  // ── Classic view past cue ──
                  return (
                    <div
                      key={annotation.id}

                      className={`group rounded-lg border cursor-pointer relative transition-opacity ${
                        isPastSkipped
                          ? 'opacity-25 hover:opacity-50'
                          : 'opacity-50 hover:opacity-80'
                      }`}
                      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
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
                            fieldDefinitions={fieldDefs}
                            mandatoryFields={mandatoryFields}
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
                          {pastPrimary && (
                            <div className="flex flex-col justify-center shrink-0 min-w-0 max-w-[50%] ml-4">
                              <span className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{pastPrimary}</span>
                              {pastSecondary && <span className="text-[11px] truncate" style={{ color: 'var(--text-mid)' }}>{pastSecondary}</span>}
                            </div>
                          )}
                          <OverflowChips chips={pastChips} showTimestamp={showTimestamp} timestamp={annotation.timestamp} onSeek={onSeek} />
                          {isDeleting && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-red-400 text-xs">Delete?</span>
                              <button type="button" onClick={(e) => { e.stopPropagation(); onDelete(annotation.id); setDeletingId(null); }} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500">Yes</button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setDeletingId(null); }} className="text-xs px-2 py-0.5 rounded" style={{ background: "var(--bg-panel)", color: "var(--text-mid)" }} onMouseEnter={e=>(e.currentTarget.style.background="var(--bg-hover)")} onMouseLeave={e=>(e.currentTarget.style.background="var(--bg-panel)")}>No</button>
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
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
              <span className="text-[9px] font-bold uppercase tracking-wider select-none" style={{ color: "var(--text-dim)" }}>Now</span>
              <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
            </div>
          </>
        )}

        {/* Grouped cue list */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 min-h-0 overflow-y-auto annotation-scroll"
          style={{ position: 'relative' }}
        >
          {filteredGroupedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-dim)' }}>
              {annotations.length === 0 ? (
                <>
                  <Clock className="w-10 h-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium">No cues yet</p>
                  <p className="text-xs mt-1">Press Enter to add your first cue</p>
                </>
              ) : (
                <>
                  <Search className="w-10 h-10 mb-3 opacity-50" />
                  <p className="text-sm font-medium">No matching results</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-0">
              {filteredGroupedItems.map((item) => {
                if (item.kind === 'title') {
                  return renderTitleRow(item);
                }
                if (item.kind === 'scene') {
                  return renderSceneRow(item);
                }
                return renderCueRow(item);
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer actions */}
      <div className="p-3 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
        <button
          type="button"
          onClick={onExport}
          disabled={annotations.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-1 justify-center"
          style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
          onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-panel)'; }}
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <button
          type="button"
          onClick={onImport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors flex-1 justify-center"
          style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
        >
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </button>
      </div>

      {/* ── Overlays ── */}

      {/* Context menu */}
      {contextMenu && (
        <CueContextMenu
          annotation={contextMenu.annotation}
          position={contextMenu.position}
          isTied={!!tieGroupMap.get(contextMenu.annotation.id)}
          isFirstInTie={tieGroupMap.get(contextMenu.annotation.id)?.index === 0}
          isLastInTie={(() => { const t = tieGroupMap.get(contextMenu.annotation.id); return t ? t.index === t.tieIds.length - 1 : true; })()}
          actions={{
            onEdit: () => { setSlideEditId(contextMenu.annotation.id); setContextMenu(null); },
            onDuplicate: () => {
              const dup = onDuplicate(contextMenu.annotation.id);
              if (dup) {
                // Auto-expand section + scroll
                expandToAnnotation(dup.id);
                setExpandedId(dup.id);
                setTimeout(() => {
                  const el = document.getElementById(`cue-${dup.id}`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
              }
              setContextMenu(null);
            },
            onDelete: () => { onDelete(contextMenu.annotation.id); setContextMenu(null); },
            onSetStatus: (status) => { onSetStatus(contextMenu.annotation.id, status); setContextMenu(null); },
            onToggleFlag: () => {
              const ann = contextMenu.annotation;
              if (ann.flagged) {
                onSetFlag(ann.id, false);
                setContextMenu(null);
              } else {
                onSetFlag(ann.id, true);
                setContextMenu(null);
                // Show flag note popover after a tick — anchor near context menu position
                const rect = new DOMRect(contextMenu.position.x, contextMenu.position.y, 0, 0);
                setTimeout(() => setFlagNoteTarget({ id: ann.id, note: '', anchorRect: rect }), 50);
              }
            },
            onEditFlagNote: () => {
              const ann = contextMenu.annotation;
              const rect = new DOMRect(contextMenu.position.x, contextMenu.position.y, 0, 0);
              setFlagNoteTarget({ id: ann.id, note: ann.flagNote || '', anchorRect: rect });
              setContextMenu(null);
            },
            onMoveUp: (() => {
              const t = tieGroupMap.get(contextMenu.annotation.id);
              if (!t || t.index === 0) return undefined;
              return () => {
                const newIds = [...t.tieIds];
                const i = t.index;
                [newIds[i - 1], newIds[i]] = [newIds[i], newIds[i - 1]];
                onReorderTieGroup(newIds);
                setContextMenu(null);
              };
            })(),
            onMoveDown: (() => {
              const t = tieGroupMap.get(contextMenu.annotation.id);
              if (!t || t.index === t.tieIds.length - 1) return undefined;
              return () => {
                const newIds = [...t.tieIds];
                const i = t.index;
                [newIds[i], newIds[i + 1]] = [newIds[i + 1], newIds[i]];
                onReorderTieGroup(newIds);
                setContextMenu(null);
              };
            })(),
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Slide-in edit panel */}
      {slideEditId && (() => {
        const ann = annotations.find((a) => a.id === slideEditId);
        if (!ann) return null;
        return (
          <SlideEditPanel
            annotation={ann}
            allAnnotations={annotations}
            cueTypes={cueTypes}
            cueTypeFields={cueTypeFields}
            fieldDefinitions={fieldDefs}
            mandatoryFields={mandatoryFields}
            onSave={(id, cue, newTimestamp) => { onEdit(id, cue, newTimestamp); setSlideEditId(null); }}
            onClose={() => setSlideEditId(null)}
          />
        );
      })()}

      {/* Flag note popover */}
      {flagNoteTarget && (
        <FlagNotePopover
          initialNote={flagNoteTarget.note}
          anchorRect={flagNoteTarget.anchorRect}
          onSave={(note) => { onSetFlag(flagNoteTarget.id, true, note); setFlagNoteTarget(null); }}
          onClose={() => setFlagNoteTarget(null)}
        />
      )}
    </div>
  );
}
