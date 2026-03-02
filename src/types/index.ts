// Reserved cue types that always exist and cannot be deleted
export const RESERVED_CUE_TYPES = ['TITLE', 'SCENE'] as const;

// Default cue types shipped with the app
export const DEFAULT_CUE_TYPES = [
  'TITLE',
  'SCENE',
  'LX',    // Lighting
  'SND',   // Sound
  'VID',   // Video/Projections
  'FLY',   // Fly/Rigging
  'SPOT',  // Followspot
  'RAIL',  // Deck/Rail
  'PYRO',  // Pyro/SFX
  'OTHER',
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
}

export const CUE_FIELD_KEYS: (keyof CueFields)[] = [
  'type', 'cueNumber', 'oldCueNumber', 'cueTime', 'duration',
  'delay', 'follow', 'hang', 'block', 'assert',
  'when', 'what', 'presets', 'colourPalette',
  'spotFrame', 'spotIntensity', 'spotTime',
  'cueSheetNotes', 'final', 'dress', 'tech', 'cueingNotes',
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

export interface ColumnConfig {
  key: keyof CueFields;
  label: string;
  visible: boolean;
}

export interface AppConfig {
  cueTypes: string[];
  cueTypeColors: Record<string, string>; // hex colour per cue type
  visibleColumns: ColumnConfig[];
  cueTypeColumns: Record<string, ColumnConfig[]>; // per-cue-type column overrides
}

/** Default colours for the built-in cue types */
export const DEFAULT_CUE_TYPE_COLORS: Record<string, string> = {
  TITLE:  '#6366f1', // indigo
  SCENE:  '#0ea5e9', // sky
  LX:     '#f59e0b', // amber
  SND:    '#3b82f6', // blue
  VID:    '#8b5cf6', // violet
  FLY:    '#06b6d4', // cyan
  SPOT:   '#ef4444', // red
  RAIL:   '#10b981', // emerald
  PYRO:   '#f97316', // orange
  OTHER:  '#6b7280', // gray
};

export const DEFAULT_VISIBLE_COLUMNS: ColumnConfig[] = CUE_FIELD_KEYS.map((key) => ({
  key,
  label: CUE_FIELD_LABELS[key],
  visible: ['type', 'cueNumber', 'cueTime', 'duration', 'when', 'what'].includes(key),
}));

export const DEFAULT_CONFIG: AppConfig = {
  cueTypes: [...DEFAULT_CUE_TYPES],
  cueTypeColors: { ...DEFAULT_CUE_TYPE_COLORS },
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
  cueTypeColumns: {},
};
