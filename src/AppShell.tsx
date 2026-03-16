import { useState, useEffect, useCallback, useRef } from 'react';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react';
import { useProject } from './hooks/useProject';
import { useToast } from './hooks/useToast';
import { useEnsureUser } from './hooks/useEnsureUser';
import { HomeScreen } from './components/HomeScreen';
import { CreateProjectForm } from './components/CreateProjectForm';
import { ImportConflictModal } from './components/ImportConflictModal';
import { ProjectSwitcherModal } from './components/ProjectSwitcherModal';
import { ToastContainer } from './components/ToastContainer';
import { parseImportedProject, importProject, deleteProject as deleteProjectFromStorage } from './utils/projectStorage';
import type { ImportedProjectData } from './utils/projectStorage';
import type { TemplateData } from './types';
import { DEFAULT_CONFIG } from './types';
import App from './App';
import { SavePromptModal } from './components/SavePromptModal';
import type { Project } from './types/index';

type Screen = 'home' | 'create-project' | 'cue-sheet';

interface AppShellState {
  screen: Screen;
}

/**
 * AppShell handles top-level routing and project management.
 * Routes between Home screen, video assignment, and the main cue sheet.
 */
export function AppShell() {
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

  // Load all projects on mount
  useEffect(() => {
    loadAllProjects();
  }, [loadAllProjects]);

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
        await createNewProject(data.name, { ...data, config });
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
        await openProject(projectId);
        setAppState({ screen: 'cue-sheet' });
      } catch (err) {
        console.error('Failed to open project:', err);
        addToast('Could not open this project. It may be corrupted.', 'error', {
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [openProject, projects]
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
          const imported = await importProject(parsed.project, undefined, parsed.annotations);
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
      const imported = await importProject(importConflict.parsed.project, undefined, importConflict.parsed.annotations);
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
        const imported = await importProject(importConflict.parsed.project, newName, importConflict.parsed.annotations);
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
  // Render based on auth + current screen
  // ────────────────────────────────────

  const renderScreenContent = () => {
    if (appState.screen === 'home') {
      return (
        <>
          <HomeScreen
            onProjectSelected={handleProjectSelected}
            onCreateProject={handleCreateProject}
            onImportProject={handleImportProject}
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
          <ToastContainer toasts={toasts} onRemove={removeToast} />
        </>
      );
    }

    if (appState.screen === 'create-project') {
      return (
        <>
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
          <App
            key={currentProject.id}
            projectId={currentProject.id}
            projectName={currentProject.name}
            videoFilename={currentProject.video_filename}
            videoFilesize={currentProject.video_filesize}
            onGoHome={handleGoHome}
            onSwitchProject={handleOpenSwitcher}
            onVideoLoaded={handleVideoLoaded}
            onUnsavedChangesChange={setUnsavedChanges}
            onDeleteProject={async () => {
              await deleteCurrentProject();
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
      <div className="flex items-center justify-center h-screen bg-gray-900 text-gray-100">
        <p>Loading...</p>
      </div>
    );
  };

  return (
    <>
      <Show when="signed-out">
        <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-gray-100">
          <div className="text-center space-y-6">
            <h1 className="text-5xl font-bold tracking-tight">Cuetation</h1>
            <p className="text-lg text-gray-400 max-w-md">
              Video cue annotation for stage managers
            </p>
            <div className="flex gap-4 justify-center">
              <SignInButton mode="modal">
                <button className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
                  Sign up
                </button>
              </SignUpButton>
            </div>
          </div>
        </div>
      </Show>
      <Show when="signed-in">
        <SignedInContent>
          <div className="fixed top-3 right-3 z-50">
            <UserButton />
          </div>
          {renderScreenContent()}
        </SignedInContent>
      </Show>
    </>
  );
}

/**
 * Wrapper that runs signed-in-only hooks (like Supabase user sync).
 * Rendered only inside <Show when="signed-in"> so Clerk hooks are safe to call.
 */
function SignedInContent({ children }: { children: React.ReactNode }) {
  try {
    useEnsureUser();
  } catch (e) {
    console.error('[SignedInContent] useEnsureUser error:', e);
  }
  return <>{children}</>;
}

