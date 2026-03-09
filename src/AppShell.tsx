import { useState, useEffect, useCallback, useRef } from 'react';
import { useProject } from './hooks/useProject';
import { HomeScreen } from './components/HomeScreen';
import { CreateProjectForm } from './components/CreateProjectForm';
import { ImportConflictModal } from './components/ImportConflictModal';
import { ProjectSwitcherModal } from './components/ProjectSwitcherModal';
import { parseImportedProject, importProject, deleteProject as deleteProjectFromStorage } from './utils/projectStorage';
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
  } = useProject();

  const [appState, setAppState] = useState<AppShellState>({ screen: 'home' });
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState(false);

  // Import flow state
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importConflict, setImportConflict] = useState<{
    parsed: Omit<Project, 'id'>;
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
    }) => {
      try {
        await createNewProject(data.name, data);
        setAppState({ screen: 'cue-sheet' });
      } catch (err) {
        console.error('Failed to create project:', err);
        alert('Failed to create project');
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
        alert('Failed to open project');
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
          (p) => p.name.toLowerCase() === parsed.name.toLowerCase()
        );

        if (existing) {
          setImportConflict({ parsed, existingProject: existing });
        } else {
          // No conflict — import directly
          const imported = await importProject(parsed);
          await loadAllProjects();
          await openProject(imported.id);
          setAppState({ screen: 'cue-sheet' });
        }
      } catch (err) {
        console.error('Import failed:', err);
        alert(
          `Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`
        );
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
      const imported = await importProject(importConflict.parsed);
      setImportConflict(null);
      await loadAllProjects();
      await openProject(imported.id);
      setAppState({ screen: 'cue-sheet' });
    } catch (err) {
      console.error('Import overwrite failed:', err);
      alert('Failed to import project');
      setImportConflict(null);
    }
  }, [importConflict, loadAllProjects, openProject]);

  const handleImportConflictRename = useCallback(
    async (newName: string) => {
      if (!importConflict) return;
      try {
        const imported = await importProject(importConflict.parsed, newName);
        setImportConflict(null);
        await loadAllProjects();
        await openProject(imported.id);
        setAppState({ screen: 'cue-sheet' });
      } catch (err) {
        console.error('Import rename failed:', err);
        alert('Failed to import project');
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
        alert('Failed to switch project');
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
            existingName={importConflict.parsed.name}
            onCancel={handleImportConflictCancel}
            onOverwrite={handleImportConflictOverwrite}
            onRename={handleImportConflictRename}
          />
        )}
      </>
    );
  }

  if (appState.screen === 'create-project') {
    return (
      <CreateProjectForm
        onCancel={handleCreateProjectCancel}
        onCreate={handleCreateProjectSubmit}
      />
    );
  }

  if (appState.screen === 'cue-sheet' && currentProject) {
    return (
      <>
        <App
          projectId={currentProject.id}
          projectName={currentProject.name}
          onGoHome={handleGoHome}
          onSwitchProject={handleOpenSwitcher}
          onVideoLoaded={handleVideoLoaded}
          onUnsavedChangesChange={setUnsavedChanges}
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
}

