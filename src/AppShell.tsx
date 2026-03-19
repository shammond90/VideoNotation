import { useState, useEffect, useCallback, useRef } from 'react';
import { Show, UserButton, useAuth } from '@clerk/react';
import { useProject } from './hooks/useProject';
import { useToast } from './hooks/useToast';
import { useEnsureUser } from './hooks/useEnsureUser';
import { TierProvider, useTier } from './hooks/useTier';
import { HomeScreen } from './components/HomeScreen';
import { CreateProjectForm } from './components/CreateProjectForm';
import { LevelSelectScreen } from './components/LevelSelectScreen';
import { SignInScreen } from './components/SignInScreen';
import { SignUpScreen } from './components/SignUpScreen';
import { ForgotPasswordScreen } from './components/ForgotPasswordScreen';
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

  const { isLoaded } = useAuth();

  // While Clerk initialises, show wordmark loading screen.
  // Neither <Show when="signed-in"> nor <Show when="signed-out"> renders
  // during this phase, which would otherwise produce a blank screen.
  if (!isLoaded) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--bg)' }}
      >
        <span
          className="font-display"
          style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em', color: 'var(--text)' }}
        >
          Cue<em style={{ color: 'var(--amber)', fontStyle: 'italic' }}>tation</em>
        </span>
      </div>
    );
  }

  return (
    <>
      <Show when="signed-out">
        <SignedOutContent />
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
  return (
    <TierProvider>
      <TierGate>{children}</TierGate>
    </TierProvider>
  );
}

/**
 * If the user's tier is 'starter' (hasn't chosen a level yet), show the
 * LevelSelectScreen instead of the normal app content.
 */
function TierGate({ children }: { children: React.ReactNode }) {
  const { tier, isLoading } = useTier();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--bg)', color: 'var(--text-mid)' }}>
        <span className="font-mono text-sm tracking-widest uppercase opacity-60">Loading…</span>
      </div>
    );
  }

  if (tier === 'starter') {
    return <LevelSelectScreen />;
  }

  return <>{children}</>;
}

type AuthScreen = 'landing' | 'sign-in' | 'sign-up' | 'forgot-password';

/**
 * Handles the signed-out experience: landing page with custom auth screens.
 * No modal popups — inline screens matching the Cuetation design system.
 */
function SignedOutContent() {
  const [authScreen, setAuthScreen] = useState<AuthScreen>('landing');

  if (authScreen === 'sign-in') {
    return (
      <SignInScreen
        onForgotPassword={() => setAuthScreen('forgot-password')}
        onSwitchToSignUp={() => setAuthScreen('sign-up')}
      />
    );
  }

  if (authScreen === 'sign-up') {
    return <SignUpScreen onSwitchToSignIn={() => setAuthScreen('sign-in')} />;
  }

  if (authScreen === 'forgot-password') {
    return <ForgotPasswordScreen onBackToSignIn={() => setAuthScreen('sign-in')} />;
  }

  // Landing page
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <div className="text-center space-y-6">
        <h1
          className="font-display"
          style={{ fontSize: 48, fontWeight: 400, letterSpacing: '-0.03em' }}
        >
          Cue<em style={{ color: 'var(--amber)', fontStyle: 'italic' }}>tation</em>
        </h1>
        <p className="font-mono text-sm" style={{ color: 'var(--text-mid)', maxWidth: 400 }}>
          Video cue annotation for stage managers
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => setAuthScreen('sign-in')}
            className="px-6 py-2.5 rounded font-mono text-sm font-medium cursor-pointer transition-colors"
            style={{ background: 'var(--amber)', color: 'var(--text-inv)', border: 'none' }}
          >
            Sign in
          </button>
          <button
            onClick={() => setAuthScreen('sign-up')}
            className="px-6 py-2.5 rounded font-mono text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border-hi)',
            }}
          >
            Sign up
          </button>
        </div>
      </div>
    </div>
  );
}

