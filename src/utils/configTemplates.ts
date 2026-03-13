import { openDB } from 'idb';
import type { ConfigTemplate, TemplateData } from '../types';

const DB_NAME = 'cuetation-db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';
const STORAGE_KEY = 'config-templates';

async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, key);
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

/** Load all saved config templates from IndexedDB. */
export async function loadConfigTemplates(): Promise<ConfigTemplate[]> {
  try {
    const raw = await idbGet<string>(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter to only valid unified templates (ignore legacy category-based templates)
    return parsed.filter(
      (t: unknown): t is ConfigTemplate =>
        typeof t === 'object' && t !== null &&
        'id' in t && 'name' in t && 'data' in t &&
        !('category' in t) // exclude old category-based templates
    );
  } catch {
    return [];
  }
}

/** Save the full list of config templates to IndexedDB. */
export async function saveConfigTemplates(templates: ConfigTemplate[]): Promise<void> {
  await idbSet(STORAGE_KEY, JSON.stringify(templates));
}

/** Save a single template (insert or update by id). */
export async function saveConfigTemplate(template: ConfigTemplate): Promise<void> {
  const templates = await loadConfigTemplates();
  const idx = templates.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    templates[idx] = template;
  } else {
    templates.push(template);
  }
  await saveConfigTemplates(templates);
}

/** Delete a template by id. */
export async function deleteConfigTemplate(id: string): Promise<void> {
  const templates = (await loadConfigTemplates()).filter((t) => t.id !== id);
  await saveConfigTemplates(templates);
}

/** Rename a template. */
export async function renameConfigTemplate(id: string, newName: string): Promise<void> {
  const templates = await loadConfigTemplates();
  const tpl = templates.find((t) => t.id === id);
  if (tpl) {
    tpl.name = newName.trim();
    tpl.updatedAt = new Date().toISOString();
    await saveConfigTemplates(templates);
  }
}

/** Return the template flagged as default, or undefined if none is set. */
export async function getDefaultTemplate(): Promise<ConfigTemplate | undefined> {
  const templates = await loadConfigTemplates();
  return templates.find((t) => t.isDefault);
}

/** Mark a template as the default (clears previous default). Pass null to clear. */
export async function setDefaultTemplate(id: string | null): Promise<void> {
  const templates = await loadConfigTemplates();
  for (const t of templates) {
    t.isDefault = t.id === id ? true : undefined;
  }
  await saveConfigTemplates(templates);
}

/** Export a single template as a JSON download (.cuetation-template.json). */
export function exportTemplateToJSON(template: ConfigTemplate): void {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = template.name.replace(/[^a-z0-9]/gi, '_');
  a.download = `${safeName}.cuetation-template.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Validate that a parsed object looks like a valid TemplateData.
 * Returns true if the essential fields are present.
 */
function isValidTemplateData(data: unknown): data is TemplateData {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    Array.isArray(d.cueTypes) &&
    typeof d.cueTypeColors === 'object' &&
    Array.isArray(d.visibleColumns)
  );
}

/**
 * Import a template from a .cuetation-template.json file.
 * Returns the imported template (already saved to storage).
 * If a template with the same name exists, appends a counter.
 */
export async function importTemplateFromJSON(file: File): Promise<ConfigTemplate> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed || typeof parsed !== 'object' || !parsed.data || !parsed.name) {
    throw new Error('Invalid template file: missing required fields.');
  }
  if (!isValidTemplateData(parsed.data)) {
    throw new Error('Invalid template file: data does not contain expected template fields.');
  }

  const existing = await loadConfigTemplates();
  const existingNames = new Set(existing.map((t) => t.name));

  let name: string = (parsed.name as string).trim();
  if (existingNames.has(name)) {
    let counter = 2;
    while (existingNames.has(`${name} (${counter})`)) counter++;
    name = `${name} (${counter})`;
  }

  const template: ConfigTemplate = {
    id: crypto.randomUUID(),
    name,
    data: parsed.data as TemplateData,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  existing.push(template);
  await saveConfigTemplates(existing);
  return template;
}
