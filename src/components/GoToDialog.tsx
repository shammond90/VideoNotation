/**
 * GoToDialog — a small centered overlay for jumping to a timecode or cue.
 *
 * Activated by pressing G. The user can type either:
 * - A timecode (HH:MM:SS:FF, HH:MM:SS, or MM:SS) → jumps to that time
 * - A cue reference like "LX35" (type short-code + cue number) → jumps to that cue
 *
 * Enter executes the jump. Escape closes the dialog.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { parseTime } from '../utils/formatTime';
import type { Annotation } from '../types';

interface GoToDialogProps {
  annotations: Annotation[];
  cueTypeShortCodes: Record<string, string>; // { 'LX': 'L', 'SND': 'S', ... }
  cueTypes: string[];
  onSeek: (time: number, annotationId?: string) => void;
  onClose: () => void;
}

export function GoToDialog({ annotations, cueTypeShortCodes, cueTypes, onSeek, onClose }: GoToDialogProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  // Build a reverse lookup: short code → full type name (case-insensitive)
  const resolveType = useCallback((input: string): string | null => {
    const upper = input.toUpperCase();
    // Direct match on full type name
    const directMatch = cueTypes.find(t => t.toUpperCase() === upper);
    if (directMatch) return directMatch;
    // Match on short code
    for (const [typeName, shortCode] of Object.entries(cueTypeShortCodes)) {
      if (shortCode.toUpperCase() === upper) return typeName;
    }
    return null;
  }, [cueTypes, cueTypeShortCodes]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) { onClose(); return; }

    // 1) Try parsing as timecode
    const seconds = parseTime(trimmed);
    if (seconds !== null && seconds >= 0) {
      // Find the first annotation at or after this time to scroll to
      const nearest = [...annotations]
        .filter(a => a.type === 'cue')
        .sort((a, b) => Math.abs(a.timestamp - seconds) - Math.abs(b.timestamp - seconds))[0];
      onSeek(seconds, nearest?.id);
      onClose();
      return;
    }

    // 2) Try parsing as cue reference: e.g. "LX35", "L 35", "SND 101"
    // Split into type prefix and number suffix
    const cueMatch = trimmed.match(/^([A-Za-z]+)\s*(.+)$/);
    if (cueMatch) {
      const typeInput = cueMatch[1];
      const cueNumInput = cueMatch[2].trim();

      const matchedType = resolveType(typeInput);
      if (matchedType) {
        // Find the annotation with this type and cue number
        const found = annotations.find(
          a => a.cue.type === matchedType && a.cue.cueNumber.toLowerCase() === cueNumInput.toLowerCase()
        );
        if (found) {
          onSeek(found.timestamp, found.id);
          onClose();
          return;
        }
        setError(`No "${matchedType}" cue #${cueNumInput} found`);
        return;
      }
    }

    setError('Enter a timecode (00:01:30) or cue (LX35)');
  }, [value, annotations, resolveType, onSeek, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="rounded-lg shadow-xl w-80"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
      >
        {/* Header */}
        <div className="px-4 pt-3 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            Go To
          </span>
        </div>

        {/* Input */}
        <div className="px-4 pb-3">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="00:01:30 or LX35"
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: 'var(--bg-input)',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              color: 'var(--text)',
              outline: 'none',
              fontFamily: 'var(--font-mono, monospace)',
            }}
            autoComplete="off"
            spellCheck={false}
          />

          {/* Error message */}
          {error && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--red)' }}>{error}</p>
          )}

          {/* Hint */}
          <p className="text-[10px] mt-2" style={{ color: 'var(--text-dim)' }}>
            Timecode (00:01:30;00) or cue type + number (LX35)
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 px-4 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded text-xs"
            style={{ color: 'var(--text-mid)', background: 'transparent', border: '1px solid var(--border)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-3 py-1 rounded text-xs font-medium"
            style={{ background: 'var(--amber, #f59e0b)', color: '#000', cursor: 'pointer', border: 'none' }}
          >
            Go
          </button>
        </div>
      </div>
    </div>
  );
}
