import type { Project } from '../types/index';

interface ProjectSwitcherModalProps {
  isOpen: boolean;
  currentProjectId: string | null;
  projects: Project[];
  onProjectSelected: (projectId: string) => void;
  onClose: () => void;
}

/**
 * Modal for switching between projects from the cue sheet.
 * Triggered by "Change Project" button in the header.
 */
export function ProjectSwitcherModal({
  isOpen,
  currentProjectId,
  projects,
  onProjectSelected,
  onClose,
}: ProjectSwitcherModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="rounded-lg max-w-md w-full max-h-96 flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Switch Project</h2>
          <button
            onClick={onClose}
            className="text-2xl font-light transition-colors"
            style={{ color: 'var(--text-mid)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-mid)')}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Project list */}
        <div className="overflow-y-auto flex-1 p-4">
          {projects.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'var(--text-mid)' }}>No projects found</p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => {
                    onProjectSelected(project.id);
                    onClose();
                  }}
                  className="w-full text-left p-3 rounded-lg transition-colors"
                  style={{
                    background: currentProjectId === project.id ? 'var(--amber)' : 'var(--bg-panel)',
                    color: currentProjectId === project.id ? 'white' : 'var(--text)',
                    border: '1px solid ' + (currentProjectId === project.id ? 'var(--amber)' : 'var(--border)'),
                  }}
                  onMouseEnter={e => { if (currentProjectId !== project.id) { e.currentTarget.style.background = 'var(--bg-hover)'; } }}
                  onMouseLeave={e => { if (currentProjectId !== project.id) { e.currentTarget.style.background = 'var(--bg-panel)'; } }}
                >
                  <p className="font-semibold">{project.name}</p>
                  {project.production_name && (
                    <p className="text-xs mt-1" style={{ color: currentProjectId === project.id ? 'var(--text-mid)' : 'var(--text-dim)' }}>{project.production_name}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={onClose}
            className="w-full font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
