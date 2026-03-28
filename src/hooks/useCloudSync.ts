import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './useAuth';
import {
  pushProject,
  pushAnnotations,
  deleteProjectCloud,
  deleteAnnotationCloud,
  pullAllProjects,
  pullProject,
  pullAnnotations,
  pullAllProjectAnnotations,
  pushConfigTemplates,
  pullConfigTemplates,
  pushXlsxExportTemplates,
  pullXlsxExportTemplates,
} from '../utils/cloudStorage';
import type { Project, Annotation, ConfigTemplate } from '../types/index';
import type { XlsxExportTemplate } from '../utils/configTemplates';
import type { SupabaseClient } from '@supabase/supabase-js';

export type CloudSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useCloudSync() {
  const { userId, isSignedIn, isLoaded, getSupabaseClient, validateSession } = useAuth();
  const [saveStatus, setSaveStatus] = useState<CloudSaveStatus>('idle');
  const annotationDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const configDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const templateDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const xlsxDebounceRef = useRef<ReturnType<typeof setTimeout>>();
  const resetStatusRef = useRef<ReturnType<typeof setTimeout>>();

  // Track which projects have been confirmed in the cloud this session
  const pushedProjectsRef = useRef(new Set<string>());

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(annotationDebounceRef.current);
      clearTimeout(configDebounceRef.current);
      clearTimeout(templateDebounceRef.current);
      clearTimeout(xlsxDebounceRef.current);
      clearTimeout(resetStatusRef.current);
    };
  }, []);

  const showSaved = useCallback(() => {
    setSaveStatus('saved');
    clearTimeout(resetStatusRef.current);
    resetStatusRef.current = setTimeout(() => setSaveStatus('idle'), 3000);
  }, []);

  /** Get a Supabase client and validate the session. Returns null if invalid. */
  const getClient = useCallback(async (): Promise<SupabaseClient | null> => {
    if (!isSignedIn || !userId) return null;
    try {
      const valid = await validateSession();
      if (!valid) return null;
      return await getSupabaseClient();
    } catch {
      return null;
    }
  }, [isSignedIn, userId, getSupabaseClient, validateSession]);

  /** Push a project to the cloud (immediate, since annotations depend on it). */
  const cloudPushProject = useCallback(
    async (project: Project) => {
      if (!isSignedIn || !userId) return;
      try {
        setSaveStatus('saving');
        const client = await getClient();
        if (!client) return;
        await pushProject(client, project, userId);
        pushedProjectsRef.current.add(project.id);
        // Update last_synced_at locally
        const { loadProject, saveProject } = await import('../utils/projectStorage');
        const fresh = await loadProject(project.id);
        if (fresh) {
          fresh.last_synced_at = Date.now();
          await saveProject(fresh);
        }
        showSaved();
      } catch (err) {
        console.error('Cloud push project failed:', err);
        setSaveStatus('error');
      }
    },
    [isSignedIn, userId, getClient, showSaved]
  );

  /** Ensure a project exists in the cloud before pushing child data. */
  const ensureProjectInCloud = useCallback(
    async (projectId: string, client: SupabaseClient) => {
      if (pushedProjectsRef.current.has(projectId)) return;
      // Check if it exists remotely already
      const { data } = await client
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .maybeSingle();
      if (data) {
        pushedProjectsRef.current.add(projectId);
        return;
      }
      // Load from IndexedDB and push
      const { loadProject } = await import('../utils/projectStorage');
      const localProject = await loadProject(projectId);
      if (localProject) {
        await pushProject(client, localProject, userId!);
        pushedProjectsRef.current.add(projectId);
      }
    },
    [userId]
  );

  /** Push annotations to the cloud (debounced 2s). Ensures project exists first. */
  const cloudPushAnnotations = useCallback(
    (annotations: Annotation[], projectId: string, videoKey: string) => {
      if (!isSignedIn || !userId) return;
      clearTimeout(annotationDebounceRef.current);
      annotationDebounceRef.current = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          const client = await getClient();
          if (!client) return;
          await ensureProjectInCloud(projectId, client);
          await pushAnnotations(client, annotations, projectId, userId, videoKey);
          showSaved();
        } catch (err) {
          console.error('Cloud push annotations failed:', err);
          setSaveStatus('error');
        }
      }, 2000);
    },
    [isSignedIn, userId, getClient, showSaved, ensureProjectInCloud]
  );

  /** Push annotations to the cloud immediately (no debounce). For use at save-time. */
  const cloudPushAnnotationsImmediate = useCallback(
    async (annotations: Annotation[], projectId: string, videoKey: string) => {
      if (!isSignedIn || !userId) return;
      try {
        setSaveStatus('saving');
        const client = await getClient();
        if (!client) return;
        await ensureProjectInCloud(projectId, client);
        await pushAnnotations(client, annotations, projectId, userId, videoKey);
        showSaved();
      } catch (err) {
        console.error('Cloud push annotations (immediate) failed:', err);
        setSaveStatus('error');
      }
    },
    [isSignedIn, userId, getClient, showSaved, ensureProjectInCloud]
  );

  /** Delete a project from the cloud (immediate). */
  const cloudDeleteProject = useCallback(
    async (projectId: string) => {
      if (!isSignedIn) return;
      try {
        const client = await getClient();
        if (!client) return;
        await deleteProjectCloud(client, projectId);
      } catch (err) {
        console.error('Cloud delete project failed:', err);
      }
    },
    [isSignedIn, getClient]
  );

  /** Delete a single annotation from the cloud (immediate). */
  const cloudDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      if (!isSignedIn) return;
      try {
        const client = await getClient();
        if (!client) return;
        await deleteAnnotationCloud(client, annotationId);
      } catch (err) {
        console.error('Cloud delete annotation failed:', err);
      }
    },
    [isSignedIn, getClient]
  );

  /** Pull all projects from the cloud. */
  const cloudPullProjects = useCallback(async (): Promise<Project[]> => {
    if (!isSignedIn) return [];
    try {
      const client = await getClient();
      if (!client) return [];
      return await pullAllProjects(client);
    } catch (err) {
      console.error('Cloud pull projects failed:', err);
      return [];
    }
  }, [isSignedIn, getClient]);

  /** Pull a single project from the cloud. Returns null if not found or offline. */
  const cloudPullProject = useCallback(
    async (projectId: string): Promise<Project | null> => {
      if (!isSignedIn) return null;
      try {
        const client = await getClient();
        if (!client) return null;
        return await pullProject(client, projectId);
      } catch (err) {
        console.error('Cloud pull project failed:', err);
        return null;
      }
    },
    [isSignedIn, getClient]
  );

  /** Pull annotations for a project+videoKey from the cloud. */
  const cloudPullAnnotations = useCallback(
    async (projectId: string, videoKey: string): Promise<Annotation[]> => {
      if (!isSignedIn) return [];
      try {
        const client = await getClient();
        if (!client) return [];
        return await pullAnnotations(client, projectId, videoKey);
      } catch (err) {
        console.error('Cloud pull annotations failed:', err);
        return [];
      }
    },
    [isSignedIn, getClient]
  );

  /** Pull all annotations for a project (all video keys). */
  const cloudPullAllProjectAnnotations = useCallback(
    async (projectId: string) => {
      if (!isSignedIn) return [];
      try {
        const client = await getClient();
        if (!client) return [];
        return await pullAllProjectAnnotations(client, projectId);
      } catch (err) {
        console.error('Cloud pull all annotations failed:', err);
        return [];
      }
    },
    [isSignedIn, getClient]
  );

  /** Push config templates to the cloud (debounced 2s). */
  const cloudPushConfigTemplates = useCallback(
    (templates: ConfigTemplate[]) => {
      if (!isSignedIn || !userId) return;
      clearTimeout(templateDebounceRef.current);
      templateDebounceRef.current = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          const client = await getClient();
          if (!client) return;
          await pushConfigTemplates(client, templates, userId);
          showSaved();
        } catch (err) {
          console.error('Cloud push config templates failed:', err);
          setSaveStatus('error');
        }
      }, 2000);
    },
    [isSignedIn, userId, getClient, showSaved]
  );

  /** Pull config templates from the cloud. */
  const cloudPullConfigTemplates = useCallback(async (): Promise<ConfigTemplate[]> => {
    if (!isSignedIn) return [];
    try {
      const client = await getClient();
      if (!client) return [];
      return await pullConfigTemplates(client);
    } catch (err) {
      console.error('Cloud pull config templates failed:', err);
      return [];
    }
  }, [isSignedIn, getClient]);

  /** Push XLSX export templates to the cloud (debounced 2s). */
  const cloudPushXlsxExportTemplates = useCallback(
    (templates: XlsxExportTemplate[]) => {
      if (!isSignedIn || !userId) return;
      clearTimeout(xlsxDebounceRef.current);
      xlsxDebounceRef.current = setTimeout(async () => {
        try {
          setSaveStatus('saving');
          const client = await getClient();
          if (!client) return;
          await pushXlsxExportTemplates(client, templates, userId);
          showSaved();
        } catch (err) {
          console.error('Cloud push xlsx export templates failed:', err);
          setSaveStatus('error');
        }
      }, 2000);
    },
    [isSignedIn, userId, getClient, showSaved]
  );

  /** Pull XLSX export templates from the cloud. */
  const cloudPullXlsxExportTemplates = useCallback(async (): Promise<XlsxExportTemplate[]> => {
    if (!isSignedIn) return [];
    try {
      const client = await getClient();
      if (!client) return [];
      return await pullXlsxExportTemplates(client);
    } catch (err) {
      console.error('Cloud pull xlsx export templates failed:', err);
      return [];
    }
  }, [isSignedIn, getClient]);

  return {
    saveStatus,
    isCloudReady: isLoaded && isSignedIn,
    cloudPushProject,
    cloudPushAnnotations,
    cloudPushAnnotationsImmediate,
    cloudDeleteProject,
    cloudDeleteAnnotation,
    cloudPullProjects,
    cloudPullProject,
    cloudPullAnnotations,
    cloudPullAllProjectAnnotations,
    cloudPushConfigTemplates,
    cloudPullConfigTemplates,
    cloudPushXlsxExportTemplates,
    cloudPullXlsxExportTemplates,
  };
}
