import type { Annotation, AppConfig } from '../types';
import { DEFAULT_CONFIG, DEFAULT_CUE_TYPE_COLORS, RESERVED_CUE_TYPES } from '../types';

// ── Annotation storage ──

function getStorageKey(fileName: string, fileSize: number): string {
  return `annotations:${fileName}:${fileSize}`;
}

/**
 * Migrate old cue field names to new ones.
 * Old: fadeDown, h, b, a, colorPalette
 * New: delay (dropped fadeDown), follow (new), hang, block, assert, colourPalette
 */
function migrateAnnotation(raw: any): Annotation {
  const cue = raw.cue ?? {};
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    timeInTitle: raw.timeInTitle ?? null,
    cue: {
      type: cue.type ?? '',
      cueNumber: cue.cueNumber ?? '',
      oldCueNumber: cue.oldCueNumber ?? '',
      cueTime: cue.cueTime ?? '',
      duration: cue.duration ?? '',
      delay: cue.delay ?? '',
      follow: cue.follow ?? '',
      hang: cue.hang ?? cue.h ?? '',
      block: cue.block ?? cue.b ?? '',
      assert: cue.assert ?? cue.a ?? '',
      when: cue.when ?? '',
      what: cue.what ?? '',
      presets: cue.presets ?? '',
      colourPalette: cue.colourPalette ?? cue.colorPalette ?? '',
      spotFrame: cue.spotFrame ?? '',
      spotIntensity: cue.spotIntensity ?? '',
      spotTime: cue.spotTime ?? '',
      cueSheetNotes: cue.cueSheetNotes ?? '',
      final: cue.final ?? '',
      dress: cue.dress ?? '',
      tech: cue.tech ?? '',
      cueingNotes: cue.cueingNotes ?? '',
    },
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function loadAnnotations(fileName: string, fileSize: number): Annotation[] {
  try {
    const key = getStorageKey(fileName, fileSize);
    const data = localStorage.getItem(key);
    if (!data) return [];
    const raw = JSON.parse(data) as any[];
    return raw.map(migrateAnnotation);
  } catch {
    return [];
  }
}

export function saveAnnotations(fileName: string, fileSize: number, annotations: Annotation[]): void {
  try {
    const key = getStorageKey(fileName, fileSize);
    localStorage.setItem(key, JSON.stringify(annotations));
  } catch (e) {
    console.error('Failed to save annotations to localStorage:', e);
    throw new Error('localStorage is full. Please export your annotations and clear some space.');
  }
}

// ── Configuration storage ──

const CONFIG_KEY = 'app-config';

export function loadConfig(): AppConfig {
  try {
    const data = localStorage.getItem(CONFIG_KEY);
    if (!data) return { ...DEFAULT_CONFIG, visibleColumns: DEFAULT_CONFIG.visibleColumns.map((c) => ({ ...c })), cueTypeColumns: {} };
    const parsed = JSON.parse(data) as AppConfig;
    // Ensure all reserved types are present
    for (const rt of RESERVED_CUE_TYPES) {
      if (!parsed.cueTypes.includes(rt)) {
        parsed.cueTypes.unshift(rt);
      }
    }
    // Ensure cueTypeColumns exists
    if (!parsed.cueTypeColumns) {
      parsed.cueTypeColumns = {};
    }
    // Ensure cueTypeColors exists
    if (!parsed.cueTypeColors || typeof parsed.cueTypeColors !== 'object') {
      parsed.cueTypeColors = { ...DEFAULT_CUE_TYPE_COLORS };
    }
    return parsed;
  } catch {
    return { ...DEFAULT_CONFIG, visibleColumns: DEFAULT_CONFIG.visibleColumns.map((c) => ({ ...c })), cueTypeColumns: {}, cueTypeColors: { ...DEFAULT_CUE_TYPE_COLORS } };
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config to localStorage:', e);
  }
}

export function exportConfigToJSON(config: AppConfig): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'video-notation-config.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function importConfigFromJSON(file: File): Promise<AppConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as AppConfig;
        if (!Array.isArray(parsed.cueTypes) || !Array.isArray(parsed.visibleColumns)) {
          throw new Error('Invalid config format');
        }
        // Ensure all reserved types are present
        for (const rt of RESERVED_CUE_TYPES) {
          if (!parsed.cueTypes.includes(rt)) {
            parsed.cueTypes.unshift(rt);
          }
        }
        // Ensure cueTypeColumns exists
        if (!parsed.cueTypeColumns || typeof parsed.cueTypeColumns !== 'object') {
          parsed.cueTypeColumns = {};
        }
        // Ensure cueTypeColors exists
        if (!parsed.cueTypeColors || typeof parsed.cueTypeColors !== 'object') {
          parsed.cueTypeColors = { ...DEFAULT_CUE_TYPE_COLORS };
        }
        resolve(parsed);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse config file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read config file'));
    reader.readAsText(file);
  });
}
