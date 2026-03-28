import { useState, useEffect, useCallback, useRef } from 'react';
import { SignIn, SignedIn, SignedOut } from '@clerk/clerk-react';
import { useProject } from './hooks/useProject';
import { useToast } from './hooks/useToast';
import { useAuth } from './hooks/useAuth';
import { useCloudSync } from './hooks/useCloudSync';
import { HomeScreen } from './components/HomeScreen';
import { CreateProjectForm } from './components/CreateProjectForm';
import { ImportConflictModal } from './components/ImportConflictModal';
import { SyncConflictModal } from './components/SyncConflictModal';
import type { SyncResolution } from './components/SyncConflictModal';
import { ProjectSwitcherModal } from './components/ProjectSwitcherModal';
import { SessionExpiredModal } from './components/SessionExpiredModal';
import { ToastContainer } from './components/ToastContainer';
import { parseImportedProject, importProject, deleteProject as deleteProjectFromStorage, saveProject as saveProjectToStorage, loadProject as loadProjectFromStorage } from './utils/projectStorage';
import { detectSyncStatus, pullAllProjectAnnotations } from './utils/cloudStorage';
import type { ImportedProjectData } from './utils/projectStorage';
import type { TemplateData } from './types';
import { DEFAULT_CONFIG } from './types';
import App from './App';
import { SavePromptModal } from './components/SavePromptModal';
import type { Project } from './types/index';
import { saveAnnotations } from './utils/storage';
import { loadCachedAuth } from './utils/authCache';
import type { CachedAuth } from './utils/authCache';

type Screen = 'home' | 'create-project' | 'cue-sheet';

interface AppShellState {
  screen: Screen;
}

/**
 * AppShell handles top-level routing and project management.
 * Routes between Home screen, video assignment, and the main cue sheet.
 */
export function AppShell() {
  const [offlineAuth, setOfflineAuth] = useState<CachedAuth | null>(null);
  const [offlineChecked, setOfflineChecked] = useState(false);

  useEffect(() => {
    if (navigator.onLine) {
      setOfflineChecked(true);
      return;
    }
    // Offline — try loading cached auth
    loadCachedAuth().then((cached) => {
      setOfflineAuth(cached);
      setOfflineChecked(true);
    });
  }, []);

  if (!offlineChecked) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <p>Loading…</p>
      </div>
    );
  }

  // Offline with valid cached auth — skip Clerk entirely
  if (!navigator.onLine && offlineAuth) {
    return <AuthenticatedApp offlineMode />;
  }

  // Offline with no/expired cached auth
  if (!navigator.onLine && !offlineAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <h1 className="text-xl font-semibold">You're offline</h1>
        <p className="text-sm opacity-70">Sign in while online at least once to enable offline access.</p>
      </div>
    );
  }

  // Online — normal Clerk auth gate
  return (
    <>
      <SignedOut>
        <div className="flex items-center justify-center min-h-screen" style={{ background: 'var(--bg)' }}>
          <SignIn />
        </div>
      </SignedOut>
      <SignedIn>
        <AuthenticatedApp />
      </SignedIn>
    </>
  );
}

function AuthenticatedApp({ offlineMode = false }: { offlineMode?: boolean }) {
  const { sessionExpired, signOut: handleSessionSignOut } = useAuth();
  const {
    cloudPushProject,
    cloudDeleteProject,
    cloudPullProjects,
    cloudPullProject,
    cloudPullAllProjectAnnotations,
    cloudPullConfigTemplates,
    cloudPullXlsxExportTemplates,
  } = useCloudSync();
  const {
    projects,
    currentProject,
    isLoading: _projectsLoading,
    loadAllProjects,
    createNewProject,
    openProject,
    updateVideo,
    deleteCurrentProject,
    deleteAllProjects,
  } = useProject();

  const { toasts, addToast, removeToast } = useToast();

  const [appState, setAppState] = useState<AppShellState>({ screen: 'home' });
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // Import flow state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importConflict, setImportConflict] = useState<{
    parsed: ImportedProjectData;
    existingProject: Project;
  } | null>(null);

  // Project switcher state
  const [switcherOpen, setSwitcherOpen] = useState(false);

  // Sync conflict state
  const [syncConflict, setSyncConflict] = useState<{
    localProject: Project;
    cloudProject: Project;
    pendingProjectId: string;
  } | null>(null);
  // Projects deferred from syncing (in-memory only, lost on refresh)
  const deferredProjectsRef = useRef(new Set<string>());

  // Cloud restore state
  const [isRestoring, setIsRestoring] = useState(true);
  const restoreAttemptedRef = useRef(false);

  // Load all projects on mount + restore from cloud
  useEffect(() => {
    loadAllProjects();
  }, [loadAllProjects]);

  useEffect(() => {
    if (restoreAttemptedRef.current) return;
    restoreAttemptedRef.current = true;

    if (offlineMode) {
      setIsRestoring(false);
      return;
    }

    (async () => {
      try {
        const cloudProjects = await cloudPullProjects();
        if (cloudProjects.length > 0) {
          // Import cloud projects that don't exist locally
          const localProjects = await import('./utils/projectStorage').then(m => m.loadProjects());
          const localIds = new Set(localProjects.map(p => p.id));
          let restored = 0;
          for (const cp of cloudProjects) {
            if (!localIds.has(cp.id)) {
              await saveProjectToStorage({ ...cp, last_synced_at: Date.now() });
              restored++;
            }
          }
          if (restored > 0) {
            await loadAllProjects();
            addToast(`Restored ${restored} project${restored > 1 ? 's' : ''} from cloud.`, 'info');
          }
        }

        // Restore config templates
        const cloudConfigTemplates = await cloudPullConfigTemplates();
        if (cloudConfigTemplates.length > 0) {
          const { loadConfigTemplates, saveConfigTemplates } = await import('./utils/configTemplates');
          const localTemplates = await loadConfigTemplates();
          const localIds = new Set(localTemplates.map(t => t.id));
          const newTemplates = cloudConfigTemplates.filter(t => !localIds.has(t.id));
          if (newTemplates.length > 0) {
            await saveConfigTemplates([...localTemplates, ...newTemplates]);
          }
        }

        // Restore XLSX export templates
        const cloudXlsxTemplates = await cloudPullXlsxExportTemplates();
        if (cloudXlsxTemplates.length > 0) {
          const { loadXlsxExportTemplates, saveXlsxExportTemplates } = await import('./utils/configTemplates');
          const localXlsx = await loadXlsxExportTemplates();
          const localIds = new Set(localXlsx.map(t => t.id));
          const newXlsx = cloudXlsxTemplates.filter(t => !localIds.has(t.id));
          if (newXlsx.length > 0) {
            await saveXlsxExportTemplates([...localXlsx, ...newXlsx]);
          }
        }
      } catch (err) {
        console.error('Cloud restore failed:', err);
      } finally {
        setIsRestoring(false);
      }
    })();
  }, [cloudPullProjects, cloudPullConfigTemplates, cloudPullXlsxExportTemplates, loadAllProjects, addToast]);

  // ────────────────────────────────────
  // Navigation handlers
  // ────────────────────────────────────

  const handleGoHome = useCallback(() => {
    if (unsavedChanges) {
      setPendingNavigation(() => () => {
        setAppState({ screen: 'home' });
        setUnsavedChanges(false);
      });
      setSavePromptOpen(true);
    } else {
      setAppState({ screen: 'home' });
    }
  }, [unsavedChanges]);

  const handleCreateProject = useCallback(() => {
    setAppState({ screen: 'create-project' });
  }, []);

  const handleCreateProjectSubmit = useCallback(
    async (data: {
      name: string;
      production_name?: string;
      choreographer?: string;
      venue?: string;
      year?: string;
      notes?: string;
      config_template_id?: string;
      templateData?: TemplateData;
    }) => {
      try {
        // Build project config from template data if a template was selected
        let config: import('./types').AppConfig | undefined;
        if (data.templateData) {
          config = { ...DEFAULT_CONFIG, ...data.templateData };
        }
        const newProject = await createNewProject(data.name, { ...data, config });
        if (!offlineMode) cloudPushProject(newProject);
        setAppState({ screen: 'cue-sheet' });
      } catch (err) {
        console.error('Failed to create project:', err);
        addToast('Could not create project. Please try again.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [createNewProject]
  );

  const handleCreateProjectCancel = useCallback(() => {
    setAppState({ screen: 'home' });
  }, []);

  const handleProjectSelected = useCallback(
    async (projectId: string) => {
      try {
        const localProject = await loadProjectFromStorage(projectId);
        if (!localProject) {
          addToast('Project not found locally.', 'error');
          return;
        }

        // Offline mode — skip all conflict checks
        if (offlineMode) {
          await openProject(projectId);
          setAppState({ screen: 'cue-sheet' });
          return;
        }

        // If this project was deferred earlier, skip conflict check
        if (deferredProjectsRef.current.has(projectId)) {
          await openProject(projectId);
          setAppState({ screen: 'cue-sheet' });
          return;
        }

        // Pull cloud version for comparison
        let cloudProject: Project | null = null;
        try {
          cloudProject = await cloudPullProject(projectId);
        } catch {
          // Offline or network error — proceed with local, show toast
          addToast('Offline — opening local version. Cloud sync will resume when online.', 'warning');
          await openProject(projectId);
          setAppState({ screen: 'cue-sheet' });
          return;
        }

        const status = detectSyncStatus(localProject, cloudProject);

        switch (status) {
          case 'in-sync':
          case 'local-only':
            // Nothing to do — open normally
            await openProject(projectId);
            setAppState({ screen: 'cue-sheet' });
            break;

          case 'local-newer':
            // Auto-push local to cloud, open normally
            await openProject(projectId);
            setAppState({ screen: 'cue-sheet' });
            cloudPushProject(localProject);
            break;

          case 'cloud-newer-no-local-edits':
            // Auto-pull cloud version to local
            await applyCloudVersion(localProject, cloudProject!);
            addToast('Project updated from cloud.', 'info');
            await loadAllProjects();
            await openProject(projectId);
            setAppState({ screen: 'cue-sheet' });
            break;

          case 'conflict':
            // Show conflict modal
            setSyncConflict({
              localProject,
              cloudProject: cloudProject!,
              pendingProjectId: projectId,
            });
            break;

          default:
            await openProject(projectId);
            setAppState({ screen: 'cue-sheet' });
        }
      } catch (err) {
        console.error('Failed to open project:', err);
        addToast('Could not open this project. It may be corrupted.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [openProject, projects, cloudPullProject, cloudPushProject, loadAllProjects, addToast]
  );

  /** Overwrite the local project + annotations with the cloud version. */
  const applyCloudVersion = useCallback(
    async (localProject: Project, cloudProject: Project) => {
      // Save cloud project data to IndexedDB
      const now = Date.now();
      await saveProjectToStorage({ ...cloudProject, last_synced_at: now });

      // Pull and overwrite annotations
      const annotationGroups = await cloudPullAllProjectAnnotations(cloudProject.id);
      for (const { videoKey, annotations } of annotationGroups) {
        const [fileName, fileSizeStr] = videoKey.split(':');
        const fileSize = Number(fileSizeStr) || 0;
        await saveAnnotations(fileName, fileSize, annotations);
      }
    },
    [cloudPullAllProjectAnnotations]
  );

  /** Handle the user's resolution choice from SyncConflictModal. */
  const handleSyncResolution = useCallback(
    async (resolution: SyncResolution) => {
      if (!syncConflict) return;
      const { localProject, cloudProject, pendingProjectId } = syncConflict;
      setSyncConflict(null);

      try {
        switch (resolution) {
          case 'use-cloud': {
            await applyCloudVersion(localProject, cloudProject);
            await loadAllProjects();
            await openProject(pendingProjectId);
            setAppState({ screen: 'cue-sheet' });
            addToast('Using cloud version.', 'info');
            break;
          }

          case 'keep-local': {
            // Push local to cloud, overwriting cloud version
            const now = Date.now();
            const updated = { ...localProject, last_synced_at: now };
            await saveProjectToStorage(updated);
            cloudPushProject(updated);
            await loadAllProjects();
            await openProject(pendingProjectId);
            setAppState({ screen: 'cue-sheet' });
            addToast('Keeping local version. Cloud will be updated.', 'info');
            break;
          }

          case 'copy-local': {
            // Use cloud as the active project. Save local as a copy with a new ID.
            const copyId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const localCopy: Project = {
              ...localProject,
              id: copyId,
              name: `${localProject.name} (local copy)`,
              last_synced_at: null,
            };
            await saveProjectToStorage(localCopy);
            cloudPushProject(localCopy);

            // Copy annotations from the original to the copy
            const annotationGroups = await cloudPullAllProjectAnnotations(localProject.id);
            for (const { videoKey, annotations } of annotationGroups) {
              // Save under the copy's project ID when it's no-video annotations
              const [fileName, fileSizeStr] = videoKey.split(':');
              const fileSize = Number(fileSizeStr) || 0;
              if (fileName === localProject.id) {
                await saveAnnotations(copyId, fileSize, annotations);
              }
              // Video-keyed annotations are shared — no need to duplicate
            }

            // Overwrite original with cloud version
            await applyCloudVersion(localProject, cloudProject);
            await loadAllProjects();
            await openProject(pendingProjectId);
            setAppState({ screen: 'cue-sheet' });
            addToast(`Using cloud version. Local saved as "${localCopy.name}".`, 'info');
            break;
          }

          case 'copy-cloud': {
            // Keep local as the active project. Save cloud as a copy with a new ID.
            const copyId = `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const cloudCopy: Project = {
              ...cloudProject,
              id: copyId,
              name: `${cloudProject.name} (cloud copy)`,
              last_synced_at: null,
            };
            await saveProjectToStorage(cloudCopy);
            cloudPushProject(cloudCopy);

            // Pull cloud annotations and store under the copy ID
            const annotationGroups = await cloudPullAllProjectAnnotations(cloudProject.id);
            for (const { videoKey, annotations } of annotationGroups) {
              const [fileName, fileSizeStr] = videoKey.split(':');
              const fileSize = Number(fileSizeStr) || 0;
              if (fileName === cloudProject.id) {
                await saveAnnotations(copyId, fileSize, annotations);
              } else {
                // Video-keyed annotations — store under copy context if needed
                await saveAnnotations(fileName, fileSize, annotations);
              }
            }

            // Push local to cloud
            const now = Date.now();
            const updated = { ...localProject, last_synced_at: now };
            await saveProjectToStorage(updated);
            cloudPushProject(updated);
            await loadAllProjects();
            await openProject(pendingProjectId);
            setAppState({ screen: 'cue-sheet' });
            addToast(`Keeping local version. Cloud saved as "${cloudCopy.name}".`, 'info');
            break;
          }

          case 'resolve-later': {
            deferredProjectsRef.current.add(pendingProjectId);
            await openProject(pendingProjectId);
            setAppState({ screen: 'cue-sheet' });
            addToast('Sync deferred — cloud push disabled for this project until resolved.', 'warning');
            break;
          }
        }
      } catch (err) {
        console.error('Sync resolution failed:', err);
        addToast('Failed to resolve sync conflict. Opening local version.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
        await openProject(pendingProjectId);
        setAppState({ screen: 'cue-sheet' });
      }
    },
    [syncConflict, applyCloudVersion, cloudPushProject, cloudPullAllProjectAnnotations, loadAllProjects, openProject, addToast]
  );

  const handleVideoLoaded = useCallback(
    async (file: File, duration: number) => {
      if (!currentProject) return;
      try {
        await updateVideo({
          filename: file.name,
          path: file.name,
          filesize: file.size,
          duration,
        });
      } catch (err) {
        console.error('Failed to update project video reference:', err);
      }
    },
    [currentProject, updateVideo]
  );

  // ────────────────────────────────────
  // Import flow
  // ────────────────────────────────────

  const handleImportProject = useCallback(() => {
    importInputRef.current?.click();
  }, []);

  const handleImportFileSelected = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      // Reset the input so the same file can be re-selected
      e.target.value = '';

      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const parsed = parseImportedProject(json);

        // Check for name conflict
        const existing = projects.find(
          (p) => p.name.toLowerCase() === parsed.project.name.toLowerCase()
        );

        if (existing) {
          setImportConflict({ parsed, existingProject: existing });
        } else {
          // No conflict — import directly
          const imported = await importProject(parsed.project, undefined, parsed.annotations, parsed.xlsxTemplates);
          await loadAllProjects();
          await openProject(imported.id);
          setAppState({ screen: 'cue-sheet' });
        }
      } catch (err) {
        console.error('Import failed:', err);
        addToast('This doesn\u2019t look like a Cuetation project file.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [projects, loadAllProjects, openProject]
  );

  const handleImportConflictCancel = useCallback(() => {
    setImportConflict(null);
  }, []);

  const handleImportConflictOverwrite = useCallback(async () => {
    if (!importConflict) return;
    try {
      // Delete old project, import with same name
      await deleteProjectFromStorage(importConflict.existingProject.id);
      const imported = await importProject(importConflict.parsed.project, undefined, importConflict.parsed.annotations, importConflict.parsed.xlsxTemplates);
      setImportConflict(null);
      await loadAllProjects();
      await openProject(imported.id);
      setAppState({ screen: 'cue-sheet' });
    } catch (err) {
      console.error('Import overwrite failed:', err);
      addToast('Import failed while overwriting. Please try again.', 'error', {
        details: err instanceof Error ? err.message : String(err),
      });
      setImportConflict(null);
    }
  }, [importConflict, loadAllProjects, openProject]);

  const handleImportConflictRename = useCallback(
    async (newName: string) => {
      if (!importConflict) return;
      try {
        const imported = await importProject(importConflict.parsed.project, newName, importConflict.parsed.annotations, importConflict.parsed.xlsxTemplates);
        setImportConflict(null);
        await loadAllProjects();
        await openProject(imported.id);
        setAppState({ screen: 'cue-sheet' });
      } catch (err) {
        console.error('Import rename failed:', err);
        addToast('Import failed. Please try again.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
        setImportConflict(null);
      }
    },
    [importConflict, loadAllProjects, openProject]
  );


  const handleSaveAndNavigate = useCallback(async () => {
    // Trigger save in App component via callback
    const saveEvent = new CustomEvent('save-project', { detail: { projectId: currentProject?.id } });
    window.dispatchEvent(saveEvent);
    
    // Wait a bit for save to complete, then navigate
    setTimeout(() => {
      setSavePromptOpen(false);
      pendingNavigation?.();
      setUnsavedChanges(false);
    }, 500);
  }, [currentProject, pendingNavigation]);

  const handleDiscardChanges = useCallback(() => {
    setSavePromptOpen(false);
    pendingNavigation?.();
    setUnsavedChanges(false);
  }, [pendingNavigation]);

  // ────────────────────────────────────
  // Project switcher
  // ────────────────────────────────────

  const handleOpenSwitcher = useCallback(() => {
    if (unsavedChanges) {
      setPendingNavigation(() => () => {
        setSwitcherOpen(true);
      });
      setSavePromptOpen(true);
    } else {
      setSwitcherOpen(true);
    }
  }, [unsavedChanges]);

  const handleSwitchToProject = useCallback(
    async (projectId: string) => {
      setSwitcherOpen(false);
      try {
        await openProject(projectId);
        setAppState({ screen: 'cue-sheet' });
        setUnsavedChanges(false);
      } catch (err) {
        console.error('Failed to switch project:', err);
        addToast('Could not switch to this project.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [openProject, projects]
  );

  // ────────────────────────────────────
  // Render based on current screen
  // ────────────────────────────────────

  if (appState.screen === 'home') {
    return (
      <>
        {sessionExpired && <SessionExpiredModal onSignOut={handleSessionSignOut} />}
        <HomeScreen
          onProjectSelected={handleProjectSelected}
          onCreateProject={handleCreateProject}
          onImportProject={handleImportProject}
          isRestoring={isRestoring}
        />
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.cuetation.json"
          className="hidden"
          onChange={handleImportFileSelected}
        />
        {importConflict && (
          <ImportConflictModal
            existingName={importConflict.parsed.project.name}
            onCancel={handleImportConflictCancel}
            onOverwrite={handleImportConflictOverwrite}
            onRename={handleImportConflictRename}
          />
        )}
        {syncConflict && (
          <SyncConflictModal
            localProject={syncConflict.localProject}
            cloudProject={syncConflict.cloudProject}
            onResolve={handleSyncResolution}
          />
        )}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  if (appState.screen === 'create-project') {
    return (
      <>
        {sessionExpired && <SessionExpiredModal onSignOut={handleSessionSignOut} />}
        <CreateProjectForm
          onCancel={handleCreateProjectCancel}
          onCreate={handleCreateProjectSubmit}
        />
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </>
    );
  }

  if (appState.screen === 'cue-sheet' && currentProject) {
    return (
      <>
        {sessionExpired && <SessionExpiredModal onSignOut={handleSessionSignOut} />}
        <App
          key={currentProject.id}
          projectId={currentProject.id}
          projectName={currentProject.name}
          videoFilename={currentProject.video_filename}
          videoFilesize={currentProject.video_filesize}
          syncPaused={offlineMode || deferredProjectsRef.current.has(currentProject.id)}
          onGoHome={handleGoHome}
          onSwitchProject={handleOpenSwitcher}
          onVideoLoaded={handleVideoLoaded}
          onUnsavedChangesChange={setUnsavedChanges}
          onDeleteProject={async () => {
            const projectId = currentProject.id;
            await deleteCurrentProject();
            if (!offlineMode) cloudDeleteProject(projectId);
            setAppState({ screen: 'home' });
            setUnsavedChanges(false);
          }}
          onDeleteAllProjects={deleteAllProjects}
          onSave={() => {
            // Save will be handled by App component
            setUnsavedChanges(false);
          }}
        />
        <SavePromptModal
          isOpen={savePromptOpen}
          onSave={handleSaveAndNavigate}
          onDiscard={handleDiscardChanges}
          onCancel={() => setSavePromptOpen(false)}
        />
        <ProjectSwitcherModal
          isOpen={switcherOpen}
          currentProjectId={currentProject.id}
          projects={projects}
          onProjectSelected={handleSwitchToProject}
          onClose={() => setSwitcherOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      {sessionExpired && <SessionExpiredModal onSignOut={handleSessionSignOut} />}
      <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-100">
        <p>Loading...</p>
      </div>
    </>
  );
}
