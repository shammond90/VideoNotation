import { useState, useRef, useEffect, useCallback } from 'react';
import { useUser, useClerk } from '@clerk/react';
import { LogOut, Settings } from 'lucide-react';

interface UserMenuProps {
  /** Opens the Account modal. */
  onOpenAccount: () => void;
}

/**
 * Custom user menu replacing Clerk's UserButton.
 * Shows avatar/initials, with a dropdown: Account, Sign out.
 */
export function UserMenu({ onOpenAccount }: UserMenuProps) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [open]);

  const handleAccount = useCallback(() => {
    setOpen(false);
    onOpenAccount();
  }, [onOpenAccount]);

  const handleSignOut = useCallback(() => {
    setOpen(false);
    signOut();
  }, [signOut]);

  // Avatar: use Clerk imageUrl or fallback to initials
  const imageUrl = user?.imageUrl;
  const initials = getInitials(user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? '?');

  return (
    <div ref={menuRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-full overflow-hidden cursor-pointer transition-shadow hover:ring-2"
        style={{
          width: 32,
          height: 32,
          background: imageUrl ? 'transparent' : 'var(--amber)',
          color: 'var(--text-inv)',
          border: '2px solid var(--border-hi)',
        }}
        aria-label="Account menu"
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="font-mono text-xs font-bold">{initials}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-48 rounded-lg shadow-xl overflow-hidden z-50"
          style={{
            background: 'var(--bg-raised)',
            border: '1px solid var(--border)',
          }}
        >
          {/* User info header */}
          <div className="px-3 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
            <p
              className="font-mono text-xs font-medium truncate"
              style={{ color: 'var(--text)' }}
            >
              {user?.fullName || 'User'}
            </p>
            <p
              className="font-mono text-xs truncate mt-0.5"
              style={{ color: 'var(--text-dim)' }}
            >
              {user?.primaryEmailAddress?.emailAddress}
            </p>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <MenuItem icon={Settings} label="Account" onClick={handleAccount} />
            <MenuItem icon={LogOut} label="Sign out" onClick={handleSignOut} danger />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 font-mono text-xs cursor-pointer transition-colors hover:bg-white/5"
      style={{
        color: danger ? '#dc2626' : 'var(--text)',
        background: 'transparent',
        border: 'none',
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] ?? '?').toUpperCase();
}
