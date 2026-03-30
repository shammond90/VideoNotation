import { openDB } from 'idb';
import type { Project, AppConfig, ColumnConfig, Annotation } from '../types/index';
import { DEFAULT_CONFIG, DEFAULT_VISIBLE_COLUMNS } from '../types/index';
import { loadAnnotations, saveAnnotations, saveConfig } from './storage';
import { deleteVideoHandle } from './videoHandleStorage';
import { loadXlsxExportTemplates, saveXlsxExportTemplates } from './configTemplates';
import type { XlsxExportTemplate } from './configTemplates';

const DB_NAME = 'CuetationDB';
const PROJECTS_STORE = 'projects';

/**
 * Get or create the IndexedDB database.
 */
async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
    },
  });
}

/**
 * Generate a unique project ID.
 */
function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a new project with default configuration.
 */
export async function createProject(
  name: string,
  options?: {
    production_name?: string;
    choreographer?: string;
    venue?: string;
    year?: string;
    notes?: string;
    config_template_id?: string;
    config?: AppConfig;
    columns?: ColumnConfig[];
  }
): Promise<Project> {
  const now = Date.now();
  const config = options?.config || { ...DEFAULT_CONFIG };
  const columns = options?.columns || [...DEFAULT_VISIBLE_COLUMNS];

  const project: Project = {
    id: generateProjectId(),
    name,
    created_at: now,
    updated_at: now,
    production_name: options?.production_name,
    choreographer: options?.choreographer,
    venue: options?.venue,
    year: options?.year,
    notes: options?.notes,
    config_template_id: options?.config_template_id,
    config,
    columns,
    export_templates: [],
    // Video reference starts as all-null
    video_filename: null,
    video_path: null,
    video_filesize: null,
    video_duration: null,
    version: 1,
    local_base_version: 0,
    has_local_changes: false,
  };

  const db = await getDB();
  await db.put(PROJECTS_STORE, project);
  return project;
}

/**
 * Load all projects, sorted by updated_at (most recent first).
 */
export async function loadProjects(): Promise<Project[]> {
  const db = await getDB();
  const projects = await db.getAll(PROJECTS_STORE);
  return projects.sort((a, b) => b.updated_at - a.updated_at);
}

/**
 * Load a single project by ID.
 */
export async function loadProject(projectId: string): Promise<Project | undefined> {
  const db = await getDB();
  return db.get(PROJECTS_STORE, projectId);
}

/**
 * Save/update a project.
 */
export async function saveProject(project: Project): Promise<void> {
  project.updated_at = Date.now();
  const db = await getDB();
  await db.put(PROJECTS_STORE, project);
}

/**
 * Delete a project by ID. Also cleans up the stored video handle.
 */
export async function deleteProject(projectId: string): Promise<void> {
  const db = await getDB();
  await db.delete(PROJECTS_STORE, projectId);
  // Clean up any stored video handle
  await deleteVideoHandle(projectId).catch(() => {});
}

/**
 * Delete all projects.
 * Used for Factory Reset to return the app to a clean state.
 */
export async function deleteAllProjects(): Promise<void> {
  const db = await getDB();
  const allProjects = await db.getAll(PROJECTS_STORE);
  // Delete each project (to clean up video handles)
  for (const project of allProjects) {
    await deleteVideoHandle(project.id).catch(() => {});
  }
  // Clear the projects store
  await db.clear(PROJECTS_STORE);
}

/**
 * Update video reference for a project.
 * All four fields are set together, or all set to null.
 */
export async function updateProjectVideo(
  projectId: string,
  videoRef: {
    filename: string;
    path: string;
    filesize: number;
    duration: number;
  } | null
): Promise<void> {
  const project = await loadProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  if (videoRef) {
    project.video_filename = videoRef.filename;
    project.video_path = videoRef.path;
    project.video_filesize = videoRef.filesize;
    project.video_duration = videoRef.duration;
  } else {
    project.video_filename = null;
    project.video_path = null;
    project.video_filesize = null;
    project.video_duration = null;
  }

  project.has_local_changes = true;
  await saveProject(project);
}

/**
 * Update project metadata (production name, venue, etc.).
 */
export async function updateProjectMetadata(
  projectId: string,
  metadata: {
    production_name?: string;
    choreographer?: string;
    venue?: string;
    year?: string;
    notes?: string;
  }
): Promise<void> {
  const project = await loadProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  Object.assign(project, metadata);
  project.has_local_changes = true;
  await saveProject(project);
}

/**
 * Get cue count for a project.
 * Returns the number of annotations stored for this project.
 */
export async function getProjectCueCount(_projectId: string): Promise<number> {
  // Cue count will be tracked when annotations are stored per project.
  // For now returns 0 — will be updated when storage migration is complete.
  return 0;
}

/**
 * Efficiently check if a video file exists at the stored path and matches filesize.
 * Note: This is a best-effort check. Actual file verification happens when user selects a file.
 */
export async function verifyProjectVideo(
  projectId: string
): Promise<{ exists: boolean; filename: string; duration: number } | null> {
  const project = await loadProject(projectId);
  if (!project || !project.video_filename) return null;

  // In browser environment, we cannot directly check file existence.
  // This would need to be handled by the component when attempting to load the video.
  // Return the stored reference for display purposes.
  return {
    exists: true, // Placeholder — actual verification in component
    filename: project.video_filename,
    duration: project.video_duration || 0,
  };
}

/**
 * Update the config and columns stored on a project record.
 * This keeps the IndexedDB project in sync with the live in-memory state.
 */
export async function updateProjectConfig(
  projectId: string,
  config: AppConfig,
  columns?: ColumnConfig[],
  exportTemplates?: Project['export_templates']
): Promise<void> {
  const project = await loadProject(projectId);
  if (!project) return;
  project.config = config;
  if (columns) project.columns = columns;
  if (exportTemplates) project.export_templates = exportTemplates;
  project.has_local_changes = true;
  await saveProject(project);
}

// ── Import / Export ──

/**
 * Export a project to a JSON object suitable for serialization.
 * Accepts an optional liveConfig to override the stored project.config,
 * ensuring the export always reflects the current in-memory state.
 */
export async function exportProjectToJSON(
  project: Project,
  liveConfig?: AppConfig,
): Promise<object> {
  // Collect all annotations for this project
  const annotations: Record<string, Annotation[]> = {};

  // Load video-linked annotations (if project has a video reference)
  if (project.video_filename && project.video_filesize != null) {
    const videoAnnotations = await loadAnnotations(project.video_filename, project.video_filesize);
    if (videoAnnotations.length > 0) {
      annotations[`${project.video_filename}:${project.video_filesize}`] = videoAnnotations;
    }
  }

  // Load no-video annotations (stored under the project ID)
  const noVideoAnnotations = await loadAnnotations(project.id, 0);
  if (noVideoAnnotations.length > 0) {
    annotations[`${project.id}:0`] = noVideoAnnotations;
  }

  const configToExport = liveConfig || project.config;
  const columnsToExport = liveConfig ? (liveConfig.visibleColumns || project.columns) : project.columns;

  // Load global xlsxExport templates to include with the project
  const xlsxTemplates = await loadXlsxExportTemplates();

  return {
    cuetation_version: 1,
    exported_at: new Date().toISOString(),
    project: {
      name: project.name,
      created_at: project.created_at,
      updated_at: project.updated_at,
      production_name: project.production_name,
      choreographer: project.choreographer,
      venue: project.venue,
      year: project.year,
      notes: project.notes,
      video_filename: project.video_filename,
      video_path: project.video_path,
      video_filesize: project.video_filesize,
      video_duration: project.video_duration,
      config_template_id: project.config_template_id,
      config: configToExport,
      columns: columnsToExport,
      export_templates: project.export_templates,
    },
    annotations,
    xlsx_templates: xlsxTemplates,
  };
}

/**
 * Validate and parse an imported JSON file into project data.
 * Returns the parsed project data or throws with a descriptive error.
 */
export function parseImportedProject(json: unknown): ImportedProjectData {
  if (!json || typeof json !== 'object') {
    throw new Error('Invalid file: not a JSON object');
  }

  const data = json as Record<string, unknown>;

  if (data.cuetation_version !== 1) {
    throw new Error('Invalid file: unrecognized Cuetation format or version');
  }

  const proj = data.project as Record<string, unknown> | undefined;
  if (!proj || typeof proj !== 'object') {
    throw new Error('Invalid file: missing project data');
  }

  if (typeof proj.name !== 'string' || proj.name.trim().length === 0) {
    throw new Error('Invalid file: project name is missing');
  }

  const project: Omit<Project, 'id'> = {
    name: proj.name as string,
    created_at: typeof proj.created_at === 'number' ? proj.created_at : Date.now(),
    updated_at: typeof proj.updated_at === 'number' ? proj.updated_at : Date.now(),
    production_name: typeof proj.production_name === 'string' ? proj.production_name : undefined,
    choreographer: typeof proj.choreographer === 'string' ? proj.choreographer : undefined,
    venue: typeof proj.venue === 'string' ? proj.venue : undefined,
    year: typeof proj.year === 'string' ? proj.year : undefined,
    notes: typeof proj.notes === 'string' ? proj.notes : undefined,
    video_filename: typeof proj.video_filename === 'string' ? proj.video_filename : null,
    video_path: typeof proj.video_path === 'string' ? proj.video_path : null,
    video_filesize: typeof proj.video_filesize === 'number' ? proj.video_filesize : null,
    video_duration: typeof proj.video_duration === 'number' ? proj.video_duration : null,
    config_template_id: typeof proj.config_template_id === 'string' ? proj.config_template_id : undefined,
    config: (proj.config && typeof proj.config === 'object' ? proj.config : { ...DEFAULT_CONFIG }) as AppConfig,
    columns: (Array.isArray(proj.columns) ? proj.columns : [...DEFAULT_VISIBLE_COLUMNS]) as ColumnConfig[],
    export_templates: (Array.isArray(proj.export_templates) ? proj.export_templates : []) as Project['export_templates'],
    version: typeof proj.version === 'number' ? proj.version : 1,
    local_base_version: typeof proj.local_base_version === 'number' ? proj.local_base_version : 0,
    has_local_changes: typeof proj.has_local_changes === 'boolean' ? proj.has_local_changes : false,
  };

  // Backward-compat: migrate theatreMode boolean → theme enum in imported config
  if (project.config && !('theme' in project.config) || typeof (project.config as any).theme !== 'string') {
    const legacy = (project.config as any).theatreMode;
    (project.config as any).theme = legacy === true ? 'theatre' : 'standard';
  }

  // Extract annotations if present
  const annotations = (data.annotations && typeof data.annotations === 'object' && !Array.isArray(data.annotations))
    ? data.annotations as Record<string, Annotation[]>
    : undefined;

  // Extract xlsx templates if present
  const xlsxTemplates = Array.isArray(data.xlsx_templates)
    ? data.xlsx_templates as XlsxExportTemplate[]
    : undefined;

  return { project, annotations, xlsxTemplates };
}

/**
 * Import a project, assigning a new ID and saving to IndexedDB.
 * The name can be overridden (e.g., for conflict resolution with rename).
 */
export interface ImportedProjectData {
  project: Omit<Project, 'id'>;
  annotations?: Record<string, Annotation[]>;
  xlsxTemplates?: XlsxExportTemplate[];
}

export async function importProject(
  data: Omit<Project, 'id'>,
  nameOverride?: string,
  annotations?: Record<string, Annotation[]>,
  xlsxTemplates?: XlsxExportTemplate[],
): Promise<Project> {
  const project: Project = {
    ...data,
    id: generateProjectId(),
    name: nameOverride || data.name,
    updated_at: Date.now(),
  };

  const db = await getDB();
  await db.put(PROJECTS_STORE, project);

  // Write the imported config to the global config key so useConfiguration picks it up
  if (data.config) {
    await saveConfig(data.config);
  }

  // Restore annotations if provided
  if (annotations && typeof annotations === 'object') {
    for (const [scopeKey, cues] of Object.entries(annotations)) {
      if (!Array.isArray(cues) || cues.length === 0) continue;
      // scopeKey format: "fileName:fileSize" or "oldProjectId:0" (no-video)
      const lastColonIdx = scopeKey.lastIndexOf(':');
      if (lastColonIdx === -1) continue;
      const fileName = scopeKey.substring(0, lastColonIdx);
      const fileSize = parseInt(scopeKey.substring(lastColonIdx + 1), 10);
      if (isNaN(fileSize)) continue;

      // For no-video annotations (fileSize === 0 and fileName looks like an old project ID),
      // re-key them under the new project ID so they're found by the new project
      const isNoVideoScope = fileSize === 0 && fileName !== project.video_filename;
      const targetFileName = isNoVideoScope ? project.id : fileName;

      await saveAnnotations(targetFileName, fileSize, cues);
    }
  }

  // Merge imported xlsx templates (skip duplicates by name)
  if (xlsxTemplates && xlsxTemplates.length > 0) {
    const existing = await loadXlsxExportTemplates();
    const existingNames = new Set(existing.map((t) => t.name));
    let merged = false;
    for (const tpl of xlsxTemplates) {
      if (existingNames.has(tpl.name)) continue; // skip duplicate names
      existing.push({ ...tpl, id: crypto.randomUUID() }); // assign new id
      merged = true;
    }
    if (merged) await saveXlsxExportTemplates(existing);
  }

  return project;
}
