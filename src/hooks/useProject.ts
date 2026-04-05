import { useState, useCallback } from 'react';
import type { Project, AppConfig } from '../types/index';
import {
  createProject,
  loadProjects,
  loadProject,
  saveProject,
  deleteProject,
  deleteAllProjects,
  updateProjectVideo,
  updateProjectMetadata,
} from '../utils/projectStorage';

export interface UseProjectReturn {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  error: string | null;

  // CRUD operations
  loadAllProjects: () => Promise<void>;
  openProject: (projectId: string) => Promise<void>;
  createNewProject: (
    name: string,
    options?: {
      production_name?: string;
      choreographer?: string;
      venue?: string;
      year?: string;
      notes?: string;
      config_template_id?: string;
      config?: AppConfig;
    }
  ) => Promise<Project>;
  updateCurrentProject: (updates: Partial<Project>) => Promise<void>;
  deleteCurrentProject: () => Promise<void>;
  deleteAllProjects: () => Promise<void>;
  updateVideo: (
    videoRef: {
      filename: string;
      path: string;
      filesize: number;
      duration: number;
    } | null
  ) => Promise<void>;
  updateMetadata: (metadata: {
    name?: string;
    production_name?: string;
    choreographer?: string;
    venue?: string;
    year?: string;
    notes?: string;
  }) => Promise<void>;
}

/**
 * Hook for managing projects.
 * Handles CRUD operations, current project state, and error handling.
 */
export function useProject(): UseProjectReturn {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all projects from storage
  const loadAllProjects = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await loadProjects();
      setProjects(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load projects';
      setError(message);
      console.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Open a specific project
  const openProject = useCallback(async (projectId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const project = await loadProject(projectId);
      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }
      setCurrentProject(project);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open project';
      setError(message);
      console.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Create a new project
  const createNewProject = useCallback(
    async (
      name: string,
      options?: {
        production_name?: string;
        choreographer?: string;
        venue?: string;
        year?: string;
        notes?: string;
        config_template_id?: string;
        config?: AppConfig;
      }
    ) => {
      try {
        setError(null);
        const newProject = await createProject(name, options);
        setProjects(prev => [newProject, ...prev]);
        setCurrentProject(newProject);
        return newProject;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create project';
        setError(message);
        console.error(message);
        throw err;
      }
    },
    []
  );

  // Update the current project
  const updateCurrentProject = useCallback(
    async (updates: Partial<Project>) => {
      if (!currentProject) {
        throw new Error('No project currently open');
      }
      try {
        setError(null);
        const updated = { ...currentProject, ...updates };
        await saveProject(updated);
        setCurrentProject(updated);
        // Update in projects list
        setProjects(prev =>
          prev.map(p => (p.id === updated.id ? updated : p))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update project';
        setError(message);
        console.error(message);
        throw err;
      }
    },
    [currentProject]
  );

  // Delete the current project
  const deleteCurrentProject = useCallback(async () => {
    if (!currentProject) {
      throw new Error('No project currently open');
    }
    try {
      setError(null);
      await deleteProject(currentProject.id);
      setProjects(prev => prev.filter(p => p.id !== currentProject.id));
      setCurrentProject(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      setError(message);
      console.error(message);
      throw err;
    }
  }, [currentProject]);

  // Delete all projects (used for Factory Reset)
  const deleteAllProjectsFn = useCallback(async () => {
    try {
      setError(null);
      await deleteAllProjects();
      setProjects([]);
      setCurrentProject(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete all projects';
      setError(message);
      console.error(message);
      throw err;
    }
  }, []);

  // Update video reference
  const updateVideo = useCallback(
    async (
      videoRef: {
        filename: string;
        path: string;
        filesize: number;
        duration: number;
      } | null
    ) => {
      if (!currentProject) {
        throw new Error('No project currently open');
      }
      try {
        setError(null);
        await updateProjectVideo(currentProject.id, videoRef);
        const updated = await loadProject(currentProject.id);
        if (updated) {
          setCurrentProject(updated);
          setProjects(prev =>
            prev.map(p => (p.id === updated.id ? updated : p))
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update video';
        setError(message);
        console.error(message);
        throw err;
      }
    },
    [currentProject]
  );

  // Update metadata
  const updateMetadata = useCallback(
    async (metadata: {
      production_name?: string;
      choreographer?: string;
      venue?: string;
      year?: string;
      notes?: string;
    }) => {
      if (!currentProject) {
        throw new Error('No project currently open');
      }
      try {
        setError(null);
        await updateProjectMetadata(currentProject.id, metadata);
        const updated = await loadProject(currentProject.id);
        if (updated) {
          setCurrentProject(updated);
          setProjects(prev =>
            prev.map(p => (p.id === updated.id ? updated : p))
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update metadata';
        setError(message);
        console.error(message);
        throw err;
      }
    },
    [currentProject]
  );

  return {
    projects,
    currentProject,
    isLoading,
    error,
    loadAllProjects,
    openProject,
    createNewProject,
    updateCurrentProject,
    deleteCurrentProject,
    deleteAllProjects: deleteAllProjectsFn,
    updateVideo,
    updateMetadata,
  };
}
