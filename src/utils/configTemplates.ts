import { openDB } from 'idb';
import type { CueTypesTemplateData, ColumnsTemplateData } from '../components/ConfigurationModal';

export type ConfigTemplateCategory = 'cueTypes' | 'columns' | 'xlsxExport';

/** A generic config template that can hold data for any category. */
export interface ConfigTemplate {
  id: string;
  name: string;
  category: ConfigTemplateCategory;
  data: CueTypesTemplateData | ColumnsTemplateData | unknown;
  createdAt: string;
  updatedAt: string;
}

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
    return parsed as ConfigTemplate[];
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

/** Get templates filtered by category. */
export async function getTemplatesByCategory(category: ConfigTemplateCategory): Promise<ConfigTemplate[]> {
  return (await loadConfigTemplates()).filter((t) => t.category === category);
}

/** Export a single template as a JSON download. */
export function exportTemplateToJSON(template: ConfigTemplate): void {
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `template-${template.name.replace(/[^a-z0-9]/gi, '_')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export all templates as a JSON download. */
export async function exportAllTemplatesToJSON(): Promise<void> {
  const templates = await loadConfigTemplates();
  const blob = new Blob([JSON.stringify(templates, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'all_templates.json';
  a.click();
  URL.revokeObjectURL(url);
}

/** Import templates from a JSON file. Returns the count of imported templates. */
export async function importTemplatesFromJSON(file: File): Promise<{ imported: number; skipped: number }> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  const incoming: ConfigTemplate[] = Array.isArray(parsed) ? parsed : [parsed];
  const existing = await loadConfigTemplates();
  const existingNames = new Set(existing.map((t) => t.name));

  let imported = 0;
  let skipped = 0;

  for (const tpl of incoming) {
    if (!tpl.id || !tpl.name || !tpl.category || !tpl.data) {
      skipped++;
      continue;
    }
    const existingIdx = existing.findIndex((e) => e.id === tpl.id);
    if (existingIdx >= 0) {
      existing[existingIdx] = { ...tpl, updatedAt: new Date().toISOString() };
      imported++;
    } else {
      let name = tpl.name;
      if (existingNames.has(name)) {
        let counter = 2;
        while (existingNames.has(`${name} (${counter})`)) counter++;
        name = `${name} (${counter})`;
      }
      existingNames.add(name);
      existing.push({ ...tpl, id: crypto.randomUUID(), name, updatedAt: new Date().toISOString() });
      imported++;
    }
  }

  await saveConfigTemplates(existing);
  return { imported, skipped };
}
