import type { Annotation, AppConfig } from '../types';
import { DEFAULT_CONFIG, DEFAULT_CUE_TYPE_COLORS, RESERVED_CUE_TYPES } from '../types';

const BACKUP_RING_SIZE = 5;
const STORAGE_SCHEMA_VERSION = 1;

interface StorageMeta {
  schemaVersion: number;
  savedAt: string;
  checksum: string;
}

interface BackupEntry {
  payload: string;
  checksum: string;
  savedAt: string;
}

export interface BackupSnapshot {
  slot: number;
  savedAt: string;
  bytes: number;
  itemCount?: number;
}

const recoveryEvents: string[] = [];

function pushRecoveryEvent(message: string): void {
  recoveryEvents.push(message);
}

export function popRecoveryEvents(): string[] {
  const events = [...recoveryEvents];
  recoveryEvents.length = 0;
  return events;
}

// ── Annotation storage ──

function getStorageKey(fileName: string, fileSize: number): string {
  return `annotations:${fileName}:${fileSize}`;
}

export function getAnnotationStorageKey(fileName: string, fileSize: number): string {
  return getStorageKey(fileName, fileSize);
}

function getMetaKey(baseKey: string): string {
  return `${baseKey}:meta`;
}

function getNextKey(baseKey: string): string {
  return `${baseKey}:next`;
}

function getNextMetaKey(baseKey: string): string {
  return `${baseKey}:next:meta`;
}

function getBackupPointerKey(baseKey: string): string {
  return `${baseKey}:backup:pointer`;
}

function getBackupKey(baseKey: string, slot: number): string {
  return `${baseKey}:backup:${slot}`;
}

function computeChecksum(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseMeta(raw: string | null): StorageMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StorageMeta;
    if (typeof parsed?.checksum !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

function isPayloadValid(baseKey: string, payload: string): boolean {
  const meta = parseMeta(localStorage.getItem(getMetaKey(baseKey)));
  if (!meta) return true;
  return computeChecksum(payload) === meta.checksum;
}

function writePrimary(baseKey: string, payload: string): void {
  const savedAt = new Date().toISOString();
  const meta: StorageMeta = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt,
    checksum: computeChecksum(payload),
  };

  localStorage.setItem(getNextKey(baseKey), payload);
  localStorage.setItem(getNextMetaKey(baseKey), JSON.stringify(meta));

  localStorage.setItem(baseKey, payload);
  localStorage.setItem(getMetaKey(baseKey), JSON.stringify(meta));

  localStorage.removeItem(getNextKey(baseKey));
  localStorage.removeItem(getNextMetaKey(baseKey));
}

function addBackup(baseKey: string, payload: string): void {
  const pointerKey = getBackupPointerKey(baseKey);
  const currentRaw = localStorage.getItem(pointerKey);
  const currentPointer = Number.isInteger(Number(currentRaw)) ? Number(currentRaw) : -1;
  const nextPointer = (currentPointer + 1) % BACKUP_RING_SIZE;

  const entry: BackupEntry = {
    payload,
    checksum: computeChecksum(payload),
    savedAt: new Date().toISOString(),
  };

  localStorage.setItem(getBackupKey(baseKey, nextPointer), JSON.stringify(entry));
  localStorage.setItem(pointerKey, String(nextPointer));
}

function tryRecoverFromBackups(baseKey: string): string | null {
  const pointerRaw = localStorage.getItem(getBackupPointerKey(baseKey));
  const pointer = Number(pointerRaw);
  if (!Number.isInteger(pointer) || pointer < 0) return null;

  for (let offset = 0; offset < BACKUP_RING_SIZE; offset += 1) {
    const slot = (pointer - offset + BACKUP_RING_SIZE) % BACKUP_RING_SIZE;
    const entryRaw = localStorage.getItem(getBackupKey(baseKey, slot));
    if (!entryRaw) continue;

    try {
      const parsed = JSON.parse(entryRaw) as BackupEntry;
      if (!parsed?.payload || !parsed?.checksum) continue;
      if (computeChecksum(parsed.payload) !== parsed.checksum) continue;

      writePrimary(baseKey, parsed.payload);
      pushRecoveryEvent(`Recovered data from backup (${new Date(parsed.savedAt).toLocaleString()})`);
      return parsed.payload;
    } catch {
      // ignore invalid backup slot
    }
  }

  return null;
}

function loadPayloadWithRecovery(baseKey: string): string | null {
  const primary = localStorage.getItem(baseKey);

  if (primary && isPayloadValid(baseKey, primary)) {
    return primary;
  }

  const stagedPayload = localStorage.getItem(getNextKey(baseKey));
  const stagedMeta = parseMeta(localStorage.getItem(getNextMetaKey(baseKey)));
  if (stagedPayload && stagedMeta && computeChecksum(stagedPayload) === stagedMeta.checksum) {
    writePrimary(baseKey, stagedPayload);
    pushRecoveryEvent('Recovered data from an interrupted save');
    return stagedPayload;
  }

  return tryRecoverFromBackups(baseKey);
}

function savePayloadWithBackup(baseKey: string, payload: string): void {
  const previous = localStorage.getItem(baseKey);
  if (previous) {
    addBackup(baseKey, previous);
  }
  writePrimary(baseKey, payload);
}

export function clearStorageFamily(baseKey: string): void {
  localStorage.removeItem(baseKey);
  localStorage.removeItem(getMetaKey(baseKey));
  localStorage.removeItem(getNextKey(baseKey));
  localStorage.removeItem(getNextMetaKey(baseKey));
  localStorage.removeItem(getBackupPointerKey(baseKey));
  for (let slot = 0; slot < BACKUP_RING_SIZE; slot += 1) {
    localStorage.removeItem(getBackupKey(baseKey, slot));
  }
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
      standbyTime: cue.standbyTime ?? '',
      warningTime: cue.warningTime ?? '',
    },
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function loadAnnotations(fileName: string, fileSize: number): Annotation[] {
  try {
    const key = getStorageKey(fileName, fileSize);
    const data = loadPayloadWithRecovery(key);
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
    writePrimary(key, JSON.stringify(annotations));
  } catch (e) {
    console.error('Failed to save annotations to localStorage:', e);
    throw new Error('localStorage is full. Please export your annotations and clear some space.');
  }
}

/** Create a backup snapshot of the current cue data, then write the latest. */
export function backupAnnotations(fileName: string, fileSize: number, annotations: Annotation[]): void {
  try {
    const key = getStorageKey(fileName, fileSize);
    savePayloadWithBackup(key, JSON.stringify(annotations));
  } catch (e) {
    console.error('Failed to backup annotations to localStorage:', e);
  }
}

// ── Configuration storage ──

const CONFIG_KEY = 'app-config';

export function getConfigStorageKey(): string {
  return CONFIG_KEY;
}

export function listBackups(baseKey: string): BackupSnapshot[] {
  const snapshots: BackupSnapshot[] = [];
  for (let slot = 0; slot < BACKUP_RING_SIZE; slot += 1) {
    const raw = localStorage.getItem(getBackupKey(baseKey, slot));
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as BackupEntry;
      if (!parsed?.payload || !parsed?.checksum || !parsed?.savedAt) continue;
      if (computeChecksum(parsed.payload) !== parsed.checksum) continue;

      let itemCount: number | undefined;
      try {
        const payloadParsed = JSON.parse(parsed.payload);
        if (Array.isArray(payloadParsed)) itemCount = payloadParsed.length;
      } catch {
        // ignore payload count parsing
      }

      snapshots.push({
        slot,
        savedAt: parsed.savedAt,
        bytes: parsed.payload.length,
        itemCount,
      });
    } catch {
      // ignore invalid backup slot
    }
  }

  snapshots.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return snapshots;
}

export function restoreBackup(baseKey: string, slot: number): boolean {
  const raw = localStorage.getItem(getBackupKey(baseKey, slot));
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as BackupEntry;
    if (!parsed?.payload || !parsed?.checksum) return false;
    if (computeChecksum(parsed.payload) !== parsed.checksum) return false;

    writePrimary(baseKey, parsed.payload);
    pushRecoveryEvent(`Restored backup from ${new Date(parsed.savedAt).toLocaleString()}`);
    return true;
  } catch {
    return false;
  }
}

/** Retrieve the raw JSON payload from a backup slot (used for CSV export). */
export function getBackupPayload(baseKey: string, slot: number): string | null {
  const raw = localStorage.getItem(getBackupKey(baseKey, slot));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BackupEntry;
    if (!parsed?.payload || !parsed?.checksum) return null;
    if (computeChecksum(parsed.payload) !== parsed.checksum) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

export function loadConfig(): AppConfig {
  try {
    const data = loadPayloadWithRecovery(CONFIG_KEY);
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
    // Ensure distanceView exists (migration)
    if (typeof parsed.distanceView !== 'boolean') {
      parsed.distanceView = true;
    }
    // Ensure cueBackupIntervalMinutes exists (migration)
    if (typeof parsed.cueBackupIntervalMinutes !== 'number' || parsed.cueBackupIntervalMinutes <= 0) {
      parsed.cueBackupIntervalMinutes = 5;
    }
    // Ensure standby/warning allow maps exist (migration from old time-based maps)
    if (!parsed.cueTypeAllowStandby || typeof parsed.cueTypeAllowStandby !== 'object') {
      // Migrate: if old cueTypeStandbyTime existed with non-zero values, set allow=true
      const oldStandby = (parsed as any).cueTypeStandbyTime;
      parsed.cueTypeAllowStandby = {};
      if (oldStandby && typeof oldStandby === 'object') {
        for (const [k, v] of Object.entries(oldStandby)) {
          if (typeof v === 'number' && v > 0) parsed.cueTypeAllowStandby[k] = true;
        }
      }
      delete (parsed as any).cueTypeStandbyTime;
    }
    if (!parsed.cueTypeAllowWarning || typeof parsed.cueTypeAllowWarning !== 'object') {
      const oldWarning = (parsed as any).cueTypeWarningTime;
      parsed.cueTypeAllowWarning = {};
      if (oldWarning && typeof oldWarning === 'object') {
        for (const [k, v] of Object.entries(oldWarning)) {
          if (typeof v === 'number' && v > 0) parsed.cueTypeAllowWarning[k] = true;
        }
      }
      delete (parsed as any).cueTypeWarningTime;
    }
    // Clean up legacy keys if still present
    delete (parsed as any).cueTypeStandbyTime;
    delete (parsed as any).cueTypeWarningTime;
    // Ensure virtual columns (timestamp, timeInTitle) are present in visibleColumns
    const virtualKeys = ['timestamp', 'timeInTitle'] as const;
    const virtualLabels: Record<string, string> = { timestamp: 'Timestamp', timeInTitle: 'Time in Title' };
    for (const vk of virtualKeys) {
      if (!parsed.visibleColumns.some((c) => c.key === vk)) {
        parsed.visibleColumns.push({ key: vk, label: virtualLabels[vk], visible: false });
      }
    }
    return parsed;
  } catch {
    return { ...DEFAULT_CONFIG, visibleColumns: DEFAULT_CONFIG.visibleColumns.map((c) => ({ ...c })), cueTypeColumns: {}, cueTypeColors: { ...DEFAULT_CUE_TYPE_COLORS } };
  }
}

export function saveConfig(config: AppConfig): void {
  try {
    writePrimary(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config to localStorage:', e);
  }
}

/** Create a backup snapshot of the current config, then write the latest. */
export function backupConfig(config: AppConfig): void {
  try {
    savePayloadWithBackup(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to backup config to localStorage:', e);
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
        // Ensure standby/warning allow maps exist
        if (!parsed.cueTypeAllowStandby || typeof parsed.cueTypeAllowStandby !== 'object') {
          const oldStandby = (parsed as any).cueTypeStandbyTime;
          parsed.cueTypeAllowStandby = {};
          if (oldStandby && typeof oldStandby === 'object') {
            for (const [k, v] of Object.entries(oldStandby)) {
              if (typeof v === 'number' && v > 0) parsed.cueTypeAllowStandby[k] = true;
            }
          }
        }
        if (!parsed.cueTypeAllowWarning || typeof parsed.cueTypeAllowWarning !== 'object') {
          const oldWarning = (parsed as any).cueTypeWarningTime;
          parsed.cueTypeAllowWarning = {};
          if (oldWarning && typeof oldWarning === 'object') {
            for (const [k, v] of Object.entries(oldWarning)) {
              if (typeof v === 'number' && v > 0) parsed.cueTypeAllowWarning[k] = true;
            }
          }
        }
        delete (parsed as any).cueTypeStandbyTime;
        delete (parsed as any).cueTypeWarningTime;
        resolve(parsed);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to parse config file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read config file'));
    reader.readAsText(file);
  });
}
