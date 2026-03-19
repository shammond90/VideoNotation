/**
 * Shared layout wrapper for all auth screens (sign-in, sign-up, forgot password).
 * Centres content on the dark background with the Cuetation wordmark.
 */
interface AuthLayoutProps {
  children: React.ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      {/* Wordmark */}
      <div className="mb-8">
        <span
          className="font-display"
          style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}
        >
          Cue<em style={{ color: 'var(--amber)', fontStyle: 'italic' }}>tation</em>
        </span>
      </div>

      {/* Card */}
      <div
        className="w-full rounded-lg p-8"
        style={{
          maxWidth: 400,
          background: 'var(--bg-raised)',
          border: '1px solid var(--border)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
