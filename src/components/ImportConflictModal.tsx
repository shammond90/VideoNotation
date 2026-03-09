import { useState } from 'react';

interface ImportConflictModalProps {
  existingName: string;
  onCancel: () => void;
  onOverwrite: () => void;
  onRename: (newName: string) => void;
}

/**
 * Modal shown when importing a project whose name matches an existing project.
 * Offers Cancel, Overwrite, or Rename options.
 */
export function ImportConflictModal({
  existingName,
  onCancel,
  onOverwrite,
  onRename,
}: ImportConflictModalProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(`${existingName} (imported)`);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="rounded-lg shadow-xl w-full max-w-md p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text)' }}>Name Conflict</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-mid)' }}>
          A project named <strong style={{ color: 'var(--text)' }}>" {existingName}"</strong> already exists.
        </p>

        {renaming ? (
          <div className="space-y-3">
            <label className="block text-sm" style={{ color: 'var(--text-mid)' }}>
              New project name
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
                className="mt-1 block w-full rounded px-3 py-2 text-sm outline-none"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)', caretColor: 'var(--amber)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newName.trim()) {
                    onRename(newName.trim());
                  }
                }}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRenaming(false)}
                className="px-4 py-2 text-sm transition-colors"
                style={{ color: 'var(--text-mid)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-mid)')}
              >
                Back
              </button>
              <button
                onClick={() => onRename(newName.trim())}
                disabled={!newName.trim()}
                className="px-4 py-2 text-sm text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--amber)' }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--amber-hi)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--amber)'; }}
              >
                Import as Renamed
              </button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm transition-colors"
              style={{ color: 'var(--text-mid)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-mid)')}
            >
              Cancel
            </button>
            <button
              onClick={() => setRenaming(true)}
              className="px-4 py-2 text-sm rounded transition-colors"
              style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
            >
              Rename
            </button>
            <button
              onClick={onOverwrite}
              className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Overwrite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
