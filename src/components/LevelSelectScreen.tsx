import { useState } from 'react';
import { useTier } from '../hooks/useTier';
import {
  SELECTABLE_TIERS,
  TIER_DESCRIPTIONS,
  TIER_FEATURE_TABLE,
  type SelectableTier,
} from '../config/tierLimits';

interface LevelSelectScreenProps {
  /** If true, shows a "Back" / cancel option (e.g. when changing level from settings). */
  allowCancel?: boolean;
  onCancel?: () => void;
  onSelected?: () => void;
}

/**
 * Full-screen level selection with feature comparison table.
 * Shown on first sign-in (tier === 'starter') and from settings.
 */
export function LevelSelectScreen({ allowCancel, onCancel, onSelected }: LevelSelectScreenProps) {
  const { updateTier } = useTier();
  const [selected, setSelected] = useState<SelectableTier | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!selected) return;
    setIsSaving(true);
    setError(null);
    try {
      await updateTier(selected);
      onSelected?.();
    } catch {
      setError('Could not save your selection. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Header */}
      <div className="text-center mb-10 max-w-lg">
        <h1
          className="font-display mb-2"
          style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}
        >
          Choose your experience level
        </h1>
        <p className="font-mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          This controls which features are available. You can change it anytime in settings.
        </p>
      </div>

      {/* Tier cards */}
      <div className="flex flex-wrap gap-4 justify-center mb-8">
        {SELECTABLE_TIERS.map((t) => {
          const desc = TIER_DESCRIPTIONS[t];
          const isActive = selected === t;
          return (
            <button
              key={t}
              onClick={() => setSelected(t)}
              className="relative rounded-lg text-left transition-all duration-150 cursor-pointer"
              style={{
                width: 200,
                padding: '20px 18px',
                background: isActive ? 'var(--surface-hi)' : 'var(--surface)',
                border: isActive
                  ? '2px solid var(--amber)'
                  : '2px solid var(--border)',
                boxShadow: isActive ? '0 0 0 1px var(--amber)' : 'none',
              }}
            >
              <span
                className="block font-display"
                style={{ fontSize: 18, fontWeight: 500, color: isActive ? 'var(--amber)' : 'var(--text)' }}
              >
                {desc.title}
              </span>
              <span
                className="block mt-1 font-mono"
                style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.4 }}
              >
                {desc.subtitle}
              </span>
            </button>
          );
        })}
      </div>

      {/* Feature comparison table */}
      <div
        className="rounded-lg overflow-hidden mb-8"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxWidth: 640,
          width: '100%',
        }}
      >
        <table className="w-full text-left font-mono" style={{ fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="px-4 py-2.5" style={{ color: 'var(--text-dim)', fontWeight: 500 }}>
                Feature
              </th>
              {SELECTABLE_TIERS.map((t) => (
                <th
                  key={t}
                  className="px-4 py-2.5 text-center"
                  style={{
                    color: selected === t ? 'var(--amber)' : 'var(--text-mid)',
                    fontWeight: 500,
                    transition: 'color 0.15s',
                  }}
                >
                  {TIER_DESCRIPTIONS[t].title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIER_FEATURE_TABLE.map((row, i) => (
              <tr
                key={row.label}
                style={{
                  borderBottom:
                    i < TIER_FEATURE_TABLE.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <td className="px-4 py-2" style={{ color: 'var(--text-mid)' }}>
                  {row.label}
                </td>
                <td className="px-4 py-2 text-center" style={{ color: 'var(--text-dim)' }}>
                  {row.beginner}
                </td>
                <td className="px-4 py-2 text-center" style={{ color: 'var(--text-dim)' }}>
                  {row.advanced}
                </td>
                <td className="px-4 py-2 text-center" style={{ color: 'var(--text-dim)' }}>
                  {row.expert}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {allowCancel && (
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded font-mono text-sm transition-colors cursor-pointer"
            style={{
              background: 'transparent',
              color: 'var(--text-mid)',
              border: '1px solid var(--border-hi)',
            }}
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleConfirm}
          disabled={!selected || isSaving}
          className="px-6 py-2 rounded font-mono text-sm font-medium transition-colors cursor-pointer"
          style={{
            background: selected ? 'var(--amber)' : 'var(--surface-hi)',
            color: selected ? 'var(--bg)' : 'var(--text-dim)',
            border: 'none',
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? 'Saving…' : 'Continue'}
        </button>
      </div>

      {error && (
        <p className="mt-4 font-mono text-xs" style={{ color: 'var(--red)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
