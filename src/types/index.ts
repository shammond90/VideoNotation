// Reserved cue types that always exist and cannot be deleted
export const RESERVED_CUE_TYPES = ['TITLE', 'SCENE', 'LOOP'] as const;

// Special system cue type for loop playback — not user-configurable
export const LOOP_CUE_TYPE = 'LOOP';

// Default cue types shipped with the app
export const DEFAULT_CUE_TYPES = [
  'TITLE',
  'SCENE',
  'AUDIO',   // Audio / Sound
  'DECK',    // Deck
  'ENVIRO',  // Environment
  'LIGHTS',  // Lighting
  'PARTS',   // Practicals / Parts
  'RAIL',    // Rail
  'SPOT 1',  // Followspot 1
  'SPOT 2',  // Followspot 2
];

export interface CueFields {
  type: string;              // Department type
  cueNumber: string;         // Cue #
  oldCueNumber: string;      // Old Cue #
  cueTime: string;           // Cue Time (time in seconds)
  duration: string;          // Duration (system-calculated, read-only)
  delay: string;             // Delay
  follow: string;            // Follow
  hang: string;              // Hang
  block: string;             // Block
  assert: string;            // Assert
  when: string;              // When
  what: string;              // What
  presets: string;           // Presets
  colourPalette: string;     // Colour Palette
  spotFrame: string;         // Spot Frame
  spotIntensity: string;     // Spot Intensity
  spotTime: string;          // Spot Time
  cueSheetNotes: string;     // Notes from Previous Cue Sheet
  final: string;             // Final
  dress: string;             // Dress
  tech: string;              // Tech
  cueingNotes: string;       // Cueing Notes
  standbyTime: string;       // Standby time (seconds before cue)
  warningTime: string;       // Warning time (seconds before cue)
  autofollow: string;        // Whether this cue auto-follows another ('true' or '')
  followCueNumber: string;   // The parent cue# this follows (e.g. "105")
  linkCueNumber: string;     // Bidirectional link to another cue# of the same type
  loopTargetTimestamp: string;  // LOOP type: the timestamp (seconds) to jump back to
  loopTargetCueNumber: string;  // LOOP type: the cue# reference for the jump target
}

export const CUE_FIELD_KEYS: (keyof CueFields)[] = [
  'type', 'cueNumber', 'oldCueNumber', 'cueTime', 'duration',
  'delay', 'follow', 'hang', 'block', 'assert',
  'when', 'what', 'presets', 'colourPalette',
  'spotFrame', 'spotIntensity', 'spotTime',
  'cueSheetNotes', 'final', 'dress', 'tech', 'cueingNotes',
  'standbyTime', 'warningTime',
  'autofollow', 'followCueNumber',
  'linkCueNumber',
  'loopTargetTimestamp', 'loopTargetCueNumber',
];

export const CUE_FIELD_LABELS: Record<keyof CueFields, string> = {
  type: 'Type',
  cueNumber: 'Cue #',
  oldCueNumber: 'Old Cue #',
  cueTime: 'Cue Time',
  duration: 'Duration',
  delay: 'Delay',
  follow: 'Follow',
  hang: 'Hang',
  block: 'Block',
  assert: 'Assert',
  when: 'When',
  what: 'What',
  presets: 'Presets',
  colourPalette: 'Colour Palette',
  spotFrame: 'Spot Frame',
  spotIntensity: 'Spot Intensity',
  spotTime: 'Spot Time',
  cueSheetNotes: 'Notes from Previous Cue Sheet',
  final: 'Final',
  dress: 'Dress',
  tech: 'Tech',
  cueingNotes: 'Cueing Notes',
  standbyTime: 'Standby Time',
  warningTime: 'Warning Time',
  autofollow: 'Auto-Follow',
  followCueNumber: 'Follow Cue#',
  linkCueNumber: 'Link Cue#',
  loopTargetTimestamp: 'Loop Target Time',
  loopTargetCueNumber: 'Loop Target Cue#',
};

export const EMPTY_CUE_FIELDS: CueFields = {
  type: '',
  cueNumber: '',
  oldCueNumber: '',
  cueTime: '',
  duration: '',
  delay: '',
  follow: '',
  hang: '',
  block: '',
  assert: '',
  when: '',
  what: '',
  presets: '',
  colourPalette: '',
  spotFrame: '',
  spotIntensity: '',
  spotTime: '',
  cueSheetNotes: '',
  final: '',
  dress: '',
  tech: '',
  cueingNotes: '',
  standbyTime: '',
  warningTime: '',
  autofollow: '',
  followCueNumber: '',
  linkCueNumber: '',
  loopTargetTimestamp: '',
  loopTargetCueNumber: '',
};

export interface Annotation {
  id: string;
  timestamp: number;
  cue: CueFields;
  timeInTitle: number | null; // Computed: current timestamp - previous "Title" cue timestamp
  createdAt: string;
  updatedAt: string;
}

export interface VideoMeta {
  name: string;
  size: number;
  duration: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

// ── Configuration types ──

/** Column key can be a CueFields key OR a virtual display column */
export type ColumnKey = keyof CueFields | 'timestamp' | 'timeInTitle';

export interface ColumnConfig {
  key: ColumnKey;
  label: string;
  visible: boolean;
}

/** Labels for the virtual (non-CueFields) display columns */
export const VIRTUAL_COLUMN_LABELS: Record<string, string> = {
  timestamp: 'Timestamp',
  timeInTitle: 'Time in Title',
};

export interface AppConfig {
  cueTypes: string[];
  cueTypeColors: Record<string, string>; // hex colour per cue type
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>; // per-cue-type column overrides
  distanceView: boolean;
  cueTypeAllowStandby: Record<string, boolean>; // DEPRECATED — migrated into cueTypeFields
  cueTypeAllowWarning: Record<string, boolean>; // DEPRECATED — migrated into cueTypeFields
  cueTypeFields: Record<string, string[]>; // per-cue-type visible form fields (keys from EDITABLE_FIELD_KEYS)
  cueTypeShortCodes: Record<string, string>; // short code for each cue type (e.g., "LX" for Lighting)
  showShortCodes: boolean; // whether to display short codes in cue sheets
  expandedSearchFilter: boolean; // whether search/filter section is expanded in cue sheet
  showPastCues: boolean; // whether to show passed cues greyed out above the current position
  showSkippedCues: boolean; // whether to show skipped (linked-range) cues in the cue sheet
  cueBackupIntervalMinutes: number; // how often (minutes) to create cue backups while active
  showVideoTimecode: boolean; // whether to show timecode overlay on video
  videoTimecodePosition: { x: number; y: number }; // overlay position as percentages (0–100)
}

/**
 * All editable field keys that can be toggled per cue type.
 * Excludes 'type' which is always shown (needed to pick the type).
 */
export const EDITABLE_FIELD_KEYS: string[] = [
  'timestamp', 'timeInTitle',
  'cueNumber', 'oldCueNumber',
  'cueTime', 'duration', 'delay', 'follow',
  'standbyTime', 'warningTime',
  'hang', 'block', 'assert',
  'when', 'what',
  'presets', 'colourPalette',
  'spotFrame', 'spotIntensity', 'spotTime',
  'cueSheetNotes', 'final', 'dress', 'tech', 'cueingNotes',
  'addAutofollow',
  'linkCueNumber',
];

/** Column keys that become available when 'addAutofollow' is in a cue type's fields. */
export const AUTOFOLLOW_COLUMN_KEYS: string[] = ['followCueNumber'];

/** Column keys that become available when 'linkCueNumber' is in a cue type's fields. */
export const LINK_COLUMN_KEYS: string[] = ['linkCueNumber'];

/** Labels for editable field keys (union of CUE_FIELD_LABELS + VIRTUAL_COLUMN_LABELS). */
export const EDITABLE_FIELD_LABELS: Record<string, string> = {
  ...CUE_FIELD_LABELS,
  ...VIRTUAL_COLUMN_LABELS,
  addAutofollow: 'Add Autofollow',
};

/** Default field subset for TITLE / SCENE cue types. */
export const TITLE_SCENE_DEFAULT_FIELDS: string[] = [
  'timestamp', 'timeInTitle',
  'cueNumber', 'oldCueNumber',
  'what', 'when', 'cueingNotes',
];

/** Default field subset for LOOP cue type (minimal — most handled by the LOOP form). */
export const LOOP_DEFAULT_FIELDS: string[] = [
  'timestamp', 'cueNumber', 'what',
];

/** Return the default visible fields for a given cue type. */
export function getDefaultFieldsForType(cueType: string): string[] {
  if (cueType === LOOP_CUE_TYPE) {
    return [...LOOP_DEFAULT_FIELDS];
  }
  if ((RESERVED_CUE_TYPES as readonly string[]).includes(cueType)) {
    return [...TITLE_SCENE_DEFAULT_FIELDS];
  }
  return [...EDITABLE_FIELD_KEYS];
}

/** Default colours for the built-in cue types */
export const DEFAULT_CUE_TYPE_COLORS: Record<string, string> = {
  TITLE:    '#6366f1', // indigo
  SCENE:    '#0ea5e9', // sky
  AUDIO:    '#3b82f6', // blue
  DECK:     '#10b981', // emerald
  ENVIRO:   '#06b6d4', // cyan
  LIGHTS:   '#f59e0b', // amber
  PARTS:    '#8b5cf6', // violet
  RAIL:     '#f97316', // orange
  'SPOT 1': '#ef4444', // red
  'SPOT 2': '#ec4899', // pink
  LOOP:     '#f59e0b', // amber (loop region)
};

export const DEFAULT_VISIBLE_COLUMNS: ColumnConfig[] = [
  // type is always first (index 0)
  { key: 'type', label: CUE_FIELD_LABELS.type, visible: true },
  // timestamp is second (index 1) — controls the timestamp pill on cards
  { key: 'timestamp', label: 'Timestamp', visible: true },
  // Then the rest
  ...CUE_FIELD_KEYS.filter((k) => k !== 'type' && k !== 'standbyTime' && k !== 'warningTime' && k !== 'autofollow' && k !== 'followCueNumber' && k !== 'linkCueNumber').map((key) => ({
    key: key as ColumnKey,
    label: CUE_FIELD_LABELS[key],
    visible: ['cueNumber', 'cueTime', 'duration', 'when', 'what'].includes(key),
  })),
  { key: 'timeInTitle', label: 'Time in Title', visible: false },
  { key: 'followCueNumber' as ColumnKey, label: 'Follow Cue#', visible: false },
  { key: 'linkCueNumber' as ColumnKey, label: 'Link Cue#', visible: false },
];

export const DEFAULT_CONFIG: AppConfig = {
  cueTypes: [...DEFAULT_CUE_TYPES],
  cueTypeColors: { ...DEFAULT_CUE_TYPE_COLORS },
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  cueTypeColumns: {},
  distanceView: true,
  cueTypeAllowStandby: {},
  cueTypeAllowWarning: {},
  cueTypeFields: {},
  cueTypeShortCodes: {},
  showShortCodes: false,
  expandedSearchFilter: true,
  showPastCues: true,
  showSkippedCues: true,
  cueBackupIntervalMinutes: 5,
  showVideoTimecode: false,
  videoTimecodePosition: { x: 2, y: 4 },
};

// ── XLSX Export Template types ──

/** A single column in the export template. Can hold one or more field keys. */
export interface ExportTemplateColumn {
  id: string;              // unique id for drag-and-drop
  fieldKeys: string[];     // one or more CueFields/virtual keys mapped to this column
  name: string;            // display name (auto-generated or user-set)
  customName: boolean;     // true if user typed a custom name (locks auto-naming)
  locked?: boolean;        // true for the 3 mandatory columns (type, cueNumber, timestamp)
}

/** Per-cue-type colour override for the export only. */
export type ExportColorOverrides = Record<string, string>;

/** A saved export template. */
export interface ExportTemplate {
  id: string;
  name: string;
  columns: ExportTemplateColumn[];
  colorOverrides: ExportColorOverrides;
  createdAt: string;
  updatedAt: string;
}

/** The 3 locked columns present on every export. */
export const LOCKED_EXPORT_COLUMNS: ExportTemplateColumn[] = [
  { id: 'locked-type', fieldKeys: ['type'], name: 'Cue Type', customName: true, locked: true },
  { id: 'locked-cueNumber', fieldKeys: ['cueNumber'], name: 'Cue #', customName: true, locked: true },
  { id: 'locked-timestamp', fieldKeys: ['timestamp'], name: 'Timecode', customName: true, locked: true },
];

/**
 * All pool field keys available for export columns.
 * Includes CueFields keys (minus 'type' which is a locked column) plus virtual columns.
 */
export const EXPORT_POOL_FIELDS: { key: string; label: string }[] = [
  // Virtual columns
  { key: 'timeInTitle', label: 'Time in Title' },
  // CueFields (excluding type and cueNumber — those are locked columns)
  ...CUE_FIELD_KEYS
    .filter((k) => k !== 'type' && k !== 'cueNumber')
    .map((k) => ({ key: k, label: CUE_FIELD_LABELS[k] })),
];
