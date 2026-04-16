import type { ReactNode } from 'react';

function Logo() {
  return (
    <div className="font-display" style={{ fontSize: 17, color: 'var(--text)', letterSpacing: '-0.01em' }}>
      Cue<em style={{ fontStyle: 'italic', color: 'var(--amber)' }}>tation</em>
    </div>
  );
}

export function PublicPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dark" style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 24px',
        borderBottom: '1px solid var(--border)',
      }}>
        <a href="/" style={{ textDecoration: 'none' }}>
          <Logo />
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <a href="/privacy" style={{ fontSize: 13, color: 'var(--text-mid)', textDecoration: 'none' }}>Privacy</a>
          <a href="/terms" style={{ fontSize: 13, color: 'var(--text-mid)', textDecoration: 'none' }}>Terms</a>
          <a
            href="/app"
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-inv)',
              background: 'var(--amber)',
              padding: '6px 16px',
              borderRadius: 'var(--r-sm)',
              textDecoration: 'none',
            }}
          >
            Sign In
          </a>
        </div>
      </nav>

      {/* Content */}
      <main style={{ flex: 1 }}>
        {children}
      </main>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 12,
        color: 'var(--text-dim)',
      }}>
        <span>&copy; {new Date().getFullYear()} Cuetation. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 16 }}>
          <a href="/privacy" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Privacy Policy</a>
          <a href="/terms" style={{ color: 'var(--text-dim)', textDecoration: 'none' }}>Terms of Service</a>
        </div>
      </footer>
    </div>
  );
}
