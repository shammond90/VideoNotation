import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project, Annotation, ConfigTemplate } from '../types/index';
import type { XlsxExportTemplate } from './configTemplates';

// ── Helpers to convert between local types and Supabase rows ──

function projectToRow(project: Project, userId: string) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    production_name: project.production_name ?? null,
    choreographer: project.choreographer ?? null,
    venue: project.venue ?? null,
    year: project.year ?? null,
    notes: project.notes ?? null,
    config: project.config,
    video_meta: project.video_filename
      ? { name: project.video_filename, size: project.video_filesize, duration: project.video_duration }
      : null,
    columns: project.columns,
    export_templates: project.export_templates,
    config_template_id: project.config_template_id ?? null,
    created_at: project.created_at,
    updated_at: project.updated_at,
    last_synced_at: project.last_synced_at ?? null,
  };
}

function rowToProject(row: any): Project {
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_synced_at: row.last_synced_at ?? null,
    production_name: row.production_name ?? undefined,
    choreographer: row.choreographer ?? undefined,
    venue: row.venue ?? undefined,
    year: row.year ?? undefined,
    notes: row.notes ?? undefined,
    config_template_id: row.config_template_id ?? undefined,
    config: row.config,
    columns: row.columns ?? [],
    export_templates: row.export_templates ?? [],
    video_filename: row.video_meta?.name ?? null,
    video_path: row.video_meta?.name ?? null,
    video_filesize: row.video_meta?.size ?? null,
    video_duration: row.video_meta?.duration ?? null,
  };
}

function annotationToRow(annotation: Annotation, projectId: string, userId: string, videoKey: string) {
  return {
    id: annotation.id,
    project_id: projectId,
    user_id: userId,
    video_key: videoKey,
    timestamp: annotation.timestamp,
    cue: annotation.cue,
    status: annotation.status,
    flagged: annotation.flagged,
    flag_note: annotation.flagNote,
    sort_order: annotation.sort_order,
    time_in_title: annotation.timeInTitle,
    link_cue_id: annotation.cue.linkCueId || null,
    created_at: annotation.createdAt,
    updated_at: annotation.updatedAt,
  };
}

function rowToAnnotation(row: any): Annotation {
  return {
    id: row.id,
    timestamp: row.timestamp,
    cue: row.cue,
    timeInTitle: row.time_in_title ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status ?? 'provisional',
    flagged: row.flagged ?? false,
    flagNote: row.flag_note ?? '',
    sort_order: row.sort_order ?? 0,
  };
}

// ── Cloud CRUD operations ──

/** Push (upsert) a project to Supabase. */
export async function pushProject(supabase: SupabaseClient, project: Project, userId: string): Promise<void> {
  const row = projectToRow(project, userId);
  const { error } = await supabase.from('projects').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`pushProject failed: ${error.message}`);
}

/** Push (upsert) annotations for a project+videoKey to Supabase. Replaces the full set. */
export async function pushAnnotations(
  supabase: SupabaseClient,
  annotations: Annotation[],
  projectId: string,
  userId: string,
  videoKey: string
): Promise<void> {
  // Delete existing annotations for this project+videoKey, then insert fresh
  const { error: deleteError } = await supabase
    .from('annotations')
    .delete()
    .eq('project_id', projectId)
    .eq('video_key', videoKey);
  if (deleteError) throw new Error(`pushAnnotations delete failed: ${deleteError.message}`);

  if (annotations.length === 0) return;

  const rows = annotations.map(a => annotationToRow(a, projectId, userId, videoKey));
  const { error: insertError } = await supabase.from('annotations').insert(rows);
  if (insertError) throw new Error(`pushAnnotations insert failed: ${insertError.message}`);
}

/** Delete a project from Supabase (cascade deletes its annotations). */
export async function deleteProjectCloud(supabase: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw new Error(`deleteProjectCloud failed: ${error.message}`);
}

/** Delete a single annotation from Supabase. */
export async function deleteAnnotationCloud(supabase: SupabaseClient, annotationId: string): Promise<void> {
  const { error } = await supabase.from('annotations').delete().eq('id', annotationId);
  if (error) throw new Error(`deleteAnnotationCloud failed: ${error.message}`);
}

/** Pull all projects for a user from Supabase. */
export async function pullAllProjects(supabase: SupabaseClient): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(`pullAllProjects failed: ${error.message}`);
  return (data ?? []).map(rowToProject);
}

/** Pull a single project by ID from Supabase. Returns null if not found. */
export async function pullProject(supabase: SupabaseClient, projectId: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .maybeSingle();
  if (error) throw new Error(`pullProject failed: ${error.message}`);
  return data ? rowToProject(data) : null;
}

// ── Conflict Resolution ──

export type SyncStatus =
  | 'in-sync'
  | 'cloud-only'
  | 'local-only'
  | 'local-newer'
  | 'cloud-newer-no-local-edits'
  | 'conflict';

/**
 * Compare a local project against its cloud counterpart and return a sync status.
 * - `in-sync`: same updated_at (or both null)
 * - `cloud-only`: no local version
 * - `local-only`: no cloud version
 * - `local-newer`: local updated_at > cloud updated_at → auto-push
 * - `cloud-newer-no-local-edits`: cloud updated_at > local, and local hasn't been
 *   edited since last_synced_at → safe to auto-pull
 * - `conflict`: both sides changed since last sync → prompt user
 */
export function detectSyncStatus(
  local: Project | null | undefined,
  cloud: Project | null | undefined,
): SyncStatus {
  if (!local && !cloud) return 'in-sync';
  if (!local && cloud) return 'cloud-only';
  if (local && !cloud) return 'local-only';

  // Both exist
  const l = local!;
  const c = cloud!;

  if (l.updated_at === c.updated_at) return 'in-sync';

  if (l.updated_at > c.updated_at) return 'local-newer';

  // Cloud is newer. Check if local was edited since last sync.
  const lastSync = l.last_synced_at ?? 0;
  if (l.updated_at <= lastSync) {
    // Local hasn't changed since last sync → safe to auto-pull
    return 'cloud-newer-no-local-edits';
  }

  // Both sides have changes → conflict
  return 'conflict';
}

/** Pull annotations for a specific project+videoKey from Supabase. */
export async function pullAnnotations(
  supabase: SupabaseClient,
  projectId: string,
  videoKey: string
): Promise<Annotation[]> {
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('project_id', projectId)
    .eq('video_key', videoKey);
  if (error) throw new Error(`pullAnnotations failed: ${error.message}`);
  return (data ?? []).map(rowToAnnotation);
}

/** Pull all annotations for a project (all video keys). */
export async function pullAllProjectAnnotations(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ videoKey: string; annotations: Annotation[] }[]> {
  const { data, error } = await supabase
    .from('annotations')
    .select('*')
    .eq('project_id', projectId);
  if (error) throw new Error(`pullAllProjectAnnotations failed: ${error.message}`);

  // Group by video_key
  const grouped = new Map<string, Annotation[]>();
  for (const row of data ?? []) {
    const key = row.video_key;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(rowToAnnotation(row));
  }

  return Array.from(grouped.entries()).map(([videoKey, annotations]) => ({ videoKey, annotations }));
}

// ── Config Templates ──

function configTemplateToRow(template: ConfigTemplate, userId: string) {
  return {
    id: template.id,
    user_id: userId,
    name: template.name,
    is_default: template.isDefault ?? false,
    data: template.data,
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

function rowToConfigTemplate(row: any): ConfigTemplate {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default || undefined,
    data: row.data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Push (upsert) all config templates for a user. Replaces the full set. */
export async function pushConfigTemplates(
  supabase: SupabaseClient,
  templates: ConfigTemplate[],
  userId: string
): Promise<void> {
  // Delete existing then insert fresh
  const { error: deleteError } = await supabase
    .from('config_templates')
    .delete()
    .eq('user_id', userId);
  if (deleteError) throw new Error(`pushConfigTemplates delete failed: ${deleteError.message}`);

  if (templates.length === 0) return;

  const rows = templates.map(t => configTemplateToRow(t, userId));
  const { error: insertError } = await supabase.from('config_templates').insert(rows);
  if (insertError) throw new Error(`pushConfigTemplates insert failed: ${insertError.message}`);
}

/** Pull all config templates for the current user. */
export async function pullConfigTemplates(supabase: SupabaseClient): Promise<ConfigTemplate[]> {
  const { data, error } = await supabase
    .from('config_templates')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`pullConfigTemplates failed: ${error.message}`);
  return (data ?? []).map(rowToConfigTemplate);
}

// ── XLSX Export Templates ──

function xlsxTemplateToRow(template: XlsxExportTemplate, userId: string) {
  return {
    id: template.id,
    user_id: userId,
    name: template.name,
    columns: template.columns,
    color_overrides: template.colorOverrides,
    include_skipped: template.includeSkipped ?? false,
    excluded_cue_types: template.excludedCueTypes ?? [],
    created_at: template.createdAt,
    updated_at: template.updatedAt,
  };
}

function rowToXlsxTemplate(row: any): XlsxExportTemplate {
  return {
    id: row.id,
    name: row.name,
    columns: row.columns ?? [],
    colorOverrides: row.color_overrides ?? {},
    includeSkipped: row.include_skipped ?? false,
    excludedCueTypes: row.excluded_cue_types ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Push (upsert) all XLSX export templates for a user. Replaces the full set. */
export async function pushXlsxExportTemplates(
  supabase: SupabaseClient,
  templates: XlsxExportTemplate[],
  userId: string
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('xlsx_export_templates')
    .delete()
    .eq('user_id', userId);
  if (deleteError) throw new Error(`pushXlsxExportTemplates delete failed: ${deleteError.message}`);

  if (templates.length === 0) return;

  const rows = templates.map(t => xlsxTemplateToRow(t, userId));
  const { error: insertError } = await supabase.from('xlsx_export_templates').insert(rows);
  if (insertError) throw new Error(`pushXlsxExportTemplates insert failed: ${insertError.message}`);
}

/** Pull all XLSX export templates for the current user. */
export async function pullXlsxExportTemplates(supabase: SupabaseClient): Promise<XlsxExportTemplate[]> {
  const { data, error } = await supabase
    .from('xlsx_export_templates')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`pullXlsxExportTemplates failed: ${error.message}`);
  return (data ?? []).map(rowToXlsxTemplate);
}
