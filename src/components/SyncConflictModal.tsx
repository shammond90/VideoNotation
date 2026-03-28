import type { Project } from '../types/index';

export type SyncResolution =
  | 'use-cloud'
  | 'keep-local'
  | 'copy-local'    // keep cloud as active, save local as copy
  | 'copy-cloud'    // keep local as active, save cloud as copy
  | 'resolve-later';

interface SyncConflictModalProps {
  localProject: Project;
  cloudProject: Project;
  onResolve: (resolution: SyncResolution) => void;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function SyncConflictModal({
  localProject,
  cloudProject,
  onResolve,
}: SyncConflictModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        className="rounded-lg shadow-xl w-full max-w-lg p-6"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>
          Project Out of Sync
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-mid)' }}>
          <strong style={{ color: 'var(--text)' }}>"{localProject.name}"</strong> has been
          edited both locally and in the cloud. Choose how to resolve the conflict.
        </p>

        {/* Comparison */}
        <div
          className="grid grid-cols-2 gap-4 mb-5 rounded-md p-3 text-sm"
          style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
        >
          <div>
            <div className="font-medium mb-1" style={{ color: 'var(--text-mid)' }}>
              This Device
            </div>
            <div style={{ color: 'var(--text)' }}>
              {formatDate(localProject.updated_at)}
            </div>
          </div>
          <div>
            <div className="font-medium mb-1" style={{ color: 'var(--text-mid)' }}>
              Cloud
            </div>
            <div style={{ color: 'var(--text)' }}>
              {formatDate(cloudProject.updated_at)}
            </div>
          </div>
        </div>

        {/* Primary actions */}
        <div className="flex flex-col gap-2 mb-3">
          <button
            onClick={() => onResolve('use-cloud')}
            className="w-full px-4 py-2 text-sm rounded transition-colors text-white"
            style={{ background: 'var(--amber)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--amber-hi)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--amber)')}
          >
            Use Cloud Version
          </button>
          <button
            onClick={() => onResolve('keep-local')}
            className="w-full px-4 py-2 text-sm rounded transition-colors"
            style={{ background: 'var(--bg-panel)', color: 'var(--text)', border: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
          >
            Keep Local Version
          </button>
        </div>

        {/* Copy actions */}
        <div
          className="flex gap-2 mb-3 pt-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={() => onResolve('copy-local')}
            className="flex-1 px-3 py-2 text-xs rounded transition-colors"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
            title="Use cloud as active project, save local as a copy"
          >
            Keep Cloud, Copy Local
          </button>
          <button
            onClick={() => onResolve('copy-cloud')}
            className="flex-1 px-3 py-2 text-xs rounded transition-colors"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)', border: '1px solid var(--border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
            title="Keep local as active project, save cloud as a copy"
          >
            Keep Local, Copy Cloud
          </button>
        </div>

        {/* Resolve later */}
        <div className="flex justify-end">
          <button
            onClick={() => onResolve('resolve-later')}
            className="px-4 py-2 text-sm transition-colors"
            style={{ color: 'var(--text-mid)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-mid)')}
          >
            Resolve Later
          </button>
        </div>
      </div>
    </div>
  );
}
