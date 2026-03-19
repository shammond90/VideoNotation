/**
 * OAuth callback handler for SSO redirects (Google OAuth).
 *
 * After Google OAuth completes, the browser is redirected here.
 * Clerk processes the callback and signs the user in.
 * Once complete, <Show when="signed-in"> in AppShell takes over.
 */
import { useEffect, useRef } from 'react';
import { useClerk } from '@clerk/react';

export function SSOCallback() {
  const { handleRedirectCallback } = useClerk();
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    handleRedirectCallback({
      afterSignInUrl: '/',
      afterSignUpUrl: '/',
    });
  }, [handleRedirectCallback]);

  // Show a minimal loading screen while the callback is processed
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--bg)', color: 'var(--text)' }}
    >
      <span
        className="font-display"
        style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.02em' }}
      >
        Cue<em style={{ color: 'var(--amber)', fontStyle: 'italic' }}>tation</em>
      </span>
    </div>
  );
}
