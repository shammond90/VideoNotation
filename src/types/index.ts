// Reserved cue types that always exist and cannot be deleted
export const RESERVED_CUE_TYPES = ['TITLE', 'SCENE'] as const;

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
}

export const CUE_FIELD_KEYS: (keyof CueFields)[] = [
  'type', 'cueNumber', 'oldCueNumber', 'cueTime', 'duration',
  'delay', 'follow', 'hang', 'block', 'assert',
  'when', 'what', 'presets', 'colourPalette',
  'spotFrame', 'spotIntensity', 'spotTime',
  'cueSheetNotes', 'final', 'dress', 'tech', 'cueingNotes',
  'standbyTime', 'warningTime',
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
  cueTypeAllowStandby: Record<string, boolean>; // whether this cue type supports standby
  cueTypeAllowWarning: Record<string, boolean>; // whether this cue type supports warning
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
  ...CUE_FIELD_KEYS.filter((k) => k !== 'type' && k !== 'standbyTime' && k !== 'warningTime').map((key) => ({
    key: key as ColumnKey,
    label: CUE_FIELD_LABELS[key],
    visible: ['cueNumber', 'cueTime', 'duration', 'when', 'what'].includes(key),
  })),
  { key: 'timeInTitle', label: 'Time in Title', visible: false },
];

export const DEFAULT_CONFIG: AppConfig = {
  cueTypes: [...DEFAULT_CUE_TYPES],
  cueTypeColors: { ...DEFAULT_CUE_TYPE_COLORS },
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  cueTypeColumns: {},
  distanceView: true,
  cueTypeAllowStandby: {},
  cueTypeAllowWarning: {},
};
