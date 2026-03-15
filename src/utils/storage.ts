import { openDB, type IDBPDatabase } from 'idb';
import type { Annotation, AppConfig } from '../types';
import { DEFAULT_CONFIG, DEFAULT_CUE_TYPE_COLORS, RESERVED_CUE_TYPES, EDITABLE_FIELD_KEYS, getDefaultFieldsForType, getDefaultColumnsForTitleScene } from '../types';

// ── IndexedDB Setup ──

const DB_NAME = 'cuetation-db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/** Low-level get from IndexedDB. */
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

/** Low-level put to IndexedDB. */
async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

/** Low-level delete from IndexedDB. */
async function idbDelete(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

/** Get all keys from IndexedDB. */
async function idbKeys(): Promise<string[]> {
  const db = await getDB();
  const keys = await db.getAllKeys(STORE_NAME);
  return keys.map(String);
}

// ── Constants ──

const ANNOTATION_RING_SIZE = 10;
const CONFIG_RING_SIZE = 2;
const STORAGE_SCHEMA_VERSION = 1;

function ringSizeForKey(baseKey: string): number {
  return baseKey.startsWith('annotations:') ? ANNOTATION_RING_SIZE : CONFIG_RING_SIZE;
}

// ── Types ──

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

// ── Key helpers ──

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

function parseMeta(raw: string | null | undefined): StorageMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StorageMeta;
    if (typeof parsed?.checksum !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Core read/write (async, IndexedDB) ──

async function isPayloadValid(baseKey: string, payload: string): Promise<boolean> {
  const metaRaw = await idbGet<string>(getMetaKey(baseKey));
  const meta = parseMeta(metaRaw);
  if (!meta) return true;
  return computeChecksum(payload) === meta.checksum;
}

async function writePrimary(baseKey: string, payload: string): Promise<void> {
  const savedAt = new Date().toISOString();
  const meta: StorageMeta = {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    savedAt,
    checksum: computeChecksum(payload),
  };

  // Staged write first
  await idbSet(getNextKey(baseKey), payload);
  await idbSet(getNextMetaKey(baseKey), JSON.stringify(meta));

  // Commit to primary
  await idbSet(baseKey, payload);
  await idbSet(getMetaKey(baseKey), JSON.stringify(meta));

  // Clean up staged
  await idbDelete(getNextKey(baseKey));
  await idbDelete(getNextMetaKey(baseKey));
}

async function addBackup(baseKey: string, payload: string): Promise<void> {
  const ringSize = ringSizeForKey(baseKey);
  const pointerKey = getBackupPointerKey(baseKey);
  const currentRaw = await idbGet<string>(pointerKey);
  const currentPointer = Number.isInteger(Number(currentRaw)) ? Number(currentRaw) : -1;
  const nextPointer = (currentPointer + 1) % ringSize;

  const entry: BackupEntry = {
    payload,
    checksum: computeChecksum(payload),
    savedAt: new Date().toISOString(),
  };

  await idbSet(getBackupKey(baseKey, nextPointer), JSON.stringify(entry));
  await idbSet(pointerKey, String(nextPointer));
}

async function tryRecoverFromBackups(baseKey: string): Promise<string | null> {
  const ringSize = ringSizeForKey(baseKey);
  const pointerRaw = await idbGet<string>(getBackupPointerKey(baseKey));
  const pointer = Number(pointerRaw);
  if (!Number.isInteger(pointer) || pointer < 0) return null;

  for (let offset = 0; offset < ringSize; offset += 1) {
    const slot = (pointer - offset + ringSize) % ringSize;
    const entryRaw = await idbGet<string>(getBackupKey(baseKey, slot));
    if (!entryRaw) continue;

    try {
      const parsed = JSON.parse(entryRaw) as BackupEntry;
      if (!parsed?.payload || !parsed?.checksum) continue;
      if (computeChecksum(parsed.payload) !== parsed.checksum) continue;

      await writePrimary(baseKey, parsed.payload);
      pushRecoveryEvent(`Recovered data from backup (${new Date(parsed.savedAt).toLocaleString()})`);
      return parsed.payload;
    } catch {
      // ignore invalid backup slot
    }
  }

  return null;
}

async function loadPayloadWithRecovery(baseKey: string): Promise<string | null> {
  const primary = await idbGet<string>(baseKey);

  if (primary && await isPayloadValid(baseKey, primary)) {
    return primary;
  }

  const stagedPayload = await idbGet<string>(getNextKey(baseKey));
  const stagedMetaRaw = await idbGet<string>(getNextMetaKey(baseKey));
  const stagedMeta = parseMeta(stagedMetaRaw);
  if (stagedPayload && stagedMeta && computeChecksum(stagedPayload) === stagedMeta.checksum) {
    await writePrimary(baseKey, stagedPayload);
    pushRecoveryEvent('Recovered data from an interrupted save');
    return stagedPayload;
  }

  return tryRecoverFromBackups(baseKey);
}

async function savePayloadWithBackup(baseKey: string, payload: string): Promise<void> {
  const previous = await idbGet<string>(baseKey);
  if (previous) {
    await addBackup(baseKey, previous);
  }
  await writePrimary(baseKey, payload);
}

export async function clearStorageFamily(baseKey: string): Promise<void> {
  await idbDelete(baseKey);
  await idbDelete(getMetaKey(baseKey));
  await idbDelete(getNextKey(baseKey));
  await idbDelete(getNextMetaKey(baseKey));
  await idbDelete(getBackupPointerKey(baseKey));
  const ringSize = ringSizeForKey(baseKey);
  for (let slot = 0; slot < ringSize; slot += 1) {
    await idbDelete(getBackupKey(baseKey, slot));
  }
}

/** Remove only the primary data + meta + staged writes, but keep the backup ring intact. */
export async function clearPrimaryData(baseKey: string): Promise<void> {
  await idbDelete(baseKey);
  await idbDelete(getMetaKey(baseKey));
  await idbDelete(getNextKey(baseKey));
  await idbDelete(getNextMetaKey(baseKey));
}

// ── Annotation migration helper ──

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
      linkCueNumber: cue.linkCueNumber ?? '',
      linkCueId: cue.linkCueId ?? '',
    },
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    status: raw.status || 'provisional',
    flagged: raw.flagged ?? false,
    flagNote: raw.flagNote ?? '',
    sort_order: raw.sort_order ?? 0,
  };
}

// ── Annotation public API (async) ──

export async function loadAnnotations(fileName: string, fileSize: number): Promise<Annotation[]> {
  try {
    const key = getStorageKey(fileName, fileSize);
    const data = await loadPayloadWithRecovery(key);
    if (!data) return [];
    const raw = JSON.parse(data) as any[];
    return raw.map(migrateAnnotation);
  } catch {
    return [];
  }
}

export async function saveAnnotations(fileName: string, fileSize: number, annotations: Annotation[]): Promise<void> {
  try {
    const key = getStorageKey(fileName, fileSize);
    await writePrimary(key, JSON.stringify(annotations));
  } catch (e) {
    console.error('Failed to save annotations:', e);
  }
}

/** Create a backup snapshot of the current cue data, then write the latest. */
export async function backupAnnotations(fileName: string, fileSize: number, annotations: Annotation[]): Promise<void> {
  try {
    const key = getStorageKey(fileName, fileSize);
    await savePayloadWithBackup(key, JSON.stringify(annotations));
  } catch (e) {
    console.error('Failed to backup annotations:', e);
  }
}

// ── Configuration storage ──

const CONFIG_KEY = 'app-config';

export function getConfigStorageKey(): string {
  return CONFIG_KEY;
}

export async function listBackups(baseKey: string): Promise<BackupSnapshot[]> {
  const ringSize = ringSizeForKey(baseKey);
  const snapshots: BackupSnapshot[] = [];
  for (let slot = 0; slot < ringSize; slot += 1) {
    const raw = await idbGet<string>(getBackupKey(baseKey, slot));
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
        // ignore
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

export async function restoreBackup(baseKey: string, slot: number): Promise<boolean> {
  const raw = await idbGet<string>(getBackupKey(baseKey, slot));
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw) as BackupEntry;
    if (!parsed?.payload || !parsed?.checksum) return false;
    if (computeChecksum(parsed.payload) !== parsed.checksum) return false;

    await writePrimary(baseKey, parsed.payload);
    pushRecoveryEvent(`Restored backup from ${new Date(parsed.savedAt).toLocaleString()}`);
    return true;
  } catch {
    return false;
  }
}

/** Retrieve the raw JSON payload from a backup slot. */
export async function getBackupPayload(baseKey: string, slot: number): Promise<string | null> {
  const raw = await idbGet<string>(getBackupKey(baseKey, slot));
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

export async function loadConfig(): Promise<AppConfig> {
  try {
    const data = await loadPayloadWithRecovery(CONFIG_KEY);
    if (!data) return { ...DEFAULT_CONFIG, visibleColumns: DEFAULT_CONFIG.visibleColumns.map((c) => ({ ...c })), cueTypeColumns: {} };
    const parsed = JSON.parse(data) as AppConfig;
    // Ensure all reserved types are present
    for (const rt of RESERVED_CUE_TYPES) {
      if (!parsed.cueTypes.includes(rt)) {
        parsed.cueTypes.unshift(rt);
      }
    }
    if (!parsed.cueTypeColumns) parsed.cueTypeColumns = {};
    // Ensure TITLE/SCENE have default columns if not yet set
    for (const rt of ['TITLE', 'SCENE'] as const) {
      if (!parsed.cueTypeColumns[rt]) {
        parsed.cueTypeColumns[rt] = getDefaultColumnsForTitleScene();
      }
    }
    if (!parsed.cueTypeColors || typeof parsed.cueTypeColors !== 'object') parsed.cueTypeColors = { ...DEFAULT_CUE_TYPE_COLORS };
    if (typeof parsed.distanceView !== 'boolean') parsed.distanceView = true;
    if (typeof parsed.cueBackupIntervalMinutes !== 'number' || parsed.cueBackupIntervalMinutes <= 0) parsed.cueBackupIntervalMinutes = 5;
    if (typeof parsed.showVideoTimecode !== 'boolean') parsed.showVideoTimecode = false;
    if (!parsed.videoTimecodePosition || typeof parsed.videoTimecodePosition !== 'object') parsed.videoTimecodePosition = { x: 2, y: 4 };
    // Standby/warning allow maps
    if (!parsed.cueTypeAllowStandby || typeof parsed.cueTypeAllowStandby !== 'object') {
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
    delete (parsed as any).cueTypeStandbyTime;
    delete (parsed as any).cueTypeWarningTime;
    // Migrate cueTypeFields
    if (!parsed.cueTypeFields || typeof parsed.cueTypeFields !== 'object') {
      parsed.cueTypeFields = {};
      for (const cueType of parsed.cueTypes) {
        const defaults = getDefaultFieldsForType(cueType);
        if ((RESERVED_CUE_TYPES as readonly string[]).includes(cueType)) {
          parsed.cueTypeFields[cueType] = defaults;
        } else {
          const fields = [...EDITABLE_FIELD_KEYS];
          if (!parsed.cueTypeAllowStandby?.[cueType]) {
            const idx = fields.indexOf('standbyTime');
            if (idx >= 0) fields.splice(idx, 1);
          }
          if (!parsed.cueTypeAllowWarning?.[cueType]) {
            const idx = fields.indexOf('warningTime');
            if (idx >= 0) fields.splice(idx, 1);
          }
          parsed.cueTypeFields[cueType] = fields;
        }
      }
    }
    if (!parsed.cueTypeShortCodes || typeof parsed.cueTypeShortCodes !== 'object') parsed.cueTypeShortCodes = {};
    if (!parsed.cueTypeFontColors || typeof parsed.cueTypeFontColors !== 'object') parsed.cueTypeFontColors = {};
    if (typeof parsed.showShortCodes !== 'boolean') parsed.showShortCodes = false;
    if (typeof parsed.expandedSearchFilter !== 'boolean') parsed.expandedSearchFilter = true;
    if (typeof parsed.showPastCues !== 'boolean') parsed.showPastCues = true;
    if (typeof parsed.showSkippedCues !== 'boolean') parsed.showSkippedCues = true;
    // Ensure virtual columns are present
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

export async function saveConfig(config: AppConfig): Promise<void> {
  try {
    await writePrimary(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config:', e);
  }
}

export async function backupConfig(config: AppConfig): Promise<void> {
  try {
    await savePayloadWithBackup(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to backup config:', e);
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
        for (const rt of RESERVED_CUE_TYPES) {
          if (!parsed.cueTypes.includes(rt)) {
            parsed.cueTypes.unshift(rt);
          }
        }
        if (!parsed.cueTypeColumns || typeof parsed.cueTypeColumns !== 'object') parsed.cueTypeColumns = {};
        if (!parsed.cueTypeColors || typeof parsed.cueTypeColors !== 'object') parsed.cueTypeColors = { ...DEFAULT_CUE_TYPE_COLORS };
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

// ── Per-video backup discovery ──

export interface VideoFileInfo {
  fileName: string;
  fileSize: number;
  storageKey: string;
}

export async function listVideoFilesWithBackups(): Promise<VideoFileInfo[]> {
  const seen = new Map<string, VideoFileInfo>();
  const prefix = 'annotations:';

  const allKeys = await idbKeys();
  for (const key of allKeys) {
    if (!key.startsWith(prefix)) continue;

    const stripped = key
      .replace(/:meta$/, '')
      .replace(/:next:meta$/, '')
      .replace(/:next$/, '')
      .replace(/:backup:pointer$/, '')
      .replace(/:backup:\d+$/, '');

    if (seen.has(stripped)) continue;

    const withoutPrefix = stripped.slice(prefix.length);
    const lastColon = withoutPrefix.lastIndexOf(':');
    if (lastColon === -1) continue;

    const fileName = withoutPrefix.slice(0, lastColon);
    const fileSize = Number(withoutPrefix.slice(lastColon + 1));
    if (!fileName || isNaN(fileSize)) continue;

    const hasBackup = (await listBackups(stripped)).length > 0;
    if (!hasBackup) continue;

    seen.set(stripped, { fileName, fileSize, storageKey: stripped });
  }

  return [...seen.values()].sort((a, b) => a.fileName.localeCompare(b.fileName));
}

export async function deleteVideoBackups(fileName: string, fileSize: number): Promise<void> {
  const baseKey = getStorageKey(fileName, fileSize);
  const ringSize = ringSizeForKey(baseKey);
  await idbDelete(getBackupPointerKey(baseKey));
  for (let slot = 0; slot < ringSize; slot += 1) {
    await idbDelete(getBackupKey(baseKey, slot));
  }
  await idbDelete(getNextKey(baseKey));
  await idbDelete(getNextMetaKey(baseKey));
  const primary = await idbGet<string>(baseKey);
  let isEmpty = true;
  if (primary) {
    try {
      const parsed = JSON.parse(primary);
      if (Array.isArray(parsed) && parsed.length > 0) isEmpty = false;
    } catch { /* treat as empty */ }
  }
  if (isEmpty) {
    await idbDelete(baseKey);
    await idbDelete(getMetaKey(baseKey));
  }
}

// ── Utility helpers ──

export async function hasAnnotationData(fileName: string, fileSize: number): Promise<{ exists: boolean; count: number }> {
  const key = getStorageKey(fileName, fileSize);
  const raw = await idbGet<string>(key);
  if (!raw) return { exists: false, count: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return { exists: true, count: parsed.length };
  } catch { /* ignore */ }
  return { exists: false, count: 0 };
}

export async function migrateNoVideoAnnotations(toFileName: string, toFileSize: number): Promise<number> {
  const noVideoKey = getStorageKey('no-video', 0);
  const raw = await idbGet<string>(noVideoKey);
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;
    const newKey = getStorageKey(toFileName, toFileSize);
    await idbSet(newKey, raw);
    await idbDelete(noVideoKey);
    await idbDelete(getMetaKey(noVideoKey));
    return parsed.length;
  } catch {
    return 0;
  }
}

export async function clearAllIDBData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  await tx.store.clear();
  await tx.done;
}
