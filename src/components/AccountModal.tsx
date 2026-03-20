import { useState, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/react';
import { useTier } from '../hooks/useTier';
import {
  SELECTABLE_TIERS,
  TIER_DESCRIPTIONS,
  type SelectableTier,
} from '../config/tierLimits';
import {
  X,
  User as UserIcon,
  Star,
  Trash2,
  AlertTriangle,
  Check,
  ChevronRight,
} from 'lucide-react';

type Tab = 'profile' | 'plan' | 'danger';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after account deletion so AppShell can clean up local state. */
  onAccountDeleted?: () => void;
}

/**
 * Full-featured account management modal.
 * Tabs: Profile · Plan · Danger Zone
 */
export function AccountModal({ isOpen, onClose, onAccountDeleted }: AccountModalProps) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { tier, updateTier } = useTier();
  const [tab, setTab] = useState<Tab>('profile');

  // ── Profile state ─────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(user?.fullName ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // ── Plan state ────────────────────────────────────────────────────
  const [changingTier, setChangingTier] = useState(false);

  // ── Delete state ──────────────────────────────────────────────────
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Profile handlers ──────────────────────────────────────────────

  const handleSaveProfile = useCallback(async () => {
    if (!user) return;
    setProfileSaving(true);
    try {
      await user.update({ firstName: displayName.split(' ')[0], lastName: displayName.split(' ').slice(1).join(' ') || undefined });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setProfileSaving(false);
    }
  }, [user, displayName]);

  // ── Plan handlers ─────────────────────────────────────────────────

  const handleChangeTier = useCallback(
    async (newTier: SelectableTier) => {
      setChangingTier(true);
      try {
        const token = await getToken();
        const res = await fetch('/api/set-experience-level', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ level: newTier }),
        });

        if (res.ok || res.status === 404) {
          await updateTier(newTier);
        }
      } catch {
        // Fallback to client-side
        await updateTier(newTier);
      } finally {
        setChangingTier(false);
      }
    },
    [getToken, updateTier],
  );

  // ── Delete handlers ───────────────────────────────────────────────

  const handleDeleteAccount = useCallback(async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const token = await getToken();
      const res = await fetch('/api/delete-account', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }

      // Clear local data
      localStorage.clear();
      onAccountDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong');
      setIsDeleting(false);
    }
  }, [deleteConfirmText, getToken, onAccountDeleted]);

  if (!isOpen) return null;

  const currentTierLabel =
    tier === 'starter'
      ? 'Starter'
      : TIER_DESCRIPTIONS[tier as SelectableTier]?.title ?? tier;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg rounded-lg shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <h2 className="font-mono text-sm font-medium" style={{ color: 'var(--text)' }}>
            Account
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/5 transition-colors cursor-pointer"
            style={{ color: 'var(--text-mid)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
          {([
            { id: 'profile', label: 'Profile', icon: UserIcon },
            { id: 'plan', label: 'Plan', icon: Star },
            { id: 'danger', label: 'Danger Zone', icon: AlertTriangle },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-1.5 px-3 py-2 font-mono text-xs cursor-pointer transition-colors rounded-t"
              style={{
                color: tab === id ? 'var(--amber)' : 'var(--text-mid)',
                borderBottom: tab === id ? '2px solid var(--amber)' : '2px solid transparent',
                background: 'transparent',
                border: 'none',
                borderBottomWidth: '2px',
                borderBottomStyle: 'solid',
                borderBottomColor: tab === id ? 'var(--amber)' : 'transparent',
              }}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5" style={{ minHeight: 240 }}>
          {/* ── Profile Tab ────────────────────────────────── */}
          {tab === 'profile' && (
            <div className="space-y-4">
              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: 'var(--text-mid)' }}>
                  Email
                </label>
                <div
                  className="px-3 py-2 rounded text-sm font-mono"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-mid)',
                    opacity: 0.7,
                  }}
                >
                  {user?.primaryEmailAddress?.emailAddress ?? '—'}
                </div>
                <p className="mt-1 font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
                  Email is managed by your sign-in provider
                </p>
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: 'var(--text-mid)' }}>
                  Display name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    setProfileSaved(false);
                  }}
                  className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                  placeholder="Your name"
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={profileSaving || profileSaved}
                className="flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
                style={{
                  background: profileSaved ? '#2a5a2a' : 'var(--amber)',
                  color: profileSaved ? '#ede9e3' : 'var(--text-inv)',
                  border: 'none',
                }}
              >
                {profileSaved ? (
                  <>
                    <Check size={13} /> Saved
                  </>
                ) : profileSaving ? (
                  'Saving…'
                ) : (
                  'Save changes'
                )}
              </button>
            </div>
          )}

          {/* ── Plan Tab ───────────────────────────────────── */}
          {tab === 'plan' && (
            <div className="space-y-4">
              <div>
                <p className="font-mono text-xs mb-1" style={{ color: 'var(--text-mid)' }}>
                  Current plan
                </p>
                <p className="font-mono text-base font-medium" style={{ color: 'var(--amber)' }}>
                  {currentTierLabel}
                </p>
              </div>

              <div>
                <p className="font-mono text-xs mb-3" style={{ color: 'var(--text-mid)' }}>
                  Switch experience level
                </p>
                <div className="space-y-2">
                  {SELECTABLE_TIERS.map((t) => {
                    const desc = TIER_DESCRIPTIONS[t];
                    const isCurrent = t === tier;
                    return (
                      <button
                        key={t}
                        onClick={() => !isCurrent && handleChangeTier(t)}
                        disabled={isCurrent || changingTier}
                        className="w-full flex items-center justify-between px-4 py-3 rounded transition-colors cursor-pointer disabled:cursor-default"
                        style={{
                          background: isCurrent ? 'var(--amber-10, rgba(191,87,0,0.1))' : 'var(--bg)',
                          border: isCurrent ? '1px solid var(--amber)' : '1px solid var(--border)',
                          opacity: changingTier && !isCurrent ? 0.5 : 1,
                        }}
                      >
                        <div className="text-left">
                          <span
                            className="font-mono text-sm font-medium block"
                            style={{ color: isCurrent ? 'var(--amber)' : 'var(--text)' }}
                          >
                            {desc.title}
                            {isCurrent && (
                              <span className="ml-2 text-xs opacity-60">(current)</span>
                            )}
                          </span>
                          <span
                            className="font-mono text-xs block mt-0.5"
                            style={{ color: 'var(--text-mid)' }}
                          >
                            {desc.subtitle}
                          </span>
                        </div>
                        {!isCurrent && (
                          <ChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Danger Zone Tab ────────────────────────────── */}
          {tab === 'danger' && (
            <div className="space-y-4">
              <div
                className="p-4 rounded"
                style={{
                  background: 'rgba(220, 38, 38, 0.05)',
                  border: '1px solid rgba(220, 38, 38, 0.2)',
                }}
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <p className="font-mono text-sm font-medium" style={{ color: '#dc2626' }}>
                      Delete account
                    </p>
                    <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-mid)' }}>
                      Permanently delete your account and all associated data including projects,
                      cues, templates, and settings. This action cannot be undone.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-mono text-xs mb-1.5" style={{ color: 'var(--text-mid)' }}>
                  Type <strong style={{ color: '#dc2626' }}>DELETE</strong> to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 rounded text-sm font-mono outline-none"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                  placeholder="DELETE"
                  autoComplete="off"
                />
              </div>

              {deleteError && (
                <p className="font-mono text-xs" style={{ color: '#dc2626' }}>
                  {deleteError}
                </p>
              )}

              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'DELETE' || isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs font-medium cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: '#dc2626',
                  color: '#fff',
                  border: 'none',
                }}
              >
                <Trash2 size={13} />
                {isDeleting ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
