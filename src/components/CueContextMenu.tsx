import { useState, useEffect, useRef, useCallback } from 'react';
import { Pencil, Copy, Trash2, Flag, FlagOff, ArrowUp, ArrowDown, MessageSquare } from 'lucide-react';
import type { Annotation, CueStatus } from '../types';
import { CUE_STATUSES, CUE_STATUS_LABELS, CUE_STATUS_COLORS } from '../types';

export interface ContextMenuAction {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSetStatus: (status: CueStatus) => void;
  onToggleFlag: () => void;
  onEditFlagNote: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

interface CueContextMenuProps {
  annotation: Annotation;
  position: { x: number; y: number };
  actions: ContextMenuAction;
  isTied: boolean;
  isFirstInTie: boolean;
  isLastInTie: boolean;
  onClose: () => void;
}

export function CueContextMenu({
  annotation,
  position,
  actions,
  isTied,
  isFirstInTie,
  isLastInTie,
  onClose,
}: CueContextMenuProps) {
  const [statusSubmenuOpen, setStatusSubmenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [submenuFlip, setSubmenuFlip] = useState(false);

  // Position the menu within viewport
  const [pos, setPos] = useState(position);
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (x + rect.width > window.innerWidth - 8) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight - 8) y = window.innerHeight - rect.height - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    setPos({ x, y });
  }, [position]);

  // Close on outside click or Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const handleStatusHover = useCallback((enter: boolean) => {
    clearTimeout(statusTimeoutRef.current);
    if (enter) {
      setStatusSubmenuOpen(true);
    } else {
      statusTimeoutRef.current = setTimeout(() => setStatusSubmenuOpen(false), 150);
    }
  }, []);

  // Auto-flip submenu when it would overflow the right edge
  useEffect(() => {
    if (!statusSubmenuOpen || !menuRef.current) return;
    const menuRect = menuRef.current.getBoundingClientRect();
    const submenuWidth = 150; // approximate minWidth + margin
    const wouldOverflow = menuRect.right + submenuWidth > window.innerWidth - 8;
    setSubmenuFlip(wouldOverflow);
  }, [statusSubmenuOpen]);

  const menuItem = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    opts?: { danger?: boolean; disabled?: boolean; dimmed?: boolean },
  ) => (
    <button
      type="button"
      disabled={opts?.disabled}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors text-left disabled:opacity-30 disabled:cursor-not-allowed"
      style={{ color: opts?.danger ? 'var(--red)' : opts?.dimmed ? 'var(--text-dim)' : 'var(--text-mid)' }}
      onMouseEnter={(e) => { if (!opts?.disabled) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = opts?.danger ? 'var(--red)' : 'var(--text)'; } }}
      onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = opts?.danger ? 'var(--red)' : opts?.dimmed ? 'var(--text-dim)' : 'var(--text-mid)'; }}
    >
      {icon}
      {label}
    </button>
  );

  const divider = <div className="my-1 h-px" style={{ background: 'var(--border)' }} />;

  return (
    <div
      ref={menuRef}
      className="fixed rounded-lg border shadow-xl py-1.5"
      style={{
        left: pos.x,
        top: pos.y,
        zIndex: 1000,
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        minWidth: 180,
        backdropFilter: 'blur(12px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Edit */}
      {menuItem('Edit cue', <Pencil className="w-3.5 h-3.5" />, () => { actions.onEdit(); })}

      {/* Duplicate */}
      {menuItem('Duplicate cue', <Copy className="w-3.5 h-3.5" />, () => { actions.onDuplicate(); })}

      {divider}

      {/* Status submenu */}
      <div
        className="relative"
        onMouseEnter={() => handleStatusHover(true)}
        onMouseLeave={() => handleStatusHover(false)}
        onClick={() => setStatusSubmenuOpen((p) => !p)}
      >
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs rounded transition-colors text-left"
          style={{ color: 'var(--text-mid)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-mid)'; }}
        >
          <span className="flex items-center gap-2">
            {annotation.status !== 'provisional' && (
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: CUE_STATUS_COLORS[annotation.status] }} />
            )}
            <span>Set status</span>
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>\u203A</span>
        </button>

        {statusSubmenuOpen && (
          <div
            ref={submenuRef}
            className={`absolute top-0 rounded-lg border shadow-xl py-1.5 ${submenuFlip ? 'right-full mr-1' : 'left-full ml-1'}`}
            style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', minWidth: 140, zIndex: 1001 }}
            onMouseEnter={() => handleStatusHover(true)}
            onMouseLeave={() => handleStatusHover(false)}
          >
            {CUE_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => { e.stopPropagation(); actions.onSetStatus(s); }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs rounded transition-colors text-left"
                style={{
                  color: annotation.status === s ? 'var(--text)' : 'var(--text-mid)',
                  fontWeight: annotation.status === s ? 600 : 400,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{
                    background: s === 'provisional' ? 'transparent' : CUE_STATUS_COLORS[s],
                    border: s === 'provisional' ? '1px solid var(--text-dim)' : 'none',
                  }}
                />
                {CUE_STATUS_LABELS[s]}
                {annotation.status === s && <span style={{ color: 'var(--text-dim)', marginLeft: 'auto' }}>\u2713</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {divider}

      {/* Flag */}
      {annotation.flagged ? (
        <>
          {menuItem('Remove flag', <FlagOff className="w-3.5 h-3.5" />, () => { actions.onToggleFlag(); })}
          {menuItem('Edit flag note', <MessageSquare className="w-3.5 h-3.5" />, () => { actions.onEditFlagNote(); }, { dimmed: true })}
        </>
      ) : (
        menuItem('Flag this cue', <Flag className="w-3.5 h-3.5" />, () => { actions.onToggleFlag(); })
      )}

      {/* Tie group reorder */}
      {isTied && (
        <>
          {divider}
          {menuItem('Move up in group', <ArrowUp className="w-3.5 h-3.5" />, () => { actions.onMoveUp?.(); }, { disabled: isFirstInTie })}
          {menuItem('Move down in group', <ArrowDown className="w-3.5 h-3.5" />, () => { actions.onMoveDown?.(); }, { disabled: isLastInTie })}
        </>
      )}

      {divider}

      {/* Delete — inline confirmation */}
      {confirmDelete ? (
        <div className="flex items-center gap-2 px-3 py-1.5">
          <span className="text-red-400 text-xs">Are you sure?</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); actions.onDelete(); }}
            className="text-xs px-2 py-0.5 bg-red-600 text-white rounded hover:bg-red-500"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
            className="text-xs px-2 py-0.5 rounded"
            style={{ background: 'var(--bg-panel)', color: 'var(--text-mid)' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        menuItem('Delete cue', <Trash2 className="w-3.5 h-3.5" />, () => setConfirmDelete(true), { danger: true })
      )}
    </div>
  );
}
