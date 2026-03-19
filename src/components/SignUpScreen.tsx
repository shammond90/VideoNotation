/**
 * Custom sign-up screen using Clerk's useSignUp hook (Core 3 API).
 * Supports email+password (with verification) and Google OAuth.
 * Matches the Cuetation dark design system.
 */
import { useSignUp } from '@clerk/react';
import { useState } from 'react';
import { AuthLayout } from './AuthLayout';

interface SignUpScreenProps {
  onSwitchToSignIn: () => void;
}

export function SignUpScreen({ onSwitchToSignIn }: SignUpScreenProps) {
  const { signUp } = useSignUp();

  const [stage, setStage] = useState<'form' | 'verify'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Email + password sign-up
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const [firstName, ...rest] = name.trim().split(' ');
      const { error: pwError } = await signUp.password({
        emailAddress: email,
        password,
        firstName,
        lastName: rest.join(' ') || undefined,
      });
      if (pwError) {
        setError(pwError.message || 'Something went wrong');
        return;
      }
      const { error: codeError } = await signUp.verifications.sendEmailCode();
      if (codeError) {
        setError(codeError.message || 'Failed to send verification email');
        return;
      }
      setStage('verify');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // Verification code
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
      if (verifyError) {
        setError(verifyError.message || 'Invalid code');
        return;
      }
      const { error: finalizeError } = await signUp.finalize();
      if (finalizeError) {
        setError(finalizeError.message || 'Sign-up failed.');
        return;
      }
      // Clerk's <Show when="signed-in"> handles the rest
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  // Google OAuth
  async function handleGoogle() {
    setError(null);
    try {
      const { error: ssoError } = await signUp.sso({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectCallbackUrl: '/',
      });
      if (ssoError) {
        setError(ssoError.message || 'Google sign-up failed. Is the social connection enabled?');
      }
    } catch (err: unknown) {
      console.error('Google OAuth error:', err);
      setError(err instanceof Error ? err.message : 'Google sign-up failed.');
    }
  }

  // ── Verify stage ──
  if (stage === 'verify') {
    return (
      <AuthLayout>
        <h1
          className="font-display text-center mb-2"
          style={{ fontSize: 22, fontWeight: 400, color: 'var(--text)' }}
        >
          Check your email
        </h1>
        <p
          className="font-mono text-center mb-6"
          style={{ fontSize: 12, color: 'var(--text-dim)' }}
        >
          We sent a 6-digit code to {email}
        </p>
        <form onSubmit={handleVerify} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="000000"
            maxLength={6}
            autoFocus
            className="w-full px-3 py-2.5 rounded font-mono text-sm text-center outline-none tracking-[0.3em]"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 18,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
            onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
          />

          {error && (
            <p className="font-mono text-xs" style={{ color: 'var(--red)' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2.5 rounded font-mono text-sm font-medium cursor-pointer transition-colors"
            style={{
              background: 'var(--amber)',
              color: 'var(--text-inv)',
              border: 'none',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Verifying…' : 'Verify email'}
          </button>
        </form>
      </AuthLayout>
    );
  }

  // ── Sign-up form ──
  return (
    <AuthLayout>
      <h1
        className="font-display text-center mb-6"
        style={{ fontSize: 22, fontWeight: 400, color: 'var(--text)' }}
      >
        Create an account
      </h1>

      {/* Google OAuth */}
      <button
        onClick={handleGoogle}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded font-mono text-sm cursor-pointer transition-colors"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-hi)',
          color: 'var(--text)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-input)')}
      >
        <GoogleIcon />
        Continue with Google
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
        <span className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
          or
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          className="w-full px-3 py-2.5 rounded font-mono text-sm outline-none transition-colors"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="w-full px-3 py-2.5 rounded font-mono text-sm outline-none transition-colors"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          className="w-full px-3 py-2.5 rounded font-mono text-sm outline-none transition-colors"
          style={{
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--border-focus)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
        />

        {error && (
          <p className="font-mono text-xs" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full px-4 py-2.5 rounded font-mono text-sm font-medium cursor-pointer transition-colors"
          style={{
            background: 'var(--amber)',
            color: 'var(--text-inv)',
            border: 'none',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      {/* Links */}
      <div className="mt-5 text-center">
        <p className="font-mono text-xs" style={{ color: 'var(--text-dim)' }}>
          Already have an account?{' '}
          <button
            onClick={onSwitchToSignIn}
            className="cursor-pointer transition-colors"
            style={{ color: 'var(--amber)', background: 'none', border: 'none', font: 'inherit' }}
          >
            Sign in
          </button>
        </p>
      </div>
    </AuthLayout>
  );
}

/** Inline Google "G" logo SVG. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.9 23.9 0 0 0 0 24c0 3.77.9 7.35 2.56 10.56l7.97-5.97z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.97C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
