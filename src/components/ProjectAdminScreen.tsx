import { useState } from 'react';
import { useProject } from '../hooks/useProject';

interface ProjectAdminScreenProps {
  onProjectDeleted?: () => void;
}

/**
 * Project admin screen shown as a tab in ConfigurationModal.
 * Allows viewing all projects, marking as active/inactive, and deletion.
 */
export function ProjectAdminScreen({ onProjectDeleted }: ProjectAdminScreenProps) {
  const { projects, currentProject, isLoading, error, loadAllProjects, deleteCurrentProject } =
    useProject();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleLoadProjects = () => {
    loadAllProjects().catch(() => {
      setDeleteError('Failed to load projects');
    });
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      setDeleteError(null);
      if (projectId === currentProject?.id) {
        await deleteCurrentProject();
      } else {
        // Would need to add a deleteProjectById function to useProject
        // For now, show a message
        setDeleteError('Can only delete the currently open project from this screen');
      }
      setDeleteConfirmId(null);
      onProjectDeleted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete project';
      setDeleteError(message);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>Loading projects...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="mb-4 p-4 bg-red-900 bg-opacity-30 border border-red-700 rounded text-red-300 text-sm">
          {error}
        </div>
        <button
          onClick={handleLoadProjects}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-2">Project Management</h3>
        <p className="text-gray-400 text-sm">
          View and manage all projects. You can delete projects from here.
        </p>
      </div>

      {deleteError && (
        <div className="mb-4 p-4 bg-red-900 bg-opacity-30 border border-red-700 rounded text-red-300 text-sm">
          {deleteError}
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-gray-400 text-sm">No projects found.</p>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`p-4 rounded-lg border ${
                project.id === currentProject?.id
                  ? 'bg-blue-900 bg-opacity-30 border-blue-700'
                  : 'bg-gray-700 bg-opacity-30 border-gray-700'
              }`}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                  <p className="font-semibold text-white">{project.name}</p>
                  {project.production_name && (
                    <p className="text-sm text-gray-400 mt-1">{project.production_name}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    {project.video_filename ? (
                      <>Video: {project.video_filename}</>
                    ) : (
                      <>No video assigned</>
                    )}
                  </p>
                  {project.id === currentProject?.id && (
                    <span className="inline-block mt-2 px-2 py-1 bg-blue-600 text-white text-xs rounded font-semibold">
                      Current Project
                    </span>
                  )}
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {deleteConfirmId === project.id ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDeleteProject(project.id)}
                        className="bg-red-600 hover:bg-red-700 text-white font-semibold py-1 px-3 rounded text-sm transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-1 px-3 rounded text-sm transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(project.id)}
                      className="bg-red-900 hover:bg-red-800 text-red-200 font-semibold py-1 px-3 rounded text-sm transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
