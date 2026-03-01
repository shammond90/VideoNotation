export const CUE_TYPES = [
  'LX',    // Lighting
  'SND',   // Sound
  'VID',   // Video/Projections
  'FLY',   // Fly/Rigging
  'SPOT',  // Followspot
  'RAIL',  // Deck/Rail
  'PYRO',  // Pyro/SFX
  'OTHER',
] as const;

export type CueType = (typeof CUE_TYPES)[number];

export interface CueFields {
  type: string;           // Department type
  cueNumber: string;      // Cue#
  oldCueNumber: string;   // Old Cue#
  cueTime: string;        // Cue Time (fade up)
  duration: string;       // D
  fadeDown: string;       // F
  h: string;              // H
  b: string;              // B
  a: string;              // A
  when: string;           // When
  what: string;           // What
  presets: string;        // Presets
  colorPalette: string;   // Color Palette
  spotFrame: string;      // Spot Frame
  spotIntensity: string;  // Spot Intensity
  spotTime: string;       // Spot Time
  cueSheetNotes: string;  // Notes from 2026 Cue Sheet
  final: string;          // Final
  dress: string;          // Dress
  tech: string;           // Tech
  cueingNotes: string;    // Cueing Notes
}

export const EMPTY_CUE_FIELDS: CueFields = {
  type: '',
  cueNumber: '',
  oldCueNumber: '',
  cueTime: '',
  duration: '',
  fadeDown: '',
  h: '',
  b: '',
  a: '',
  when: '',
  what: '',
  presets: '',
  colorPalette: '',
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
