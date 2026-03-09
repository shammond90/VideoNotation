interface SavePromptModalProps {
  isOpen: boolean;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Modal prompting the user to save changes before leaving.
 */
export function SavePromptModal({
  isOpen,
  onSave,
  onDiscard,
  onCancel,
  isLoading = false,
}: SavePromptModalProps) {
  if (!isOpen) return null;

  const handleSave = async () => {
    await onSave();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-4">
      <div className="rounded-lg max-w-md w-full" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Unsaved Changes</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-mid)' }}>
            You have unsaved changes. Do you want to save before leaving?
          </p>
        </div>

        {/* Actions */}
        <div className="p-6 space-y-3">
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="w-full text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'var(--amber)' }}
            onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--amber-hi)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--amber)'; }}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={onDiscard}
            disabled={isLoading}
            className="w-full font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
          >
            Discard
          </button>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="w-full font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg-panel)')}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
