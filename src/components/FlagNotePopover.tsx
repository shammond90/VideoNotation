import { useState, useEffect, useRef } from 'react';

interface FlagNotePopoverProps {
  /** Current note text */
  initialNote: string;
  /** Position relative to the flag icon */
  anchorRect: DOMRect;
  onSave: (note: string) => void;
  onClose: () => void;
}

export function FlagNotePopover({ initialNote, anchorRect, onSave, onClose }: FlagNotePopoverProps) {
  const [note, setNote] = useState(initialNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTimeout(() => textareaRef.current?.focus(), 30);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onSave(note);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleKey);
    };
  }, [note, onSave, onClose]);

  // Position below the anchor, clamped to viewport
  const top = Math.min(anchorRect.bottom + 4, window.innerHeight - 140);
  const left = Math.min(anchorRect.left, window.innerWidth - 230);

  return (
    <div
      ref={popoverRef}
      className="fixed rounded-lg border shadow-xl p-2 z-[1001]"
      style={{
        top,
        left,
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        width: 220,
      }}
    >
      <textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(note); }
        }}
        placeholder="Add a note (optional)..."
        rows={3}
        className="w-full text-xs rounded outline-none resize-none"
        style={{
          background: 'var(--bg-input)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          padding: '6px 8px',
          caretColor: 'var(--amber)',
        }}
      />
      <div className="flex items-center justify-end gap-1.5 mt-1.5">
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] px-2 py-1 rounded transition-colors"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(note)}
          className="text-[10px] px-2 py-1 rounded transition-colors font-medium"
          style={{ background: 'var(--amber)', color: '#fff' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
