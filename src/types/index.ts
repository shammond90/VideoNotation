// Reserved cue types that always exist and cannot be deleted
export const RESERVED_CUE_TYPES = ['TITLE', 'SCENE'] as const;

// ── Cue Status ──
export type CueStatus = 'provisional' | 'confirmed' | 'tbc' | 'cut';
export const CUE_STATUSES: CueStatus[] = ['provisional', 'confirmed', 'tbc', 'cut'];
export const CUE_STATUS_LABELS: Record<CueStatus, string> = {
  provisional: 'Provisional',
  confirmed: 'Confirmed',
  tbc: 'TBC',
  cut: 'Cut',
};
export const CUE_STATUS_COLORS: Record<CueStatus, string> = {
  provisional: 'transparent',
  confirmed: 'var(--green)',
  tbc: 'var(--yellow)',
  cut: 'var(--red)',
};



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
  linkCueNumber: string;     // Bidirectional link to another cue# of the same type
  linkCueId: string;          // UUID of the linked cue (stable reference)
}

export const CUE_FIELD_KEYS: (keyof CueFields)[] = [
  'type', 'cueNumber', 'oldCueNumber', 'cueTime', 'duration',
  'delay', 'follow', 'hang', 'block', 'assert',
  'when', 'what', 'presets', 'colourPalette',
  'spotFrame', 'spotIntensity', 'spotTime',
  'cueSheetNotes', 'final', 'dress', 'tech', 'cueingNotes',
  'standbyTime', 'warningTime',
  'linkCueNumber',
  'linkCueId',
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
  linkCueNumber: 'Link Cue#',
  linkCueId: 'Link Cue ID',
};

// ── Field Definition System ──

export type FieldTier = 1 | 2 | 3;
export type FieldInputType = 'text' | 'number' | 'checkbox';
export type NumberPrecision = 'integer' | 'decimal';
export type FieldSizeHint = 'small' | 'medium' | 'large';

export interface FieldDefinition {
  key: string;                          // Internal key (camelCase), immutable after creation
  label: string;                        // Display label, user-editable for all tiers
  tier: FieldTier;                      // 1 = system-logic, 2 = default, 3 = custom
  inputType: FieldInputType;            // 'text' or 'number', immutable after creation
  numberPrecision?: NumberPrecision;    // 'integer' or 'decimal' (number fields only)
  sizeHint: FieldSizeHint;             // 'small' | 'medium' | 'large'
  archived: boolean;                    // Soft-deleted (hidden from UI, data preserved)
  defaultLabel?: string;                // Original label for Tier 1/2 (allows reset)
}

/** Tier 1 — System-Logic Fields. Cannot be deleted; type/key immutable; label can be renamed. */
export const TIER1_FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'type', label: 'Type', tier: 1, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Type' },
  { key: 'cueNumber', label: 'Cue #', tier: 1, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Cue #' },
  { key: 'linkCueNumber', label: 'Link Cue#', tier: 1, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Link Cue#' },
  { key: 'linkCueId', label: 'Link Cue ID', tier: 1, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Link Cue ID' },
  { key: 'standbyTime', label: 'Standby Time', tier: 1, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Standby Time' },
  { key: 'warningTime', label: 'Warning Time', tier: 1, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Warning Time' },
];

/** Tier 2 — Default Fields. Can be soft-deleted, renamed, reordered, and toggled per type. */
export const TIER2_FIELD_DEFINITIONS: FieldDefinition[] = [
  { key: 'oldCueNumber', label: 'Old Cue #', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Old Cue #' },
  { key: 'cueTime', label: 'Cue Time', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Cue Time' },
  { key: 'duration', label: 'Duration', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Duration' },
  { key: 'delay', label: 'Delay', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Delay' },
  { key: 'follow', label: 'Follow', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Follow' },
  { key: 'hang', label: 'Hang', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Hang' },
  { key: 'block', label: 'Block', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Block' },
  { key: 'assert', label: 'Assert', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Assert' },
  { key: 'when', label: 'When', tier: 2, inputType: 'text', sizeHint: 'medium', archived: false, defaultLabel: 'When' },
  { key: 'what', label: 'What', tier: 2, inputType: 'text', sizeHint: 'medium', archived: false, defaultLabel: 'What' },
  { key: 'presets', label: 'Presets', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Presets' },
  { key: 'colourPalette', label: 'Colour Palette', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Colour Palette' },
  { key: 'spotFrame', label: 'Spot Frame', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Spot Frame' },
  { key: 'spotIntensity', label: 'Spot Intensity', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Spot Intensity' },
  { key: 'spotTime', label: 'Spot Time', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Spot Time' },
  { key: 'cueSheetNotes', label: 'Notes from Previous Cue Sheet', tier: 2, inputType: 'text', sizeHint: 'large', archived: false, defaultLabel: 'Notes from Previous Cue Sheet' },
  { key: 'final', label: 'Final', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Final' },
  { key: 'dress', label: 'Dress', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Dress' },
  { key: 'tech', label: 'Tech', tier: 2, inputType: 'text', sizeHint: 'small', archived: false, defaultLabel: 'Tech' },
  { key: 'cueingNotes', label: 'Cueing Notes', tier: 2, inputType: 'text', sizeHint: 'large', archived: false, defaultLabel: 'Cueing Notes' },
];

/** Complete default field definitions (Tier 1 + Tier 2). */
export const DEFAULT_FIELD_DEFINITIONS: FieldDefinition[] = [
  ...TIER1_FIELD_DEFINITIONS,
  ...TIER2_FIELD_DEFINITIONS,
];

/** Look up a field label by key, using fieldDefinitions first, falling back to static labels. */
export function getFieldLabel(key: string, fieldDefs?: FieldDefinition[]): string {
  if (fieldDefs) {
    const def = fieldDefs.find((f) => f.key === key);
    if (def) return def.label;
  }
  return CUE_FIELD_LABELS[key as keyof CueFields] ?? VIRTUAL_COLUMN_LABELS[key] ?? key;
}

/** Look up a FieldDefinition by key. */
export function getFieldDef(key: string, fieldDefs?: FieldDefinition[]): FieldDefinition | undefined {
  return fieldDefs?.find((f) => f.key === key);
}

/** Generate a camelCase internal key from a display label. */
export function labelToFieldKey(label: string): string {
  return label
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/\s+/g, '')
    .replace(/^(.)/, (_, c: string) => c.toLowerCase());
}

/** Ensure a key is unique among existing definitions by appending a numeric suffix if needed. */
export function ensureUniqueFieldKey(baseKey: string, existingKeys: Set<string>): string {
  if (!existingKeys.has(baseKey)) return baseKey;
  let i = 2;
  while (existingKeys.has(`${baseKey}${i}`)) i++;
  return `${baseKey}${i}`;
}

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
  linkCueNumber: '',
  linkCueId: '',
};

export interface Annotation {
  id: string;
  timestamp: number;
  cue: CueFields;
  timeInTitle: number | null; // Computed: current timestamp - previous "Title" cue timestamp
  createdAt: string;
  updatedAt: string;
  // F2.13 — Cue Status
  status: CueStatus;
  // F2.14 — Cue Flagging
  flagged: boolean;
  flagNote: string;
  // F2.7 — Sort order within tie groups (cues sharing the same timecode)
  sort_order: number;
}

export interface VideoMeta {
  name: string;
  size: number;
  duration: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  /** Optional technical details shown in a collapsible section (errors only). */
  details?: string;
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

export type CueSheetView = 'classic' | 'production';

// ── Unified Config Template types ──

/**
 * The data payload stored inside a config template.
 * Captures cue types, fields, columns, and view settings — everything
 * a user might want to reuse across projects.
 */

// ── Theme Mode ──
export type ThemeMode = 'standard' | 'bright' | 'dark' | 'theatre';
export const THEME_MODES: ThemeMode[] = ['standard', 'bright', 'dark', 'theatre'];
export const THEME_LABELS: Record<ThemeMode, string> = {
  standard: 'Standard',
  bright: 'Bright',
  dark: 'Dark',
  theatre: 'Theatre',
};
export const THEME_DESCRIPTIONS: Record<ThemeMode, string> = {
  standard: 'Default dark palette',
  bright: 'Light backgrounds for bright environments',
  dark: 'Deeper darks, reduced contrast',
  theatre: 'Pure black, boosted readability',
};

export interface TemplateData {
  cueTypes: string[];
  cueTypeColors: Record<string, string>;
  cueTypeShortCodes: Record<string, string>;
  cueTypeFontColors: Record<string, string>;
  cueTypeFields: Record<string, string[]>;
  mandatoryFields: Record<string, string[]>;
  fieldDefinitions: FieldDefinition[];
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>;
  cueSheetView: CueSheetView;
  theme: ThemeMode;
  showShortCodes: boolean;
  showPastCues: boolean;
  showSkippedCues: boolean;
  distanceView: boolean;
  expandedSearchFilter: boolean;
  showVideoTimecode: boolean;
  videoTimecodePosition: { x: number; y: number };
  autoplayAfterCue: boolean;
  hiddenCueTypes?: string[];
  hiddenFieldKeys?: string[];
  videoBrightness?: number;
  cueTypeHotkeys?: Record<string, string>;
}

/** A saved config template (stored in IndexedDB). */
export interface ConfigTemplate {
  id: string;
  name: string;
  category?: string;
  /** When true this template is used by "Reset Configuration" in the Data tab. */
  isDefault?: boolean;
  data: TemplateData;
  createdAt: string;
  updatedAt: string;
}

/** Extract template-relevant settings from a full AppConfig. */
export function extractTemplateData(config: AppConfig): TemplateData {
  return {
    cueTypes: [...config.cueTypes],
    cueTypeColors: { ...config.cueTypeColors },
    cueTypeShortCodes: { ...config.cueTypeShortCodes },
    cueTypeFontColors: { ...config.cueTypeFontColors },
    cueTypeFields: Object.fromEntries(
      Object.entries(config.cueTypeFields).map(([k, v]) => [k, [...v]])
    ),
    mandatoryFields: Object.fromEntries(
      Object.entries(config.mandatoryFields ?? {}).map(([k, v]) => [k, [...v]])
    ),
    fieldDefinitions: config.fieldDefinitions.map((f) => ({ ...f })),
    visibleColumns: config.visibleColumns.map((c) => ({ ...c })),
    cueTypeColumns: Object.fromEntries(
      Object.entries(config.cueTypeColumns).map(([k, v]) => [k, v.map((c) => ({ ...c }))])
    ),
    cueSheetView: config.cueSheetView,
    theme: config.theme,
    showShortCodes: config.showShortCodes,
    showPastCues: config.showPastCues,
    showSkippedCues: config.showSkippedCues,
    distanceView: config.distanceView,
    expandedSearchFilter: config.expandedSearchFilter,
    showVideoTimecode: config.showVideoTimecode,
    videoTimecodePosition: { ...config.videoTimecodePosition },
    autoplayAfterCue: config.autoplayAfterCue,
    hiddenCueTypes: [...(config.hiddenCueTypes ?? [])],
    hiddenFieldKeys: [...(config.hiddenFieldKeys ?? [])],
    videoBrightness: config.videoBrightness,
    cueTypeHotkeys: { ...(config.cueTypeHotkeys ?? {}) },
  };
}

export interface AppConfig {
  cueTypes: string[];
  cueTypeColors: Record<string, string>; // hex colour per cue type
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>; // per-cue-type column overrides
  distanceView: boolean;
  cueSheetView: CueSheetView; // 'classic' (default) or 'production'
  theme: ThemeMode; // display mode: standard, bright, dark, or theatre
  cueTypeAllowStandby: Record<string, boolean>; // DEPRECATED — migrated into cueTypeFields
  cueTypeAllowWarning: Record<string, boolean>; // DEPRECATED — migrated into cueTypeFields
  cueTypeFields: Record<string, string[]>; // per-cue-type visible form fields (keys from EDITABLE_FIELD_KEYS)
  cueTypeShortCodes: Record<string, string>; // short code for each cue type (e.g., "LX" for Lighting)
  cueTypeFontColors: Record<string, string>; // font colour override for cue type badge in Production view
  showShortCodes: boolean; // whether to display short codes in cue sheets
  expandedSearchFilter: boolean; // whether search/filter section is expanded in cue sheet
  showPastCues: boolean; // whether to show passed cues greyed out above the current position
  showSkippedCues: boolean; // whether to show skipped (linked-range) cues in the cue sheet
  cueBackupIntervalMinutes: number; // how often (minutes) to create cue backups while active
  showVideoTimecode: boolean; // whether to show timecode overlay on video
  videoTimecodePosition: { x: number; y: number }; // overlay position as percentages (0–100)
  autoplayAfterCue: boolean; // whether video resumes playback after saving/cancelling a cue
  fieldDefinitions: FieldDefinition[]; // global field registry (Tier 1 + 2 + 3)
  mandatoryFields: Record<string, string[]>; // per-cue-type mandatory field keys
  hiddenCueTypes: string[]; // cue types hidden from dropdowns, cue sheet, and exports
  hiddenFieldKeys: string[]; // field keys hidden from visible-fields, columns, and exports
  videoBrightness: number; // video brightness filter (0.2–1.8, default 1.0)
  cueTypeHotkeys: Record<string, string>; // modifier+key hotkey per cue type (e.g. { "LIGHTS": "Alt+L" })
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
  'linkCueNumber',
];

/** Column keys that become available when 'linkCueNumber' is in a cue type's fields. */
export const LINK_COLUMN_KEYS: string[] = ['linkCueNumber'];

/** Labels for editable field keys (union of CUE_FIELD_LABELS + VIRTUAL_COLUMN_LABELS). */
export const EDITABLE_FIELD_LABELS: Record<string, string> = {
  ...CUE_FIELD_LABELS,
  ...VIRTUAL_COLUMN_LABELS,
};

/** Default field subset for TITLE / SCENE cue types. */
export const TITLE_SCENE_DEFAULT_FIELDS: string[] = [
  'timestamp', 'timeInTitle',
  'cueNumber', 'oldCueNumber',
  'what', 'when', 'cueingNotes',
];

/** Default visible columns for TITLE / SCENE cue types (only 'what' visible by default). */
export function getDefaultColumnsForTitleScene(): ColumnConfig[] {
  return DEFAULT_VISIBLE_COLUMNS.map((c) => ({
    ...c,
    visible: c.key === 'type' || c.key === 'what',
  }));
}



/** Return the default visible fields for a given cue type. */
export function getDefaultFieldsForType(cueType: string): string[] {
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
};

export const DEFAULT_VISIBLE_COLUMNS: ColumnConfig[] = [
  // type is always first (index 0)
  { key: 'type', label: CUE_FIELD_LABELS.type, visible: true },
  // timestamp is second (index 1) — controls the timestamp pill on cards
  { key: 'timestamp', label: 'Timestamp', visible: true },
  // Then the rest
  ...CUE_FIELD_KEYS.filter((k) => k !== 'type' && k !== 'standbyTime' && k !== 'warningTime' && k !== 'linkCueNumber' && k !== 'linkCueId').map((key) => ({
    key: key as ColumnKey,
    label: CUE_FIELD_LABELS[key],
    visible: ['cueNumber', 'cueTime', 'duration', 'when', 'what'].includes(key),
  })),
  { key: 'timeInTitle', label: 'Time in Title', visible: false },
  { key: 'linkCueNumber' as ColumnKey, label: 'Link Cue#', visible: false },
];

export const DEFAULT_CONFIG: AppConfig = {
  cueTypes: [...DEFAULT_CUE_TYPES],
  cueTypeColors: { ...DEFAULT_CUE_TYPE_COLORS },
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  cueTypeColumns: {},
  distanceView: true,
  cueSheetView: 'classic',
  theme: 'standard',
  cueTypeAllowStandby: {},
  cueTypeAllowWarning: {},
  cueTypeFields: {},
  cueTypeShortCodes: {},
  cueTypeFontColors: {},
  showShortCodes: false,
  expandedSearchFilter: true,
  showPastCues: true,
  showSkippedCues: true,
  cueBackupIntervalMinutes: 5,
  showVideoTimecode: false,
  videoTimecodePosition: { x: 2, y: 4 },
  autoplayAfterCue: false,
  fieldDefinitions: [...DEFAULT_FIELD_DEFINITIONS],
  mandatoryFields: {},
  hiddenCueTypes: [],
  hiddenFieldKeys: [],
  videoBrightness: 1.0,
  cueTypeHotkeys: {},
};

/** The factory-default template. Always available for "Reset to Factory". */
export const FACTORY_DEFAULT_TEMPLATE: ConfigTemplate = {
  id: '__factory__',
  name: 'Cuetation Standard',
  data: extractTemplateData(DEFAULT_CONFIG),
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
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

// ── Project Management types ──

/** Video reference stored with a project. All four fields are either all populated or all null. */
export interface VideoReference {
  video_filename: string | null;
  video_path: string | null;
  video_filesize: number | null;
  video_duration: number | null;
}

/** A project record. Top-level container for a production. */
export interface Project {
  id: string;
  name: string;
  created_at: number; // timestamp in milliseconds
  updated_at: number; // timestamp in milliseconds

  // Optional production metadata
  production_name?: string;
  choreographer?: string;
  venue?: string;
  year?: string;
  notes?: string;

  // Video reference (all or nothing)
  video_filename: string | null;
  video_path: string | null;
  video_filesize: number | null;
  video_duration: number | null;

  // Configuration snapshot
  config_template_id?: string; // informational, not linked after creation
  config: AppConfig;
  columns: ColumnConfig[];
  export_templates: ExportTemplate[];
}
